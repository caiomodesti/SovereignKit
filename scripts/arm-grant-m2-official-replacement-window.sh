#!/usr/bin/env bash
set -euo pipefail

expected_commit=2cbb5bac687879c7825facef9cf8a12ab48aa668
interrupted_run_id=m2-official-20260914t163100000z
incident_id=official-transport-permission-denied
interrupted_state_sha256=6927da1cd611080dddf80feaee1973f4c58c339880f10ff9edccf12b3b02ec73
service=sovereignkit-m2-official-coordinator.service
runtime_root=/opt/sovereignkit-m2-coordinator
base_state_root=/var/lib/sovereignkit/m2/official
replacements_root=$base_state_root/replacements
config_target=/etc/sovereignkit/m2-official-coordinator.json
preflight_input=/tmp/m2-official-replacement-preflight.json
run_input=/tmp/m2-official-replacement-run.json
started_service=false

fail_closed() {
  if [[ $started_service == true ]]; then
    systemctl disable --now "$service" >/dev/null 2>&1 || true
  fi
}
trap fail_closed ERR

[[ $(id -u) -eq 0 ]] || { echo 'replacement arm must run as root' >&2; exit 77; }
[[ -f $preflight_input && -f $run_input && -f $config_target ]] || { echo 'replacement inputs or existing config missing' >&2; exit 66; }
systemctl is-active --quiet "$service" && { echo 'official coordinator is active before replacement arm' >&2; exit 69; }
systemctl is-enabled --quiet "$service" && { echo 'official coordinator is enabled before replacement arm' >&2; exit 69; }
manifest_commit=$(/usr/local/bin/node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1])).source_commit)' "$runtime_root/runtime-manifest.json")
[[ $manifest_commit == "$expected_commit" ]] || { echo 'coordinator runtime commit mismatch' >&2; exit 65; }

