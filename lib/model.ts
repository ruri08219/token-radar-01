// Token Radar's model, radar-3: the snapshot in, the ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and
// adds the pre-token protocols the watchlist leaves out, by TVL, that the early radar exists
// to find: a protocol above the floor that the watchlist leaves out (its parent protocol
// trades, or its category is one the house's rule does not name) is as much a launch
// candidate as one below it, and the board ranks it on the same figures. A protocol is
// pre-token when its record carries no token (no market cap, no CoinGecko id, no symbol);
// the live-token protocols are kept apart and shown at the market's own values, never
// mixed into the ranked board.
//
// Implied value is priced off the market itself, by comparables:
//
//   multiple(category) = the median market-cap / TVL of the snapshot's own live-token
//     protocols in that category, clamped to 0.05x-1.00x, and trusted only when at least
//     two of the category's comparables survive the Tukey fence below: a category whose
//     comparables are mostly outliers has no trustworthy median of its own, so it falls
//     back to the market's own median multiple. The fallback is the median over the live
//     protocols that survive a Tukey fence (Q1 - 1.5 IQR .. Q3 + 1.5 IQR) on the ratio, so
//     one wild token cannot set the price. A category with a single live comparable, or
//     with two whose median is an outlier, is priced off the market, not off itself.
//   growth   = 1 + clamp(change_7d, -60, 120) / 100 x 0.5
//   maturity = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age unknown: 365 days)
//   implied  = max(1, round(tvl_usd x multiple x growth x maturity))
//
// The calibration is tested out of sample, in this file, before it prices anything: the
// live-token protocols are split into five folds by slug, the multiples are fitted on four
// folds and used to price the fifth, and the report says how far the prices land. No
// protocol name is ever special-cased: the same functions score every row.
//
// Every farm plan is netted: the plan's own stated gas is set against the position's
// expected share of the implied value, and the plan says the net and the capital at which
// the position pays for its own gas. The share is an assumption, stated in the open:
// 7% of the implied value is assumed to reach farmers.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many pre-token protocols the watchlist leaves out the early radar carries, by TVL. */
export const EARLY_ROWS = 157;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The share of an implied value the farm math assumes reaches farmers. A guess, stated. */
export const COMMUNITY_SHARE = 0.07;

/** A category multiple is trusted when this many of its live comparables survive the fence. */
export const MIN_CATEGORY_COMPS = 2;

/** The clamp on any multiple, in x of TVL. */
export const MULTIPLE_FLOOR = 0.05;
export const MULTIPLE_CAP = 1.0;

/** The growth clamp, in per cent, and its weight. */
export const GROWTH_FLOOR = -60;
export const GROWTH_CAP = 120;
export const GROWTH_WEIGHT = 0.5;

/** The maturity curve: 0.6 at day zero, 1.0 at three years. */
export const MATURITY_FLOOR = 0.6;
export const MATURITY_RANGE = 0.4;
export const MATURITY_DAYS = 1095;
export const UNKNOWN_AGE_DAYS = 365;

/** The number of folds the out-of-sample check splits the comparables into. */
export const OOS_FOLDS = 5;

/** One category's fitted multiple. */
export interface CategoryMultiple {
  category: string;
  comps: number;
  /** Of the category's comparables, the ones inside the Tukey fence. */
  comps_kept: number;
  multiple: number;
}

/** The fitted calibration: the fallback multiple and every category's. */
export interface Calibration {
  /** Live-token protocols that carry a market cap and a TVL. */
  comps_total: number;
  /** Of them, the ones inside the Tukey fence, whose median is the fallback. */
  comps_kept: number;
  /** The median market-cap / TVL over the fenced comparables. */
  global_multiple: number;
  /** The fence itself, in x of TVL. */
  fence_low: number;
  fence_high: number;
  /** One entry per category that holds at least one live comparable. */
  categories: CategoryMultiple[];
}

