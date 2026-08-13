param(
  [string]$ValidatorPath = ".tools\agave\4.0.0-patched\bin\solana-test-validator.exe",
  [string]$ProgramAddress = "4Ywfurzjdhh83CUhTp1A3yaJuos4bSeYBtAZiJUnvq8h"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$validator = (Resolve-Path (Join-Path $workspace $ValidatorPath)).Path
$cargoBuildSbf = (Resolve-Path (Join-Path $workspace ".tools\agave\4.0.0\solana-release\bin\cargo-build-sbf.exe")).Path
$manifest = Join-Path $workspace "programs\matched-probe\Cargo.toml"
$programBinary = Join-Path $workspace "programs\matched-probe\target\deploy\sovereignkit_matched_probe.so"
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$runDirectory = Join-Path $workspace ("artifacts\sprint-5\program-runs\" + $stamp)
$ledger = Join-Path $env:TEMP ("SovereignKit\sprint-5-program-" + $stamp)
$validatorDirectory = Join-Path $runDirectory "validator"
$fixtureDirectory = Join-Path $workspace "fixtures\integration\agave-4.0.0\matched-program"
New-Item -ItemType Directory -Force -Path $validatorDirectory | Out-Null

$env:CARGO_HOME = (Resolve-Path (Join-Path $workspace ".tools\cargo")).Path
& $cargoBuildSbf --manifest-path $manifest --offline
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$previousRustLog = $env:RUST_LOG
$env:RUST_LOG = "solana_faucet=info,solana_rpc=info,warn"
$processInfo = [Diagnostics.ProcessStartInfo]::new()
$processInfo.FileName = $validator
$processInfo.Arguments = '--ledger "' + $ledger + '" --reset --bind-address 127.0.0.1 --rpc-port 8899 --faucet-port 9900 --limit-ledger-size 10000 --bpf-program ' + $ProgramAddress + ' "' + $programBinary + '" --log'
$processInfo.WorkingDirectory = $validatorDirectory
$processInfo.UseShellExecute = $false
$processInfo.CreateNoWindow = $true
$processInfo.RedirectStandardOutput = $true
$processInfo.RedirectStandardError = $true
$process = [Diagnostics.Process]::Start($processInfo)
$env:RUST_LOG = $previousRustLog
$stdoutTask = $process.StandardOutput.ReadToEndAsync()
$stderrTask = $process.StandardError.ReadToEndAsync()
Set-Content (Join-Path $validatorDirectory "validator.pid") $process.Id -Encoding ascii

$healthy = $false
$healthBody = '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
for ($attempt = 0; $attempt -lt 180; $attempt += 1) {
  if ($process.HasExited) { break }
  try {
    $health = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8899" -ContentType "application/json" -Body $healthBody
    if ($health.result -eq "ok") { $healthy = $true; break }
  } catch {}
  Start-Sleep -Milliseconds 500
}

$testExitCode = 98
if ($healthy) {
  $env:SOVEREIGNKIT_RPC_ENDPOINT = "http://127.0.0.1:8899"
  $env:SOVEREIGNKIT_MATCHED_PROGRAM_ADDRESS = $ProgramAddress
  $env:SOVEREIGNKIT_ARTIFACT_DIR = $runDirectory
  $env:SOVEREIGNKIT_FIXTURE_DIR = $fixtureDirectory
  Push-Location $workspace
  try {
    node node_modules/typescript/bin/tsc -p packages/probes/tsconfig.integration.json --noEmit
    $testExitCode = $LASTEXITCODE
    if ($testExitCode -eq 0) {
      node node_modules/vitest/vitest.mjs run packages/probes/integration/live-matched-program.integration.test.ts --testTimeout=120000
      $testExitCode = $LASTEXITCODE
    }
  } finally {
    Pop-Location
  }
}

if (-not $process.HasExited) {
  Stop-Process -Id $process.Id
  Wait-Process -Id $process.Id -Timeout 20 -ErrorAction SilentlyContinue
}
$stdout = $stdoutTask.Result
$stderr = $stderrTask.Result
Set-Content -LiteralPath (Join-Path $validatorDirectory "validator.stdout.log") -Value $stdout -Encoding utf8
Set-Content -LiteralPath (Join-Path $validatorDirectory "validator.stderr.log") -Value $stderr -Encoding utf8

$runManifest = [ordered]@{
  runId = $stamp
  validatorVersion = (& $validator --version)
  validatorSha256 = (Get-FileHash -Algorithm SHA256 $validator).Hash
  programAddress = $ProgramAddress
  programBinarySha256 = (Get-FileHash -Algorithm SHA256 $programBinary).Hash
  ledger = $ledger
  rpcEndpoint = "http://127.0.0.1:8899"
  validatorHealthy = $healthy
  testExitCode = $testExitCode
}
$runManifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runDirectory "run-manifest.json") -Encoding utf8
Write-Output ("HEALTHY=" + $healthy)
Write-Output ("RUN_ID=" + $stamp)
Write-Output ("RUN_DIR=" + $runDirectory)
Write-Output ("TEST_EXIT_CODE=" + $testExitCode)
exit $testExitCode
