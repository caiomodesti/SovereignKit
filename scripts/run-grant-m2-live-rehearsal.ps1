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

function Get-HostServiceState([string]$ObserverId, [string]$ServiceName) {
  return (Invoke-Host $ObserverId ("sudo systemctl show --property=ActiveState --value '" + $ServiceName + "'")).Trim()
}

function Test-HostFile([string]$ObserverId, [string]$RemotePath) {
  $status = Invoke-Host $ObserverId ("if sudo test -f '" + $RemotePath + "'; then echo PRESENT; else echo MISSING; fi")
  return $status.Trim() -eq 'PRESENT'
}

function Complete-PendingSlot([pscustomobject]$Pending, [DateTimeOffset]$Deadline) {
  $completionRemotePath = '/var/lib/sovereignkit/evidence/m2/completed/' + $Pending.AssignmentId + '.json'
  while (-not (Test-HostFile $Pending.ObserverId $completionRemotePath)) {
    if ([DateTimeOffset]::UtcNow -ge $Deadline) {
      throw "Worker completion deadline exceeded before another transaction: $($Pending.SlotId)"
    }
    Start-Sleep -Milliseconds 1000
  }

  $workerRecordedAt = Get-UtcCanonical
  Receive-HostFile $Pending.ObserverId $completionRemotePath $Pending.CompletionPath
  Receive-HostFile $Pending.ObserverId ('/var/lib/sovereignkit/evidence/m2/raw/' + $Pending.AssignmentId + '.jsonl') $Pending.RawPath
  $completeOutput = & node scripts\complete-grant-m2-rehearsal-slot.mjs --slot-journal-directory (Join-Path $RunDirectory 'slots') --slot-id $Pending.SlotId --entry $Pending.EntryPath --receipt $Pending.ReceiptPath --receipt-authority $Pending.AuthorityPath --worker-evidence $Pending.CompletionPath --transport-recorded-at $Pending.TransportRecordedAt --worker-recorded-at $workerRecordedAt
  if ($LASTEXITCODE -ne 0) { throw "Slot completion failed: $($Pending.SlotId)" }
  $complete = $completeOutput | Select-Object -Last 1 | ConvertFrom-Json
  $script:completedSlots += 1
  Write-Event @{ event='SLOT_WORKER_COMPLETED'; slot_id=$Pending.SlotId; observer_id=$Pending.ObserverId; terminal_state=$complete.terminal_state; completed_slots=$script:completedSlots; qualifying_units=0 }
  Send-Telegram ("SovereignKit M2 rehearsal: slot " + $script:completedSlots + "/12 concluído em " + $Pending.ObserverId + " (" + $complete.terminal_state + ").")
}

Write-Event @{ event='REHEARSAL_ORCHESTRATOR_STARTED'; run_id=$run.run_id; expected_slots=$run.schedule.slots.Count; official_window_started=$false }
Send-Telegram ("SovereignKit M2: rehearsal autorizado preparado. Início: " + $run.schedule.start_at + ". Limite: 12 transações Devnet; janela oficial de 14 dias NÃO iniciada.")

try {
  $script:completedSlots = 0
  $pendingByObserver = @{}
  foreach ($slot in $run.schedule.slots) {
    $due = [DateTimeOffset]::Parse($slot.due_at)
    if ($pendingByObserver.ContainsKey($slot.observer_id)) {
      $previous = $pendingByObserver[$slot.observer_id]
      $serviceState = Get-HostServiceState $previous.ObserverId $previous.ServiceName
      if ($serviceState -in @('active', 'activating', 'deactivating', 'reloading')) {
        Complete-PendingSlot $previous $due
      } else {
        Complete-PendingSlot $previous ([DateTimeOffset]::UtcNow)
      }
      $pendingByObserver.Remove($slot.observer_id)
    }
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
    Invoke-Host $slot.observer_id ("sudo systemctl start --no-block '" + $serviceName + "'") | Out-Null
    $remoteBase = '/var/lib/sovereignkit/m2/inbox/' + $slotResult.assignmentId
    $receiptPath = Join-Path $slotDirectory 'receipt.json'
    $completionPath = Join-Path $slotDirectory 'completion.json'
    $rawPath = Join-Path $slotDirectory 'raw.jsonl'
    Receive-HostFile $slot.observer_id ($remoteBase + '/receipt.json') $receiptPath
    $authorityPath = Join-Path $slotDirectory 'receipt-authority.json'
    [IO.File]::WriteAllText($authorityPath, (($receiptAuthorities[$slot.observer_id] | ConvertTo-Json -Depth 10) + "`n"), [Text.UTF8Encoding]::new($false))
    $pendingByObserver[$slot.observer_id] = [pscustomobject]@{
      SlotId = $slot.slot_id
      ObserverId = $slot.observer_id
      AssignmentId = $slotResult.assignmentId
      ServiceName = $serviceName
      EntryPath = $entryPath
      ReceiptPath = $receiptPath
      AuthorityPath = $authorityPath
      CompletionPath = $completionPath
      RawPath = $rawPath
      TransportRecordedAt = $transportRecordedAt
    }
    Write-Event @{ event='SLOT_RECEIVED_WORKER_STARTED'; slot_id=$slot.slot_id; observer_id=$slot.observer_id; service_name=$serviceName; qualifying_units=0 }
    Send-Telegram ("SovereignKit M2 rehearsal: slot " + $slot.slot_id + " recebido por " + $slot.observer_id + "; worker iniciado sem bloquear o próximo horário.")
  }
  $runEnd = [DateTimeOffset]::Parse($run.schedule.end_at)
  foreach ($pending in @($pendingByObserver.Values)) {
    Complete-PendingSlot $pending $runEnd
  }
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
