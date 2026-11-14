// The token radar's pricing model (radar-2): a sealed snapshot of the protocol universe goes in,
// a ranked board of pre-token protocols comes out.
//
// Coverage first: the board holds every slug on the snapshot's watchlist (the floor, never a
// ceiling) and, on top of that, every other pre-token protocol the house's own rule would keep —
// the early rows the radar exists to surface. Pre-token means the record carries no token at all:
// no market cap, no CoinGecko id, no symbol. Live-token protocols are kept apart and shown at the
// market's own values, never mixed into the ranking.
//
// Implied value comes only from the snapshot's own figures, priced off the market itself rather
// than a flat guess:
//
//   multiple   = the category's median market-cap / TVL across the snapshot's live-token protocols
//                (at least 3 live protocols in the category, clamped to [0.05, 1.00]); a category
//                with fewer live protocols falls back to the whole market's median
//   base       = tvl_usd x multiple
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x 0.5
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   implied    = max(1, round(base x growthMult x maturity))
//
// A lender and a DEX with the same TVL are not worth the same: the market pays about 0.13x TVL
// for a lender's token and about 0.34x for a DEX's, and the board prices them that way. No
// protocol name is ever special-cased: one function scores every row.
//
// A wrapped, staked or bridged product of a token that already trades is not a launch of its own,
// so the board applies the watchlist's own exclusion to every row, not only to the floor: a
// category of Bridge, Canonical Bridge, Cross Chain Bridge, Liquid Staking, Liquid Restaking or
// Restaked BTC, a CEX, a version-marked name, a name carrying the whole word wrapped, staked or
// staking, or a name beginning with an exchange's name is left out. That is why WBTC, Binance
// staked ETH and USDT0 are nowhere on the board, although their TVLs are the largest in the file.

/** The model's constants, as the dashboard states them and the methodology panel shows them. */
export interface ModelConstants {
  growth_weight: number; // how much of the clamped 7d change feeds the growth multiplier
  growth_floor: number; // the lowest 7d change the model credits, in per cent
  growth_cap: number; // the highest 7d change the model credits, in per cent
  maturity_floor: number; // the multiplier a protocol listed yesterday still gets
  maturity_range: number; // the extra multiplier three years listed earns on top of the floor
  maturity_days: number; // the listing age at which the maturity multiplier tops out
  unknown_age_days: number; // the age assumed when no listing date is recorded
  multiple_floor: number; // the lowest category multiple the model will pay
  multiple_cap: number; // the highest category multiple the model will pay
  comparables_min: number; // live protocols a category needs before its own multiple counts
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5, // half of the clamped weekly move
  growth_floor: -60, // a 60% weekly fall is the worst the model prices in
  growth_cap: 120, // a 120% weekly rise is the best the model prices in
  maturity_floor: 0.6, // a brand-new listing keeps 60% of its base value
  maturity_range: 0.4, // up to 40 points more for three years listed
  maturity_days: 1095, // three years, in days
  unknown_age_days: 365, // one year, when the listing date is missing
  multiple_floor: 0.05, // never pay under 0.05x TVL
  multiple_cap: 1.0, // never pay over 1.00x TVL
  comparables_min: 3, // a category needs three live tokens to set its own multiple
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const MS_PER_DAY = 86_400_000;

/** A finite number, else `fallback`. */
function coerceFinite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list, or null when it is empty. */
function middleValue(values: number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)]!;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const asOfMs = Date.parse(`${asOf}T00:00:00Z`);
  const listedMs = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(asOfMs) || !Number.isFinite(listedMs)) return null;
  return Math.max(0, Math.floor((asOfMs - listedMs) / MS_PER_DAY));
}

