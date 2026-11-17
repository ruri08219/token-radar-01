// Token Radar's model, radar-4: the snapshot in, the ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling)
// and adds the pre-token protocols the watchlist leaves out, by TVL, that the early radar
// exists to find: a protocol above the floor that the watchlist leaves out (its parent
// protocol trades, or its category is one the house's rule does not name) is as much a
// launch candidate as one below it, and the board ranks it on the same figures. A protocol
// is pre-token when its record carries no token (no market cap, no CoinGecko id, no
// symbol); the live-token protocols are kept apart and shown at the market's own values,
// never mixed into the ranked board.
//
// Implied value is priced off the market itself, by a regression on the snapshot's own
// live-token comparables, in log space:
//
//   log(mcap / TVL) = anchor + slope x (log(TVL) - lt_mean) + category_adj
//   implied          = round(TVL x exp(log ratio))
//
//   anchor    the median log market-cap / TVL over the comparables: the market's own
//             centre, stable across folds, so the level never rides on one fit.
//   slope     fitted by least squares on centred log TVL, then re-fitted eight times
//             with Huber weights (c = 1.345), so one wild token cannot drag the line.
//             The fitted slope is about -0.48: log market cap grows with log TVL at
//             about 0.52, far below one-to-one. A protocol twice as large is worth
//             about 1.4x as much, not twice as much. The market pays sublinearly for TVL.
//   category_adj  each category's median residual after the line, shrunk by n / (n + 3),
//             taken over the comparables inside the Tukey fence on the ratio: a
//             category with many comparables keeps most of its own adjustment, a
//             category with one keeps a quarter of it, a category with none, or none
//             inside the fence, gets zero. Categories are never trusted on their own:
//             the line always carries the row.
//
// Two things radar-3 did are deliberately NOT done here. Growth (change_7d) and age
// (listed_at) were tested as extra regressors and dropped: in the same five-fold check
// their coefficients came out near zero or negative and they lowered the pooled rank
// correlation, so the model keeps only TVL and category. And the -1 market cap is not a
// comparable: DefiLlama writes -1 where it cannot state a market cap, so a protocol
// carrying it is excluded from fitting and from validation (128 comparables, not 129).
// Radar-3's published numbers used 129; the comparison below recomputes radar-3's own
// calibration on the same 128, so the two models are judged on the same protocols.
//
// The calibration is tested out of sample, in this file, before it prices anything: the
// comparables are split into five folds by slug, the fit is redone on four folds and used
// to price the fifth, and the report says how far the prices land. No protocol name is
// ever special-cased: the same functions score every row.
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
export const MODEL_VERSION = 'radar-4';

/** How many pre-token protocols the watchlist leaves out the early radar carries, by TVL. */
export const EARLY_ROWS = 157;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The share of an implied value the farm math assumes reaches farmers. A guess, stated. */
export const COMMUNITY_SHARE = 0.07;

/** The ridge penalty on the single slope, and the Huber re-fit rounds. */
export const RIDGE = 1.0;
export const HUBER_ROUNDS = 8;
export const HUBER_C = 1.345;

/** A category's median residual is shrunk by n / (n + CAT_SHRINK). */
export const CAT_SHRINK = 3;

/** The number of folds the out-of-sample check splits the comparables into. */
export const OOS_FOLDS = 5;

/** One category's fitted adjustment, in log-ratio points. */
export interface CategoryAdjustment {
  category: string;
  comps: number;
  /** The category's median residual after the line, before shrinkage. */
  median_residual: number;
  /** The adjustment actually applied: the median residual shrunk by n / (n + 3). */
  adjustment: number;
  /** The multiple the model gives this category at the mean log TVL. */
  multiple_at_mean_tvl: number;
}

/** The fitted model: the anchor, the slope, and every category's adjustment. */
export interface ModelFit {
  /** Live-token protocols that carry a usable market cap and a TVL. */
  comps_total: number;
  /** The median log market-cap / TVL over the comparables: the anchor. */
  anchor: number;
  /** The mean log TVL over the comparables: the slope's centre. */
  lt_mean: number;
  /** The Huber-fitted slope on centred log TVL (log mcap grows at 1 + slope). */
  slope: number;
  /** One entry per category that holds at least one live comparable. */
  categories: CategoryAdjustment[];
}

/** One fold of the out-of-sample check. */
export interface OosFold {
  fold: number;
  train: number;
  test: number;
  anchor: number;
  slope: number;
  median_abs_log_error: number;
  within_two_x: number;
  within_three_x: number;
  spearman: number;
}

