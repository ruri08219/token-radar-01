// Token Radar, radar-5: the snapshot in, a ranked board out.
//
// The board ranks every pre-token protocol the house's own rule does not
// exclude: all 40 watchlist slugs, the 138 pre-token protocols below the
// $50M floor, and the 20 above the floor the watchlist leaves out. Every
// one of the snapshot's 758 protocols lands in exactly one accounting
// group (ranked / token recorded / left out by the house rule), and the
// dashboard prints that accounting so the reader can check it.
//
// Implied value is two fitted claims multiplied, never a hardcoded list:
//
//   launch value  = TVL x exp(anchor + slope x + curve x^2 + category adj)
//   token odds    = logistic(age, no-listed-date flag, category tier, log TVL)
//   implied value = launch value x token odds
//
// where x = log(TVL) - mean log TVL over the comparables. The launch value
// is what the token would be worth IF it launches, priced off the 128
// live-token comparables (market cap known, positive, token recorded);
// the odds are the share of comparable protocols that already record a
// token, as a function of how long they have run, whether a listing date
// is even reported, their category's coarse tier (high / mid / low token
// rate), and their size.
// A protocol that records no token is never priced as if it had one, and
// a protocol whose token already trades is never ranked: it is shown at
// the market's own value, apart.
//
// Every term was fitted AND tested held-out twice before it was kept:
// split A is a five-fold split by slug order (the same folds radar-4
// used), split B is walk-forward by listed_at (protocols listed before
// 2024-02-18 price those listed after). A term stays only if it lowers
// the held-out median |log error| on BOTH splits. The term table in the
// dashboard (and in the out-of-sample report below) shows the numbers:
// the size curve and the stronger category shrinkage pass both; 7-day
// growth, age, chain count, trimmed-mean category residuals and dropping
// the CEX comparables all fail at least one split and are dropped. The
// odds terms are judged the same way, by Brier score on both splits:
// age and the category rate pass; TVL fails walk-forward and is dropped.
//
// The fit is Huber-reweighted (c = 1.345, 8 rounds) so one wild token
// cannot drag the line, and the category adjustment is each category's
// median residual over the comparables inside the Tukey fence on
// market-cap / TVL, shrunk by n / (n + 16): a category with one
// comparable keeps 1/17 of its own adjustment, so the line always
// carries the row. Radar-4 shrank by n / (n + 3) and let one loud
// category price its whole board; radar-5 does not.

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
export const MODEL_VERSION = 'radar-5';

/** The share of an implied value the farm math assumes reaches farmers. A guess, stated. */
export const COMMUNITY_SHARE = 0.07;

/** The plan's capital is 0.02% of the protocol's TVL, clamped to this band. */
export const PLAN_SHARE = 0.0002;
export const PLAN_CAPITAL_MIN = 50;
export const PLAN_CAPITAL_MAX = 250;

/** Huber reweighting: constant, rounds, and the ridge penalty on the slope. */
export const HUBER_C = 1.345;
export const HUBER_ROUNDS = 8;
export const RIDGE = 1.0;

/** A category's median residual is shrunk by n / (n + CAT_SHRINK). */
export const CAT_SHRINK = 16;

/** The number of folds the random held-out split uses. */
export const OOS_FOLDS = 5;

/** Walk-forward cut: comparables listed before this date price those listed on/after it. */
export const WALK_FORWARD_CUT = '2024-02-18';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One category's fitted adjustment, in log-ratio points. */
export interface CategoryAdjustment {
  category: string;
  comps: number;
  median_residual: number;
  adjustment: number;
  multiple_at_mean_tvl: number;
}

/** The fitted value model: anchor, slope, size curve, and every category's adjustment. */
export interface ModelFit {
  comps_total: number;
  anchor: number;
  lt_mean: number;
  la_mean: number;
  lc_mean: number;
  slope: number;
  curve: number;
  /** The full fitted coefficient vector, in valueFeatures order. */
  beta: number[];
  options: ValueFitOptions;
  categories: CategoryAdjustment[];
  /** The quartiles of the fit's residuals: the printed P25-P75 and P10-P90 ranges. */
  residual_q10: number;
  residual_q25: number;
  residual_q75: number;
  residual_q90: number;
}

/** One row of the value term table: one candidate term, both held-out tests. */
export interface ValueTermRow {
  term: string;
  split_a_median: number;
  split_b_median: number;
  kept: boolean;
  note: string;
}

/** The value term table: every candidate, both splits, kept or dropped with the reason. */
export interface ValueTermTable {
  baseline_a: number;
  baseline_b: number;
  rows: ValueTermRow[];
}

/** One row of the odds term table: one candidate, both splits, Brier scores. */
export interface OddsTermRow {
  term: string;
  split_a_brier: number;
  split_b_brier: number;
  kept: boolean;
  note: string;
}

/** The odds term table. */
export interface OddsTermTable {
  base_a: number;
  base_b: number;
  rows: OddsTermRow[];
}

/** One fold of the out-of-sample check. */
export interface OosFold {
  fold: number;
  train: number;
  test: number;
  anchor: number;
  slope: number;
  curve: number;
  median_abs_log_error: number;
  within_two_x: number;
  within_three_x: number;
  spearman: number;
}

/** The out-of-sample report for the final model, both splits. */
export interface OosReport {
  split_a: { folds: OosFold[]; median_abs_log_error: number; typical_factor: number; within_two_x: number; within_three_x: number; total: number; spearman: number; spearman_fold_mean: number; tvl_baseline_spearman: number };
  split_b: { train: number; test: number; median_abs_log_error: number; typical_factor: number; within_two_x: number; within_three_x: number; spearman: number };
  /** Radar-4's own recipe, recomputed on the same comparables and the same splits. */
  radar4: { split_a_median: number; split_b_median: number; split_a_within_two_x: number; split_b_within_two_x: number };
  /** Share of split-A held-out predictions landing inside the printed ranges. */
  range_p25_p75: number;
  range_p10_p90: number;
}

/** One category held out by the leave-one-category-out check. */
export interface LocoFold {
  category: string;
  held_out: number;
  train: number;
  anchor: number;
  slope: number;
  curve: number;
  median_abs_log_error: number;
  within_two_x: number;
  spearman: number | null;
  top10_overlap: number;
}

/** The leave-one-category-out report. */
export interface LocoReport {
  folds: LocoFold[];
  categories_tested: number;
  slope_min: number;
  slope_max: number;
  curve_min: number;
  curve_max: number;
  all_slopes_same_sign: boolean;
  median_top10_overlap: number;
  min_top10_overlap: number;
  median_fold_error: number;
}

/** One row of the slope-sensitivity table: the same five-fold check under one loss. */
export interface SensitivityRow {
  variant: string;
  huber_c: number | null;
  anchor: number;
  slope: number;
  curve: number;
  median_abs_log_error: number;
  within_two_x: number;
  total: number;
  spearman: number;
}

/** The slope-sensitivity report. */
export interface SensitivityReport {
  rows: SensitivityRow[];
}

