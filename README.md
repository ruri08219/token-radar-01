[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ruri08219/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ruri08219/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar — pre-token protocols ranked by implied value

A radar for the token launches that have not happened yet. It reads a frozen DefiLlama
protocol snapshot, ranks every pre-token protocol the watchlist's own rule would keep by an
implied value, and hands in a static dashboard a reader can sort, filter and open row by row,
with a farm plan for each protocol.

## The model (radar-4.1)

Implied value is priced off the market itself, by one regression fitted on the snapshot's
own live-token comparables, in log space:

```
log(mcap / TVL) = -1.5436 + -0.4456 x (log(TVL) - 17.7095) + category adjustment
implied = round(TVL x exp(log ratio))
```

- **Anchored.** The anchor is the median log market-cap / TVL over 128 live-token
  comparables: the market's own centre, stable across folds, so the level never rides on
  one fit.
- **Sublinear in TVL.** The slope is fitted by least squares on centred log TVL and
  re-fitted eight times with Huber weights (c = 1.345), so one wild token cannot drag the
  line. The fitted slope is −0.4456: log market cap grows with log TVL at 0.55, far below
  one-to-one. A protocol twice as large is worth about 1.47x as much, not twice as much.
  The market pays sublinearly for TVL.
- **Category, shrunk and fenced.** Each category gets its median residual after the line,
  shrunk by n / (n + 3) and taken only over the comparables inside the Tukey fence on the
  ratio. A category with many comparables keeps most of its own adjustment, a category
  with one keeps a quarter of it, and a category whose only comparable is an outlier —
  a 400x-ratio token — gets no adjustment at all and is priced off the line. Lending
  sits at 0.137x at mean TVL, Dexs at 0.249x, RWA at 0.303x.
- **Growth and age tested and dropped.** Seven-day TVL change and age were tried as extra
  regressors in the same five-fold check: their coefficients came out near zero or
  negative and they lowered the pooled rank correlation, so the model keeps only TVL and
  category. Age still sets the farm plan's hold length, never the price.
- **The −1 market cap is not a comparable.** DefiLlama writes −1 where it cannot state a
  market cap, so that one protocol is excluded from fitting and from validation (128
  comparables, not 129).

## Out of sample — and against radar-3

The comparables are split into five folds by slug. Each fold refits the model on the
other four and prices the held-out protocols, so no protocol's own figures ever price
itself. Radar-3's category-median calibration is refitted the same way, on the same 128
comparables and the same folds, so the comparison is on identical ground.

| | radar-4 | radar-3 (same 128) |
|---|---|---|
| Median \|log error\| | **1.2787** (about 3.59x) | 1.5878 (about 4.89x) |
| Held-out prices within 2x | **41 / 128** | 24 / 128 |
| Held-out prices within 3x | **59 / 128** | 38 / 128 |
| Rank correlation, pooled | **0.4075** | 0.4013 |
| Rank correlation, mean of folds | **0.4464** | — |
| TVL alone, rank correlation | 0.4385 | 0.4385 |

Radar-4 beats radar-3 on every out-of-sample number: the typical pricing error falls from
about 4.89x to about 3.59x, and nearly twice as many held-out prices land within 2x. Its
within-fold ranking (0.4464) also beats TVL alone (0.4385); the pooled correlation
(0.4075) sits just below TVL alone because pooling mixes folds whose fitted levels differ
slightly, and the board says so instead of hiding it. (Radar-3 as published used 129
comparables, including the −1 market cap: median |log error| 1.61, 27/129 within 2x,
Spearman 0.41. The table above recomputes it on the same 128.)

The numbers are what they are: a regression fitted on other protocols prices a held-out
market cap only roughly, and the board says so instead of hiding it.

## Robustness: leave one category out, and change the loss

Two checks ask whether that validation survives the choices the model made, and both
are computed in `lib/model.ts` (`locoCheck`, `sensitivityCheck`) and shown on the
dashboard's methodology panel — not asserted here, but re-derived from the same
snapshot on every run.

**Leave-one-category-out.** The regression is refitted 34 times, once per category
that holds a live comparable, with that whole category removed, and the removed
category's protocols are priced by the refit — a fit that never saw them and gives
them no category adjustment at all, pricing them off the line alone. The refitted
slopes run from −0.5058 (CEX held out) to −0.4005 (Staking Pool held out), a range of
0.1053, all keeping the full fit's negative sign: the sublinear slope is not one
category's doing. Rebuilding the board under each refit keeps a median of 10 of the
top 10 in the top 10, and never fewer than 9 (Basis Trading, Dexs, Onchain Capital
Allocator and RWA each lose one): the board's head does not ride on any single
category's adjustment.

The held-out categories price worse than the five-fold check — a median |log error|
of 1.5232 across the 34 folds, against 1.2787 out of sample — because a category
priced with no adjustment of its own is priced blind. The singletons price worst of
all: Prediction Market at 6.7009, Collateral Management at 3.5017, Liquidity Manager
at 3.4022. The best-held-out categories price well: CDP at 0.2697, Lending's
near-neighbours Restaking at 0.4235, RWA at 0.5610 with 6 of its 9 held-out
protocols within 2x and a rank correlation of 0.75. The board reports the bad folds
with the good ones.

| Held-out category | Held out | Refit slope | Median \|log error\| | Within 2x | Top-10 overlap |
|---|---|---|---|---|---|
| Lending | 15 | −0.4886 | 2.0168 | 5 / 15 | 10 / 10 |
| Dexs | 11 | −0.4507 | 1.7280 | 2 / 11 | 9 / 10 |
| CEX | 9 | −0.5058 | 1.8346 | 2 / 9 | 10 / 10 |
| Liquid Staking | 9 | −0.4383 | 1.1869 | 2 / 9 | 10 / 10 |
| RWA | 9 | −0.4390 | 0.5610 | 6 / 9 | 9 / 10 |
| Yield | 9 | −0.4687 | 1.3462 | 2 / 9 | 10 / 10 |
| Canonical Bridge | 8 | −0.4597 | 1.8975 | 2 / 8 | 10 / 10 |
| Basis Trading | 7 | −0.4425 | 0.8659 | 2 / 7 | 9 / 10 |

(Full table: all 34 categories, on the dashboard. The eight above are the categories
with seven or more live comparables.)

**Slope sensitivity.** The same five-fold out-of-sample check, refitted under four
losses on the same folds — Huber c = 1.0, 1.345 (the published fit) and 2.0, and
plain OLS with no reweighting at all. The median |log error| moves only from 1.2644
to 1.2791 across all four, and the within-2x count from 41 to 43 of 128: the
validation does not depend on the choice of loss. The rank correlation does drift,
and the table shows the trade instead of picking the loss that flatters one number:
OLS prices the typical protocol a touch closer (1.2644) but ranks them worse
(Spearman 0.3911 against 0.4075), so the Huber fit is kept for its ranking.

| Loss | Anchor | Slope | Median \|log error\| | Within 2x | Spearman |
|---|---|---|---|---|---|
| Huber c = 1.0 | −1.5436 | −0.4498 | 1.2791 | 41 / 128 | 0.4078 |
| Huber c = 1.345 (published) | −1.5436 | −0.4456 | 1.2787 | 41 / 128 | 0.4075 |
| Huber c = 2.0 | −1.5436 | −0.4537 | 1.2681 | 41 / 128 | 0.3994 |
| Plain OLS (no Huber) | −1.5436 | −0.4768 | 1.2644 | 43 / 128 | 0.3911 |

## The board

The watchlist is the floor, never the ceiling: every protocol with at least $50M of TVL
and no token on record, plus the 157 pre-token protocols the watchlist leaves out, by
TVL — a protocol above the floor that the watchlist leaves out is as much a launch
candidate as one below it. 197 rows in all, 40 of them watchlist, 24 live-token
protocols set aside with their market caps shown. The board separates token-trading
protocols from still-to-come: live tokens are never ranked alongside pre-token ones.

Top of the board: Sentora Curator at $97.9M, Steakhouse Financial at $97.8M, Gauntlet at
$71.8M — the three biggest risk-curator vaults, priced off a line that pays sublinearly
for their multi-billion TVLs. The dashboard opens with those ten as a spotlight strip
(Sentora Curator $97.9M down to BitFi Basis $35.3M), then the full sortable board, then
two summary tables computed from the same board: by category (32 categories, richest
median implied value first — CDP Manager $27.3M, Collateral Markets $26.1M, RWA $15.8M
across 16 rows with OnRe $41.2M on top) and by chain (52 first-named chains, most rows
first — Ethereum 56 rows with Sentora Curator on top, Solana 20, Binance 11). Selecting
a spotlight card, a summary row's top protocol, or a board row opens the same detail
drawer for that protocol.

## Farm plans, netted

Every row carries a seven-step farm plan. The first six steps are the position: fresh
wallet, the deposit the category calls for, one qualifying action a week, a hold of
30–60 days, claiming only from the protocol's own page, and a log. The seventh step
nets the plan against its own gas: at an assumed 7% community share, the position's
expected allocation against the gas the plan states, and the capital at which the
position pays for its own gas. At the plan's $50–$250 of capital, 0 of 197 rows net
positive; the median break-even is $977. The share is a guess, stated in the open.

## Run it

```
node main.ts --input <snapshot.json|directory>
```

Node 22, standard library only. It writes `board.json`, `data.js`, `dashboard/` and
`screenshots/` to `/output` (or `$MAKEFUN_OUTPUT_DIR`), then `dossier.json`. The
dashboard is a static page with no framework and no network: it reads `data.js`, which
is written from the same board, so the page and the board can never disagree. Each row's
detail drawer recomputes its implied value from the snapshot figures with the fitted
regression, and the methodology panel prints the fit, the category adjustments, the
out-of-sample test and the radar-3 comparison — plus, in radar-4.1, the top-10
spotlight, the per-category and per-chain summary tables, and a Robustness section
with the leave-one-category-out folds and the slope-sensitivity table, all of it
computed by the program from the snapshot on every run.
