param(
  [Parameter(Mandatory=$true)][string]$SourceCommit,
  [string]$TelegramPath = '.secrets\grant-m2-telegram.json',
  [string]$EvidenceDirectory = 'artifacts\grant-m2-live-monitor-activation-evidence'
)

$ErrorActionPreference = 'Stop'
if ($SourceCommit -notmatch '^[a-f0-9]{40}$') { throw 'Invalid runtime source commit' }
$TelegramPath = (Resolve-Path $TelegramPath).Path
$EvidenceDirectory = [IO.Path]::GetFullPath($EvidenceDirectory)
$config = Get-Content $TelegramPath -Raw | ConvertFrom-Json
$fields = @($config.PSObject.Properties.Name | Sort-Object)
if (($fields -join ',') -ne 'bot_token,chat_id' -or
    $config.bot_token -isnot [string] -or $config.bot_token.Length -lt 20 -or
    [string]$config.chat_id -notmatch '^-?\d+$') {
  throw 'Telegram monitor configuration is invalid'
}

$aws = Get-Content '.secrets\aws-observer-a-connection.json' -Raw | ConvertFrom-Json
$awsKey = (Resolve-Path $aws.key_path).Path
$awsKnownHosts = (Resolve-Path '.secrets\aws-observer-a-known_hosts').Path
$google = Get-Content '.secrets\google-observer-b-connection.json' -Raw | ConvertFrom-Json
$googleKey = (Resolve-Path $google.key_path).Path
$plink = (Resolve-Path $google.plink_path).Path
$pscp = (Resolve-Path $google.pscp_path).Path
$oracleKey = (Resolve-Path '.secrets\grant-m1-observer-c-oracle-ed25519').Path
$oracleKnownHosts = (Resolve-Path '.secrets\grant-m1-observer-c-known_hosts').Path
$oracleHost = ((Get-Content $oracleKnownHosts -TotalCount 1) -split '[ ,]')[0]
$remoteSecret = '/tmp/grant-m2-telegram-' + $SourceCommit + '.json'
$installedSecret = '/etc/sovereignkit/secrets/grant-m2-telegram.json'
$runtime = '/opt/sovereignkit-m2-rehearsal'
$timer = 'sovereignkit-m2-live-monitor.timer'

$observers = @(
  [pscustomobject]@{ id='observer-aws-a'; provider='aws' },
  [pscustomobject]@{ id='observer-google-e2-micro'; provider='google' },
  [pscustomobject]@{ id='observer-oracle-a1'; provider='oracle' }
)

function Send-Secret($observer) {
  if ($observer.provider -eq 'aws') {
    $target = $aws.username + '@' + $aws.host
    & scp -q -i $awsKey -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$awsKnownHosts $TelegramPath ($target + ':' + $remoteSecret)
  } elseif ($observer.provider -eq 'google') {
    $target = $google.username + '@' + $google.host
    & $pscp -q -batch -hostkey $google.host_key -i $googleKey $TelegramPath ($target + ':' + $remoteSecret)
  } else {
    & scp -q -i $oracleKey -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$oracleKnownHosts $TelegramPath ('opc@' + $oracleHost + ':' + $remoteSecret)
  }
  if ($LASTEXITCODE -ne 0) { throw "Telegram configuration upload failed for $($observer.id)" }
}

function Invoke-Remote($observer, [string]$command) {
  if ($observer.provider -eq 'aws') {
    $target = $aws.username + '@' + $aws.host
    $output = & ssh -i $awsKey -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$awsKnownHosts $target $command
  } elseif ($observer.provider -eq 'google') {
    $target = $google.username + '@' + $google.host
    $output = & $plink -batch -hostkey $google.host_key -i $googleKey $target $command
  } else {
    $output = & ssh -i $oracleKey -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$oracleKnownHosts ('opc@' + $oracleHost) $command
  }
  if ($LASTEXITCODE -ne 0) { throw "Remote monitor operation failed for $($observer.id)" }
  return @($output)
}