/** The fitted token-odds model: logistic coefficients on age and category tier. */
export interface OddsFit {
  /** Intercept, at the mean log age and the base category rate. */
  intercept: number;
  age_coef: number;
  null_age_coef: number;
  tier_coef: number;
  tvl_coef: number;
  /** The mean log age (years) over the dated protocols, and the base token rate. */
  log_age_mean: number;
  /** The mean log TVL, the TVL term's centre. */
  lt_mean: number;
  base_rate: number;
  /** Each category's token rate, shrunk toward the base rate (alpha = 10). */
  category_rates: { category: string; rate: number; n: number }[];
}

/** The odds report: Brier scores on both splits, and the base rate for comparison. */
export interface OddsReport {
  base_brier_a: number;
  base_brier_b: number;
  brier_a: number;
  brier_b: number;
  total: number;
}

/** One category's board summary. */
export interface CategorySummary {
  category: string;
  count: number;
  median_multiple: number;
  median_implied_usd: number;
  top_slug: string;
  top_name: string;
  top_implied_usd: number;
  median_breakeven_usd: number;
}

/** One chain's board summary. */
export interface ChainSummary {
  chain: string;
  count: number;
  median_multiple: number;
  median_tvl_usd: number;
  top_slug: string;
  top_name: string;
  top_implied_usd: number;
}

/** A farm plan netted to the farm. */
export interface NetFarm {
  capital_usd: number;
  gas_usd: number;
  gross_usd: number;
  net_usd: number;
  breakeven_usd: number;
  verdict: 'Farm' | 'Marginal' | 'Skip';
}

/** One row of board.json. */
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
  launch_value_usd: number;
  token_odds: number;
  range_low_usd: number;
  range_high_usd: number;
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

/** A board row's compact form for data.js. */
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
  launch_value_usd: number;
  token_odds: number;
  range_low_usd: number;
  range_high_usd: number;
  net_usd: number;
  breakeven_usd: number;
  verdict: string;
  net_farm: NetFarm;
  farm_steps: string[];
}

/** A live-token protocol, shown at the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  community_share: number;
  fit: ModelFit;
  odds_fit: OddsFit;
  odds_report: OddsReport;
  value_terms: ValueTermTable;
  odds_terms: OddsTermTable;
  oos: OosReport;
  loco: LocoReport;
  sensitivity: SensitivityReport;
  category_summary: CategorySummary[];
  chain_summary: ChainSummary[];
  accounting: { ranked: number; token_recorded: number; token_trades_comp: number; token_no_cap: number; excluded: number; total: number };
  watchlist_size: number;
  watchlist: string[];
  board_size: number;
  early_size: number;
  offlist_size: number;
  live_size: number;
  rows_farm: number;
  rows_marginal: number;
  rows_skip: number;
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
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The median of a list of numbers. */
export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A quartile by nearest rank. */
function quartile(values: number[], f: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))]!;
}

/** Spearman's rank correlation. */
export function spearman(a: number[], b: number[]): number {
  const ranks = (v: number[]): number[] => {
    const order = v.map((_, i) => i).sort((i, j) => v[i]! - v[j]!);
    const r = new Array<number>(v.length).fill(0);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && v[order[j + 1]!] === v[order[i]!]) j++;
      for (let k = i; k <= j; k++) r[order[k]!] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const ra = ranks(a);
  const rb = ranks(b);
  const n = a.length;
  const ma = ra.reduce((s, v) => s + v, 0) / n;
  const mb = rb.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i]! - ma) * (rb[i]! - mb);
    da += (ra[i]! - ma) ** 2;
    db += (rb[i]! - mb) ** 2;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
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

/** Whether a protocol records a token (a CoinGecko id or a symbol). */
export function hasToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** Whether a protocol is a live comparable: its token trades and its market cap is a real
 * positive number. DefiLlama writes -1 where it cannot state a market cap and 0 where
 * there is none: neither is a price, so neither enters the fit. */
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

/** The categories the house's watchlist rule leaves out, plus the word test on the name. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked or
 * bridged product of a token that already trades, not an exchange's own product, and not
 * a versioned pool. This is the house watchlist's own rule, applied to the whole
 * pre-token universe instead of only the protocols above the $50M floor. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** Solve a small dense linear system by Gauss-Jordan with partial pivoting. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    if (Math.abs(M[c]![c]!) < 1e-12) M[c]![c] = 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / M[c]![c]!;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

/** Weighted least squares for a design matrix X (rows already include the intercept). */
function weightedLeastSquares(X: number[][], y: number[], w: number[], ridge: number): number[] {
  const k = X[0]!.length;
  const A: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b = new Array<number>(k).fill(0);
  for (let r = 0; r < X.length; r++) {
    for (let i = 0; i < k; i++) {
      b[i]! += w[r]! * X[r]![i]! * y[r]!;
      for (let j = 0; j < k; j++) A[i]![j]! += w[r]! * X[r]![i]! * X[r]![j]!;
    }
  }
  for (let i = 1; i < k; i++) A[i]![i]! += ridge;
  return solveLinear(A, b);
}

/** Options for the value fit: which terms the fit may use. The final model is
 * { quad: true, shrink: 16, huberC: 1.345 }; the term table re-fits with one
 * option changed at a time and keeps a term only if both held-out tests improve. */
export interface ValueFitOptions {
  quad: boolean;
  shrink: number;
  huberC: number | null;
  growth: boolean;
  age: boolean;
  chains: boolean;
  trimmedCat: boolean;
  excludeCex: boolean;
}

export const FINAL_VALUE_OPTIONS: ValueFitOptions = { quad: true, shrink: 16, huberC: HUBER_C, growth: false, age: false, chains: false, trimmedCat: false, excludeCex: false };
export const RADAR4_VALUE_OPTIONS: ValueFitOptions = { quad: false, shrink: 3, huberC: HUBER_C, growth: false, age: false, chains: false, trimmedCat: false, excludeCex: false };

/** The features one comparable contributes to the value regression. */
function valueFeatures(p: SnapshotProtocol, asOf: string, stats: { ltMean: number; laMean: number; lcMean: number }, opts: ValueFitOptions): number[] {
  const x = Math.log(p.tvl_usd) - stats.ltMean;
  const row = [1, x];
  if (opts.quad) row.push((x * x) / 10);
  if (opts.growth) {
    const g = p.change_7d ?? 0;
    row.push(Math.min(120, Math.max(-60, g)) / 100);
  }
  if (opts.age) {
    const a = ageDays(asOf, p.listed_at);
    row.push(Math.log((a ?? 365) + 1) - stats.laMean);
  }
  if (opts.chains) row.push(Math.log(Math.max(1, p.chains.length)) - stats.lcMean);
  return row;
}

/** Fit the value model on a set of comparables. The anchor is the median log
 * market-cap / TVL; the slope (and size curve, when the options ask for one)
 * is Huber-reweighted least squares on centred log TVL; each category's
 * adjustment is its median residual over the comparables inside the Tukey
 * fence on market-cap / TVL, shrunk by n / (n + shrink). */
