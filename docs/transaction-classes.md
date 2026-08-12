# Transaction Classes v0.1

## Definition

A `TransactionClass` is a label declared by a controlled `ProbeDefinition`. It identifies a workload built for comparison. The MVP does not inspect arbitrary user transactions and infer their class.

## Initial test program

The project-owned program exposes two successful instructions:

- `MATCHED_CONTROL`, discriminator byte `0x00`;
- `PROGRAM_X`, discriminator byte `0x01`.

The program must execute the same code path after decoding the discriminator, except for a constant-time branch used to select the class marker. Neither instruction changes economically meaningful state. A probe-specific fixed-width value may be included to guarantee uniqueness, but its position and size must match across classes.

## Matching contract

For every paired unit, the builder must verify and record:

| Dimension | Requirement |
|---|---|
| Program ID | identical |
| Account metas | identical order, signer/writable flags |
| Signer structure | identical count and roles |
| Instruction count/order | identical |
| Instruction data length | identical |
| Serialized transaction size | identical, or documented tolerance of 0 bytes for v0.1 |
| Compute-unit limit | identical |
| Compute-unit price | identical |
| Expected compute consumption | difference ≤ 1% or 100 CU, whichever is larger |
| Fee payer policy | identical derivation and funding policy |
| Blockhash commitment | identical configuration; blockhashes may differ |
| Send/preflight options | identical |
| Expected on-chain result | successful for both |

If any required dimension fails, the unit is `MATCHING_INVALID` and excluded before analysis. Exclusion counts and reasons remain in the summary.

## Uniqueness

Each route × class × probe index has a separate signed transaction and signature. Uniqueness may come from a unique fee payer or fixed-width probe nonce. No signed transaction is broadcast to two comparative routes.

## Proxy classification

The hostile proxy classifies only transactions produced by the controlled builder and only through the allowlisted test program. It may decode the known message shape and discriminator. It must fail closed to pass-through for unknown programs or malformed class data, record the event, and never attempt generic semantic classification.

## Future classes

SOL transfers, SPL transfers, size-matched controls, and real program interactions require separate methodology reviews. They must not reuse the v0.1 equivalence claim automatically.
