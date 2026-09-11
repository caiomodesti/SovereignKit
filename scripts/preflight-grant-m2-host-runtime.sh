#!/usr/bin/env bash
set -euo pipefail

test -r /etc/sovereignkit/assignment-authorities.json
test -r /etc/sovereignkit/readers.json
if ! sudo -u sovereignkit test -r /etc/sovereignkit/secrets/observer-private.json; then
  sudo -u sovereignkit test -r /etc/sovereignkit/secrets/observer-private-active.json
fi
[[ $(timedatectl show -p NTPSynchronized --value) == yes ]]
[[ $(systemctl is-active sovereignkit-observer.service) == active ]]
if systemctl list-units --all --plain --no-legend 'sovereignkit-m2-observation-worker@*.service' | grep -q .; then
  echo 'M2 worker instance exists before rehearsal' >&2
  exit 69
fi
free_bytes=$(df --output=avail -B1 /var/lib/sovereignkit | tail -1 | tr -d ' ')
[[ $free_bytes -ge 2147483648 ]]
printf '{"status":"PASS","ntp":true,"qualifiedObserverActive":true,"workerInstances":0,"configReadable":true,"freeBytes":%s}\n' "$free_bytes"
