#!/usr/bin/env bash
set -euo pipefail

swap_root=/var/lib/sovereignkit/swap
swap_path=$swap_root/m2-google.swap
swap_bytes=2147483648
fstab=/etc/fstab
backup_root=/etc/sovereignkit/backups
fstab_entry="$swap_path none swap sw 0 0"

[[ $(id -u) -eq 0 ]] || { echo 'memory resilience setup must run as root' >&2; exit 77; }
[[ $(systemctl is-active sovereignkit-observer.service 2>/dev/null || true) == active ]] || { echo 'qualified observer is not active' >&2; exit 69; }
if swapon --show=NAME --noheadings --raw | grep -Fqx "$swap_path"; then
  actual=$(swapon --show=NAME,SIZE --bytes --noheadings --raw | awk -v target="$swap_path" '$1==target {print $2}')
  [[ $actual -eq $swap_bytes ]] || { echo 'active SovereignKit swap size mismatch' >&2; exit 73; }
  grep -Fqx "$fstab_entry" "$fstab" || { echo 'active swap is not persistently bound' >&2; exit 73; }
  printf '{"status":"ALREADY_ACTIVE_VERIFIED","swap_path":"%s","swap_bytes":%s,"observer_service_active":true,"workers_started":0,"official_window_started":false}\n' "$swap_path" "$swap_bytes"
  exit 0
fi
[[ -z $(swapon --show=NAME --noheadings --raw) ]] || { echo 'unexpected active swap exists; reconciliation required' >&2; exit 73; }
[[ ! -e $swap_path ]] || { echo 'inactive swap path exists; reconciliation required' >&2; exit 73; }
grep -Fqx "$fstab_entry" "$fstab" && { echo 'persistent swap entry exists without active swap; reconciliation required' >&2; exit 73; }
[[ $(systemctl list-units --type=service --state=running --plain --no-legend 'sovereignkit-m2-official-observation-worker@*.service' | wc -l) -eq 0 ]] || { echo 'official worker exists before memory setup' >&2; exit 69; }
free_disk=$(df --output=avail -B1 /var/lib/sovereignkit | tail -1 | tr -d ' ')
[[ $free_disk -ge 5368709120 ]] || { echo 'insufficient free disk for bounded swap setup' >&2; exit 69; }

install -d -m 0700 -o root -g root "$swap_root" "$backup_root"
fstab_sha=$(sha256sum "$fstab" | awk '{print $1}')
fstab_backup="$backup_root/fstab-$fstab_sha"
if [[ -e $fstab_backup ]]; then cmp -s "$fstab" "$fstab_backup" || exit 73; else install -m 0644 -o root -g root "$fstab" "$fstab_backup"; fi
fallocate -l "$swap_bytes" "$swap_path"
chmod 0600 "$swap_path"
mkswap "$swap_path" >/dev/null
swapon "$swap_path"
grep -Fqx "$fstab_entry" "$fstab" || printf '%s\n' "$fstab_entry" >> "$fstab"
sync

actual=$(swapon --show=NAME,SIZE --bytes --noheadings --raw | awk -v target="$swap_path" '$1==target {print $2}')
[[ $actual -eq $swap_bytes ]] || { echo 'swap activation verification failed' >&2; exit 69; }
grep -Fqx "$fstab_entry" "$fstab"
[[ $(stat -c '%a:%U:%G' "$swap_path") == 600:root:root ]] || exit 69
[[ $(systemctl list-units --type=service --state=running --plain --no-legend 'sovereignkit-m2-official-observation-worker@*.service' | wc -l) -eq 0 ]] || exit 69
printf '{"status":"ACTIVE_PERSISTENT","swap_path":"%s","swap_bytes":%s,"fstab_backup":"%s","observer_service_active":true,"workers_started":0,"official_window_started":false}\n' "$swap_path" "$swap_bytes" "$fstab_backup"