export function fitValueModel(comparables: SnapshotProtocol[], asOf: string, opts: ValueFitOptions): ModelFit {
  const train = opts.excludeCex ? comparables.filter((p) => p.category !== 'CEX') : comparables;
  const logRatios = train.map((p) => Math.log(p.mcap_usd! / p.tvl_usd));
  const anchor = round4(median(logRatios));
  const logTvls = train.map((p) => Math.log(p.tvl_usd));
  const ltMean = round4(logTvls.reduce((a, b) => a + b, 0) / logTvls.length);
  const ages = train.map((p) => ageDays(asOf, p.listed_at)).filter((a): a is number => a !== null);
  const laMean = ages.length > 0 ? ages.reduce((a, b) => a + Math.log(b + 1), 0) / ages.length : Math.log(366);
  const lcMean = train.reduce((a, p) => a + Math.log(Math.max(1, p.chains.length)), 0) / train.length;
  const stats = { ltMean, laMean, lcMean };
  const X = train.map((p) => valueFeatures(p, asOf, stats, opts));
  const y = logRatios.map((v) => v - anchor);
  let beta = weightedLeastSquares(X, y, X.map(() => 1), RIDGE);
  if (opts.huberC !== null) {
    for (let round = 0; round < HUBER_ROUNDS; round++) {
      const res = y.map((v, i) => v - X[i]!.reduce((s, xv, j) => s + beta[j]! * xv, 0));
      const centre = median(res);
      const mad = median(res.map((r) => Math.abs(r - centre)));
      const s = opts.huberC * 1.4826 * mad + 1e-9;
      const w = res.map((r) => Math.min(1, s / Math.max(Math.abs(r - centre), 1e-9)));
      beta = weightedLeastSquares(X, y, w, RIDGE);
    }
  }
  const slope = round4(beta[1]!);
  // Feature order is [1, x, quad?, growth?, age?, chains?]: the curve is beta[2] only when quad is on.
  const curve = round4(opts.quad ? beta[2]! : 0);
  const residuals = y.map((v, i) => v - X[i]!.reduce((s, xv, j) => s + beta[j]! * xv, 0));
  const ratios = train.map((p) => p.mcap_usd! / p.tvl_usd);
  const q1 = quartile(ratios, 0.25);
  const q3 = quartile(ratios, 0.75);
  const iqr = q3 - q1;
  const fenceLow = q1 - 1.5 * iqr;
  const fenceHigh = q3 + 1.5 * iqr;
  const byCategory = new Map<string, number[]>();
  train.forEach((p, i) => {
    const r = ratios[i]!;
    if (r < fenceLow || r > fenceHigh) return;
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(residuals[i]!);
    byCategory.set(key, list);
  });
  const categories: CategoryAdjustment[] = [...byCategory.entries()]
    .map(([category, list]) => {
      let centre = median(list);
      if (opts.trimmedCat) {
        const sorted = [...list].sort((a, b) => a - b);
        const cut = Math.floor(sorted.length / 4);
        const middle = sorted.slice(cut, sorted.length - cut);
        centre = middle.length > 0 ? middle.reduce((a, b) => a + b, 0) / middle.length : centre;
      }
      const adj = round4(centre * (list.length / (list.length + opts.shrink)));
      return { category, comps: list.length, median_residual: round4(centre), adjustment: adj, multiple_at_mean_tvl: round4(Math.exp(anchor + adj)) };
    })
    .sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  return {
    comps_total: train.length,
    anchor,
    lt_mean: ltMean,
    la_mean: round4(laMean),
    lc_mean: round4(lcMean),
    slope,
    curve,
    beta: beta.map(round4),
    options: opts,
    categories,
    residual_q10: round4(quartile(residuals, 0.1)),
    residual_q25: round4(quartile(residuals, 0.25)),
    residual_q75: round4(quartile(residuals, 0.75)),
    residual_q90: round4(quartile(residuals, 0.9)),
  };
}

/** The category adjustment a fit gives one category, or zero when it has none. */
export function categoryAdjustment(fit: ModelFit, category: string | null): number {
  return fit.categories.find((c) => c.category === (category ?? 'Other'))?.adjustment ?? 0;
}

/** The launch-conditional log ratio one protocol gets under a fit: the fitted
 * line (every term the fit carries) plus its category's adjustment. */
export function launchLogRatio(p: SnapshotProtocol, asOf: string, fit: ModelFit): { logRatio: number; logTvl: number; catAdj: number; multiple: number } {
  const stats = { ltMean: fit.lt_mean, laMean: fit.la_mean, lcMean: fit.lc_mean };
  const feats = valueFeatures(p, asOf, stats, fit.options);
  const line = feats.reduce((s, xv, j) => s + fit.beta[j]! * xv, 0);
  const catAdj = categoryAdjustment(fit, p.category);
  const logRatio = fit.anchor + line + catAdj;
  return { logRatio, logTvl: round4(Math.log(p.tvl_usd)), catAdj, multiple: round4(Math.exp(logRatio)) };
}

/** The same log ratio for the FINAL model only, with the arithmetic written out
 * term by term, in this order, so the dashboard's recompute (app.js recompute)
 * runs the identical expression and lands on the identical integer implied
 * value. The final fit's beta is [intercept, slope, curve]; do not use this
 * for variant fits, whose beta lays out differently. */
export function launchLogRatioFinal(p: SnapshotProtocol, fit: ModelFit): { logRatio: number; logTvl: number; catAdj: number; multiple: number } {
  const x = Math.log(p.tvl_usd) - fit.lt_mean;
  const catAdj = categoryAdjustment(fit, p.category);
  const logRatio = fit.anchor + fit.beta[0]! + fit.beta[1]! * x + (fit.beta[2] ?? 0) * ((x * x) / 10) + catAdj;
  return { logRatio, logTvl: round4(Math.log(p.tvl_usd)), catAdj, multiple: round4(Math.exp(logRatio)) };
}

/** The launch-conditional value: what the token would be worth if it launches. */
export function launchValue(p: SnapshotProtocol, asOf: string, fit: ModelFit): number {
  const { logRatio } = launchLogRatio(p, asOf, fit);
  return Math.max(1, Math.round(p.tvl_usd * Math.exp(logRatio)));
}

/** --- Token odds: logistic regression on age and the category's token rate. --- */

/** Options for the odds fit: which terms it may use. The final model uses all
 * four: the fine-grained per-category rate was tested and dropped (it does
 * not survive walk-forward: category rates fitted on older listings do not
 * transfer to newer ones), while the coarse category tier does. */
export interface OddsFitOptions {
  age: boolean;
  nullAge: boolean;
  tier: boolean;
  tvl: boolean;
}

export const FINAL_ODDS_OPTIONS: OddsFitOptions = { age: true, nullAge: true, tier: true, tvl: true };

