# Epistemic Limits

This document is normative. Product copy, dashboards, reports, alerts, and SDK telemetry must not exceed these boundaries.

## What SovereignKit can observe

- A logical route returned a particular JSON-RPC response or timed out from an observer's perspective.
- A controlled proxy explicitly rejected a known test class.
- Two of three configured readers reported a signature and compatible execution outcome.
- A transaction reached `processed`, `confirmed`, or `finalized` according to the configured readers.
- A block-height quorum passed `lastValidBlockHeight` without an execution quorum.
- Matched classes had different measured success rates or latencies within an explicit window.
- Peer logical routes did or did not exhibit the same measured difference.
- An SDK changed routes according to its recorded policy.

## What SovereignKit can infer cautiously

- A measured route/class/window satisfies a versioned classification rule.
- Behavior is consistent with general degradation, asymmetric degradation, or healthy operation under the controlled methodology.
- A fallback route restored confirmed submission for a specific transaction.

These are conditional inferences, not causal attribution.

## What SovereignKit cannot prove

- A provider, validator, leader, operator, government, or intermediary intended to censor.
- Which internal backend or physical path handled an endpoint request.
- That an RPC acknowledgment means the transaction reached a leader.
- That a non-observed transaction was deliberately dropped.
- That three logical readers sharing infrastructure are independent witnesses.
- That controlled-proxy accuracy transfers directly to Devnet or Mainnet Beta.
- That a route will behave identically for user traffic and probe traffic.
- Perfect separation of filtering, software defects, state contention, congestion, fee markets, or network failure.

## Required language

Prefer:

- “asymmetric route behavior observed”;
- “selective transaction accessibility degradation”;
- “classification under ClassificationPolicyV0Experimental”;
- “evidence strength: strong controlled”;
- “RPC acknowledged submission.”

Do not use without independent evidence beyond SovereignKit:

- “censorship detected”;
- “provider censored”;
- “validator rejected intentionally”;
- “transaction propagated” as a synonym for RPC acknowledgment;
- “confidence: high” before calibration.

## Controlled experiment disclaimer

The hostile proxy is a known intervention against project-controlled infrastructure. A successful experiment proves that the configured pipeline detects that intervention under those conditions. It does not demonstrate real-world censorship.

## Privacy limit

Transaction signatures and account addresses are public but linkable. Their collection is not anonymous. User telemetry is opt-in, minimized, retention-bound, and separated from probe traffic; no private key, seed phrase, or raw user transaction is collected.
