#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo 'usage: upgrade-grant-m2-host-runtime <archive> <archive-sha256> <source-commit> <observer-id>' >&2
  exit 64
fi

archive=$1
expected_sha=$2
source_commit=$3
observer_id=$4
install_root=/opt/sovereignkit-m2-rehearsal
unit_target=/etc/systemd/system/sovereignkit-m2-observation-worker@.service
monitor_service_target=/etc/systemd/system/sovereignkit-m2-live-monitor.service
monitor_timer_target=/etc/systemd/system/sovereignkit-m2-live-monitor.timer
env_target=/etc/sovereignkit/m2-rehearsal.env

[[ $expected_sha =~ ^[a-f0-9]{64}$ ]] || { echo 'invalid archive hash' >&2; exit 65; }
[[ $source_commit =~ ^[a-f0-9]{40}$ ]] || { echo 'invalid source commit' >&2; exit 65; }
[[ $observer_id =~ ^observer-(aws-a|google-e2-micro|oracle-a1)$ ]] || { echo 'invalid observer id' >&2; exit 65; }
[[ $(id -u) -eq 0 ]] || { echo 'upgrader must run as root' >&2; exit 77; }
[[ -f $archive && -d $install_root && -f $unit_target && -f $env_target ]] || { echo 'existing M2 host runtime is incomplete; reconciliation required' >&2; exit 73; }
[[ $(node --version) == v22.17.0 ]] || { echo 'unexpected Node version' >&2; exit 69; }
systemctl is-active --quiet sovereignkit-observer.service || { echo 'qualified observer service is not active' >&2; exit 69; }
if systemctl list-units --all --plain --no-legend 'sovereignkit-m2-observation-worker@*.service' | grep -q .; then
  echo 'M2 worker instance exists before upgrade' >&2
  exit 69
fi

actual_sha=$(sha256sum "$archive" | awk '{print $1}')
[[ $actual_sha == "$expected_sha" ]] || { echo 'runtime archive hash mismatch' >&2; exit 65; }
previous_commit=$(node -e 'const fs=require("fs");const m=JSON.parse(fs.readFileSync(process.argv[1]));if(!/^[a-f0-9]{40}$/.test(m.source_commit))process.exit(2);process.stdout.write(m.source_commit)' "$install_root/runtime-manifest.json")
backup_root="/opt/sovereignkit-m2-rehearsal.backup-$previous_commit"
[[ ! -e $backup_root ]] || { echo 'versioned runtime backup already exists; reconciliation required' >&2; exit 73; }

staging_root=$(mktemp -d /opt/sovereignkit-m2-rehearsal.upgrade.XXXXXX)
swapped=false
rollback() {
  status=$?
  if [[ $status -ne 0 && $swapped == true ]]; then
    rm -rf -- "$install_root"
    mv -- "$backup_root" "$install_root"
    install -m 0644 -o root -g root "$install_root/deploy/systemd/sovereignkit-m2-observation-worker@.service" "$unit_target"
    if [[ -f $install_root/deploy/systemd/sovereignkit-m2-live-monitor.service ]]; then install -m 0644 -o root -g root "$install_root/deploy/systemd/sovereignkit-m2-live-monitor.service" "$monitor_service_target"; else rm -f -- "$monitor_service_target"; fi
    if [[ -f $install_root/deploy/systemd/sovereignkit-m2-live-monitor.timer ]]; then install -m 0644 -o root -g root "$install_root/deploy/systemd/sovereignkit-m2-live-monitor.timer" "$monitor_timer_target"; else rm -f -- "$monitor_timer_target"; fi
    systemctl daemon-reload
  fi
  if [[ -d $staging_root ]]; then rm -rf -- "$staging_root"; fi
  exit "$status"
}
trap rollback EXIT

tar -xzf "$archive" -C "$staging_root" --strip-components=1
manifest_commit=$(node -e 'const fs=require("fs");const m=JSON.parse(fs.readFileSync(process.argv[1]));if(m.status!=="STAGED_HOST_PREPARATION_NOT_ACTIVATED"||m.activation_performed!==false||m.authorizes_rehearsal!==false||m.milestone_2_started!==false)process.exit(2);process.stdout.write(m.source_commit)' "$staging_root/runtime-manifest.json")
[[ $manifest_commit == "$source_commit" ]] || { echo 'runtime source commit mismatch' >&2; exit 65; }
[[ -d $install_root/node_modules ]] || { echo 'existing runtime dependencies are missing; reconciliation required' >&2; exit 73; }
cmp --silent "$install_root/package-lock.json" "$staging_root/package-lock.json" || { echo 'runtime dependency lock changed; clean dependency installation required' >&2; exit 73; }
cp -a -- "$install_root/node_modules" "$staging_root/node_modules"
chown -R root:root "$staging_root"
find "$staging_root" -type d -exec chmod 0755 {} +
find "$staging_root" -type f -exec chmod 0644 {} +
(cd "$staging_root" && sudo -u sovereignkit node --input-type=module -e 'await Promise.all([import("./packages/collector/dist/observation-worker.js"),import("./packages/probes/dist/m2-rehearsal-submission.js")])' </dev/null)

mv -- "$install_root" "$backup_root"
mv -- "$staging_root" "$install_root"
swapped=true
install -d -m 0700 -o sovereignkit -g sovereignkit /var/lib/sovereignkit/evidence/m2/alerts
install -m 0644 -o root -g root "$install_root/deploy/systemd/sovereignkit-m2-observation-worker@.service" "$unit_target"
install -m 0644 -o root -g root "$install_root/deploy/systemd/sovereignkit-m2-live-monitor.service" "$monitor_service_target"
install -m 0644 -o root -g root "$install_root/deploy/systemd/sovereignkit-m2-live-monitor.timer" "$monitor_timer_target"
systemctl daemon-reload
if systemctl list-units --all --plain --no-legend 'sovereignkit-m2-observation-worker@*.service' | grep -q .; then
  echo 'unexpected M2 worker instance exists after upgrade' >&2
  exit 69
fi
if systemctl is-enabled --quiet sovereignkit-m2-live-monitor.timer || systemctl is-active --quiet sovereignkit-m2-live-monitor.timer; then
  echo 'M2 live monitor timer activated unexpectedly during upgrade' >&2
  exit 69
fi
swapped=false
trap - EXIT
printf '{"status":"UPGRADED_NOT_ACTIVATED","observerId":"%s","sourceCommit":"%s","previousSourceCommit":"%s","archiveSha256":"%s","backupRoot":"%s","qualifiedObserverActive":true,"workerInstances":0}\n' "$observer_id" "$source_commit" "$previous_commit" "$actual_sha" "$backup_root"
