# Project-owned matched probe program

Sprint 5 closes the controlled-program prerequisite with
`programs/matched-probe`, compiled as a Solana SBF `cdylib` by
`cargo-build-sbf 4.0.0` under Rust 1.97.1.

The program accepts no accounts and exactly 17 instruction-data bytes. Byte 0
is the declared class discriminator (`0` for `MATCHED_CONTROL`, `1` for
`PROGRAM_X`); the remaining 16 bytes are the matched pair nonce. Both accepted
classes pass the same validation and one equal-width log operation. Unknown
discriminators, accounts, and non-fixed-width payloads fail explicitly.

The program is loaded by `solana-test-validator --bpf-program` at the fixed
public address `4Ywfurzjdhh83CUhTp1A3yaJuos4bSeYBtAZiJUnvq8h`. No private key
exists for this test address. The accepted SBF SHA-256 is:

```text
F51BD55B94EF6A32A7C1A8624A28C47268F09E81E424507E9E29372254316EC2
```

The live profile used ten pairs. All 20 signed transactions were unique, every
serialized transaction was 238 bytes, and both classes consumed exactly 510
compute units in every pair. The initial branch-shaped implementation exposed
a real 500-vs-502 CU skew; the accepted indexed-selection implementation was
adopted only after the live rerun measured exact equality.

This proves equivalence for this binary, configuration, runtime, and workload.
It does not establish semantic equivalence for arbitrary transactions.

