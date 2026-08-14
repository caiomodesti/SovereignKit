# SovereignKit brand system

_Status: active · v0.1 repository and product direction_

## Brand idea

**Positioning:** open-source infrastructure for measuring, explaining, and routing around Solana transaction-accessibility failures.

**Core line:** Measure the path. Preserve the evidence. Route without overclaiming.

**Visual concept:** a signal observatory. Routes converge on independent observation, raw events become defensible evidence, and the interface makes uncertainty visible instead of decorating it away.

## Direction

- **Archetype:** scientific infrastructure with an editorial documentation layer.
- **Density:** comfortable for narrative; compact for measurements, tables, and route maps.
- **Surface:** deep blue-black foundation, elevated navy panels, one cyan signal accent.
- **Type mood:** precise, restrained, mono-supported.
- **Motion:** crisp and functional; no bounce or ambient decoration.

## Palette — Sovereign Signal

The palette combines the reliability of blue, the analytical quality of cyan, and a restricted amber reserved for caution or incomplete evidence.

| Token | Hex | OKLCH | Role |
|---|---|---|---|
| `ink` | `#07111A` | `oklch(0.145 0.025 235)` | dark brand foundation |
| `panel` | `#0C1B28` | `oklch(0.205 0.035 235)` | elevated dark surface |
| `signal` | `#38BDF8` | `oklch(0.78 0.15 220)` | primary action, active route, links |
| `trust` | `#5B8DEF` | `oklch(0.68 0.17 250)` | secondary information accent |
| `ice` | `#EAF7FF` | `oklch(0.97 0.02 225)` | primary text on dark surfaces |
| `mist` | `#9CB4C5` | `oklch(0.75 0.04 230)` | secondary text |
| `success` | `#2DD4A8` | `oklch(0.79 0.15 170)` | healthy, verified, confirmed |
| `caution` | `#F4B860` | `oklch(0.82 0.13 75)` | stale, limited, pending |
| `failure` | `#FB7185` | `oklch(0.72 0.18 15)` | rejected, failed, invalid |

### Light surfaces

| Token | Hex | Role |
|---|---|---|
| `paper` | `#F5FAFD` | page background |
| `white` | `#FFFFFF` | elevated surface |
| `text` | `#102330` | primary text |
| `text-muted` | `#526A79` | secondary text |
| `border` | `#D6E3EA` | low-contrast separation |
| `signal-dark` | `#087EA8` | accessible links and actions on light surfaces |

## Typography

- **Narrative/UI:** `Inter`, with `ui-sans-serif` and the system stack as fallbacks. It is selected deliberately for compact technical legibility—not left as an unexamined default.
- **Measurements/code:** `SFMono-Regular`, `Cascadia Code`, `Consolas`, monospace.
- **Hierarchy:** maximum three weights in one surface; headings use tight tracking; metrics use tabular numerals.
- **README assets:** system sans and monospace only, so GitHub renders them without external font requests.

## Shape and composition

- Use an 8px base grid.
- Use 8px radii for compact controls, 12px for evidence panels, and 16–20px only for brand-level compositions.
- Prefer borders and tone changes over heavy shadows.
- Avoid nesting cards more than one level deep.
- Route lines, quorum nodes, and event sequences are the primary visual language.
- Gradients are permitted only as a restrained brand signal in hero artwork, never as decorative heading text.

## Voice

SovereignKit sounds precise, calm, and falsifiable.

**Use:** “The controlled evidence supports…”, “This result is limited by…”, “RPC acknowledgment is not ledger observation.”

**Avoid:** “censorship detected”, “guaranteed inclusion”, “universal classifier”, “fully decentralized”, “best-in-class”, or any claim not derived from measurements.

## Accessibility

- Never rely on color alone: pair states with labels, symbols, or signs.
- Reserve green/red for semantic outcomes and retain textual state names.
- Body text targets WCAG AA contrast; `signal-dark` is used instead of bright cyan for small text on light backgrounds.
- Diagrams must remain understandable from their labels when rendered without brand color.

## Repository presentation

- `docs/assets/sovereignkit-hero.svg` is the canonical GitHub hero.
- Badges use `ink` as their label background and only semantic palette colors.
- README diagrams prioritize topology and evidence flow over ornamental illustration.
- Numbers shown in public-facing material must identify whether they describe accepted `main`, a review branch, or a future target.
