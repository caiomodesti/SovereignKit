#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo 'usage: install-grant-m2-official-host-controls <source-commit> <observer-id>' >&2
  exit 64
fi
source_commit=$1
observer_id=$2
install_root=/opt/sovereignkit-m2-rehearsal
unit_source=$install_root/deploy/systemd/sovereignkit-m2-official-observation-worker@.service
unit_target=/etc/systemd/system/sovereignkit-m2-official-observation-worker@.service
env_target=/etc/sovereignkit/m2-official.env
quota_root=/var/lib/sovereignkit/m2/official-quota

[[ $source_commit =~ ^[a-f0-9]{40}$ ]] || { echo 'invalid source commit' >&2; exit 65; }
[[ $observer_id =~ ^observer-(aws-a|google-e2-micro|oracle-a1)$ ]] || { echo 'invalid observer id' >&2; exit 65; }
[[ $(id -u) -eq 0 ]] || { echo 'official host controls installer must run as root' >&2; exit 77; }
[[ -f $unit_source && -f $install_root/runtime-manifest.json ]] || { echo 'official runtime package is incomplete' >&2; exit 73; }
[[ ! -e $unit_target && ! -e $env_target && ! -e $quota_root ]] || { echo 'official host controls already exist; reconciliation required' >&2; exit 73; }
manifest_commit=$(node -e 'const fs=require("fs");const m=JSON.parse(fs.readFileSync(process.argv[1]));if(m.source_commit!==process.argv[2])process.exit(2);process.stdout.write(m.source_commit)' "$install_root/runtime-manifest.json" "$source_commit")
[[ $manifest_commit == "$source_commit" ]] || { echo 'official runtime source commit mismatch' >&2; exit 65; }
systemctl is-active --quiet sovereignkit-observer.service || { echo 'qualified observer service is not active' >&2; exit 69; }
if systemctl list-units --all --plain --no-legend 'sovereignkit-m2-official-observation-worker@*.service' | grep -q .; then
  echo 'official M2 worker instance exists before installation' >&2
  exit 69
fi

install -d -m 0700 -o sovereignkit -g sovereignkit "$quota_root"
printf 'GRANT_M2_OBSERVER_ID=%s\nGRANT_M2_OFFICIAL_TOTAL_LIMIT=1500000\n' "$observer_id" > "$env_target"
chmod 0600 "$env_target"
chown root:root "$env_target"
install -m 0644 -o root -g root "$unit_source" "$unit_target"
systemctl daemon-reload
worker_enablement=$(systemctl is-enabled sovereignkit-m2-official-observation-worker@.service 2>/dev/null || true)
[[ $worker_enablement == static || $worker_enablement == disabled ]] || { echo 'official worker template has an unsafe enablement state' >&2; exit 69; }
systemctl list-units --all --plain --no-legend 'sovereignkit-m2-official-observation-worker@*.service' | grep -q . && { echo 'official worker instance was activated unexpectedly' >&2; exit 69; }
printf '{"status":"OFFICIAL_CONTROLS_INSTALLED_NOT_ACTIVATED","observerId":"%s","sourceCommit":"%s","quotaLimit":1500000,"workerInstances":0,"officialWindowStarted":false}\n' "$observer_id" "$source_commit"
