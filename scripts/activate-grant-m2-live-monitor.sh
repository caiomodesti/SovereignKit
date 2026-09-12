#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo 'usage: activate-grant-m2-live-monitor <observer-id> <expected-source-commit>' >&2
  exit 64
fi
observer_id=$1
expected_commit=$2
install_root=/opt/sovereignkit-m2-rehearsal
telegram_config=/etc/sovereignkit/secrets/grant-m2-telegram.json
timer=sovereignkit-m2-live-monitor.timer
service=sovereignkit-m2-live-monitor.service

[[ $observer_id =~ ^observer-(aws-a|google-e2-micro|oracle-a1)$ ]] || { echo 'invalid observer id' >&2; exit 65; }
[[ $expected_commit =~ ^[a-f0-9]{40}$ ]] || { echo 'invalid source commit' >&2; exit 65; }
[[ $(id -u) -eq 0 ]] || { echo 'monitor activation must run as root' >&2; exit 77; }
actual_commit=$(node -e 'const fs=require("fs");const m=JSON.parse(fs.readFileSync(process.argv[1]));process.stdout.write(m.source_commit)' "$install_root/runtime-manifest.json")
[[ $actual_commit == "$expected_commit" ]] || { echo 'installed runtime commit mismatch' >&2; exit 65; }
grep -qx "GRANT_M2_OBSERVER_ID=$observer_id" /etc/sovereignkit/m2-rehearsal.env || { echo 'observer environment mismatch' >&2; exit 65; }
sudo -u sovereignkit test -r "$telegram_config" || { echo 'Telegram monitor configuration is not readable by service identity' >&2; exit 66; }
systemctl is-active --quiet sovereignkit-observer.service || { echo 'qualified observer service is not active' >&2; exit 69; }
if systemctl list-units --all --plain --no-legend 'sovereignkit-m2-observation-worker@*.service' | grep -q .; then
  echo 'M2 worker instance exists before monitor activation' >&2
  exit 69
fi
systemctl start "$service"
systemctl enable --now "$timer"
systemctl is-enabled --quiet "$timer"
systemctl is-active --quiet "$timer"
if systemctl list-units --all --plain --no-legend 'sovereignkit-m2-observation-worker@*.service' | grep -q .; then
  echo 'M2 worker instance exists after monitor activation' >&2
  exit 69
fi
printf '{"status":"LIVE_MONITOR_ACTIVATED","observerId":"%s","sourceCommit":"%s","sampleRecorded":true,"timerEnabled":true,"timerActive":true,"workerInstances":0,"officialWindowStarted":false}\n' "$observer_id" "$actual_commit"
