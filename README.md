# Launch Radar — radar-5

[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ruri08219/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ruri08219/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

Pre-token protocols, ranked by what a token would be worth **if it launches** — and whether it is likely to. Every number is fitted on the snapshot's own figures, and every term was kept only if it passed **two held-out tests**.

## What it is

- **198 rows**: all 40 watchlist slugs, the 138 pre-token protocols below the $50M floor, and the 20 above the floor the watchlist leaves out. Every one of the snapshot's 758 protocols lands in exactly one accounting group (198 ranked / 416 token recorded / 144 left out by the house rule), printed on the page.
- **Implied value = TVL × fitted multiple × token odds.** The launch value is priced off the 128 live-token comparables; the odds are the peers' record (how long they ran, their category's tier, their size).
- **Farm plans** for every row: concrete steps with costs and times, netted against the gas at 0.02% of TVL of capital. Verdict Farm / Marginal / Skip by the capital that pays for the gas (≤ $1,000 / ≤ $5,000 / above). At plan capital no plan nets positive — the page says so instead of hiding it.

## The model (fitted, not hardcoded)

```
log(mcap / TVL) = anchor + slope·x + curve·x²/10 + category adjustment
implied value   = TVL × exp(log ratio) × token odds
x = log(TVL) − mean log TVL over the comparables
```

- Anchor −1.5436 (median log ratio), slope −0.455, curve +0.0301, Huber-reweighted (c = 1.345). Category adjustments are median residuals inside the Tukey fence, shrunk n/(n+16).
- Token odds are a logistic on log years listed, a no-listed-date flag, the category tier (high / mid / low token rate) and log TVL. Brier 0.199 (random held-out) / 0.261 (walk-forward) vs 0.249 / 0.390 for the base rate.

## Out-of-sample evidence (both splits, same comparables and folds as radar-4)

| | Split A: 5-fold by slug | Split B: walk-forward by listed_at |
| --- | --- | --- |
| radar-5 median \|log error\| | **1.23** (×3.42, 41/128 within 2×) | **1.05** (×2.87, 16/48 within 2×) |
| radar-4 recipe, recomputed | 1.28 (×3.59, 43/128 within 2×) | 1.15 (×3.16, 16/48 within 2×) |

Term table (kept only if it beats the reference on **both** splits): the size curve and shrinkage 16 pass; 7-day growth, age, chain count, trimmed-mean category residuals, dropping the CEX comparables and plain OLS all fail at least one split and are dropped. The fine-grained per-category odds rate wins the random split but loses walk-forward at every cut — dropped in favour of the coarse tier. Leave-one-category-out: slopes stay negative in all 34 refits, median top-10 overlap 10/10. The printed P25–P75 range holds 50.8% of held-out predictions (stated 50%); P10–P90 holds 78.1% (stated 80%).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22+, standard library only, no network, deterministic (two runs are byte-identical). The dashboard is a static page (`dashboard/` + `data.js`); open `out/dashboard/index.html` in a browser. `#detail=<slug>` opens a protocol's detail, `#cat=<category>` filters, `#board` jumps to the board.

## Files

- `main.ts` — entrypoint: reads `/input/snapshot.json`, writes `board.json`, `data.js`, `dashboard/`, `screenshots/`, `dossier.json`
- `lib/model.ts` — the model, the validation, the farm plans
- `dashboard/` — `index.html`, `app.css`, `app.js` (27.6 KB total, fits the dossier whole)
- `screenshots/` — three real renders of this dashboard: the board, a detail view, a filtered view
- `vendor/makefun-board.ts` — the make.fun dossier library, as shipped in the kit

## License

MIT — see `LICENSE`.