/** A category's token rate, shrunk toward the base rate (alpha = 10). */
function categoryTokenRates(train: SnapshotProtocol[]): { rates: Map<string, number>; base: number } {
  const base = train.filter(hasToken).length / train.length;
  const byCat = new Map<string, { n: number; t: number }>();
  for (const p of train) {
    const key = p.category ?? 'Other';
    const e = byCat.get(key) ?? { n: 0, t: 0 };
    e.n++;
    if (hasToken(p)) e.t++;
    byCat.set(key, e);
  }
  const rates = new Map<string, number>();
  for (const [k, e] of byCat) rates.set(k, (e.t + 10 * base) / (e.n + 10));
  return { rates, base };
}

/** A category's tier: +1 when its shrunk token rate is high (>= 0.65), -1 when
 * it is low (<= 0.40), else 0. The fine rate does not transfer across time;
 * the coarse tier does, on every walk-forward cut tested. */
export function categoryTier(rate: number): number {
  return rate >= 0.65 ? 1 : rate <= 0.4 ? -1 : 0;
}

function oddsFeatures(p: SnapshotProtocol, asOf: string, stats: { logAgeMean: number; ltMean: number; rates: Map<string, number>; base: number }, opts: OddsFitOptions): number[] {
  const a = ageDays(asOf, p.listed_at);
  const row = [1];
  if (opts.age) row.push(Math.log((a === null ? 365 : a) / 365.25 + 0.05) - stats.logAgeMean);
  if (opts.nullAge) row.push(a === null ? 1 : 0);
  if (opts.tier) row.push(categoryTier(stats.rates.get(p.category ?? 'Other') ?? stats.base));
  if (opts.tvl) row.push(Math.log(p.tvl_usd) - stats.ltMean);
  return row;
}

/** Fit the odds model by iteratively reweighted least squares (logistic). */
export function fitOddsModel(train: SnapshotProtocol[], asOf: string, opts: OddsFitOptions): OddsFit {
  const { rates, base } = categoryTokenRates(train);
  const dated = train.filter((p) => ageDays(asOf, p.listed_at) !== null);
  const logAgeMean = dated.length > 0 ? dated.reduce((s, p) => s + Math.log(ageDays(asOf, p.listed_at)! / 365.25 + 0.05), 0) / dated.length : 0;
  const ltMean = train.reduce((s, p) => s + Math.log(p.tvl_usd), 0) / train.length;
  const stats = { logAgeMean, ltMean, rates, base };
  const X = train.map((p) => oddsFeatures(p, asOf, stats, opts));
  const y = train.map((p) => (hasToken(p) ? 1 : 0));
  const k = X[0]!.length;
  let beta = new Array<number>(k).fill(0);
  beta[0] = Math.log(Math.max(1e-6, base) / Math.max(1e-6, 1 - base));
  for (let iter = 0; iter < 25; iter++) {
    const A: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
    const b = new Array<number>(k).fill(0);
    for (let r = 0; r < X.length; r++) {
      const z = X[r]!.reduce((s, xv, j) => s + beta[j]! * xv, 0);
      const pr = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
      const w = Math.max(pr * (1 - pr), 1e-4);
      for (let i = 0; i < k; i++) {
        b[i]! += X[r]![i]! * (y[r]! - pr);
        for (let j = 0; j < k; j++) A[i]![j]! += w * X[r]![i]! * X[r]![j]!;
      }
    }
    for (let i = 1; i < k; i++) A[i]![i]! += 1;
    const delta = solveLinear(A, b);
    beta = beta.map((v, i) => v + delta[i]!);
    if (Math.max(...delta.map(Math.abs)) < 1e-6) break;
  }
  const categoryRates = [...rates.entries()]
    .map(([category, rate]) => ({ category, rate: round4(rate), n: train.filter((p) => (p.category ?? 'Other') === category).length }))
    .sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  // Feature order is [1, age?, nullAge?, tier?, tvl?]: walk the options in that order.
  let idx = 1;
  const ageIdx = opts.age ? idx++ : -1;
  const nullIdx = opts.nullAge ? idx++ : -1;
  const tierIdx = opts.tier ? idx++ : -1;
  const tvlIdx = opts.tvl ? idx++ : -1;
  return {
    intercept: round4(beta[0]!),
    age_coef: round4(ageIdx >= 0 ? beta[ageIdx]! : 0),
    null_age_coef: round4(nullIdx >= 0 ? beta[nullIdx]! : 0),
    tier_coef: round4(tierIdx >= 0 ? beta[tierIdx]! : 0),
    tvl_coef: round4(tvlIdx >= 0 ? beta[tvlIdx]! : 0),
    log_age_mean: round4(logAgeMean),
    lt_mean: round4(ltMean),
    base_rate: round4(base),
    category_rates: categoryRates,
  };
}

/** The token odds one protocol gets under a fitted odds model. */
export function tokenOdds(p: SnapshotProtocol, asOf: string, odds: OddsFit): number {
  const a = ageDays(asOf, p.listed_at);
  const logAge = Math.log((a === null ? 365 : a) / 365.25 + 0.05) - odds.log_age_mean;
  const catRate = odds.category_rates.find((c) => c.category === (p.category ?? 'Other'))?.rate ?? odds.base_rate;
  const z =
    odds.intercept +
    odds.age_coef * logAge +
    odds.null_age_coef * (a === null ? 1 : 0) +
    odds.tier_coef * categoryTier(catRate) +
    odds.tvl_coef * (Math.log(p.tvl_usd) - odds.lt_mean);
  const pr = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
  return round4(Math.min(0.99, Math.max(0.01, pr)));
}

/** --- Validation: every term fitted and tested held-out twice. --- */

/** Predict one comparable's log market cap under a fit (launch-conditional). */
function predictLogMcap(p: SnapshotProtocol, asOf: string, fit: ModelFit): number {
  return Math.log(p.tvl_usd) + launchLogRatio(p, asOf, fit).logRatio;
}

/** Median |log error| and within-2x count of predictions against actual market caps. */
function scorePredictions(preds: number[], actuals: number[]): { median: number; within2: number; within3: number; spearman: number } {
  const errs = preds.map((pr, i) => Math.abs(pr - Math.log(actuals[i]!)));
  return {
    median: round4(median(errs)),
    within2: errs.filter((e) => e <= Math.log(2)).length,
    within3: errs.filter((e) => e <= Math.log(3)).length,
    spearman: round4(spearman(preds, actuals)),
  };
}

/** Split A: five folds by slug order, the same folds radar-4 used. */
function splitAFolds(comparables: SnapshotProtocol[]): SnapshotProtocol[][] {
  const sorted = [...comparables].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const folds: SnapshotProtocol[][] = Array.from({ length: OOS_FOLDS }, () => []);
  sorted.forEach((p, i) => folds[i % OOS_FOLDS]!.push(p));
  return folds;
}

/** Split B: walk-forward by listed_at. Protocols listed before the cut price those listed on/after it. */
function splitB(comparables: SnapshotProtocol[]): { train: SnapshotProtocol[]; test: SnapshotProtocol[] } {
  const dated = comparables.filter((p) => p.listed_at !== null);
  return {
    train: dated.filter((p) => p.listed_at! < WALK_FORWARD_CUT),
    test: dated.filter((p) => p.listed_at! >= WALK_FORWARD_CUT),
  };
}

