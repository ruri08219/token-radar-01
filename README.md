# Token Radar — pre-token protocols ranked by implied value

A radar for the token launches that have not happened yet. It reads a frozen DefiLlama
protocol snapshot, ranks every pre-token protocol the watchlist's own rule would keep by an
implied value, and hands in a static dashboard a reader can sort, filter and open row by row,
with a farm plan for each protocol.

## The model (radar-2)

Implied value is priced off the market itself, not a flat guess:

```
implied = round( tvl_usd x multiple(category)
               x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
               x (0.6 + min(age_days, 1095) / 1095 x 0.4) )
```

- **multiple(category)** is the category's median market-cap / TVL among the snapshot's own
  live-token protocols (at least 3 live protocols, clamped to 0.05x–1.00x). A category with
  fewer live protocols uses the whole market's median. A lending protocol and a DEX with the
  same TVL are not worth the same: the market pays about 0.13x TVL for a lender's token and
  about 0.34x for a DEX's.
- **growth** is the protocol's seven-day TVL change, clamped so one hot week cannot dominate.
- **maturity** is how long the protocol has run with no token: older, still tokenless
  protocols score higher, up to 1.00x at three years.
- No protocol name is special-cased; the same function scores every row.

Wrapped, staked and bridged products are left out by the watchlist's own rule: their token
already trades, so they are not a launch of their own. The board says a protocol *records no
token*, never that it has none.

## What it hands in

- `board.json` — the ranked board: 197 rows (the 40 watchlist protocols plus 157 early
  pre-token protocols below the floor), each with its implied value, its model breakdown and a
  six-step farm plan with costs and times.
- `dashboard/` — a static page (no network, no framework): sortable and filterable board,
  a detail view for every protocol with the model's full breakdown, a live-token view kept
  apart at market values, and the methodology with the category multiples table.
- `screenshots/` — three renders of the dashboard's own page: the board, a detail view and a
  filtered view.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22, standard library only. The program runs twice and writes the same bytes both times.