/** One protocol entry from the snapshot: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string; // the protocol's key in the snapshot and on the board
  name: string; // display name
  category: string | null; // DefiLlama category, or null when uncategorised
  chains: string[]; // chains the protocol is listed on
  tvl_usd: number; // total value locked, in US dollars
  change_7d: number | null; // seven-day TVL change, in per cent, or null
  mcap_usd: number | null; // market cap when a token trades, else null
  listed_at: string | null; // first listing date (YYYY-MM-DD), or null
  gecko_id: string | null; // CoinGecko id when a token trades, else null
  symbol: string | null; // token symbol when a token trades, else null
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string; // the snapshot's date (YYYY-MM-DD)
  source: string; // where the snapshot came from
  floor_usd: number; // the watchlist's TVL floor, in US dollars
  protocols: SnapshotProtocol[]; // every protocol in the snapshot
  watchlist: string[]; // the slugs the board must cover at minimum
}

/** One farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string; // what to do
  cost: string; // what it costs
  time: string; // how long it takes
}

/** A single row of board.json: one entry of the ranked board. */
export interface BoardRow {
  rank: number; // 1-based position, strongest implied value first
  slug: string; // the protocol's key
  name: string; // display name
  category: string | null; // DefiLlama category, or null
  chains: string[]; // chains the protocol is listed on
  tvl_usd: number; // total value locked, in US dollars
  change_7d: number | null; // seven-day TVL change, in per cent, or null
  mcap_usd: number | null; // null on every board row: the board is pre-token only
  listed_at: string | null; // first listing date, or null
  gecko_id: string | null; // null on every board row
  symbol: string | null; // null on every board row
  token_status: 'pre-token'; // every board row carries this literal
  age_days: number | null; // days listed at the snapshot date, or null
  implied_value_usd: number; // the model's implied value, in whole US dollars
  model: { // the inputs behind the implied value, for the detail drawer
    multiple: number; // the category (or market) multiple applied
    multiple_source: 'category' | 'market'; // where the multiple came from
    comparables: number; // live protocols that set the multiple (0 when market)
    growth_pct: number; // the clamped seven-day change, in per cent
    growth_multiplier: number; // 1 + growth_pct / 100 x growth_weight, to 4 decimals
    maturity_multiplier: number; // the listing-age multiplier, to 4 decimals
    age_days: number | null; // the listing age used, or null
  };
  farm_steps: string[]; // the six-step farm plan, as display strings
}

/** The dashboard's compact view of one row, with its farm plan generated in the page. */
export interface RadarRow {
  rank: number; // 1-based position on the board
  slug: string; // the protocol's key
  name: string; // display name
  category: string | null; // DefiLlama category, or null
  chains: string[]; // chains the protocol is listed on
  tvl_usd: number; // total value locked, in US dollars
  change_7d: number | null; // seven-day TVL change, in per cent, or null
  mcap_usd: number | null; // null: the dashboard's rows are pre-token only
  listed_at: string | null; // first listing date, or null
  age_days: number | null; // days listed at the snapshot date, or null
  implied_value_usd: number; // the model's implied value, in whole US dollars
  multiple: number; // the multiple applied, at full precision
  comparables: number; // live protocols that set the multiple
  growth_multiplier: number; // the growth multiplier, to 4 decimals
  maturity_multiplier: number; // the maturity multiplier, to 4 decimals
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string; // the protocol's key
  name: string; // display name
  category: string | null; // DefiLlama category, or null
  chains: string[]; // chains the protocol is listed on
  tvl_usd: number; // total value locked, in US dollars
  mcap_usd: number | null; // market cap, the fact the view shows
  change_7d: number | null; // seven-day TVL change, in per cent, or null
}

/** One category's pricing: the median live multiple and how many protocols set it. */
export interface CategoryMultiple {
  category: string; // the category this pricing belongs to
  multiple: number; // the median mcap / TVL, clamped to the model's band
  comparables: number; // live protocols whose ratios set the median
  source: 'category' | 'market'; // 'category' here; the market fallback never lands in this list
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string; // the snapshot's date
  source: string; // where the snapshot came from
  floor_usd: number; // the watchlist's TVL floor, in US dollars
  model: ModelConstants; // the constants the page recomputes rows from
  model_version: string; // 'radar-2'
  watchlist_size: number; // how many slugs the watchlist holds
  board_size: number; // how many rows the board holds
  early_size: number; // board rows below the watchlist floor
  live_size: number; // live-token protocols set aside
  multiples: CategoryMultiple[]; // one pricing per category with enough live protocols
  market_multiple: number; // the whole market's median multiple, to 4 decimals
  watchlist_rows: string[]; // the watchlist's slugs, for the watchlist-only filter
  rows: RadarRow[]; // the ranked board, compact form
  live: LiveRow[]; // the live-token set, by market cap
}

