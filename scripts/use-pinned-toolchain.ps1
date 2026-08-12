$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$toolsRoot = Join-Path $workspace ".tools"
$cargoHome = Join-Path $toolsRoot "cargo"
$rustupHome = Join-Path $toolsRoot "rustup"
$agaveBin = Join-Path $toolsRoot "agave\4.0.0\solana-release\bin"

$required = @(
    (Join-Path $cargoHome "bin\rustc.exe"),
    (Join-Path $agaveBin "solana.exe"),
    (Join-Path $agaveBin "solana-test-validator.exe")
)

foreach ($path in $required) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Pinned toolchain is incomplete. Missing: $path. Run scripts/setup-pinned-toolchain.ps1."
    }
}

$env:CARGO_HOME = $cargoHome
$env:RUSTUP_HOME = $rustupHome
$env:PATH = "$($cargoHome)\bin;$agaveBin;$env:PATH"