/** One fold of the out-of-sample check. */
export interface OosFold {
  fold: number;
  train: number;
  test: number;
  global_multiple: number;
  median_abs_log_error: number;
  within_two_x: number;
  within_three_x: number;
  spearman: number;
}

/** The out-of-sample report: the calibration priced protocols it was not fitted on. */
export interface OosReport {
  folds: OosFold[];
  /** Median |log(predicted / actual)| over all held-out protocols, calibration only. */
  median_abs_log_error: number;
  /** The same, as a factor: exp(median |log error|). */
  typical_factor: number;
  within_two_x: number;
  within_three_x: number;
  total: number;
  /** Rank correlation of the held-out predictions with the actual market caps. */
  spearman: number;
  /** The same correlation for TVL alone, the baseline the multiple must beat to matter. */
  tvl_baseline_spearman: number;
  /** The full model (multiple x growth x maturity) on the same held-out set. */
  full_model_median_abs_log_error: number;
  full_model_within_two_x: number;
}

/** A farm plan netted to the farm: the position's expected value against its own gas. */
export interface NetFarm {
  capital_usd: number;
  gas_usd: number;
  gross_usd: number;
  net_usd: number;
  breakeven_usd: number;
}

/** The model's constants, as the dashboard states them and the page recomputes with them. */
export interface ModelConstants {
  growth_floor: number;
  growth_cap: number;
  growth_weight: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
  min_category_comps: number;
}

export const MODEL_CONSTANTS: ModelConstants = {
  growth_floor: GROWTH_FLOOR,
  growth_cap: GROWTH_CAP,
  growth_weight: GROWTH_WEIGHT,
  maturity_floor: MATURITY_FLOOR,
  maturity_range: MATURITY_RANGE,
  maturity_days: MATURITY_DAYS,
  unknown_age_days: UNKNOWN_AGE_DAYS,
  multiple_floor: MULTIPLE_FLOOR,
  multiple_cap: MULTIPLE_CAP,
  min_category_comps: MIN_CATEGORY_COMPS,
};

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    multiple: number;
    comps: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  net_farm: NetFarm;
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with the farm plan generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  multiple: number;
  comps: number;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  net_usd: number;
  breakeven_usd: number;
  /** The net farm figures, so the page renders the net step exactly as board.json does. */
  net_farm: NetFarm;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  community_share: number;
  /** The model's constants, so the page recomputes a row with the same numbers. */
  constants: ModelConstants;
  calibration: Calibration;
  oos: OosReport;
  watchlist_size: number;
  /** The watchlist slugs themselves, so the page can filter to them. */
  watchlist: string[];
  board_size: number;
  early_size: number;
  live_size: number;
  rows_net_positive: number;
  median_breakeven_usd: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a list, or NaN when it holds nothing. */
export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A quartile by nearest rank: the value at floor(n x f) of the sorted list. */
function quartile(values: number[], f: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))]!;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is a live comparable: its token trades, its market cap is recorded and
 * nonzero, and its figures are whole. DefiLlama writes -1 for a token whose market cap it
 * cannot state and 0 for one with none: the -1 record enters with a ratio near zero (one
 * record of 129; the dashboard states it), the 0 records do not enter at all. */
export function isComparable(p: SnapshotProtocol): boolean {
  return (
    p.mcap_usd !== null &&
    p.mcap_usd !== 0 &&
    p.gecko_id !== null &&
    p.gecko_id !== '' &&
    p.symbol !== null &&
    p.symbol !== '' &&
    p.tvl_usd > 0
  );
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The categories the early radar leaves out: wrapped, staked or bridged products of a token
 * that already trades, an exchange's own product, and farms, which are a strategy, not a
 * protocol launch. Derivatives stay in: a perps protocol with no token is a launch candidate,
 * and its multiple is the market's fallback (see calibrateComps), not its own two outliers. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Restaked BTC',
  'CEX',
  'Farm',
]);