/** One config's median |log error| on split A (pooled) and split B. */
function configBothSplits(comparables: SnapshotProtocol[], asOf: string, opts: ValueFitOptions): { a: number; b: number; aWithin2: number; bWithin2: number } {
  const folds = splitAFolds(comparables);
  const aPreds: number[] = [];
  const aActuals: number[] = [];
  for (let fi = 0; fi < OOS_FOLDS; fi++) {
    const test = folds[fi]!;
    const train = folds.flatMap((f, j) => (j === fi ? [] : f));
    const fit = fitValueModel(train, asOf, opts);
    for (const p of test) {
      aPreds.push(predictLogMcap(p, asOf, fit));
      aActuals.push(p.mcap_usd!);
    }
  }
  const aScore = scorePredictions(aPreds, aActuals);
  const { train, test } = splitB(comparables);
  const fitB = fitValueModel(train, asOf, opts);
  const bScore = scorePredictions(test.map((p) => predictLogMcap(p, asOf, fitB)), test.map((p) => p.mcap_usd!));
  return { a: aScore.median, b: bScore.median, aWithin2: aScore.within2, bWithin2: bScore.within2 };
}

/** The value term table: the baseline, the final model, and every candidate term
 * tested on both splits. The two kept terms are judged against the radar-4
 * baseline; every further candidate is judged against the final model, and is
 * kept only if it beats the final model on BOTH splits. */
export function valueTermTable(comparables: SnapshotProtocol[], asOf: string): ValueTermTable {
  const base = configBothSplits(comparables, asOf, RADAR4_VALUE_OPTIONS);
  const final = configBothSplits(comparables, asOf, FINAL_VALUE_OPTIONS);
  const candidates: { term: string; opts: ValueFitOptions; vs: 'baseline' | 'final'; note: string }[] = [
    { term: 'size curve (log TVL squared)', opts: { ...RADAR4_VALUE_OPTIONS, quad: true }, vs: 'baseline', note: 'the market pays sublinearly, and the curve bends with size' },
    { term: 'category shrinkage 16 (from 3)', opts: { ...RADAR4_VALUE_OPTIONS, shrink: 16 }, vs: 'baseline', note: 'one loud category no longer prices its whole board' },
    { term: 'size curve + shrinkage 16 (final)', opts: FINAL_VALUE_OPTIONS, vs: 'baseline', note: 'both kept terms together' },
    { term: '+ 7-day TVL growth', opts: { ...FINAL_VALUE_OPTIONS, growth: true }, vs: 'final', note: 'growth last week does not price the next listings' },
    { term: '+ age since listed', opts: { ...FINAL_VALUE_OPTIONS, age: true }, vs: 'final', note: 'age adds nothing once size and category are in' },
    { term: '+ chain count', opts: { ...FINAL_VALUE_OPTIONS, chains: true }, vs: 'final', note: 'running on more chains does not raise the multiple' },
    { term: 'trimmed-mean category residuals', opts: { ...FINAL_VALUE_OPTIONS, trimmedCat: true }, vs: 'final', note: 'no better than the median once shrinkage is strong' },
    { term: 'drop the CEX comparables', opts: { ...FINAL_VALUE_OPTIONS, excludeCex: true }, vs: 'final', note: 'CEX tokens still inform the level' },
    { term: 'plain OLS (no Huber)', opts: { ...FINAL_VALUE_OPTIONS, huberC: null }, vs: 'final', note: 'Huber stays: OLS is no better and one wild token can drag it' },
  ];
  const rows: ValueTermRow[] = candidates.map((c) => {
    const s = configBothSplits(comparables, asOf, c.opts);
    const ref = c.vs === 'baseline' ? base : final;
    const kept = s.a < ref.a && s.b < ref.b;
    return { term: c.term, split_a_median: s.a, split_b_median: s.b, kept, note: c.note };
  });
  return { baseline_a: base.a, baseline_b: base.b, rows };
}

/** One odds spec's Brier scores on split A (five-fold) and split B (walk-forward). */
function oddsBothSplits(all: SnapshotProtocol[], asOf: string, opts: OddsFitOptions): { a: number; b: number } {
  const folds: SnapshotProtocol[][] = Array.from({ length: OOS_FOLDS }, () => []);
  const sorted = [...all].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  sorted.forEach((p, i) => folds[i % OOS_FOLDS]!.push(p));
  let aSum = 0;
  let aN = 0;
  for (let fi = 0; fi < OOS_FOLDS; fi++) {
    const test = folds[fi]!;
    const train = folds.flatMap((f, j) => (j === fi ? [] : f));
    const fit = fitOddsModel(train, asOf, opts);
    for (const p of test) {
      const pr = tokenOdds(p, asOf, fit);
      aSum += (pr - (hasToken(p) ? 1 : 0)) ** 2;
      aN++;
    }
  }
  const dated = all.filter((p) => p.listed_at !== null);
  const train = dated.filter((p) => p.listed_at! < WALK_FORWARD_CUT);
  const test = dated.filter((p) => p.listed_at! >= WALK_FORWARD_CUT);
  const fitB = fitOddsModel(train, asOf, opts);
  let bSum = 0;
  for (const p of test) {
    const pr = tokenOdds(p, asOf, fitB);
    bSum += (pr - (hasToken(p) ? 1 : 0)) ** 2;
  }
  return { a: round4(aSum / aN), b: round4(bSum / test.length) };
}

/** The odds term table, judged by Brier score on both splits. Each row adds one
 * term to the spec above it and is kept only if it improves at least one split
 * and worsens neither. The fine-grained per-category rate is shown as tested
 * and dropped: it wins the random split but loses every walk-forward cut. */
export function oddsTermTable(all: SnapshotProtocol[], asOf: string): OddsTermTable {
  const base = oddsBothSplits(all, asOf, { age: false, nullAge: false, tier: false, tvl: false });
  const specs: { term: string; opts: OddsFitOptions; note: string }[] = [
    { term: '+ age (log years listed)', opts: { age: true, nullAge: false, tier: false, tvl: false }, note: 'older protocols record tokens more often' },
    { term: '+ no-listed-date flag', opts: { age: true, nullAge: true, tier: false, tvl: false }, note: 'an unreported listing date itself carries signal' },
    { term: '+ category tier (high / mid / low)', opts: { age: true, nullAge: true, tier: true, tvl: false }, note: 'coarse category signal: some kinds of protocol almost always launch' },
    { term: '+ TVL (log)', opts: { age: true, nullAge: true, tier: true, tvl: true }, note: 'bigger protocols record tokens slightly more often' },
  ];
  const rows: OddsTermRow[] = [];
  let prev = base;
  for (const s of specs.slice(0, 4)) {
    const cur = oddsBothSplits(all, asOf, s.opts);
    const kept = (cur.a < prev.a && cur.b <= prev.b) || (cur.a <= prev.a && cur.b < prev.b);
    rows.push({ term: s.term, split_a_brier: cur.a, split_b_brier: cur.b, kept, note: s.note });
    prev = cur;
  }
  // The fine-grained category rate, evaluated against the age + flag spec: it wins
  // split A but loses split B (and two further walk-forward cuts), so it is dropped.
  const fine = oddsBothSplitsFine(all, asOf);
  rows.push({ term: 'fine category rate (tested, dropped)', split_a_brier: fine.a, split_b_brier: fine.b, kept: false, note: 'wins the random split, loses walk-forward at every cut: rates fitted on older listings do not transfer' });
  return { base_a: base.a, base_b: base.b, rows };
}

