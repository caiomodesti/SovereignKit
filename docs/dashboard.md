# Sprint 8 evidence dashboard

The Sprint 8 dashboard is a local, read-only view over committed controlled
evidence. It does not poll a hosted Collector, publish a feed, modify route
order, or add any Sprint 9 routing behavior.

## Data boundary

`apps/dashboard/scripts/build-data.mjs` reads only the accepted versioned
fixtures for the Sprint 5 controlled experiment, Sprint 3 failover proof, and
Sprint 7 intelligence snapshot. It verifies their cross-file identifiers and
writes `public/dashboard-data.json`. The production bundle contains that
derived dataset; no sample rows, random values, or fallback measurements exist.

The source files are listed inside the dataset. The Sprint 8 verifier compares
every displayed measurement cell and classification byte-for-byte with its
source summary.

## Views

- evidence totals and authenticated observer identity;
- route/class measurements for each required experimental scenario;
- controlled findings for the selected window, including an explicit empty
  state for a healthy window;
- confirmed primary/fallback trace where RPC acknowledgement remains distinct
  from ledger confirmation;
- intelligence snapshot timing, disposition, and fail-open warning;
- normative methodology and epistemic limits.

The retained Sprint 7 snapshot expired at `2026-08-14T00:01:00.000Z`. The UI
therefore displays `STALE` after that instant. It must not relabel retained
evidence as a currently available feed.

## Runtime states

The application has explicit loading, invalid/unavailable evidence, retry,
success, and no-findings states. Invalid datasets fail closed at the display
boundary instead of receiving invented defaults. Feed staleness is different:
the UI remains available, marks the snapshot stale, and explains the SDK's
fail-open local policy.

## Accessibility and responsive behavior

The UI uses semantic landmarks, tables, headings, labels, native controls,
visible keyboard focus, 40-pixel interactive targets, reduced-motion support,
and system light/dark modes. The production bundle was inspected at 375, 768,
and 1280 pixel widths with no document-level horizontal overflow.

## Claim boundary

The dashboard reports controlled measurements and conditional classifications
under `ClassificationPolicyV0Experimental`. It does not identify physical
paths, attribute intent, claim censorship, represent one local observer as a
decentralized network, or generalize the local result to Devnet or Mainnet.
