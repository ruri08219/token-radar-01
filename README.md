[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ruri08219/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ruri08219/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar — pre-token protocols ranked by implied value

A radar for the token launches that have not happened yet. It reads a frozen DefiLlama
protocol snapshot, ranks every pre-token protocol the watchlist's own rule would keep by an
implied value, and hands in a static dashboard a reader can sort, filter and open row by row,
with a farm plan for each protocol.

## The model (radar-3)

Implied value is priced off the market itself, not a flat guess:

- **Comps-fitted.** Every live-token protocol in the snapshot is a comparable: its market
  cap divided by its TVL is what the market pays for that kind of protocol. A category's
  multiple is the median of its live comparables, clamped to 0.05x–1.00x. A lending
  protocol and a DEX with the same TVL are not worth the same: the market pays about
  0.13x TVL for a lender's token and about 0.34x for a DEX's.
- **Fence-gated trust.** A category's median is trusted only when at least two of its
  comparables survive the Tukey fence on the ratios (1.5 × IQR). A category with one
  comparable inside the fence — or none — is priced off the market's own median instead
  (0.1691x over 115 of 129 comparables, fence 0.04x to 2.54x). A single outlier never
  sets a whole category's price.
- **Growth and maturity.** The seven-day TVL change is clamped to −60%…+120% and moves
  the value by half its size; age with no token moves it from 0.6x at launch to 1.0x at
  three years. An unlisted age uses 365 days.
- **Out of sample.** The comparables are split into five folds by slug. Each fold fits
  the multiples on the other four and prices the held-out protocols, so no protocol's
  own multiple ever prices itself. Median |log error| 1.61 (a typical factor of about
  5.02x), 27 of 129 held-out prices within 2x, rank correlation 0.41 against 0.43 for
  TVL alone. The multiple prices categories apart; it does not beat TVL alone at
  ranking held-out market caps, and the board says so instead of hiding it.

## The board

The watchlist is the floor, never the ceiling: every protocol with at least $50M of TVL
and no token on record, plus the 157 pre-token protocols the watchlist leaves out, by
TVL — a protocol above the floor that the watchlist leaves out is as much a launch
candidate as one below it. 197 rows in all, 40 of them watchlist, 24 live-token
protocols set aside with their market caps shown. The board separates token-trading
protocols from still-to-come: live tokens are never ranked alongside pre-token ones.

## Farm plans, netted

Every row carries a seven-step farm plan. The first six steps are the position: fresh
wallet, the deposit the category calls for, one qualifying action a week, a hold of
30–60 days, claiming only from the protocol's own page, and a log. The seventh step
nets the plan against its own gas: at an assumed 7% community share, the position's
expected allocation against the gas the plan states, and the capital at which the
position pays for its own gas. At the plan's $50–$250 of capital, 0 of 197 rows net
positive; the median break-even is $1,660. The share is a guess, stated in the open.

## Run it

```
node main.ts --input <snapshot.json|directory>
```

Node 22, standard library only. It writes `board.json`, `data.js`, `dashboard/` and
`screenshots/` to `/output` (or `$MAKEFUN_OUTPUT_DIR`), then `dossier.json`. The
dashboard is a static page with no framework and no network: it reads `data.js`, which
is written from the same board, so the page and the board can never disagree. Each row's
detail drawer recomputes its implied value from the snapshot figures with the same
constants the model used.