/** The first chain a protocol names, or a neutral phrase. */
function primaryChain(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function stakeSize(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdLength(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/**
 * One dispatch rule for the farm's opening action: the first rule whose category test matches
 * wins, so the table's order is the old if-chain's order. No protocol name is ever tested here.
 */
interface OpeningRule {
  matches: (category: string) => boolean;
  build: (capital: number, name: string, chain: string) => string;
}

const OPENING_RULES: OpeningRule[] = [
  {
    matches: (c) => c.includes('lend') || c.includes('cdp') || c.includes('collateral'),
    build: (capital, name, chain) => `Supply $${capital} of USDC to ${name} on ${chain}, then borrow $20 of it back so both sides of the position are active.`,
  },
  {
    matches: (c) => c.includes('dex') || c.includes('leveraged farm'),
    build: (capital, name, chain) => `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the position in range.`,
  },
  {
    matches: (c) => c.includes('yield') || c.includes('curator') || c.includes('allocator') || c.includes('vault'),
    build: (capital, name, chain) => `Deposit $${capital} into a ${name} vault on ${chain} with the longest track record and keep the shares.`,
  },
  {
    matches: (c) => c.includes('basis'),
    build: (capital, name, chain) => `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and hold the receipt.`,
  },
  {
    matches: (c) => c.includes('perpetual') || c.includes('derivative') || c.includes('options'),
    build: (capital, name, chain) => `Deposit $${capital} of USDC as margin on ${name} and open one small hedge, then close it the same week.`,
  },
  {
    matches: (c) => c.includes('prediction'),
    build: (capital, name, chain) => `Fund $${capital} and place one market position on ${name} on an event you have read.`,
  },
  {
    matches: (c) => c.includes('stable'),
    build: (capital, name, chain) => `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`,
  },
  {
    matches: (c) => c.includes('rwa'),
    build: (capital, name, chain) => `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it to maturity.`,
  },
  {
    matches: (c) => c.includes('insurance'),
    build: (capital, name, chain) => `Buy $${capital} of cover from ${name} on ${chain} and keep the policy for the full term.`,
  },
  {
    matches: (c) => c.includes('restak') || c.includes('staking'),
    build: (capital, name, chain) => `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`,
  },
  {
    matches: (c) => c.includes('bridge'),
    build: (capital, name, chain) => `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`,
  },
  {
    matches: (c) => c.includes('chain'),
    build: (capital, name, chain) => `Bridge $${capital} of USDC to ${name}'s chain and use one of its native apps each week.`,
  },
  {
    matches: (c) => c.includes('governance'),
    build: (capital, name, chain) => `Deposit $${capital} of USDC into ${name} on ${chain} and vote once on a live proposal.`,
  },
  {
    matches: (c) => c.includes('payment'),
    build: (capital, name, chain) => `Route $${capital} of payments through ${name} on ${chain} over the month.`,
  },
];

/** The category's one action, in the words a farmer can follow; the fallback is a plain deposit. */
function openingAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const category = (p.category ?? '').toLowerCase();
  const rule = OPENING_RULES.find((r) => r.matches(category));
  if (rule !== undefined) return rule.build(capital, p.name, chain);
  return `Deposit $${capital} of USDC into ${p.name} on ${chain} and keep the position open.`;
}

/** One dispatch rule for the weekly cadence, in the same first-match order as the old chain. */
interface WeeklyRule {
  matches: (category: string) => boolean;
  text: string;
}

const WEEKLY_RULES: WeeklyRule[] = [
  {
    matches: (c) => c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('prediction'),
    text: 'Make one small trade each week, open and close, so the volume for the week is real.',
  },
  {
    matches: (c) => c.includes('dex'),
    text: 'Swap once a week through the pool you supplied, in either direction.',
  },
  {
    matches: (c) => c.includes('lend') || c.includes('cdp') || c.includes('collateral'),
    text: 'Adjust the position once a week: add collateral, repay a little, or borrow a little.',
  },
  {
    matches: (c) => c.includes('governance'),
    text: 'Vote once a week while a proposal is live, and comment on one discussion.',
  },
];

/** The weekly cadence, matched to the category: what one qualifying action a week looks like. */
function weeklyAction(p: SnapshotProtocol): string {
  const category = (p.category ?? '').toLowerCase();
  const rule = WEEKLY_RULES.find((r) => r.matches(category));
  return rule !== undefined ? rule.text : 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.';
}

/** One step as a single string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. It never claims the protocol has an airdrop: it farms the position, and the position is
 * what a launch would pay.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = primaryChain(p);
  const capital = stakeSize(p);
  const hold = holdLength(age);
  const action = openingAction(p, capital, chain);
  const weekly = weeklyAction(p);
  const gasForSetup = capital >= 150 ? 8 : 4;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${gasForSetup} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weekly,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** A protocol whose token already trades: it records a market cap and a token id and symbol. */
export function isLiveToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.gecko_id !== null && p.symbol !== null;
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories whose token already trades by construction: a wrapped, staked or bridged product. */
const BLOCKED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** An exchange's name at the start of a protocol's name: its own product, not a launch of its own. */
const EXCHANGE_LEAD = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** A whole word wrapped, staked or staking anywhere in the name. */
const WRAPPED_TERM = /\b(wrapped|staked|staking)\b/i;

/**
 * Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked or bridged
 * product of a token that already trades, by the watchlist's own rule, extended to cross-chain
 * bridges. The watchlist's members all pass it.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (BLOCKED_CATEGORIES.has(p.category ?? '')) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (EXCHANGE_LEAD.test(p.name)) return false;
  if (WRAPPED_TERM.test(p.name)) return false;
  return true;
}

/**
 * The market's own pricing, from the snapshot's live-token protocols: each category's median
 * market-cap / TVL where at least `comparables_min` live protocols set it, clamped to the
 * model's band, and the whole market's median as the fallback. No name is ever special-cased.
 */
export function categoryMultiples(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { byCategory: Map<string, CategoryMultiple>; market: number } {
  const trading = snapshot.protocols.filter(
    (p) => isLiveToken(p) && p.mcap_usd !== null && p.tvl_usd > 0,
  );
  const ratios = trading.map((p) => p.mcap_usd! / p.tvl_usd);
  const market = middleValue(ratios) ?? 0.22;
  const perCategory = new Map<string, CategoryMultiple>();
  const ratioLists = new Map<string, number[]>();
  for (const p of trading) {
    const key = p.category ?? 'Other';
    const list = ratioLists.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    ratioLists.set(key, list);
  }
  for (const [category, values] of ratioLists) {
    if (values.length < model.comparables_min) continue;
    const raw = middleValue(values)!;
    const clamped = Math.min(model.multiple_cap, Math.max(model.multiple_floor, raw));
    perCategory.set(category, { category, multiple: clamped, comparables: values.length, source: 'category' });
  }
  return { byCategory: perCategory, market };
}

/** The multiple one protocol is priced at, and how many live protocols set it. */
export function multipleFor(
  p: SnapshotProtocol,
  multiples: { byCategory: Map<string, CategoryMultiple>; market: number },
): { multiple: number; comparables: number; source: 'category' | 'market' } {
  const hit = multiples.byCategory.get(p.category ?? 'Other');
  if (hit !== undefined) {
    return { multiple: hit.multiple, comparables: hit.comparables, source: 'category' };
  }
  return { multiple: multiples.market, comparables: 0, source: 'market' };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: { byCategory: Map<string, CategoryMultiple>; market: number },
  model: ModelConstants = MODEL,
): {
  implied: number;
  multiple: number;
  comparables: number;
  source: 'category' | 'market';
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, comparables, source } = multipleFor(protocol, multiples);
  const rawGrowth = coerceFinite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const cappedAge = Math.min(Math.max(ageForModel, 0), model.maturity_days);
  const maturityMult = model.maturity_floor + (cappedAge / model.maturity_days) * model.maturity_range;
  const base = protocol.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, multiple, comparables, source, growthPct, growthMult, maturityMult, age };
}

/** The snapshot's protocols keyed by slug. */
function indexBySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const multiples = categoryMultiples(snapshot, model);
  const lookup = indexBySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const found = lookup.get(slug);
    if (found !== undefined) chosen.set(slug, found);
  }
  // The early radar: every other pre-token protocol the house's own rule would keep, at any size.
  // Never a replacement for a watchlist row: a chosen protocol stays chosen.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, multiples, model);
    return { p, ...v };
  });
  scored.sort((a, b) => {
    if (b.implied !== a.implied) return b.implied - a.implied;
    if (a.p.slug < b.p.slug) return -1;
    if (a.p.slug > b.p.slug) return 1;
    return 0;
  });
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      // Full precision, not rounded: the dashboard recomputes the row from this multiple, and a
      // rounded copy would make its check read a different number than board.json carries.
      multiple: s.multiple,
      multiple_source: s.source,
      comparables: s.comparables,
      growth_pct: s.growthPct,
      growth_multiplier: roundTo4dp(s.growthMult),
      maturity_multiplier: roundTo4dp(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const roundTo4dp = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  const trading = snapshot.protocols.filter((p) => isLiveToken(p) && p.category !== 'CEX');
  trading.sort((a, b) => {
    const mcapDiff = (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0);
    if (mcapDiff !== 0) return mcapDiff;
    return b.tvl_usd - a.tvl_usd;
  });
  return trading.slice(0, LIVE_ROWS).map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    mcap_usd: p.mcap_usd,
    change_7d: p.change_7d,
  }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    multiple: row.model.multiple,
    comparables: row.model.comparables,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const multiples = categoryMultiples(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const multiplesList: CategoryMultiple[] = [...multiples.byCategory.values()].sort((a, b) => {
    if (b.multiple !== a.multiple) return b.multiple - a.multiple;
    return a.category.localeCompare(b.category);
  });
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    multiples: multiplesList,
    market_multiple: roundTo4dp(multiples.market),
    watchlist_rows: snapshot.watchlist,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SnapshotError('snapshot.json is not a JSON object');
  }
  const doc = raw as Record<string, unknown>;
  if (typeof doc.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(doc.as_of)) {
    throw new SnapshotError('snapshot.json has no as_of date');
  }
  if (typeof doc.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof doc.floor_usd !== 'number' || !Number.isSafeInteger(doc.floor_usd) || doc.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json has no floor_usd');
  }
  if (!Array.isArray(doc.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(doc.watchlist) || doc.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  }
  const protocols = doc.protocols.map((entry, i) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    }
    const rec = entry as Record<string, unknown>;
    const hasIdentity =
      typeof rec.slug === 'string' && typeof rec.name === 'string' &&
      typeof rec.tvl_usd === 'number' && Number.isFinite(rec.tvl_usd);
    if (!hasIdentity) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    const chains = Array.isArray(rec.chains)
      ? rec.chains.filter((c): c is string => typeof c === 'string')
      : [];
    const change = typeof rec.change_7d === 'number' && Number.isFinite(rec.change_7d) ? rec.change_7d : null;
    const mcap = typeof rec.mcap_usd === 'number' && Number.isFinite(rec.mcap_usd) ? rec.mcap_usd : null;
    return {
      slug: rec.slug,
      name: rec.name,
      category: typeof rec.category === 'string' ? rec.category : null,
      chains,
      tvl_usd: rec.tvl_usd,
      change_7d: change,
      mcap_usd: mcap,
      listed_at: typeof rec.listed_at === 'string' ? rec.listed_at : null,
      gecko_id: typeof rec.gecko_id === 'string' ? rec.gecko_id : null,
      symbol: typeof rec.symbol === 'string' ? rec.symbol : null,
    };
  });
  return {
    as_of: doc.as_of,
    source: doc.source,
    floor_usd: doc.floor_usd,
    protocols,
    watchlist: doc.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) {
    return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  }
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `row ${i + 1} outranks row ${i} on implied value`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
