param(
  [string]$RpcEndpoint = "http://127.0.0.1:8899",
  [string]$ArtifactDirectory = ""
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $workspace
if ([string]::IsNullOrWhiteSpace($ArtifactDirectory)) {
  $stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
  $ArtifactDirectory = Join-Path $workspace "artifacts\grant-m1\local-readiness\$stamp"
} elseif (-not [IO.Path]::IsPathRooted($ArtifactDirectory)) {
  $ArtifactDirectory = Join-Path $workspace $ArtifactDirectory
}
if (Test-Path -LiteralPath $ArtifactDirectory) {
  throw "Artifact directory already exists; use a new path: $ArtifactDirectory"
}
$health = Invoke-RestMethod -Uri $RpcEndpoint -Method Post -ContentType "application/json" -Body '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
if ($health.result -ne "ok") { throw "Solana RPC is not healthy at $RpcEndpoint" }
$runtimeCommit = (git rev-parse HEAD).Trim()
if ($runtimeCommit -notmatch '^[a-f0-9]{40}$') { throw "Could not resolve the runtime commit" }

$previousRun = $env:SOVEREIGNKIT_RUN_GRANT_M1_LOCAL_READINESS
$previousRpc = $env:SOVEREIGNKIT_RPC_ENDPOINT
$previousArtifacts = $env:SOVEREIGNKIT_ARTIFACT_DIR
$previousCommit = $env:SOVEREIGNKIT_RUNTIME_COMMIT
try {
  $env:SOVEREIGNKIT_RUN_GRANT_M1_LOCAL_READINESS = "1"
  $env:SOVEREIGNKIT_RPC_ENDPOINT = $RpcEndpoint
  $env:SOVEREIGNKIT_ARTIFACT_DIR = $ArtifactDirectory
  $env:SOVEREIGNKIT_RUNTIME_COMMIT = $runtimeCommit
  corepack pnpm@11.16.0 build
  if ($LASTEXITCODE -ne 0) { throw "Workspace build failed" }
  corepack pnpm@11.16.0 check:collector:integration
  if ($LASTEXITCODE -ne 0) { throw "Collector integration typecheck failed" }
  node node_modules/vitest/vitest.mjs run packages/collector/integration/grant-m1-local-readiness.integration.test.ts --testTimeout=120000
  if ($LASTEXITCODE -ne 0) { throw "Grant M1 local readiness run failed" }
  node scripts/verify-grant-m1-local-readiness.mjs --evidence $ArtifactDirectory
  if ($LASTEXITCODE -ne 0) { throw "Grant M1 local readiness evidence verification failed" }
  Write-Output "Grant M1 local readiness evidence: $ArtifactDirectory"
} finally {
  $env:SOVEREIGNKIT_RUN_GRANT_M1_LOCAL_READINESS = $previousRun
  $env:SOVEREIGNKIT_RPC_ENDPOINT = $previousRpc
  $env:SOVEREIGNKIT_ARTIFACT_DIR = $previousArtifacts
  $env:SOVEREIGNKIT_RUNTIME_COMMIT = $previousCommit
}
