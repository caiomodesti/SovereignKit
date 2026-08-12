param(
    [switch]$Background
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "use-pinned-toolchain.ps1")

$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$artifactRoot = Join-Path $workspace "artifacts\sprint-1.5"
$temporaryRoot = [System.IO.Path]::GetFullPath((Join-Path ([System.IO.Path]::GetTempPath()) "SovereignKit"))
if ($temporaryRoot -eq [System.IO.Path]::GetPathRoot($temporaryRoot)) {
    throw "Refusing unsafe temporary ledger root: $temporaryRoot"
}
$ledger = Join-Path $temporaryRoot "agave-4.0.0-ledger"
$validator = Join-Path $workspace ".tools\agave\4.0.0\solana-release\bin\solana-test-validator.exe"
$stdoutLog = Join-Path $artifactRoot "validator.stdout.log"
$stderrLog = Join-Path $artifactRoot "validator.stderr.log"

New-Item -ItemType Directory -Force -Path $artifactRoot | Out-Null
New-Item -ItemType Directory -Force -Path $temporaryRoot | Out-Null

$arguments = @(
    "--ledger", $ledger,
    "--reset",
    "--bind-address", "127.0.0.1",
    "--rpc-port", "8899",
    "--faucet-port", "9900",
    "--limit-ledger-size", "10000"
)

if (-not $Background) {
    & $validator @arguments
    exit $LASTEXITCODE
}

$process = Start-Process -FilePath $validator -ArgumentList $arguments -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -WindowStyle Hidden -PassThru
Set-Content -LiteralPath (Join-Path $artifactRoot "validator.pid") -Value $process.Id -Encoding ascii

$rpcBody = '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
for ($attempt = 0; $attempt -lt 120; $attempt++) {
    if ($process.HasExited) {
        $process.Refresh()
        $errorTail = if (Test-Path -LiteralPath $stderrLog) { Get-Content -LiteralPath $stderrLog -Tail 30 } else { @() }
        throw "Validator exited during startup with code $($process.ExitCode).`n$($errorTail -join "`n")"
    }
    try {
        $health = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8899" -ContentType "application/json" -Body $rpcBody
        if ($health.result -eq "ok") {
            Write-Output "Agave 4.0.0 local validator healthy (PID $($process.Id), RPC http://127.0.0.1:8899)"
            exit 0
        }
    } catch {
        Start-Sleep -Milliseconds 500
    }
}

throw "Validator did not become healthy within 60 seconds"
