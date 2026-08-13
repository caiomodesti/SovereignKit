param([switch]$UpdateFixture)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$validator = (Resolve-Path (Join-Path $workspace '.tools\agave\4.0.0-patched\bin\solana-test-validator.exe')).Path
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$ledger = Join-Path $env:TEMP ('SovereignKit\sprint-4-proxy-' + $stamp)
$runDirectory = Join-Path $workspace ('artifacts\sprint-4\runs\' + $stamp)
$validatorDirectory = Join-Path $runDirectory 'validator'
New-Item -ItemType Directory -Force -Path $validatorDirectory | Out-Null

$processInfo = [Diagnostics.ProcessStartInfo]::new()
$processInfo.FileName = $validator
$processInfo.Arguments = '--ledger "' + $ledger + '" --reset --bind-address 127.0.0.1 --rpc-port 8899 --faucet-port 9900 --limit-ledger-size 10000 --log'
$processInfo.WorkingDirectory = $validatorDirectory
$processInfo.UseShellExecute = $false
$processInfo.CreateNoWindow = $true
$processInfo.RedirectStandardOutput = $true
$processInfo.RedirectStandardError = $true
$validatorProcess = [Diagnostics.Process]::Start($processInfo)
$stdoutTask = $validatorProcess.StandardOutput.ReadToEndAsync()
$stderrTask = $validatorProcess.StandardError.ReadToEndAsync()
$healthy = $false
$testExitCode = 98

try {
  $healthBody = '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
  for ($attempt = 0; $attempt -lt 180; $attempt += 1) {
    if ($validatorProcess.HasExited) { break }
    try {
      $health = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8899' -ContentType 'application/json' -Body $healthBody
      if ($health.result -eq 'ok') { $healthy = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  if (-not $healthy) { throw 'Local Agave validator did not become healthy' }
  $env:SOVEREIGNKIT_RPC_ENDPOINT = 'http://127.0.0.1:8899'
  $env:SOVEREIGNKIT_ARTIFACT_DIR = $runDirectory
  if ($UpdateFixture) { $env:SOVEREIGNKIT_FIXTURE_DIR = Join-Path $workspace 'fixtures\integration\agave-4.0.0\hostile-proxy' }
  else { Remove-Item Env:SOVEREIGNKIT_FIXTURE_DIR -ErrorAction SilentlyContinue }
  & node node_modules/typescript/bin/tsc -p packages/hostile-proxy/tsconfig.integration.json --noEmit
  if ($LASTEXITCODE -ne 0) { $testExitCode = $LASTEXITCODE; throw 'Integration typecheck failed' }
  & node node_modules/vitest/vitest.mjs run packages/hostile-proxy/integration/live-hostile-proxy.integration.test.ts --testTimeout=120000
  $testExitCode = $LASTEXITCODE
} finally {
  if (-not $validatorProcess.HasExited) { Stop-Process -Id $validatorProcess.Id; Wait-Process -Id $validatorProcess.Id -Timeout 20 -ErrorAction SilentlyContinue }
  Set-Content -LiteralPath (Join-Path $validatorDirectory 'validator.stdout.log') -Value $stdoutTask.Result -Encoding utf8
  Set-Content -LiteralPath (Join-Path $validatorDirectory 'validator.stderr.log') -Value $stderrTask.Result -Encoding utf8
  [ordered]@{
    runId = $stamp
    validatorVersion = (& $validator --version)
    validatorSha256 = (Get-FileHash -Algorithm SHA256 $validator).Hash
    ledger = $ledger
    rpcEndpoint = 'http://127.0.0.1:8899'
    validatorHealthy = $healthy
    testExitCode = $testExitCode
    fixtureUpdated = [bool]$UpdateFixture
  } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runDirectory 'run-manifest.json') -Encoding utf8
  Write-Output ('HEALTHY=' + $healthy)
  Write-Output ('RUN_ID=' + $stamp)
  Write-Output ('RUN_DIR=' + $runDirectory)
  Write-Output ('TEST_EXIT_CODE=' + $testExitCode)
}
exit $testExitCode