foreach ($observer in $observers) {
  Send-Secret $observer
  $install = "set -eu; umask 077; trap 'rm -f -- $remoteSecret' EXIT; sudo install -d -m 0750 -o root -g sovereignkit /etc/sovereignkit/secrets; sudo install -m 0640 -o root -g sovereignkit $remoteSecret $installedSecret; sudo -u sovereignkit test -r $installedSecret"
  Invoke-Remote $observer $install | Out-Null
}

$synthetic = @{}
foreach ($observer in $observers) {
  $command = "set -eu; ! systemctl is-active --quiet $timer; cd $runtime; sudo -u sovereignkit env GRANT_M2_SYNTHETIC_ALERT=MEMORY_CRITICAL /usr/bin/node scripts/run-grant-m2-live-monitor.mjs deploy/m2-live-monitor-policy.json deploy/m2-alert-policy.json $($observer.id) /var/lib/sovereignkit/evidence/m2/alerts/state.json /var/lib/sovereignkit/evidence/m2/alerts/monitor.jsonl $installedSecret; sudo -u sovereignkit /usr/bin/node scripts/run-grant-m2-live-monitor.mjs deploy/m2-live-monitor-policy.json deploy/m2-alert-policy.json $($observer.id) /var/lib/sovereignkit/evidence/m2/alerts/state.json /var/lib/sovereignkit/evidence/m2/alerts/monitor.jsonl $installedSecret"
  $records = @(Invoke-Remote $observer $command | ForEach-Object { $_ | ConvertFrom-Json })
  if ($records.Count -ne 2 -or $records[0].highestSeverity -ne 'CRITICAL' -or
      $records[0].notificationDelivered -ne $true -or $records[1].highestSeverity -ne 'NONE' -or
      $records[1].notificationDelivered -ne $true -or
      $records[0].officialWindowStarted -ne $false -or $records[1].officialWindowStarted -ne $false) {
    throw "Synthetic alert/recovery evidence is invalid for $($observer.id)"
  }
  $synthetic[$observer.id] = [pscustomobject]@{
    alertSequence=$records[0].sequence
    recoverySequence=$records[1].sequence
    alertDelivered=$true
    recoveryDelivered=$true
  }
}

New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
foreach ($observer in $observers) {
  $command = "sudo bash $runtime/scripts/activate-grant-m2-live-monitor.sh $($observer.id) $SourceCommit"
  $record = Invoke-Remote $observer $command | Select-Object -Last 1 | ConvertFrom-Json
  if ($record.status -ne 'LIVE_MONITOR_ACTIVATED' -or $record.observerId -ne $observer.id -or
      $record.sourceCommit -ne $SourceCommit -or $record.sampleRecorded -ne $true -or
      $record.timerEnabled -ne $true -or $record.timerActive -ne $true -or
      $record.workerInstances -ne 0 -or $record.officialWindowStarted -ne $false) {
    throw "Live monitor activation evidence is invalid for $($observer.id)"
  }
  $evidence = [pscustomobject]@{
    schema_version='GrantM2LiveMonitorActivationEvidence@0.1.0'
    observer_id=$observer.id
    source_commit=$SourceCommit
    synthetic_alert_sequence=$synthetic[$observer.id].alertSequence
    synthetic_recovery_sequence=$synthetic[$observer.id].recoverySequence
    synthetic_alert_delivered=$true
    synthetic_recovery_delivered=$true
    timer_enabled=$true
    timer_active=$true
    worker_instances=0
    contains_credentials=$false
    official_window_started=$false
  }
  [IO.File]::WriteAllText((Join-Path $EvidenceDirectory ($observer.id + '.json')), (($evidence | ConvertTo-Json -Depth 10) + "`n"), [Text.UTF8Encoding]::new($false))
}

[pscustomobject]@{
  status='THREE_HOST_LIVE_MONITOR_ACTIVATED'
  sourceCommit=$SourceCommit
  observers=3
  syntheticAlertsDelivered=3
  syntheticRecoveriesDelivered=3
  workerInstances=0
  officialWindowStarted=$false
} | ConvertTo-Json -Compress
