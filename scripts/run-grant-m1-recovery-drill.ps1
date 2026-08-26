$ErrorActionPreference = 'Stop'

$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$artifactDirectory = Join-Path (Get-Location) ("artifacts\grant-m1\recovery-drill\$stamp")
New-Item -ItemType Directory -Force -Path $artifactDirectory | Out-Null
$previousArtifact = $env:SOVEREIGNKIT_RECOVERY_ARTIFACT_DIR
try {
  $env:SOVEREIGNKIT_RECOVERY_ARTIFACT_DIR = $artifactDirectory
  node node_modules/vitest/vitest.mjs run packages/collector/integration/grant-m1-recovery-drill.integration.test.ts --testTimeout=30000
  if ($LASTEXITCODE -ne 0) { throw "recovery drill integration test failed" }
  node scripts/verify-grant-m1-recovery-drill.mjs --evidence $artifactDirectory
  if ($LASTEXITCODE -ne 0) { throw "recovery drill evidence verification failed" }
} finally {
  $env:SOVEREIGNKIT_RECOVERY_ARTIFACT_DIR = $previousArtifact
}
Write-Output "Grant M1 local recovery evidence: $artifactDirectory"
