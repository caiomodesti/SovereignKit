#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo 'usage: install-grant-m2-host-runtime <archive> <archive-sha256> <source-commit> <observer-id>' >&2
  exit 64
fi
archive=$1
expected_sha=$2
source_commit=$3
observer_id=$4
install_root=/opt/sovereignkit-m2-rehearsal
unit_source=$install_root/deploy/systemd/sovereignkit-m2-observation-worker@.service
unit_target=/etc/systemd/system/sovereignkit-m2-observation-worker@.service
monitor_service_source=$install_root/deploy/systemd/sovereignkit-m2-live-monitor.service
monitor_service_target=/etc/systemd/system/sovereignkit-m2-live-monitor.service
monitor_timer_source=$install_root/deploy/systemd/sovereignkit-m2-live-monitor.timer
monitor_timer_target=/etc/systemd/system/sovereignkit-m2-live-monitor.timer
env_target=/etc/sovereignkit/m2-rehearsal.env

[[ $expected_sha =~ ^[a-f0-9]{64}$ ]] || { echo 'invalid archive hash' >&2; exit 65; }
[[ $source_commit =~ ^[a-f0-9]{40}$ ]] || { echo 'invalid source commit' >&2; exit 65; }
[[ $observer_id =~ ^observer-(aws-a|google-e2-micro|oracle-a1)$ ]] || { echo 'invalid observer id' >&2; exit 65; }
[[ $(id -u) -eq 0 ]] || { echo 'installer must run as root' >&2; exit 77; }
[[ -f $archive ]] || { echo 'runtime archive missing' >&2; exit 66; }
[[ ! -e $install_root && ! -e $unit_target && ! -e $monitor_service_target && ! -e $monitor_timer_target && ! -e $env_target ]] || { echo 'M2 host runtime already exists; reconciliation required' >&2; exit 73; }
actual_sha=$(sha256sum "$archive" | awk '{print $1}')
[[ $actual_sha == "$expected_sha" ]] || { echo 'runtime archive hash mismatch' >&2; exit 65; }
node_version=$(node --version)
[[ $node_version == v22.17.0 ]] || { echo "unexpected Node version: $node_version" >&2; exit 69; }
systemctl is-active --quiet sovereignkit-observer.service || { echo 'qualified observer service is not active' >&2; exit 69; }

install -d -m 0755 -o root -g root "$install_root"
tar -xzf "$archive" -C "$install_root" --strip-components=1
manifest_commit=$(node -e 'const fs=require("fs");const m=JSON.parse(fs.readFileSync(process.argv[1]));if(m.status!=="STAGED_HOST_PREPARATION_NOT_ACTIVATED"||m.activation_performed!==false||m.authorizes_rehearsal!==false||m.milestone_2_started!==false)process.exit(2);process.stdout.write(m.source_commit)' "$install_root/runtime-manifest.json")
[[ $manifest_commit == "$source_commit" ]] || { echo 'runtime source commit mismatch' >&2; exit 65; }
chown -R root:root "$install_root"
find "$install_root" -type d -exec chmod 0755 {} +
find "$install_root" -type f -exec chmod 0644 {} +
(cd "$install_root" && sudo -u sovereignkit node --input-type=module -e 'await Promise.all([import("./packages/collector/dist/observation-worker.js"),import("./packages/probes/dist/m2-rehearsal-submission.js")])' </dev/null)
install -d -m 0755 -o root -g root /etc/sovereignkit
printf 'GRANT_M2_OBSERVER_ID=%s\nGRANT_M2_TOTAL_LIMIT=10000\n' "$observer_id" > "$env_target"
chmod 0600 "$env_target"
chown root:root "$env_target"
install -d -m 0700 -o sovereignkit -g sovereignkit /var/lib/sovereignkit/m2/inbox /var/lib/sovereignkit/m2/quota /var/lib/sovereignkit/evidence/m2/raw /var/lib/sovereignkit/evidence/m2/completed /var/lib/sovereignkit/evidence/m2/alerts
install -m 0644 -o root -g root "$unit_source" "$unit_target"
install -m 0644 -o root -g root "$monitor_service_source" "$monitor_service_target"
install -m 0644 -o root -g root "$monitor_timer_source" "$monitor_timer_target"
systemctl daemon-reload
if systemctl list-units --all --plain --no-legend 'sovereignkit-m2-observation-worker@*.service' | grep -q .; then
  echo 'unexpected M2 worker instance exists after install' >&2
  exit 69
fi
if systemctl is-enabled --quiet sovereignkit-m2-live-monitor.timer || systemctl is-active --quiet sovereignkit-m2-live-monitor.timer; then
  echo 'M2 live monitor timer activated unexpectedly during install' >&2
  exit 69
fi
printf '{"status":"INSTALLED_NOT_ACTIVATED","observerId":"%s","sourceCommit":"%s","archiveSha256":"%s","qualifiedObserverActive":true,"workerInstances":0}\n' "$observer_id" "$source_commit" "$actual_sha"