/** Radar-3's own calibration, recomputed on the same comparables, for an honest comparison. */
export interface Radar3Baseline {
  median_abs_log_error: number;
  within_two_x: number;
  within_three_x: number;
  total: number;
  spearman: number;
}

/** The out-of-sample report: the fit priced protocols it was not fitted on. */
export interface OosReport {
  folds: OosFold[];
  /** Median |log(predicted / actual)| over all held-out protocols. */
  median_abs_log_error: number;
  /** The same, as a factor: exp(median |log error|). */
  typical_factor: number;
  within_two_x: number;
  within_three_x: number;
  total: number;
  /** Rank correlation of the held-out predictions with the actual market caps, pooled. */
  spearman: number;
  /** The same correlation averaged over the five folds, one fold at a time. */
  spearman_fold_mean: number;
  /** The same correlation for TVL alone, the baseline the fit must beat to matter. */
  tvl_baseline_spearman: number;
  /** Radar-3's calibration, recomputed on the same 128 comparables and folds. */
  radar3_baseline: Radar3Baseline;
}

/** A farm plan netted to the farm: the position's expected value against its own gas. */
export interface NetFarm {
  capital_usd: number;
  gas_usd: number;
  gross_usd: number;
  net_usd: number;
  breakeven_usd: number;
}

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
    log_tvl: number;
    log_ratio: number;
    category_adjustment: number;
    implied_multiple: number;
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
  implied_multiple: number;
  category_adjustment: number;
  implied_value_usd: number;
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
  /** The fitted model, so the page recomputes a row with the same numbers. */
  fit: ModelFit;
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

/** Whether a protocol is a live comparable: its token trades, its market cap is a real
 * positive number, and its figures are whole. DefiLlama writes -1 for a token whose
 * market cap it cannot state and 0 for one with none: neither is a price, so neither
 * enters the fit. Radar-3 let the -1 record in; radar-4 does not. */
