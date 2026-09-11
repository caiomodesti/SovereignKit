param(
  [Parameter(Mandatory=$true)][string]$RunPath,
  [Parameter(Mandatory=$true)][string]$RunDirectory,
  [string]$ObserverKeysPath = '.secrets\grant-m2-observer-keys.json',
  [string]$ReceiptAuthoritiesPath = '.secrets\grant-m2-receipt-authorities.json',
  [string]$FeePayerPath = '.secrets\sprint-10-devnet-fee-payer.json',
  [string]$AssignmentAuthorityPath = '.secrets\grant-m1-assignment-authority-private.json',
  [string]$AlchemyEndpointPath = '.secrets\alchemy-devnet-endpoint.txt',
  [string]$PublicEndpointPath = '.secrets\solana-public-devnet-endpoint.txt',
  [string]$TelegramPath = '.secrets\grant-m2-telegram.json'
)

$ErrorActionPreference = 'Stop'
$RunPath = (Resolve-Path $RunPath).Path
$RunDirectory = [IO.Path]::GetFullPath($RunDirectory)
$observerKeys = Get-Content $ObserverKeysPath -Raw | ConvertFrom-Json -AsHashtable
$receiptAuthorities = Get-Content $ReceiptAuthoritiesPath -Raw | ConvertFrom-Json -AsHashtable
$run = Get-Content $RunPath -Raw | ConvertFrom-Json
$aws = Get-Content '.secrets\aws-observer-a-connection.json' -Raw | ConvertFrom-Json
$awsKey = (Resolve-Path $aws.key_path).Path
$awsKnownHosts = (Resolve-Path '.secrets\aws-observer-a-known_hosts').Path
$oracleKey = (Resolve-Path '.secrets\grant-m1-observer-c-oracle-ed25519').Path
$oracleKnownHosts = (Resolve-Path '.secrets\grant-m1-observer-c-known_hosts').Path
$oracleHost = ((Get-Content $oracleKnownHosts -TotalCount 1) -split '[ ,]')[0]
$privateKeyPaths = @{
  'observer-aws-a' = '/etc/sovereignkit/secrets/observer-private.json'
  'observer-google-e2-micro' = '/etc/sovereignkit/secrets/observer-private-active.json'
  'observer-oracle-a1' = '/etc/sovereignkit/secrets/observer-private.json'
}

New-Item -ItemType Directory -Path $RunDirectory -Force | Out-Null
$logPath = Join-Path $RunDirectory 'orchestrator.jsonl'

function Write-Event([hashtable]$Event) {
  $Event.recorded_at = Get-UtcCanonical
  [IO.File]::AppendAllText($logPath, (($Event | ConvertTo-Json -Compress -Depth 20) + "`n"), [Text.UTF8Encoding]::new($false))
}