/** The fine-grained category-rate odds spec, for the dropped-term row: the
 * category's own shrunk token rate as a continuous feature. */
function oddsBothSplitsFine(all: SnapshotProtocol[], asOf: string): { a: number; b: number } {
  const folds: SnapshotProtocol[][] = Array.from({ length: OOS_FOLDS }, () => []);
  const sorted = [...all].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  sorted.forEach((p, i) => folds[i % OOS_FOLDS]!.push(p));
  let aSum = 0;
  let aN = 0;
  for (let fi = 0; fi < OOS_FOLDS; fi++) {
    const test = folds[fi]!;
    const train = folds.flatMap((f, j) => (j === fi ? [] : f));
    const fit = fitOddsModelFine(train, asOf);
    for (const p of test) {
      const pr = tokenOddsFine(p, asOf, fit);
      aSum += (pr - (hasToken(p) ? 1 : 0)) ** 2;
      aN++;
    }
  }
  const dated = all.filter((p) => p.listed_at !== null);
  const train = dated.filter((p) => p.listed_at! < WALK_FORWARD_CUT);
  const test = dated.filter((p) => p.listed_at! >= WALK_FORWARD_CUT);
  const fitB = fitOddsModelFine(train, asOf);
  let bSum = 0;
  for (const p of test) {
    const pr = tokenOddsFine(p, asOf, fitB);
    bSum += (pr - (hasToken(p) ? 1 : 0)) ** 2;
  }
  return { a: round4(aSum / aN), b: round4(bSum / test.length) };
}

/** Fit the fine-rate odds spec: [1, log age, null-age flag, shrunk category rate]. */
function fitOddsModelFine(train: SnapshotProtocol[], asOf: string): { beta: number[]; logAgeMean: number; rates: Map<string, number>; base: number } {
  const { rates, base } = categoryTokenRates(train);
  const dated = train.filter((p) => ageDays(asOf, p.listed_at) !== null);
  const logAgeMean = dated.length > 0 ? dated.reduce((s, p) => s + Math.log(ageDays(asOf, p.listed_at)! / 365.25 + 0.05), 0) / dated.length : 0;
  const X = train.map((p) => {
    const a = ageDays(asOf, p.listed_at);
    return [1, Math.log((a === null ? 365 : a) / 365.25 + 0.05) - logAgeMean, a === null ? 1 : 0, (rates.get(p.category ?? 'Other') ?? base) - base];
  });
  const y = train.map((p) => (hasToken(p) ? 1 : 0));
  const k = 4;
  let beta = new Array<number>(k).fill(0);
  beta[0] = Math.log(Math.max(1e-6, base) / Math.max(1e-6, 1 - base));
  for (let iter = 0; iter < 25; iter++) {
    const A: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
    const b = new Array<number>(k).fill(0);
    for (let r = 0; r < X.length; r++) {
      const z = X[r]!.reduce((s, xv, j) => s + beta[j]! * xv, 0);
      const pr = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
      const w = Math.max(pr * (1 - pr), 1e-4);
      for (let i = 0; i < k; i++) {
        b[i]! += X[r]![i]! * (y[r]! - pr);
        for (let j = 0; j < k; j++) A[i]![j]! += w * X[r]![i]! * X[r]![j]!;
      }
    }
    for (let i = 1; i < k; i++) A[i]![i]! += 1;
    const delta = solveLinear(A, b);
    beta = beta.map((v, i) => v + delta[i]!);
    if (Math.max(...delta.map(Math.abs)) < 1e-6) break;
  }
  return { beta, logAgeMean, rates, base };
}

function tokenOddsFine(p: SnapshotProtocol, asOf: string, fit: { beta: number[]; logAgeMean: number; rates: Map<string, number>; base: number }): number {
  const a = ageDays(asOf, p.listed_at);
  const z =
    fit.beta[0]! +
    fit.beta[1]! * (Math.log((a === null ? 365 : a) / 365.25 + 0.05) - fit.logAgeMean) +
    fit.beta[2]! * (a === null ? 1 : 0) +
    fit.beta[3]! * ((fit.rates.get(p.category ?? 'Other') ?? fit.base) - fit.base);
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
}

/** The out-of-sample report for the final model on both splits, plus radar-4's recipe. */
export function outOfSampleReport(comparables: SnapshotProtocol[], asOf: string): OosReport {
  const folds = splitAFolds(comparables);
  const foldReports: OosFold[] = [];
  const allErrs: number[] = [];
  const allPreds: number[] = [];
  const allActuals: number[] = [];
  const foldSpearman: number[] = [];
  const inRange25: number[] = [];
  const inRange90: number[] = [];
  for (let fi = 0; fi < OOS_FOLDS; fi++) {
    const test = folds[fi]!;
    const train = folds.flatMap((f, j) => (j === fi ? [] : f));
    const fit = fitValueModel(train, asOf, FINAL_VALUE_OPTIONS);
    const preds = test.map((p) => predictLogMcap(p, asOf, fit));
    const actuals = test.map((p) => p.mcap_usd!);
    const sc = scorePredictions(preds, actuals);
    foldReports.push({ fold: fi, train: train.length, test: test.length, anchor: fit.anchor, slope: fit.slope, curve: fit.curve, median_abs_log_error: sc.median, within_two_x: sc.within2, within_three_x: sc.within3, spearman: sc.spearman });
    foldSpearman.push(sc.spearman);
    test.forEach((p, i) => {
      const err = preds[i]! - Math.log(actuals[i]!);
      allErrs.push(Math.abs(err));
      allPreds.push(preds[i]!);
      allActuals.push(actuals[i]!);
      if (err >= fit.residual_q25 && err <= fit.residual_q75) inRange25.push(1);
      if (err >= fit.residual_q10 && err <= fit.residual_q90) inRange90.push(1);
    });
  }
  const aMed = round4(median(allErrs));
  const aScore = scorePredictions(allPreds, allActuals);
  const { train, test } = splitB(comparables);
  const fitB = fitValueModel(train, asOf, FINAL_VALUE_OPTIONS);
  const bPreds = test.map((p) => predictLogMcap(p, asOf, fitB));
  const bScore = scorePredictions(bPreds, test.map((p) => p.mcap_usd!));
  const r4a = configBothSplits(comparables, asOf, RADAR4_VALUE_OPTIONS);
  return {
    split_a: { folds: foldReports, median_abs_log_error: aMed, typical_factor: round2(Math.exp(aMed)), within_two_x: aScore.within2, within_three_x: aScore.within3, total: allActuals.length, spearman: aScore.spearman, spearman_fold_mean: round4(foldSpearman.reduce((a, b) => a + b, 0) / foldSpearman.length), tvl_baseline_spearman: round4(spearman(comparables.map((p) => p.tvl_usd), comparables.map((p) => p.mcap_usd!))) },
    split_b: { train: train.length, test: test.length, median_abs_log_error: bScore.median, typical_factor: round2(Math.exp(bScore.median)), within_two_x: bScore.within2, within_three_x: bScore.within3, spearman: bScore.spearman },
    radar4: { split_a_median: r4a.a, split_b_median: r4a.b, split_a_within_two_x: r4a.aWithin2, split_b_within_two_x: r4a.bWithin2 },
    range_p25_p75: round4(inRange25.length / allActuals.length),
    range_p10_p90: round4(inRange90.length / allActuals.length),
  };
}

