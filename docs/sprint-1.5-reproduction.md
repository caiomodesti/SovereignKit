# Sprint 1.5 reproduction

This procedure reproduces the Live Validator Integration Proof on Windows. It does not start Sprint 2.

## Pinned environment

| Component | Required value |
|---|---:|
| Node.js | 22.17.0 |
| pnpm | 11.16.0 |
| Rust | 1.97.1 MSVC |
| Agave/Solana CLI | 4.0.0 |
| Visual Studio Build Tools | 2022 / 17.14.37531.7 |
| Strawberry Perl | 5.42.2.1 |
| LLVM/libclang | 19.1.7 |
| protoc | 21.12 (`libprotoc 3.21.12`) |

Install the project pins and official Agave CLI distribution:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-pinned-toolchain.ps1
pnpm install --frozen-lockfile
. scripts/use-pinned-toolchain.ps1
pnpm env:doctor
```

The official Agave Windows `solana-test-validator.exe` cannot complete this proof. ADR-016 documents two concrete Windows incompatibilities and the permitted source-build exception.

## Build the patched Agave validator

Download `https://github.com/anza-xyz/agave/archive/refs/tags/v4.0.0.tar.gz`. Its required SHA-256 is:

```text
1BD1B7B4EB412D95926ED9490DFBDAC787F75A63DF13317AF7DDEC37BE0EB6A1
```

Extract it to `.tools/agave-source/agave-4.0.0`, apply `patches/agave-v4.0.0-windows-directory-open.patch` from the extracted source root, and use a Visual Studio x64 developer shell. With the pinned tools in the paths below, the exact verification/build commands are:

```bat
set CARGO_HOME=<workspace>\.tools\cargo
set RUSTUP_HOME=<workspace>\.tools\rustup
set RUSTUP_TOOLCHAIN=1.97.1-x86_64-pc-windows-msvc
set CARGO_TARGET_DIR=%TEMP%\SovereignKit\cargo-target-agave-4.0.0
set LIBCLANG_PATH=<workspace>\.tools\llvm\libclang-19.1.7
set PROTOC=<workspace>\.tools\protoc\21.12\bin\protoc.exe
set PATH=%PATH%;<workspace>\.tools\strawberry-perl\5.42.2.1\perl\bin;<workspace>\.tools\llvm\libclang-19.1.7
cargo test -p agave-snapshots --features agave-unstable-api hardened_unpack::tests::
cargo build --release -p agave-validator --bin solana-test-validator
```

The focused test must report `16 passed, 0 failed`. Copy the executable to `.tools/agave/4.0.0-patched/bin/solana-test-validator.exe`. It must report version `4.0.0`; the accepted local executable SHA-256 is:

```text
9E9FD1C10BE90585039C1637F36FFCA360ADD8A6E7B1F64324E75B7E4708B406
```

Local build paths can change debug metadata and therefore binary hashes. A different hash is not automatically accepted: preserve the source hash, patch, compiler versions, focused tests, reported Agave version, and resulting hash for review.

## Run the proof

Terminal 1:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-local-validator.ps1 -Background
```

Terminal 2:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-live-validator-proof.ps1 -UpdateFixture
```

The startup command expands to a clean Agave invocation with:

```text
solana-test-validator --ledger %TEMP%\SovereignKit\agave-4.0.0-ledger --reset --bind-address 127.0.0.1 --rpc-port 8899 --faucet-port 9900 --limit-ledger-size 10000 --log
```

The proof command runs environment validation, integration typecheck, build, and the live Vitest. It writes runtime evidence under ignored `artifacts/sprint-1.5/runs/<run_id>` and, only with `-UpdateFixture`, refreshes the committed healthy fixture.

## Expected evidence

- a real transaction signature;
- append-only `raw-events.jsonl` as primary evidence;
- a derived JSON/text timeline;
- `RPC_ACKNOWLEDGED` before any ledger observation;
- three logical reader IDs and quorum at least 2/3;
- real `confirmed` and `finalized` statuses;
- finalized recipient balance of `1,000,000` lamports;
- lifecycle `CREATED → SUBMISSION_ATTEMPTED → RPC_ACKNOWLEDGED → OBSERVATION_PENDING → OBSERVED_EXECUTION_SUCCESS → CONFIRMED → FINALIZED`.

The readers share one local validator and are not operationally independent infrastructure.
