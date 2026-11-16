# Launch Radar — Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Sapriyudin/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Sapriyudin/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![Node](https://img.shields.io/badge/node-22-green)](https://nodejs.org/)

A token launch radar: **342 pre-token protocols, ranked by implied value** — the value a
token would have if the protocol were priced like the average protocol in its category.

Built for the make.fun bounty
[Build the best token launch radar](https://make.fun/bounty/token-radar-01) ($1,325).

## How it works

Snapshot: 758 DeFiLlama protocols (14 Nov 2026). 342 have no token on record; 40 of them
form the $50M-TVL watchlist — all 40 covered. The other 416 already have a token; their
market caps are the comps the model learns from.

**Implied value** — log-log regression with a category intercept, fitted on the 128
protocols that have both a market cap and a TVL above zero:

```
ln(market cap) = 7.918 + 0.460 × ln(TVL) + category adjustment
implied = exp(...) × quality        band = base × e^±2.11
```

- Slope 0.460, intercept 7.918, residual σ 2.111, R² 0.265.
- 13 categories earn their own intercept (at least 3 tokenized comps each; Lending is the
  reference). 115 rows sit in categories with fewer than 3 comps and fall back to the
  snapshot's overall upper-median market-cap/TVL of 0.223× — one protocol cannot set a
  category's multiple.
- Quality factors: growth clamps 1 + change_7d/100 to 0.8–1.25; breadth
  min(1 + 0.02 × (chains − 1), 1.2); age 0.9 when listed under 90 days, else 1.
- **Blind test:** split the comps in half by slug, fit the first 64, predict the second 64
  — typical miss ×5.72, median miss ×4.49. The band on every row says the same thing in
  dollars: the honest answer is a range, not a point.

**Farm plan** — every row gets a costed plan and a verdict:

```
expected airdrop = base × 5% × (capital / TVL) × 20
cost = gas on the cheapest chain + 2% opportunity on the capital
farm if expected ≥ 3× cost (164 rows) · thin if ≥ 1× (129) · skip below that (49)
```

Capital $250 / $150 / $100 / $50 by TVL tier; hold 60 / 45 / 30 days by age.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Writes `out/board.json` (342 rows), `out/data.js`, `out/dashboard/` (static, no network),
`out/screenshots/` and `out/dossier.json`. Node 22, standard library only.

## Top of the board

| Rank | Protocol | TVL | Implied value | Band | Verdict |
| --- | --- | --- | --- | --- | --- |
| 1 | Steakhouse Financial | $2.75B | $719.8M | $74.3M – $5.07B | farm |
| 2 | Sentora Curator | $2.76B | $666.4M | $74.4M – $5.07B | farm |
| 3 | Gauntlet | $1.58B | $445.4M | $42.5M – $2.90B | farm |
| 4 | Bybit | $13.82B | $404.1M | $43.6M – $2.97B | thin |
| 5 | Veda | $1.56B | $383.2M | $42.2M – $2.88B | farm |

Median row: $17.0M TVL, $7.4M implied.

## Files

- `main.ts` — entry point: reads the snapshot, writes the output.
- `lib/model.ts` — the regression, the board, the farm economics.
- `dashboard/` — the static dashboard: sortable/filterable board, per-protocol detail
  view (implied value, band, comps used, farm plan), watchlist filter, methodology.
- `screenshots/` — board, detail, filtered views (1440×900).
- `vendor/makefun-board.ts` — the kit's dossier builder (unmodified).