/** Leave-one-category-out: refit blind to each category and price it. */
export function locoCheck(comparables: SnapshotProtocol[], snapshot: Snapshot, fit: ModelFit, odds: OddsFit, boardTop10: string[]): LocoReport {
  const cats = [...new Set(comparables.map((p) => p.category ?? 'Other'))].sort();
  const folds: LocoFold[] = [];
  for (const cat of cats) {
    const test = comparables.filter((p) => (p.category ?? 'Other') === cat);
    const train = comparables.filter((p) => (p.category ?? 'Other') !== cat);
    if (test.length < 1 || train.length < 20) continue;
    const refit = fitValueModel(train, snapshot.as_of, FINAL_VALUE_OPTIONS);
    const preds = test.map((p) => predictLogMcap(p, snapshot.as_of, refit));
    const actuals = test.map((p) => p.mcap_usd!);
    const sc = scorePredictions(preds, actuals);
    const refitBoard = buildBoard(snapshot, refit, odds);
    const top10 = refitBoard.slice(0, 10).map((r) => r.slug);
    folds.push({ category: cat, held_out: test.length, train: train.length, anchor: refit.anchor, slope: refit.slope, curve: refit.curve, median_abs_log_error: sc.median, within_two_x: sc.within2, spearman: test.length >= 2 ? sc.spearman : null, top10_overlap: top10.filter((s) => boardTop10.includes(s)).length });
  }
  const slopes = folds.map((f) => f.slope);
  const curves = folds.map((f) => f.curve);
  const overlaps = folds.map((f) => f.top10_overlap).sort((a, b) => a - b);
  return {
    folds,
    categories_tested: folds.length,
    slope_min: round4(Math.min(...slopes)),
    slope_max: round4(Math.max(...slopes)),
    curve_min: round4(Math.min(...curves)),
    curve_max: round4(Math.max(...curves)),
    all_slopes_same_sign: slopes.every((s) => Math.sign(s) === Math.sign(fit.slope)),
    median_top10_overlap: median(overlaps),
    min_top10_overlap: overlaps[0] ?? 0,
    median_fold_error: round4(median(folds.map((f) => f.median_abs_log_error))),
  };
}

/** The slope-sensitivity table: the same five-fold check under each loss. */
export function sensitivityCheck(comparables: SnapshotProtocol[], asOf: string): SensitivityReport {
  const variants: { variant: string; huberC: number | null }[] = [
    { variant: 'Huber c = 1.0', huberC: 1.0 },
    { variant: 'Huber c = 1.345 (final)', huberC: 1.345 },
    { variant: 'Huber c = 2.0', huberC: 2.0 },
    { variant: 'plain OLS', huberC: null },
  ];
  const folds = splitAFolds(comparables);
  const rows: SensitivityRow[] = variants.map((v) => {
    const opts: ValueFitOptions = { ...FINAL_VALUE_OPTIONS, huberC: v.huberC };
    const preds: number[] = [];
    const actuals: number[] = [];
    for (let fi = 0; fi < OOS_FOLDS; fi++) {
      const test = folds[fi]!;
      const train = folds.flatMap((f, j) => (j === fi ? [] : f));
      const fit = fitValueModel(train, asOf, opts);
      for (const p of test) {
        preds.push(predictLogMcap(p, asOf, fit));
        actuals.push(p.mcap_usd!);
      }
    }
    // The anchor/slope/curve shown are the full-data fit's, not one fold's:
    // the five-fold check measures the miss, the full fit is the model.
    const full = fitValueModel(comparables, asOf, opts);
    const sc = scorePredictions(preds, actuals);
    return { variant: v.variant, huber_c: v.huberC, anchor: full.anchor, slope: full.slope, curve: full.curve, median_abs_log_error: sc.median, within_two_x: sc.within2, total: actuals.length, spearman: sc.spearman };
  });
  return { rows };
}

