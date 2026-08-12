$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$toolsRoot = Join-Path $workspace ".tools"
if (-not $toolsRoot.StartsWith($workspace, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing unsafe tool path: $toolsRoot"
}

$downloads = Join-Path $toolsRoot "downloads"
New-Item -ItemType Directory -Force -Path $downloads | Out-Null

$rustupUrl = "https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe"
$rustupSha256 = "86478e53f769379d7f0ebfa7c9aa97cb76ca92233f79aa2cc0dbee2efaac73c7"
$rustupExe = Join-Path $downloads "rustup-init.exe"

if (-not (Test-Path -LiteralPath $rustupExe)) {
    curl.exe -L --fail --output $rustupExe $rustupUrl
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$actualRustupHash = (Get-FileHash -LiteralPath $rustupExe -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualRustupHash -ne $rustupSha256) {
    throw "rustup-init SHA-256 mismatch: $actualRustupHash"
}

$env:RUSTUP_HOME = Join-Path $toolsRoot "rustup"
$env:CARGO_HOME = Join-Path $toolsRoot "cargo"
& $rustupExe -y --no-modify-path --profile minimal --default-toolchain 1.97.1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$agaveUrl = "https://github.com/anza-xyz/agave/releases/download/v4.0.0/solana-release-x86_64-pc-windows-msvc.tar.bz2"
$agaveSha256 = "22bb2b16d509ce3d9ea25298d36525cd13750e18616d33886c22969997239759"
$agaveArchive = Join-Path $downloads "solana-release-x86_64-pc-windows-msvc-v4.0.0.tar.bz2"
$agaveRoot = Join-Path $toolsRoot "agave\4.0.0"
$agaveValidator = Join-Path $agaveRoot "solana-release\bin\agave-validator.exe"

if (-not (Test-Path -LiteralPath $agaveValidator)) {
    if (-not (Test-Path -LiteralPath $agaveArchive)) {
        curl.exe -L --fail --output $agaveArchive $agaveUrl
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    $actualAgaveHash = (Get-FileHash -LiteralPath $agaveArchive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualAgaveHash -ne $agaveSha256) {
        throw "Agave archive SHA-256 mismatch: $actualAgaveHash"
    }
    New-Item -ItemType Directory -Force -Path $agaveRoot | Out-Null
    tar.exe -xjf $agaveArchive -C $agaveRoot
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

. (Join-Path $PSScriptRoot "use-pinned-toolchain.ps1")

if ((rustc --version) -notmatch '^rustc 1\.97\.1 ') { throw "Rust version mismatch" }
if ((solana --version) -notmatch 'solana-cli 4\.0\.0') { throw "Solana CLI version mismatch" }
if ((agave-validator --version) -notmatch 'agave-validator 4\.0\.0') { throw "Agave validator version mismatch" }

Write-Output "Pinned Rust 1.97.1 and Agave 4.0.0 are ready in $toolsRoot"