export function isComparable(p: SnapshotProtocol): boolean {
  return (
    p.mcap_usd !== null &&
    p.mcap_usd > 0 &&
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
 * protocol launch. Derivatives stay in: a perps protocol with no token is a launch candidate. */
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

/** One weighted least-squares slope through the origin, ridge-penalised. */
function weightedSlope(xs: number[], ys: number[], weights: number[]): number {
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    const w = weights[i]!;
    sxx += w * xs[i]! * xs[i]!;
    sxy += w * xs[i]! * ys[i]!;
  }
  return sxy / (sxx + RIDGE);
}

/**
 * Fit the model on a set of comparables: the median log ratio as the anchor, the mean log
 * TVL as the slope's centre, one Huber-reweighted slope on centred log TVL, and every
 * category's median residual shrunk by n / (n + 3). The category medians use only the
 * comparables inside the Tukey fence on market-cap / TVL (1.5 x IQR): a category whose
 * only comparable is a 400x-ratio outlier gets no adjustment at all, and is priced off
 * the line, instead of inheriting one wild token's price. The returned numbers are rounded
 * to four decimals and the model predicts from the rounded numbers, so the dashboard's
 * recomputation and board.json agree exactly.
 */
export function fitModel(comparables: SnapshotProtocol[]): ModelFit {
  const logRatios = comparables.map((p) => Math.log((p.mcap_usd as number) / p.tvl_usd));
  const anchor = round4(median(logRatios));
  const logTvls = comparables.map((p) => Math.log(p.tvl_usd));
  const ltMean = round4(logTvls.reduce((a, b) => a + b, 0) / logTvls.length);
  const xs = logTvls.map((v) => v - ltMean);
  const ys = logRatios.map((v) => v - anchor);
  let slope = weightedSlope(xs, ys, xs.map(() => 1));
  for (let round = 0; round < HUBER_ROUNDS; round++) {
    const residuals = ys.map((y, i) => y - slope * xs[i]!);
    const centre = median(residuals);
    const mad = median(residuals.map((r) => Math.abs(r - centre)));
    const s = HUBER_C * 1.4826 * mad + 1e-9;
    const weights = residuals.map((r) => Math.min(1, s / Math.max(Math.abs(r), 1e-9)));
    slope = weightedSlope(xs, ys, weights);
  }
  slope = round4(slope);
  const residuals = ys.map((y, i) => y - slope * xs[i]!);
  // The Tukey fence on the ratios: only comparables inside it may set a category's
  // adjustment. One 400x-ratio token must not price its whole category.
  const ratios = comparables.map((p) => (p.mcap_usd as number) / p.tvl_usd);
  const q1 = quartile(ratios, 0.25);
  const q3 = quartile(ratios, 0.75);
  const iqr = q3 - q1;
  const fenceLow = q1 - 1.5 * iqr;
  const fenceHigh = q3 + 1.5 * iqr;
  const byCategory = new Map<string, number[]>();
  comparables.forEach((p, i) => {
    const r = ratios[i]!;
    if (r < fenceLow || r > fenceHigh) return;
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(residuals[i]!);
    byCategory.set(key, list);
  });
  const categories: CategoryAdjustment[] = [...byCategory.entries()]
    .map(([category, list]) => {
      const med = median(list);
      const adj = round4(med * (list.length / (list.length + CAT_SHRINK)));
      return {
        category,
        comps: list.length,
        median_residual: round4(med),
        adjustment: adj,
        multiple_at_mean_tvl: round4(Math.exp(anchor + adj)),
      };
    })
    .sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  return { comps_total: comparables.length, anchor, lt_mean: ltMean, slope, categories };
}

/** A protocol's category adjustment under a fit: its category's, or zero when the category
 * holds no live comparable. */
export function categoryAdjustment(fit: ModelFit, category: string | null): number {
  const found = fit.categories.find((c) => c.category === (category ?? 'Other'));
  return found === undefined ? 0 : found.adjustment;
}

/** The implied value one protocol gets under a fit, with its breakdown. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: ModelFit,
): { implied: number; logTvl: number; logRatio: number; categoryAdj: number; multiple: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const logTvl = Math.log(protocol.tvl_usd);
  const categoryAdj = categoryAdjustment(fit, protocol.category);
  const logRatio = fit.anchor + fit.slope * (logTvl - fit.lt_mean) + categoryAdj;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * Math.exp(logRatio)));
  return { implied, logTvl: round4(logTvl), logRatio: round4(logRatio), categoryAdj, multiple: round4(implied / protocol.tvl_usd), age };
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
 * Radar-3's calibration, fitted on a set of comparables and used to price others: the
 * Tukey fence on market-cap / TVL, the global median over the fenced set, and every
 * category's median, trusted only when at least two of its comparables survive the fence.
 * Kept here only as the baseline the out-of-sample report judges radar-4 against, on
 * the same comparables and the same folds.
 */
export function radar3Predict(train: SnapshotProtocol[], test: SnapshotProtocol[]): number[] {
  const ratios = train.map((p) => (p.mcap_usd as number) / p.tvl_usd);
  const q1 = quartile(ratios, 0.25);
  const q3 = quartile(ratios, 0.75);
  const iqr = q3 - q1;
  const fenceLow = q1 - 1.5 * iqr;
  const fenceHigh = q3 + 1.5 * iqr;
  const kept = train.filter((p) => {
    const r = (p.mcap_usd as number) / p.tvl_usd;
    return r >= fenceLow && r <= fenceHigh;
  });
  const global = median(kept.map((p) => (p.mcap_usd as number) / p.tvl_usd));
  const keptSlugs = new Set(kept.map((p) => p.slug));
  const byCategory = new Map<string, number[]>();
  const keptByCategory = new Map<string, number>();
  for (const p of train) {
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push((p.mcap_usd as number) / p.tvl_usd);
    byCategory.set(key, list);
    if (keptSlugs.has(p.slug)) keptByCategory.set(key, (keptByCategory.get(key) ?? 0) + 1);
  }
  return test.map((p) => {
    const key = p.category ?? 'Other';
    const list = byCategory.get(key);
    const trusted = list !== undefined && (keptByCategory.get(key) ?? 0) >= 2;
    const m = trusted ? median(list!) : global;
    return p.tvl_usd * Math.min(1.0, Math.max(0.05, m));
  });
}

/**
 * The out-of-sample check. The comparables are split into five folds by slug order, so the
 * split is deterministic and no protocol's own figures ever price itself. Each fold refits
 * the model on the other four and prices the held-out protocols; radar-3's calibration is
 * refitted the same way on the same folds, so the comparison is on identical ground. The
 * pooled rank correlation mixes folds whose fitted levels differ slightly, so the report
 * also carries the mean of the five within-fold correlations, where the fit's ranking is
 * judged fold by fold.
 */
export function outOfSampleCheck(comparables: SnapshotProtocol[], asOf: string): OosReport {
  void asOf;
  const sorted = [...comparables].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const folds: SnapshotProtocol[][] = Array.from({ length: OOS_FOLDS }, () => []);
  sorted.forEach((p, i) => {
    folds[i % OOS_FOLDS]!.push(p);
  });
  const foldReports: OosFold[] = [];
  const allErrs: number[] = [];
  const allPred: number[] = [];
  const allActual: number[] = [];
  const foldSpearman: number[] = [];
  const r3Errs: number[] = [];
  const r3Pred: number[] = [];
  const r3Actual: number[] = [];
  for (let fi = 0; fi < OOS_FOLDS; fi++) {
    const test = folds[fi]!;
    const train = folds.flatMap((f, j) => (j === fi ? [] : f));
    const fit = fitModel(train);
    const errs: number[] = [];
    const preds: number[] = [];
    const actuals: number[] = [];
    for (const p of test) {
      const pred = p.tvl_usd * Math.exp(fit.anchor + fit.slope * (Math.log(p.tvl_usd) - fit.lt_mean) + categoryAdjustment(fit, p.category));
      errs.push(Math.log(pred / (p.mcap_usd as number)));
      preds.push(pred);
      actuals.push(p.mcap_usd as number);
    }
    const abs = errs.map(Math.abs);
    foldReports.push({
      fold: fi,
      train: train.length,
      test: test.length,
      anchor: fit.anchor,
      slope: fit.slope,
      median_abs_log_error: round4(median(abs)),
      within_two_x: errs.filter((e) => Math.abs(e) <= Math.log(2)).length,
      within_three_x: errs.filter((e) => Math.abs(e) <= Math.log(3)).length,
      spearman: round4(spearman(preds, actuals)),
    });
    foldSpearman.push(spearman(preds, actuals));
    allErrs.push(...errs);
    allPred.push(...preds);
    allActual.push(...actuals);
    const r3 = radar3Predict(train, test);
    r3.forEach((pred, i) => {
      r3Errs.push(Math.log(pred / (test[i]!.mcap_usd as number)));
      r3Pred.push(pred);
      r3Actual.push(test[i]!.mcap_usd as number);
    });
  }
  const overallAbs = median(allErrs.map(Math.abs));
  const r3Abs = median(r3Errs.map(Math.abs));
  return {
    folds: foldReports,
    median_abs_log_error: round4(overallAbs),
    typical_factor: round2(Math.exp(overallAbs)),
    within_two_x: allErrs.filter((e) => Math.abs(e) <= Math.log(2)).length,
    within_three_x: allErrs.filter((e) => Math.abs(e) <= Math.log(3)).length,
    total: allErrs.length,
    spearman: round4(spearman(allPred, allActual)),
    spearman_fold_mean: round4(foldSpearman.reduce((a, b) => a + b, 0) / foldSpearman.length),
    tvl_baseline_spearman: round4(spearman(comparables.map((p) => p.tvl_usd), comparables.map((p) => p.mcap_usd as number))),
    radar3_baseline: {
      median_abs_log_error: round4(r3Abs),
      within_two_x: r3Errs.filter((e) => Math.abs(e) <= Math.log(2)).length,
      within_three_x: r3Errs.filter((e) => Math.abs(e) <= Math.log(3)).length,
      total: r3Errs.length,
      spearman: round4(spearman(r3Pred, r3Actual)),
    },
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
export function buildBoard(snapshot: Snapshot, fit: ModelFit): BoardRow[] {
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
    const v = impliedValue(p, snapshot.as_of, fit);
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
      log_tvl: s.v.logTvl,
      log_ratio: s.v.logRatio,
      category_adjustment: s.v.categoryAdj,
      implied_multiple: s.v.multiple,
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
    implied_multiple: row.model.implied_multiple,
    category_adjustment: row.model.category_adjustment,
    implied_value_usd: row.implied_value_usd,
    net_usd: row.net_farm.net_usd,
    breakeven_usd: row.net_farm.breakeven_usd,
    net_farm: row.net_farm,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const comparables = snapshot.protocols.filter(isComparable);
  const fit = fitModel(comparables);
  const oos = outOfSampleCheck(comparables, snapshot.as_of);
  const board = buildBoard(snapshot, fit);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const breakevens = board.map((r) => r.net_farm.breakeven_usd).sort((a, b) => a - b);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    community_share: COMMUNITY_SHARE,
    fit,
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
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
