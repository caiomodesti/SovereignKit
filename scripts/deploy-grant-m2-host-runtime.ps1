param(
  [Parameter(Mandatory=$true)][string]$ArchivePath,
  [Parameter(Mandatory=$true)][string]$ArchiveSha256,
  [Parameter(Mandatory=$true)][string]$SourceCommit,
  [Parameter(Mandatory=$true)][string]$EvidenceDirectory,
  [switch]$UpgradeExisting
)

$ErrorActionPreference = 'Stop'
if ($ArchiveSha256 -notmatch '^[a-f0-9]{64}$' -or $SourceCommit -notmatch '^[a-f0-9]{40}$') { throw 'Invalid package identity' }
$ArchivePath = (Resolve-Path $ArchivePath).Path
$EvidenceDirectory = [IO.Path]::GetFullPath($EvidenceDirectory)
New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
$actual = (Get-FileHash $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $ArchiveSha256) { throw 'Local host-runtime archive hash mismatch' }
$installer = if ($UpgradeExisting) { (Resolve-Path 'scripts\upgrade-grant-m2-host-runtime.sh').Path } else { (Resolve-Path 'scripts\install-grant-m2-host-runtime.sh').Path }
$aws = Get-Content '.secrets\aws-observer-a-connection.json' -Raw | ConvertFrom-Json
$awsKey = (Resolve-Path $aws.key_path).Path
$awsKnownHosts = (Resolve-Path '.secrets\aws-observer-a-known_hosts').Path
$oracleKey = (Resolve-Path '.secrets\grant-m1-observer-c-oracle-ed25519').Path
$oracleKnownHosts = (Resolve-Path '.secrets\grant-m1-observer-c-known_hosts').Path
$oracleHost = ((Get-Content $oracleKnownHosts -TotalCount 1) -split '[ ,]')[0]
$remoteArchive = '/tmp/sovereignkit-m2-host-runtime-' + $SourceCommit + '.tar.gz'
$remoteInstaller = '/tmp/' + $(if ($UpgradeExisting) { 'upgrade' } else { 'install' }) + '-grant-m2-host-runtime-' + $SourceCommit + '.sh'

function Send-Files([string]$ObserverId) {
  if ($ObserverId -eq 'observer-aws-a') {
    $target = $aws.username + '@' + $aws.host
    & scp -i $awsKey -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$awsKnownHosts $ArchivePath ($target + ':' + $remoteArchive)
    if ($LASTEXITCODE -eq 0) { & scp -i $awsKey -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$awsKnownHosts $installer ($target + ':' + $remoteInstaller) }
  } elseif ($ObserverId -eq 'observer-oracle-a1') {
    $target = 'opc@' + $oracleHost
    & scp -i $oracleKey -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$oracleKnownHosts $ArchivePath ($target + ':' + $remoteArchive)
    if ($LASTEXITCODE -eq 0) { & scp -i $oracleKey -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$oracleKnownHosts $installer ($target + ':' + $remoteInstaller) }
  } elseif ($ObserverId -eq 'observer-google-e2-micro') {
    & gcloud.cmd compute scp $ArchivePath ('sovereignkit-observer-b:' + $remoteArchive) --zone us-central1-a --quiet
    if ($LASTEXITCODE -eq 0) { & gcloud.cmd compute scp $installer ('sovereignkit-observer-b:' + $remoteInstaller) --zone us-central1-a --quiet }
  } else { throw "Unknown observer $ObserverId" }
  if ($LASTEXITCODE -ne 0) { throw "Package upload failed for $ObserverId" }
}

function Install-Host([string]$ObserverId) {
  $command = "sudo bash '$remoteInstaller' '$remoteArchive' '$ArchiveSha256' '$SourceCommit' '$ObserverId'"
  if ($ObserverId -eq 'observer-aws-a') {
    $target = $aws.username + '@' + $aws.host
    $output = & ssh -i $awsKey -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$awsKnownHosts $target $command
  } elseif ($ObserverId -eq 'observer-oracle-a1') {
    $output = & ssh -i $oracleKey -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$oracleKnownHosts ('opc@' + $oracleHost) $command
  } else {
    $output = & gcloud.cmd compute ssh sovereignkit-observer-b --zone us-central1-a --quiet --command $command
  }
  if ($LASTEXITCODE -ne 0) { throw "Host installation failed for $ObserverId; reconciliation required" }
  $record = $output | Select-Object -Last 1 | ConvertFrom-Json
  $expectedStatus = if ($UpgradeExisting) { 'UPGRADED_NOT_ACTIVATED' } else { 'INSTALLED_NOT_ACTIVATED' }
  if ($record.status -ne $expectedStatus -or $record.observerId -ne $ObserverId -or $record.sourceCommit -ne $SourceCommit -or $record.archiveSha256 -ne $ArchiveSha256 -or $record.workerInstances -ne 0) { throw "Host installation evidence is invalid for $ObserverId" }
  [IO.File]::WriteAllText((Join-Path $EvidenceDirectory ($ObserverId + '.json')), (($record | ConvertTo-Json -Depth 10) + "`n"), [Text.UTF8Encoding]::new($false))
}

foreach ($observer in @('observer-aws-a','observer-google-e2-micro','observer-oracle-a1')) {
  Send-Files $observer
  Install-Host $observer
}
$finalStatus = if ($UpgradeExisting) { 'UPGRADED_THREE_HOSTS_NOT_ACTIVATED' } else { 'INSTALLED_THREE_HOSTS_NOT_ACTIVATED' }
[pscustomobject]@{ status=$finalStatus; sourceCommit=$SourceCommit; archiveSha256=$ArchiveSha256; observers=3; workerInstances=0 } | ConvertTo-Json -Compress
