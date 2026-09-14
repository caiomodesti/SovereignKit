#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo 'usage: install-grant-m2-official-coordinator <source-commit>' >&2
  exit 64
fi
source_commit=$1
install_root=/opt/sovereignkit-m2-coordinator
unit_source=$install_root/deploy/systemd/sovereignkit-m2-official-coordinator.service
unit_target=/etc/systemd/system/sovereignkit-m2-official-coordinator.service
state_root=/var/lib/sovereignkit/m2/official

[[ $source_commit =~ ^[a-f0-9]{40}$ ]] || { echo 'invalid source commit' >&2; exit 65; }
[[ $(id -u) -eq 0 ]] || { echo 'official coordinator installer must run as root' >&2; exit 77; }
[[ -f $unit_source && -f $install_root/runtime-manifest.json ]] || { echo 'official coordinator runtime package is incomplete' >&2; exit 73; }
[[ ! -e $unit_target && ! -e /etc/sovereignkit/m2-official-coordinator.json && ! -e $state_root ]] || {
  echo 'official coordinator controls already exist; reconciliation required' >&2
  exit 73
}
manifest_commit=$(/usr/local/bin/node -e 'const fs=require("fs");const m=JSON.parse(fs.readFileSync(process.argv[1]));if(m.source_commit!==process.argv[2])process.exit(2);process.stdout.write(m.source_commit)' "$install_root/runtime-manifest.json" "$source_commit")
[[ $manifest_commit == "$source_commit" ]] || { echo 'official coordinator source commit mismatch' >&2; exit 65; }
systemctl is-active --quiet sovereignkit-collector.service || { echo 'Collector service is not active' >&2; exit 69; }
command -v flock >/dev/null && command -v ssh >/dev/null && command -v scp >/dev/null || { echo 'required coordinator transport command is missing' >&2; exit 69; }

id sovereignkit >/dev/null 2>&1 || { echo 'qualified SovereignKit service account is missing' >&2; exit 69; }
install -d -m 0700 -o sovereignkit -g sovereignkit "$state_root"
install -m 0644 -o root -g root "$unit_source" "$unit_target"
systemctl daemon-reload
systemctl is-active --quiet sovereignkit-m2-official-coordinator.service && { echo 'coordinator activated unexpectedly' >&2; exit 69; }
systemctl is-enabled --quiet sovereignkit-m2-official-coordinator.service && { echo 'coordinator enabled unexpectedly' >&2; exit 69; }
printf '{"status":"OFFICIAL_COORDINATOR_INSTALLED_NOT_CONFIGURED_NOT_ACTIVATED","sourceCommit":"%s","durableRestartUnitInstalled":true,"singleWriterFlockConfigured":true,"officialWindowStarted":false}\n' "$source_commit"