/** An exchange's name at the start of a protocol's name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol is one the board may rank: pre-token, not a wrapped, staked or bridged
 * product of a token that already trades, not a farm, not a versioned pool, and not an
 * exchange's own product. A name carrying the word staked or staking is not excluded on its
 * own: the word alone does not prove the protocol is a product of a token that trades, and
 * the category rule above is the one that keeps wrapped products out. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Fit the calibration on a set of comparables: the Tukey fence on market-cap / TVL, the
 * global median over the fenced set, and every category's median over its own comparables.
 * The fence keeps one wild token (a 400x ratio, a 70x ratio) from setting the market's price.
 * A category's median is only trusted when at least two of its comparables survive the
 * fence: Derivatives, for instance, holds two comparables and only one survives, so its
 * protocols are priced off the market's median instead of a median of two outliers.
 */
export function calibrateComps(comparables: SnapshotProtocol[]): Calibration {
  const ratios = comparables.map((p) => (p.mcap_usd as number) / p.tvl_usd);
  const q1 = quartile(ratios, 0.25);
  const q3 = quartile(ratios, 0.75);
  const iqr = q3 - q1;
  const fenceLow = q1 - 1.5 * iqr;
  const fenceHigh = q3 + 1.5 * iqr;
  const kept = comparables.filter((p) => {
    const r = (p.mcap_usd as number) / p.tvl_usd;
    return r >= fenceLow && r <= fenceHigh;
  });
  const global = median(kept.map((p) => (p.mcap_usd as number) / p.tvl_usd));
  const keptSlugs = new Set(kept.map((p) => p.slug));
  const byCategory = new Map<string, number[]>();
  const keptByCategory = new Map<string, number>();
  for (const p of comparables) {
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push((p.mcap_usd as number) / p.tvl_usd);
    byCategory.set(key, list);
    if (keptSlugs.has(p.slug)) keptByCategory.set(key, (keptByCategory.get(key) ?? 0) + 1);
  }
  const categories: CategoryMultiple[] = [...byCategory.entries()]
    .map(([category, list]) => ({
      category,
      comps: list.length,
      comps_kept: keptByCategory.get(category) ?? 0,
      multiple: round4(Math.min(MULTIPLE_CAP, Math.max(MULTIPLE_FLOOR, median(list)))),
    }))
    .sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  return {
    comps_total: comparables.length,
    comps_kept: kept.length,
    global_multiple: round4(global),
    fence_low: round4(fenceLow),
    fence_high: round4(fenceHigh),
    categories,
  };
}

/** A protocol's multiple under a calibration: its category's, when the category's median is
 * trusted (at least two of its comparables survive the fence), or the market's otherwise. */
export function multipleFor(calibration: Calibration, category: string | null): { multiple: number; comps: number } {
  const found = calibration.categories.find((c) => c.category === (category ?? 'Other'));
  if (found !== undefined && found.comps_kept >= MIN_CATEGORY_COMPS) return { multiple: found.multiple, comps: found.comps };
  return { multiple: calibration.global_multiple, comps: 0 };
}

/** The growth multiplier from a seven-day change, clamped so one hot week cannot dominate. */
export function growthMultiplier(change7d: number | null): { pct: number; mult: number } {
  const pct = Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, finite(change7d, 0)));
  return { pct, mult: 1 + (pct / 100) * GROWTH_WEIGHT };
}

/** The maturity multiplier from an age in days: older, still tokenless, scores higher. */
export function maturityMultiplier(age: number | null): number {
  const days = age ?? UNKNOWN_AGE_DAYS;
  return MATURITY_FLOOR + (Math.min(Math.max(days, 0), MATURITY_DAYS) / MATURITY_DAYS) * MATURITY_RANGE;
}

/** The implied value one protocol gets under a calibration, with its breakdown. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
): { implied: number; multiple: number; comps: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, comps } = multipleFor(calibration, protocol.category);
  const { pct, mult: growthMult } = growthMultiplier(protocol.change_7d);
  const maturityMult = maturityMultiplier(age);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult));
  return { implied, multiple, comps, growthPct: pct, growthMult, maturityMult, age };
}

/** Plain ranks of a list, by value ascending; ties break by position, deterministically. */
function ranksOf(values: number[]): number[] {
  const order = values.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const ranks = new Array<number>(values.length);
  order.forEach(([_, i], k) => {
    ranks[i] = k;
  });
  return ranks;
}