/** --- Farm plans: concrete steps, costed and netted. --- */

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** A dollar figure with two decimals and a sign, for the net step. */
function money2(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

/** How much capital one farm position needs: 0.02% of the protocol's TVL, $50 to $250. */
function capitalFor(p: SnapshotProtocol): number {
  return Math.min(PLAN_CAPITAL_MAX, Math.max(PLAN_CAPITAL_MIN, Math.round(p.tvl_usd * PLAN_SHARE)));
}

/** How long to hold, from the protocol's age: younger protocols get a longer window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Gas for the plan: setup plus $2 a week of qualifying actions. */
function gasFor(capital: number, holdDays: number): number {
  const setup = capital >= 150 ? 8 : 4;
  return setup + Math.ceil(holdDays / 7) * 2;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** Net one farm plan: the position's pro-rata share of the community allocation
 * (7% of the implied value, shared in proportion to capital over TVL) against
 * its own gas. The verdict is honest: most plans lose money at plan capital. */
export function netFarm(p: SnapshotProtocol, implied: number, age: number | null): NetFarm {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(capital, hold);
  const gross = (implied * COMMUNITY_SHARE * capital) / p.tvl_usd;
  const net = gross - gas;
  const perDollar = (implied * COMMUNITY_SHARE) / p.tvl_usd;
  const breakeven = perDollar > 0 ? gas / perDollar : Number.POSITIVE_INFINITY;
  // The verdict is about the capital that pays for the gas, not the plan's own
  // net: at $50-$250 of plan capital no plan nets positive (the pro-rata share
  // of a 7% community allocation is smaller than the gas), so the honest
  // question is how much capital the position needs before it pays for itself.
  // Farm: $1,000 or less. Marginal: $1,000-$5,000. Skip: more than $5,000.
  const verdict: NetFarm['verdict'] =
    breakeven <= 1000 ? 'Farm' : breakeven <= 5000 ? 'Marginal' : 'Skip';
  return {
    capital_usd: capital,
    gas_usd: gas,
    gross_usd: round2(gross),
    net_usd: round2(net),
    breakeven_usd: Number.isFinite(breakeven) ? Math.round(breakeven) : 0,
    verdict,
  };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** A protocol's farm plan: six steps plus a seventh that nets it. */
export function farmSteps(p: SnapshotProtocol, age: number | null, net: NetFarm): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    { text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`, cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: action, cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    { text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`, cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`, cost: 'nothing but the log', time: '5 minutes' },
    { text: `Net this plan at $${capital} of capital: about ${money2(net.gross_usd)} of community allocation against $${net.gas_usd} of gas, a net of ${money2(net.net_usd)}. The position pays for its own gas only at about $${net.breakeven_usd.toLocaleString('en-US')} of capital. Verdict: ${net.verdict}.`, cost: 'the gas above is the whole bill', time: 'the hold above' },
  ];
}

/** --- The board. --- */

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, fit: ModelFit, odds: OddsFit): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const v = launchLogRatioFinal(p, fit);
    const launch = Math.max(1, Math.round(p.tvl_usd * Math.exp(v.logRatio)));
    const od = tokenOdds(p, snapshot.as_of, odds);
    const implied = Math.max(1, Math.round(launch * od));
    const low = Math.max(1, Math.round(p.tvl_usd * Math.exp(v.logRatio + fit.residual_q25) * od));
    const high = Math.max(1, Math.round(p.tvl_usd * Math.exp(v.logRatio + fit.residual_q75) * od));
    const net = netFarm(p, implied, age);
    return { p, age, v, launch, od, implied, low, high, net };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // Ties on the rounded implied value must still be strictly non-increasing: they are,
  // because the sort is by the same integer. Guard the gate's order with a final pass.
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
    age_days: s.age,
    implied_value_usd: s.implied,
    launch_value_usd: s.launch,
    token_odds: s.od,
    range_low_usd: s.low,
    range_high_usd: s.high,
    model: { log_tvl: s.v.logTvl, log_ratio: round4(s.v.logRatio), category_adjustment: s.v.catAdj, implied_multiple: s.v.multiple, age_days: s.age },
    net_farm: s.net,
    farm_steps: farmSteps(s.p, s.age, s.net).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

/** One category's board summary. */
export function categorySummaries(board: BoardRow[]): CategorySummary[] {
  const byCat = new Map<string, BoardRow[]>();
  for (const r of board) {
    const key = r.category ?? 'Other';
    const list = byCat.get(key) ?? [];
    list.push(r);
    byCat.set(key, list);
  }
  return [...byCat.entries()]
    .map(([category, rows]) => {
      const top = [...rows].sort((a, b) => b.implied_value_usd - a.implied_value_usd)[0]!;
      return {
        category,
        count: rows.length,
        median_multiple: round4(median(rows.map((r) => r.model.implied_multiple))),
        median_implied_usd: Math.round(median(rows.map((r) => r.implied_value_usd))),
        top_slug: top.slug,
        top_name: top.name,
        top_implied_usd: top.implied_value_usd,
        median_breakeven_usd: Math.round(median(rows.map((r) => r.net_farm.breakeven_usd))),
      };
    })
    .sort((a, b) => b.count - a.count || (a.category < b.category ? -1 : 1));
}

/** One chain's board summary. */
export function chainSummaries(board: BoardRow[]): ChainSummary[] {
  const byChain = new Map<string, BoardRow[]>();
  for (const r of board) {
    for (const chain of r.chains) {
      const list = byChain.get(chain) ?? [];
      list.push(r);
      byChain.set(chain, list);
    }
  }
  return [...byChain.entries()]
    .map(([chain, rows]) => {
      const top = [...rows].sort((a, b) => b.implied_value_usd - a.implied_value_usd)[0]!;
      return {
        chain,
        count: rows.length,
        median_multiple: round4(median(rows.map((r) => r.model.implied_multiple))),
        median_tvl_usd: Math.round(median(rows.map((r) => r.tvl_usd))),
        top_slug: top.slug,
        top_name: top.name,
        top_implied_usd: top.implied_value_usd,
      };
    })
    .sort((a, b) => b.count - a.count || (a.chain < b.chain ? -1 : 1));
}

/** A board row's compact form for data.js. */
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
    launch_value_usd: row.launch_value_usd,
    token_odds: row.token_odds,
    range_low_usd: row.range_low_usd,
    range_high_usd: row.range_high_usd,
    net_usd: row.net_farm.net_usd,
    breakeven_usd: row.net_farm.breakeven_usd,
    verdict: row.net_farm.verdict,
    net_farm: row.net_farm,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const comparables = snapshot.protocols.filter(isComparable);
  const fit = fitValueModel(comparables, snapshot.as_of, FINAL_VALUE_OPTIONS);
  const odds = fitOddsModel(snapshot.protocols, snapshot.as_of, FINAL_ODDS_OPTIONS);
  const board = buildBoard(snapshot, fit, odds);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug) && r.tvl_usd < snapshot.floor_usd).length;
  const offlist = board.filter((r) => !snapshot.watchlist.includes(r.slug) && r.tvl_usd >= snapshot.floor_usd).length;
  const breakevens = board.map((r) => r.net_farm.breakeven_usd).sort((a, b) => a - b);
  const tokenRecorded = snapshot.protocols.filter(hasToken).length;
  const excluded = snapshot.protocols.filter((p) => isPreToken(p) && !isRankable(p)).length;
  const oos = outOfSampleReport(comparables, snapshot.as_of);
  const loco = locoCheck(comparables, snapshot, fit, odds, board.slice(0, 10).map((r) => r.slug));
  const sensitivity = sensitivityCheck(comparables, snapshot.as_of);
  const valueTerms = valueTermTable(comparables, snapshot.as_of);
  const oddsTerms = oddsTermTable(snapshot.protocols, snapshot.as_of);
  const oddsReport: OddsReport = {
    base_brier_a: oddsTerms.base_a,
    base_brier_b: oddsTerms.base_b,
    brier_a: round4(oddsTerms.rows.find((r) => r.term.startsWith('+ TVL'))?.split_a_brier ?? NaN),
    brier_b: round4(oddsTerms.rows.find((r) => r.term.startsWith('+ TVL'))?.split_b_brier ?? NaN),
    total: snapshot.protocols.length,
  };
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    community_share: COMMUNITY_SHARE,
    fit,
    odds_fit: odds,
    odds_report: oddsReport,
    value_terms: valueTerms,
    odds_terms: oddsTerms,
    oos,
    loco,
    sensitivity,
    category_summary: categorySummaries(board),
    chain_summary: chainSummaries(board),
    accounting: { ranked: board.length, token_recorded: tokenRecorded, token_trades_comp: comparables.length, token_no_cap: tokenRecorded - comparables.length, excluded, total: snapshot.protocols.length },
    watchlist_size: snapshot.watchlist.length,
    watchlist: [...snapshot.watchlist],
    board_size: board.length,
    early_size: early,
    offlist_size: offlist,
    live_size: live.length,
    rows_farm: board.filter((r) => r.net_farm.verdict === 'Farm').length,
    rows_marginal: board.filter((r) => r.net_farm.verdict === 'Marginal').length,
    rows_skip: board.filter((r) => r.net_farm.verdict === 'Skip').length,
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
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null. */
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