function Get-UtcCanonical { return [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ') }

function Send-Telegram([string]$Text) {
  try {
    $cfg = Get-Content $TelegramPath -Raw | ConvertFrom-Json
    $null = Invoke-RestMethod -Method Post -Uri ('https://api.telegram.org/bot' + $cfg.bot_token + '/sendMessage') -Body @{ chat_id=$cfg.chat_id; text=$Text }
  } catch {
    Write-Event @{ event='TELEGRAM_DELIVERY_FAILED'; error_class=$_.Exception.GetType().Name }
  }
}

function Invoke-Host([string]$ObserverId, [string]$Command) {
  if ($ObserverId -eq 'observer-aws-a') {
    $target = $aws.username + '@' + $aws.host
    $output = & ssh -i $awsKey -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$awsKnownHosts $target $Command
  } elseif ($ObserverId -eq 'observer-oracle-a1') {
    $output = & ssh -i $oracleKey -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$oracleKnownHosts ('opc@' + $oracleHost) $Command
  } elseif ($ObserverId -eq 'observer-google-e2-micro') {
    $output = & gcloud.cmd compute ssh sovereignkit-observer-b --zone us-central1-a --quiet --command $Command
  } else { throw "Unknown observer $ObserverId" }
  if ($LASTEXITCODE -ne 0) { throw "Remote command failed for $ObserverId" }
  return ($output -join "`n")
}

function Send-HostFile([string]$ObserverId, [string]$LocalPath, [string]$RemotePath) {
  if ($ObserverId -eq 'observer-aws-a') {
    $target = $aws.username + '@' + $aws.host + ':' + $RemotePath
    & scp -i $awsKey -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$awsKnownHosts $LocalPath $target
  } elseif ($ObserverId -eq 'observer-oracle-a1') {
    & scp -i $oracleKey -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$oracleKnownHosts $LocalPath ('opc@' + $oracleHost + ':' + $RemotePath)
  } elseif ($ObserverId -eq 'observer-google-e2-micro') {
    & gcloud.cmd compute scp $LocalPath ('sovereignkit-observer-b:' + $RemotePath) --zone us-central1-a --quiet
  } else { throw "Unknown observer $ObserverId" }
  if ($LASTEXITCODE -ne 0) { throw "Remote copy failed for $ObserverId" }
}

function Receive-HostFile([string]$ObserverId, [string]$RemotePath, [string]$LocalPath) {
  $encoded = Invoke-Host $ObserverId ("sudo base64 -w0 '" + $RemotePath + "'")
  [IO.File]::WriteAllBytes($LocalPath, [Convert]::FromBase64String($encoded.Trim()))
}

Write-Event @{ event='REHEARSAL_ORCHESTRATOR_STARTED'; run_id=$run.run_id; expected_slots=$run.schedule.slots.Count; official_window_started=$false }
Send-Telegram ("SovereignKit M2: rehearsal autorizado preparado. Início: " + $run.schedule.start_at + ". Limite: 12 transações Devnet; janela oficial de 14 dias NÃO iniciada.")

try {
  $completedSlots = 0
  foreach ($slot in $run.schedule.slots) {
    $due = [DateTimeOffset]::Parse($slot.due_at)
    while ([DateTimeOffset]::UtcNow -lt $due) {
      $remaining = ($due - [DateTimeOffset]::UtcNow).TotalMilliseconds
      Start-Sleep -Milliseconds ([Math]::Max(50, [Math]::Min(1000, [int]$remaining)))
    }
    $nowAt = Get-UtcCanonical
    if (([DateTimeOffset]::UtcNow - $due).TotalSeconds -gt 8) { throw "Slot missed before submission: $($slot.slot_id)" }
    $slotDirectory = Join-Path $RunDirectory $slot.slot_id
    New-Item -ItemType Directory -Path $slotDirectory -Force | Out-Null
    $entryPath = Join-Path $slotDirectory 'prepared-dispatch.json'
    $slotOutput = & node scripts\run-grant-m2-rehearsal-slot.mjs --run $RunPath --slot-id $slot.slot_id --observer-keys $ObserverKeysPath --fee-payer $FeePayerPath --assignment-authority $AssignmentAuthorityPath --alchemy-endpoint-file $AlchemyEndpointPath --public-endpoint-file $PublicEndpointPath --run-directory $RunDirectory --now-at $nowAt --output $entryPath
    if ($LASTEXITCODE -ne 0) { throw "Slot preparation failed: $($slot.slot_id)" }
    $slotResult = $slotOutput | Select-Object -Last 1 | ConvertFrom-Json
    Write-Event @{ event='SLOT_SUBMISSION_ACKNOWLEDGED'; slot_id=$slot.slot_id; observer_id=$slot.observer_id; route_id=$slot.route_id; signature=$slotResult.signature; assignment_id=$slotResult.assignmentId; qualifying_units=0 }

    $remoteEntry = '/tmp/sovereignkit-m2-' + $slotResult.assignmentId + '.json'
    Send-HostFile $slot.observer_id $entryPath $remoteEntry
    $receivedAt = Get-UtcCanonical
    $receiveCommand = "sudo -u sovereignkit node /opt/sovereignkit-m2-rehearsal/scripts/receive-grant-m2-assignment.mjs '$remoteEntry' /etc/sovereignkit/assignment-authorities.json '$($privateKeyPaths[$slot.observer_id])' /var/lib/sovereignkit/m2/inbox '$receivedAt'"
    $receiveOutput = Invoke-Host $slot.observer_id $receiveCommand
    $received = $receiveOutput | Select-Object -Last 1 | ConvertFrom-Json
    if ($received.status -ne 'RECEIVED') { throw "Assignment receipt failed: $($slot.slot_id)" }
    $transportRecordedAt = Get-UtcCanonical
    $serviceName = 'sovereignkit-m2-observation-worker@' + $slotResult.assignmentId + '.service'
    Invoke-Host $slot.observer_id ("sudo systemctl start '" + $serviceName + "'") | Out-Null
    $workerRecordedAt = Get-UtcCanonical
    $remoteBase = '/var/lib/sovereignkit/m2/inbox/' + $slotResult.assignmentId
    $receiptPath = Join-Path $slotDirectory 'receipt.json'
    $completionPath = Join-Path $slotDirectory 'completion.json'
    $rawPath = Join-Path $slotDirectory 'raw.jsonl'
    Receive-HostFile $slot.observer_id ($remoteBase + '/receipt.json') $receiptPath
    Receive-HostFile $slot.observer_id ('/var/lib/sovereignkit/evidence/m2/completed/' + $slotResult.assignmentId + '.json') $completionPath
    Receive-HostFile $slot.observer_id ('/var/lib/sovereignkit/evidence/m2/raw/' + $slotResult.assignmentId + '.jsonl') $rawPath
    $authorityPath = Join-Path $slotDirectory 'receipt-authority.json'
    [IO.File]::WriteAllText($authorityPath, (($receiptAuthorities[$slot.observer_id] | ConvertTo-Json -Depth 10) + "`n"), [Text.UTF8Encoding]::new($false))
    $completeOutput = & node scripts\complete-grant-m2-rehearsal-slot.mjs --slot-journal-directory (Join-Path $RunDirectory 'slots') --slot-id $slot.slot_id --entry $entryPath --receipt $receiptPath --receipt-authority $authorityPath --worker-evidence $completionPath --transport-recorded-at $transportRecordedAt --worker-recorded-at $workerRecordedAt
    if ($LASTEXITCODE -ne 0) { throw "Slot completion failed: $($slot.slot_id)" }
    $complete = $completeOutput | Select-Object -Last 1 | ConvertFrom-Json
    $completedSlots += 1
    Write-Event @{ event='SLOT_WORKER_COMPLETED'; slot_id=$slot.slot_id; observer_id=$slot.observer_id; terminal_state=$complete.terminal_state; completed_slots=$completedSlots; qualifying_units=0 }
    Send-Telegram ("SovereignKit M2 rehearsal: slot " + $completedSlots + "/12 concluído em " + $slot.observer_id + " (" + $complete.terminal_state + ").")
  }
  $runEnd = [DateTimeOffset]::Parse($run.schedule.end_at)
  while ([DateTimeOffset]::UtcNow -lt $runEnd) {
    $remaining = ($runEnd - [DateTimeOffset]::UtcNow).TotalMilliseconds
    Start-Sleep -Milliseconds ([Math]::Max(100, [Math]::Min(1000, [int]$remaining)))
  }
  Write-Event @{ event='REHEARSAL_SLOTS_COMPLETED'; completed_slots=12; elapsed_seconds=3600; qualifying_units=0; official_window_started=$false }
  Send-Telegram 'SovereignKit M2: 12/12 slots do rehearsal executados. Validação, reconciliação e backup ainda pendentes; janela oficial de 14 dias NÃO iniciada.'
} catch {
  Write-Event @{ event='REHEARSAL_STOPPED_FAIL_CLOSED'; error_class=$_.Exception.GetType().Name; message=$_.Exception.Message; official_window_started=$false }
  Send-Telegram ("SovereignKit M2: rehearsal interrompido em modo fail-closed. Motivo: " + $_.Exception.Message + ". Não haverá retry automático; janela de 14 dias não iniciada.")
  throw
}
