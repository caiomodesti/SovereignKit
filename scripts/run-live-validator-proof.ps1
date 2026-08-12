param(
    [switch]$UpdateFixture
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "use-pinned-toolchain.ps1")

$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runId = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$env:SOVEREIGNKIT_RPC_ENDPOINT = "http://127.0.0.1:8899"
$env:SOVEREIGNKIT_ARTIFACT_DIR = Join-Path $workspace "artifacts\sprint-1.5\runs\$runId"
if ($UpdateFixture) {
    $env:SOVEREIGNKIT_FIXTURE_DIR = Join-Path $workspace "fixtures\integration\agave-4.0.0\healthy"
} else {
    $env:SOVEREIGNKIT_FIXTURE_DIR = $null
}

pnpm env:doctor
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm check:integration
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm test:live
exit $LASTEXITCODE