old_files=$(find "$base_state_root" -path "$replacements_root" -prune -o -type f -print | wc -l)
old_hash=$(find "$base_state_root" -path "$replacements_root" -prune -o -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')
[[ $old_files -eq 487 && $old_hash == "$interrupted_state_sha256" ]] || { echo 'interrupted evidence state drifted' >&2; exit 73; }

mapfile -t metadata < <(/usr/local/bin/node --input-type=module - "$preflight_input" "$run_input" "$expected_commit" "$interrupted_run_id" "$incident_id" "$interrupted_state_sha256" <<'NODE'
import fs from 'node:fs';
import { validateGrantM2OfficialPreflight } from '/opt/sovereignkit-m2-coordinator/scripts/lib/grant-m2-official-preflight.mjs';
import { validateGrantM2OfficialRun } from '/opt/sovereignkit-m2-coordinator/scripts/lib/grant-m2-official-run.mjs';
const [preflightPath, runPath, commit, interruptedRunId, incidentId, interruptedStateSha256] = process.argv.slice(2);
const preflight=JSON.parse(fs.readFileSync(preflightPath));
const run=JSON.parse(fs.readFileSync(runPath));
const quota=JSON.parse(fs.readFileSync('/opt/sovereignkit-m2-coordinator/deploy/m2-resource-quota-estimate.json'));
const checked=validateGrantM2OfficialPreflight(preflight,commit);
validateGrantM2OfficialRun(run,quota);
const replacement=run.replacement_window;
if(run.authorization.preflight_sha256!==checked.sha256 || run.source_commit!==commit ||
   replacement?.schema_version!=="GrantM2OfficialReplacement@0.1.0" || replacement?.replaces_run_id!==interruptedRunId ||
   replacement?.incident_id!==incidentId || replacement?.interrupted_state_aggregate_sha256!==interruptedStateSha256 ||
   replacement?.original_evidence_preserved!==true || replacement?.automatic_window_reset!==false ||
   replacement?.explicit_replacement_decision_required!==true ||
   !/^m2-official-replacement-[a-z0-9]+$/u.test(run.run_id) || Date.parse(run.schedule.start_at)-Date.now()<180000) process.exit(2);
console.log(run.run_id);
console.log(run.schedule.start_at);
console.log(run.schedule.end_at);
NODE
)
[[ ${#metadata[@]} -eq 3 ]] || { echo 'replacement metadata invalid' >&2; exit 65; }
run_id=${metadata[0]}
start_at=${metadata[1]}
end_at=${metadata[2]}
replacement_root="$replacements_root/$run_id"
run_target="/etc/sovereignkit/m2/runs/$run_id.json"
preflight_target="$replacement_root/preflight.json"
config_next="/tmp/m2-replacement-config.$$.$RANDOM.json"
[[ ! -e $config_next ]] || { echo 'temporary replacement config path exists' >&2; exit 73; }
trap 'fail_closed' ERR

[[ ! -e $replacement_root && ! -e $run_target ]] || { echo 'replacement target already exists; reconciliation required' >&2; exit 73; }
/usr/local/bin/node --input-type=module - "$config_target" "$config_next" "$run_target" "$replacement_root" <<'NODE'
import fs from 'node:fs';
import { validateGrantM2OfficialCoordinatorConfig } from '/opt/sovereignkit-m2-coordinator/scripts/lib/grant-m2-official-coordinator-runtime.mjs';
const [currentPath,nextPath,runPath,stateRoot]=process.argv.slice(2);
const current=JSON.parse(fs.readFileSync(currentPath));
validateGrantM2OfficialCoordinatorConfig(current);
if(current.run_directory!=='/var/lib/sovereignkit/m2/official/run' || current.journal_directory!=='/var/lib/sovereignkit/m2/official/journal' || current.evidence_directory!=='/var/lib/sovereignkit/m2/official/evidence') process.exit(2);
const next={...current,run_path:runPath,run_directory:`${stateRoot}/run`,journal_directory:`${stateRoot}/journal`,evidence_directory:`${stateRoot}/evidence`};
validateGrantM2OfficialCoordinatorConfig(next);
fs.writeFileSync(nextPath,`${JSON.stringify(next,null,2)}\n`,{mode:0o600,flag:'wx'});
NODE

config_sha=$(sha256sum "$config_target" | awk '{print $1}')
config_archive="/etc/sovereignkit/m2/config-archive/original-$config_sha.json"
install -d -m 0750 -o root -g sovereignkit /etc/sovereignkit/m2/runs /etc/sovereignkit/m2/config-archive
install -d -m 0700 -o sovereignkit -g sovereignkit "$replacement_root"
install -m 0600 -o sovereignkit -g sovereignkit "$preflight_input" "$preflight_target"
install -m 0640 -o root -g sovereignkit "$run_input" "$run_target"
if [[ -e $config_archive ]]; then cmp -s "$config_target" "$config_archive" || exit 73; else install -m 0640 -o root -g sovereignkit "$config_target" "$config_archive"; fi
install -m 0640 -o root -g sovereignkit "$config_next" "$config_target"

new_old_files=$(find "$base_state_root" -path "$replacements_root" -prune -o -type f -print | wc -l)
new_old_hash=$(find "$base_state_root" -path "$replacements_root" -prune -o -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')
[[ $new_old_files -eq $old_files && $new_old_hash == "$old_hash" ]] || { echo 'interrupted evidence changed during replacement arm' >&2; exit 73; }

check_workers() {
  local key=$1 known=$2 target=$3 count
  count=$(sudo -u sovereignkit /usr/bin/ssh -i "$key" -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 -o ConnectionAttempts=1 -o "UserKnownHostsFile=$known" -- "$target" \
    "systemctl list-units --type=service --state=running --plain --no-legend 'sovereignkit-m2-official-observation-worker@*.service' | wc -l")
  [[ $count -eq 0 ]]
}
check_workers /etc/sovereignkit/secrets/m2-observer-aws-a-ssh /etc/sovereignkit/m2/observer-aws-a-known-hosts ec2-user@ec2-18-229-162-6.sa-east-1.compute.amazonaws.com
check_workers /etc/sovereignkit/secrets/m2-observer-google-ssh /etc/sovereignkit/m2/observer-google-known-hosts caiom@35.208.38.132
check_workers /etc/sovereignkit/secrets/m2-observer-oracle-ssh /etc/sovereignkit/m2/observer-oracle-known-hosts opc@144.22.216.81

/usr/local/bin/node -e 'const run=JSON.parse(require("fs").readFileSync(process.argv[1]));if(Date.parse(run.schedule.start_at)-Date.now()<120000)process.exit(2)' "$run_target"
systemctl enable --now "$service" >/dev/null
started_service=true
sleep 3
systemctl is-active --quiet "$service"
systemctl is-enabled --quiet "$service"
grep -Rqs '"event":"WINDOW_STARTED"' "$replacement_root/journal" && exit 69
pid_before=$(systemctl show -p MainPID --value "$service")
[[ $pid_before =~ ^[1-9][0-9]*$ ]] || exit 69
systemctl restart "$service"
sleep 3
systemctl is-active --quiet "$service"
pid_after=$(systemctl show -p MainPID --value "$service")
[[ $pid_after =~ ^[1-9][0-9]*$ && $pid_after != "$pid_before" ]] || exit 69
if sudo -u sovereignkit /usr/bin/flock --nonblock --conflict-exit-code=75 /run/sovereignkit-m2-coordinator/coordinator.lock /usr/bin/true; then lock_status=0; else lock_status=$?; fi
[[ $lock_status -eq 75 ]] || exit 69
grep -Rqs '"event":"WINDOW_STARTED"' "$replacement_root/journal" && exit 69

printf '{"status":"REPLACEMENT_ARMED_WAITING_FOR_FROZEN_START","run_id":"%s","source_commit":"%s","start_at":"%s","end_at":"%s","interrupted_evidence_preserved":true,"service_active":true,"service_enabled":true,"restart_proven":true,"single_writer_lock_proven":true,"window_started":false,"official_workers":0}\n' "$run_id" "$expected_commit" "$start_at" "$end_at"
trap - ERR