/** Spearman's rank correlation between two lists of the same length. */
export function spearman(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return NaN;
  const ra = ranksOf(a);
  const rb = ranksOf(b);
  const ma = ra.reduce((x, y) => x + y, 0) / n;
  const mb = rb.reduce((x, y) => x + y, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i]! - ma) * (rb[i]! - mb);
    da += (ra[i]! - ma) ** 2;
    db += (rb[i]! - mb) ** 2;
  }
  return da === 0 || db === 0 ? NaN : num / Math.sqrt(da * db);
}

/**
 * The out-of-sample check. The comparables are split into five folds by slug order, so the
 * split is deterministic and no protocol's own multiple ever prices itself. Each fold fits
 * the calibration on the other four and prices the held-out protocols two ways: the
 * calibration alone (TVL x multiple) and the full model (x growth x maturity). The report
 * carries both, and the TVL-alone rank correlation as the baseline the multiple must beat.
 * The numbers are what they are: a multiple fitted on other protocols prices a held-out
 * market cap only roughly, and the report says so instead of hiding it.
 */
export function outOfSampleCheck(comparables: SnapshotProtocol[], asOf: string): OosReport {
  const sorted = [...comparables].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const folds: SnapshotProtocol[][] = Array.from({ length: OOS_FOLDS }, () => []);
  sorted.forEach((p, i) => {
    folds[i % OOS_FOLDS]!.push(p);
  });
  const foldReports: OosFold[] = [];
  const allErrs: number[] = [];
  const allFullErrs: number[] = [];
  const allPred: number[] = [];
  const allActual: number[] = [];
  for (let fi = 0; fi < OOS_FOLDS; fi++) {
    const test = folds[fi]!;
    const train = folds.flatMap((f, j) => (j === fi ? [] : f));
    const fit = calibrateComps(train);
    const errs: number[] = [];
    const fullErrs: number[] = [];
    const preds: number[] = [];
    const actuals: number[] = [];
    for (const p of test) {
      const { multiple } = multipleFor(fit, p.category);
      const age = ageDays(asOf, p.listed_at);
      const { mult: growthMult } = growthMultiplier(p.change_7d);
      const maturityMult = maturityMultiplier(age);
      const calPred = p.tvl_usd * multiple;
      const fullPred = calPred * growthMult * maturityMult;
      errs.push(Math.log(calPred / (p.mcap_usd as number)));
      fullErrs.push(Math.log(fullPred / (p.mcap_usd as number)));
      preds.push(calPred);
      actuals.push(p.mcap_usd as number);
    }
    const abs = errs.map(Math.abs);
    foldReports.push({
      fold: fi,
      train: train.length,
      test: test.length,
      global_multiple: fit.global_multiple,
      median_abs_log_error: round4(median(abs)),
      within_two_x: errs.filter((e) => Math.abs(e) <= Math.log(2)).length,
      within_three_x: errs.filter((e) => Math.abs(e) <= Math.log(3)).length,
      spearman: round4(spearman(preds, actuals)),
    });
    allErrs.push(...errs);
    allFullErrs.push(...fullErrs);
    allPred.push(...preds);
    allActual.push(...actuals);
  }
  const overallAbs = median(allErrs.map(Math.abs));
  return {
    folds: foldReports,
    median_abs_log_error: round4(overallAbs),
    typical_factor: round2(Math.exp(overallAbs)),
    within_two_x: allErrs.filter((e) => Math.abs(e) <= Math.log(2)).length,
    within_three_x: allErrs.filter((e) => Math.abs(e) <= Math.log(3)).length,
    total: allErrs.length,
    spearman: round4(spearman(allPred, allActual)),
    tvl_baseline_spearman: round4(spearman(comparables.map((p) => p.tvl_usd), comparables.map((p) => p.mcap_usd as number))),
    full_model_median_abs_log_error: round4(median(allFullErrs.map(Math.abs))),
    full_model_within_two_x: allFullErrs.filter((e) => Math.abs(e) <= Math.log(2)).length,
  };
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The plan's own gas bill, in dollars: the setup plus one action a week over the hold. */
function gasFor(capital: number, holdDays: number): number {
  const setup = capital >= 150 ? 8 : 4;
  const weekly = Math.ceil(holdDays / 7) * 2;
  return setup + weekly;
}

/**
 * Net the farm. The position's expected gross is its share of the implied value at the
 * assumed community share, in proportion to its capital over the protocol's TVL; the gas is
 * the plan's own stated bill. The break-even is the capital at which the gross covers the
 * gas. At the plan's $50-$250 most rows net negative: the plan says so, with the number.
 */
export function netFarm(p: SnapshotProtocol, implied: number, age: number | null): NetFarm {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(capital, hold);
  const gross = (implied * COMMUNITY_SHARE * capital) / p.tvl_usd;
  const net = gross - gas;
  const perDollar = (implied * COMMUNITY_SHARE) / p.tvl_usd;
  const breakeven = perDollar > 0 ? gas / perDollar : Number.POSITIVE_INFINITY;
  return {
    capital_usd: capital,
    gas_usd: gas,
    gross_usd: round2(gross),
    net_usd: round2(net),
    breakeven_usd: Number.isFinite(breakeven) ? Math.round(breakeven) : 0,
  };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** A dollar figure with two decimals and a sign, for the net step. */
function money2(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time, plus a seventh
 * that nets the plan: the expected gross against the gas, the net, and the break-even
 * capital. The plan is derived from the protocol's own record (category, chains, TVL, age),
 * never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, net: NetFarm): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
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
    {
      text: `Net this plan at $${capital} of capital: about ${money2(net.gross_usd)} of community allocation against $${net.gas_usd} of gas, a net of ${money2(net.net_usd)}. The position pays for its own gas only at about $${net.breakeven_usd.toLocaleString('en-US')} of capital.`,
      cost: 'the gas above is the whole bill',
      time: 'the hold above',
    },
  ];
  return steps;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, calibration: Calibration): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot,
  // but the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: the pre-token protocols the watchlist leaves out, by TVL, capped.
  // No floor on them: a protocol above the floor that the watchlist leaves out (its parent
  // protocol trades, or its category is one the house's rule does not name) is as much a
  // launch candidate as one below it, and the board ranks it on the same figures. Never a
  // replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, calibration);
    const net = netFarm(p, v.implied, v.age);
    return { p, v, net };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
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
    token_status: 'pre-token',
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      multiple: s.v.multiple,
      comps: s.v.comps,
      growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      age_days: s.v.age,
    },
    net_farm: s.net,
    farm_steps: farmSteps(s.p, s.v.age, s.net).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
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
    multiple: row.model.multiple,
    comps: row.model.comps,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    net_usd: row.net_farm.net_usd,
    breakeven_usd: row.net_farm.breakeven_usd,
    net_farm: row.net_farm,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const comparables = snapshot.protocols.filter(isComparable);
  const calibration = calibrateComps(comparables);
  const oos = outOfSampleCheck(comparables, snapshot.as_of);
  const board = buildBoard(snapshot, calibration);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const breakevens = board.map((r) => r.net_farm.breakeven_usd).sort((a, b) => a - b);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    community_share: COMMUNITY_SHARE,
    constants: MODEL_CONSTANTS,
    calibration,
    oos,
    watchlist_size: snapshot.watchlist.length,
    watchlist: [...snapshot.watchlist],
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows_net_positive: board.filter((r) => r.net_farm.net_usd > 0).length,
    median_breakeven_usd: Math.round(median(breakevens)),
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
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
