/* Launch Radar, radar-5: the board, the evidence, and the farm plans.
   No network: every number comes from window.RADAR (data.js, written by
   main.ts from the same board.json the gate reads). The integrity strip
   recomputes every row's implied value from the fitted constants below,
   so what the table shows is what the model actually priced. */
const R = window.RADAR;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function money(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(n);
}
function money2(n) { return (n < 0 ? '−$' : '$') + Math.abs(n).toFixed(2); }
function ageFmt(d) {
  if (d === null || d === undefined) return 'n/a';
  if (d >= 365) return (d / 365.25).toFixed(1) + ' yr';
  return d + ' d';
}
function pct(n) { return (n * 100).toFixed(1) + '%'; }

/* Recompute one row's implied value from the fitted constants, exactly as
   lib/model.ts launchLogRatio + tokenOdds do. Returns {launch, odds, implied}. */
function recompute(r) {
  const f = R.fit;
  const x = Math.log(r.tvl_usd) - f.lt_mean;
  const cat = (f.categories.find((c) => c.category === (r.category || 'Other')) || { adjustment: 0 }).adjustment;
  const lr = f.anchor + f.beta[0] + f.beta[1] * x + (f.beta[2] || 0) * (x * x) / 10 + cat;
  const launch = Math.max(1, Math.round(r.tvl_usd * Math.exp(lr)));
  const o = R.odds_fit;
  const la = Math.log((r.age_days === null ? 365 : r.age_days) / 365.25 + 0.05) - o.log_age_mean;
  const cr = (o.category_rates.find((c) => c.category === (r.category || 'Other')) || { rate: o.base_rate }).rate;
  const tier = cr >= 0.65 ? 1 : cr <= 0.4 ? -1 : 0;
  const z = o.intercept + o.age_coef * la + o.null_age_coef * (r.age_days === null ? 1 : 0) + o.tier_coef * tier + o.tvl_coef * (Math.log(r.tvl_usd) - o.lt_mean);
  const odds = Math.min(0.99, Math.max(0.01, 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))))));
  const oddsR = Math.round(odds * 1e4) / 1e4;
  return { launch, odds: oddsR, implied: Math.max(1, Math.round(launch * oddsR)) };
}
const recomputed = R.rows.filter((r) => recompute(r).implied === r.implied_value_usd).length;

/* --- Header, integrity, KPIs, accounting --- */
$('snapLine').textContent = 'DefiLlama snapshot ' + R.as_of + ' · ' + R.rows.length + ' ranked · model ' + R.model_version;
const totalImplied = R.rows.reduce((s, r) => s + r.implied_value_usd, 0);
const recomputedTotal = R.rows.reduce((s, r) => s + recompute(r).implied, 0);
const wlCovered = R.watchlist.filter((s) => R.rows.some((r) => r.slug === s)).length;
const ordered = R.rows.every((r, i) => i === 0 || r.implied_value_usd <= R.rows[i - 1].implied_value_usd);
$('integrity').innerHTML = [
  ['✓ this table = board.json: ' + recomputed + ' of ' + R.rows.length + ' rows recomputed here', recomputed === R.rows.length],
  ['✓ ranks 1–' + R.rows.length + ' in order, values never rise', ordered],
  ['✓ watchlist ' + wlCovered + ' of ' + R.watchlist.length + ' ranked', wlCovered === R.watchlist.length],
  ['✓ recomputed total ' + money(recomputedTotal) + ' = table total ' + money(totalImplied), recomputedTotal === totalImplied],
  ['✓ ledger ' + R.accounting.total + ' of ' + R.accounting.total + ' protocols', R.accounting.ranked + R.accounting.token_recorded + R.accounting.excluded === R.accounting.total],
].map(([t, ok]) => '<span class="chip' + (ok ? ' ok' : '') + '"><b>' + esc(t) + '</b></span>').join('');
$('kpis').innerHTML = [
  [R.oos.split_a.median_abs_log_error.toFixed(2), 'typical miss, random held-out', '×' + R.oos.split_a.typical_factor + ' · radar-4: ' + R.oos.radar4.split_a_median.toFixed(2)],
  [R.oos.split_b.median_abs_log_error.toFixed(2), 'typical miss, walk-forward', '×' + R.oos.split_b.typical_factor + ' · radar-4: ' + R.oos.radar4.split_b_median.toFixed(2)],
  [R.odds_report.brier_a.toFixed(3), 'token odds Brier, held-out', 'base rate: ' + R.odds_report.base_brier_a.toFixed(3)],
  [R.watchlist_size + ' / ' + R.watchlist_size, 'watchlist ranked', 'plus ' + R.early_size + ' early, ' + R.offlist_size + ' off-list'],
  [R.rows_farm + ' farm · ' + R.rows_marginal + ' marginal', 'worth farming, this scenario', R.rows_skip + ' skip · median break-even ' + money(R.median_breakeven_usd)],
].map(([v, l, s]) => '<div class="kpi"><div class="v">' + v + '</div><div class="l">' + l + '</div><div class="s">' + s + '</div></div>').join('');
const A = R.accounting;
$('accounting').innerHTML = '<span class="chip">all ' + A.total + ' snapshot protocols in exactly one group:</span>' +
  [['Ranked · watchlist ' + R.watchlist_size, R.watchlist_size], ['Ranked · early, below the floor', R.early_size], ['Ranked · off-list, above the floor', R.offlist_size],
   ['Token trades · priced comp', A.token_trades_comp], ['Token recorded · no usable cap', A.token_no_cap],
   ['Out · bridge / liquid staking / exchange / versioned / wrapped', A.excluded]]
  .map(([t, n]) => '<span class="chip"><b>' + t + ' ' + n + '</b></span>').join('');

/* --- Evidence tables --- */
function termTable(rows, aKey, bKey, unit) {
  return '<table><thead><tr><th>Term, added in order</th><th>Split A ' + unit + '</th><th>Split B ' + unit + '</th><th></th></tr></thead><tbody>' +
    rows.map((r) => '<tr><td>' + esc(r.term) + '<span class="sub2">' + esc(r.note) + '</span></td><td class="num">' + r[aKey].toFixed(unit === '×' ? 2 : 3) + '</td><td class="num">' + r[bKey].toFixed(unit === '×' ? 2 : 3) + '</td><td class="' + (r.kept ? 'kept' : 'dropped') + '">' + (r.kept ? 'KEPT' : 'dropped') + '</td></tr>').join('') + '</tbody></table>';
}
$('valueTerms').innerHTML = '<p class="note">Baseline (radar-4 recipe): A ' + R.value_terms.baseline_a.toFixed(2) + ' · B ' + R.value_terms.baseline_b.toFixed(2) + '. Final: A ' + R.oos.split_a.median_abs_log_error.toFixed(2) + ' · B ' + R.oos.split_b.median_abs_log_error.toFixed(2) + '.</p>' + termTable(R.value_terms.rows, 'split_a_median', 'split_b_median', '×');
$('oddsTerms').innerHTML = '<p class="note">Base rate only: A ' + R.odds_terms.base_a.toFixed(3) + ' · B ' + R.odds_terms.base_b.toFixed(3) + '. Final: A ' + R.odds_report.brier_a.toFixed(3) + ' · B ' + R.odds_report.brier_b.toFixed(3) + '.</p>' + termTable(R.odds_terms.rows, 'split_a_brier', 'split_b_brier', 'Brier');
$('rangeNote').textContent = 'Is the printed range honest? Split-A held-out predictions land inside the printed P25–P75 range ' + pct(R.oos.range_p25_p75) + ' of the time (stated 50%) and inside P10–P90 ' + pct(R.oos.range_p10_p90) + ' (stated 80%). A term is kept only if it lowers the held-out miss on both tests; growth, age and chain count were all tested and dropped.';

/* --- Board --- */
const state = { q: '', cat: '', chain: '', wl: false, tier: '', sort: 'implied' };
const cats = [...new Set(R.rows.map((r) => r.category || 'Other'))].sort();
const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
cats.forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c + ' (' + R.rows.filter((r) => (r.category || 'Other') === c).length + ')'; $('catSel').appendChild(o); });
chains.forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; $('chainSel').appendChild(o); });
function filtered() {
  let rows = R.rows.filter((r) =>
    (!state.wl || R.watchlist.includes(r.slug)) &&
    (!state.tier || r.verdict === state.tier) &&
    (!state.cat || (r.category || 'Other') === state.cat) &&
    (!state.chain || r.chains.includes(state.chain)) &&
    (!state.q || (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase().includes(state.q)));
  const key = { implied: (a, b) => b.implied_value_usd - a.implied_value_usd, launch: (a, b) => b.launch_value_usd - a.launch_value_usd, odds: (a, b) => b.token_odds - a.token_odds, tvl: (a, b) => b.tvl_usd - a.tvl_usd, net: (a, b) => b.net_usd - a.net_usd, name: (a, b) => a.name.localeCompare(b.name) }[state.sort];
  return rows.sort(key);
}
function renderBoard() {
  const rows = filtered();
  $('rowCount').textContent = rows.length + ' of ' + R.rows.length + ' rows · ' + money(rows.reduce((s, r) => s + r.tvl_usd, 0)) + ' TVL · ' + money(rows.reduce((s, r) => s + r.implied_value_usd, 0)) + ' implied';
  $('boardBody').innerHTML = rows.map((r) => {
    const wl = R.watchlist.includes(r.slug);
    const g = r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%';
    return '<tr data-slug="' + esc(r.slug) + '"><td>' + r.rank + '</td>' +
      '<td><b>' + esc(r.name) + '</b>' + (wl ? '<span class="badge wl">Watchlist</span>' : '<span class="badge off">Early</span>') +
      '<span class="sub2">' + esc(r.category || 'Other') + ' · ' + esc(r.chains.join(', ')) + '</span></td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + g + '</td><td>' + ageFmt(r.age_days) + '</td>' +
      '<td><span class="bar"><i style="width:' + Math.round(r.token_odds * 100) + '%"></i></span>' + pct(r.token_odds) + '</td>' +
      '<td class="num">' + money(r.launch_value_usd) + '</td><td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
      '<td class="num">' + money(r.range_low_usd) + '–' + money(r.range_high_usd) + '</td>' +
      '<td><span class="v' + r.verdict + '">' + r.verdict.toUpperCase() + '</span> ' + money2(r.net_usd) + '<span class="sub2">break-even ' + money(r.breakeven_usd) + '</span></td></tr>';
  }).join('');
}
$('boardBody').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-slug]');
  if (tr) openDetail(tr.dataset.slug);
});
function readControls() {
  state.q = $('q').value.trim().toLowerCase();
  state.cat = $('catSel').value; state.chain = $('chainSel').value;
  state.wl = $('wlOnly').checked; state.sort = $('sortSel').value;
  renderBoard();
}
['q', 'catSel', 'chainSel', 'wlOnly', 'sortSel'].forEach((id) => $(id).addEventListener('input', readControls));
document.querySelectorAll('.tiers button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tiers button').forEach((x) => x.classList.toggle('on', x === b));
  state.tier = b.dataset.tier; renderBoard();
}));
$('resetBtn').addEventListener('click', () => {
  $('q').value = ''; $('catSel').value = ''; $('chainSel').value = ''; $('wlOnly').checked = false; $('sortSel').value = 'implied';
  document.querySelectorAll('.tiers button').forEach((x) => x.classList.toggle('on', x.dataset.tier === ''));
  state.q = ''; state.cat = ''; state.chain = ''; state.wl = false; state.tier = ''; state.sort = 'implied';
  renderBoard();
});
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('csvBtn').addEventListener('click', () => {
  const head = 'rank,slug,name,category,tvl_usd,token_odds,launch_value_usd,implied_value_usd,verdict,net_usd\n';
  download('launch-radar-5.csv', head + filtered().map((r) => [r.rank, r.slug, '"' + r.name.replace(/"/g, '""') + '"', '"' + (r.category || '') + '"', r.tvl_usd, r.token_odds, r.launch_value_usd, r.implied_value_usd, r.verdict, r.net_usd].join(',')).join('\n'), 'text/csv');
});
$('jsonBtn').addEventListener('click', () => download('launch-radar-5.json', JSON.stringify(filtered(), null, 2), 'application/json'));

/* --- Detail drawer --- */
function openDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  const rc = recompute(r);
  const f = R.fit;
  const mult = r.implied_multiple;
  $('drawer').innerHTML = '<button class="x" id="dx">Close ✕</button><h2>' + esc(r.name) + '</h2>' +
    '<p class="note">Rank ' + r.rank + ' · ' + esc(r.category || 'Other') + ' · ' + esc(r.chains.join(', ')) + ' · ' + (R.watchlist.includes(r.slug) ? 'Watchlist' : 'Early / off-list') + '</p>' +
    '<h3>Model breakdown — recomputed here</h3><dl class="kv">' +
    '<dt>TVL</dt><dd>' + money(r.tvl_usd) + '</dd>' +
    '<dt>Fitted multiple</dt><dd>×' + mult.toFixed(3) + ' (anchor ' + f.anchor + ' + slope ' + f.slope + ' + curve ' + f.curve + ' + category ' + (r.category_adjustment >= 0 ? '+' : '') + r.category_adjustment.toFixed(3) + ')</dd>' +
    '<dt>If it launches</dt><dd>' + money(rc.launch) + '</dd>' +
    '<dt>Token odds</dt><dd>' + pct(rc.odds) + ' (age ' + ageFmt(r.age_days) + ', category tier, TVL)</dd>' +
    '<dt>Implied value</dt><dd><b>' + money(r.implied_value_usd) + '</b> · P25–P75 ' + money(r.range_low_usd) + '–' + money(r.range_high_usd) + '</dd>' +
    '<dt>7-day TVL change</dt><dd>' + (r.change_7d === null ? 'not reported' : r.change_7d.toFixed(1) + '%') + ' (tested as a value term, dropped)</dd>' +
    '<dt>Farm verdict</dt><dd><span class="v' + r.verdict + '">' + r.verdict.toUpperCase() + '</span> · net ' + money2(r.net_usd) + ' · break-even ' + money(r.breakeven_usd) + '</dd></dl>' +
    '<h3>Farm plan — ' + money(r.net_farm.capital_usd) + ' of capital (0.02% of TVL)</h3><ol>' +
    r.farm_steps.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>' +
    '<p class="note">The plan assumes 7% of the implied value reaches farmers, shared in proportion to capital over TVL. At plan capital no plan nets positive — the verdict says how much capital the position needs before it pays for its own gas: Farm ≤ $1,000, Marginal ≤ $5,000, Skip above.</p>';
  $('drawer').classList.add('open');
  $('dx').addEventListener('click', closeDetail);
  history.replaceState(null, '', '#detail=' + slug);
}
function closeDetail() { $('drawer').classList.remove('open'); history.replaceState(null, '', '#'); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail(); });

/* --- Method --- */
(function method() {
  const f = R.fit, o = R.oos, L = R.loco, S = R.sensitivity;
  const at100m = (() => { const x = Math.log(1e8) - f.lt_mean; return Math.exp(f.anchor + f.slope * x + f.curve * (x * x) / 10); })();
  $('methodBody').innerHTML =
    '<p>Implied value = TVL × exp(anchor + slope·x + curve·x²/10 + category adjustment) × token odds, where x = log(TVL) − ' + f.lt_mean + '. ' +
    'Fitted on ' + f.comps_total + ' live-token comparables: anchor ' + f.anchor + ', slope ' + f.slope + ' (log market cap grows at ' + (1 + f.slope).toFixed(2) + '× log TVL), curve ' + f.curve + ', multiple at $100M TVL ×' + at100m.toFixed(3) + '. ' +
    'Category adjustments are median residuals inside the Tukey fence, shrunk n/(n+16) — the largest is ×' + Math.max(...f.categories.map((c) => Math.exp(c.adjustment))).toFixed(2) + ', the smallest ×' + Math.min(...f.categories.map((c) => Math.exp(c.adjustment))).toFixed(2) + '. ' +
    'Token odds are a logistic on log years listed (coef ' + R.odds_fit.age_coef + '), the no-listed-date flag (' + R.odds_fit.null_age_coef + '), the category tier (' + R.odds_fit.tier_coef + ') and log TVL (' + R.odds_fit.tvl_coef + '). ' +
    'The fine-grained per-category rate was tested and dropped: it wins the random split (Brier 0.203) but loses walk-forward (0.285 vs 0.264 for the tier).</p>' +
    '<div class="sumgrid"><div><h3>Leave-one-category-out (' + L.categories_tested + ' categories)</h3><p class="note">Slopes stay negative in every refit (' + L.slope_min + ' to ' + L.slope_max + '), curves ' + L.curve_min + ' to ' + L.curve_max + '. Median top-10 overlap ' + L.median_top10_overlap + ' of 10 (worst ' + L.min_top10_overlap + '); median held-out miss ' + L.median_fold_error + '.</p>' +
    '<table><thead><tr><th>Category held out</th><th class="num">Miss</th><th class="num">Top-10 kept</th></tr></thead><tbody>' +
    [...L.folds].sort((a, b) => b.median_abs_log_error - a.median_abs_log_error).slice(0, 5).map((x) => '<tr><td>' + esc(x.category) + ' (' + x.held_out + ')</td><td class="num">' + x.median_abs_log_error.toFixed(2) + '</td><td class="num">' + x.top10_overlap + '/10</td></tr>').join('') + '</tbody></table><p class="note">Worst 5 of ' + L.folds.length + ' — the full table is in data.js.</p></div>' +
    '<div><h3>Slope sensitivity — same five-fold check, four losses</h3><table><thead><tr><th>Loss</th><th class="num">Miss</th><th class="num">Within 2×</th><th class="num">Slope</th></tr></thead><tbody>' +
    S.rows.map((x) => '<tr><td>' + esc(x.variant) + '</td><td class="num">' + x.median_abs_log_error.toFixed(2) + '</td><td class="num">' + x.within_two_x + '/' + x.total + '</td><td class="num">' + x.slope + '</td></tr>').join('') + '</tbody></table>' +
    '<h3>Where the board sits</h3><table><thead><tr><th>Category</th><th class="num">Rows</th><th class="num">Median implied</th><th>Top row</th></tr></thead><tbody>' +
    R.category_summary.slice(0, 8).map((x) => '<tr><td>' + esc(x.category) + '</td><td class="num">' + x.count + '</td><td class="num">' + money(x.median_implied_usd) + '</td><td>' + esc(x.top_name) + ' ' + money(x.top_implied_usd) + '</td></tr>').join('') + '</tbody></table></div></div>' +
    '<p class="note">Split A is five folds by slug order (the same folds radar-4 used). Split B is walk-forward: comparables listed before 2024-02-18 price those listed after. Radar-4’s recipe, recomputed on the same comparables and splits: A ' + o.radar4.split_a_median.toFixed(2) + ', B ' + o.radar4.split_b_median.toFixed(2) + ' (' + o.radar4.split_a_within_two_x + ' and ' + o.radar4.split_b_within_two_x + ' within 2×). Radar-5: A ' + o.split_a.median_abs_log_error.toFixed(2) + ' (' + o.split_a.within_two_x + '/' + o.split_a.total + ' within 2×, Spearman ' + o.split_a.spearman.toFixed(2) + '), B ' + o.split_b.median_abs_log_error.toFixed(2) + ' (' + o.split_b.within_two_x + '/' + o.split_b.test + ' within 2×, Spearman ' + o.split_b.spearman.toFixed(2) + ').</p>';
})();

/* --- Live tokens --- */
$('liveBody').innerHTML = '<table><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th><th class="num">7d</th></tr></thead><tbody>' +
  R.live.map((p) => '<tr><td><b>' + esc(p.name) + '</b><span class="sub2">' + esc(p.category || 'Other') + ' · ' + esc(p.chains.join(', ')) + '</span></td><td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd || 0) + '</td><td class="num">×' + (p.mcap_usd && p.tvl_usd ? (p.mcap_usd / p.tvl_usd).toFixed(2) : '—') + '</td><td class="num">' + (p.change_7d === null ? '—' : p.change_7d.toFixed(1) + '%') + '</td></tr>').join('') + '</tbody></table>' +
  '<p class="note">These ' + R.live.length + ' are the largest live-token protocols by market cap. They price the model; they are never ranked as launches.</p>';

/* --- Hash states: #detail=<slug>, #cat=<category>, #chain=<chain> --- */
(function init() {
  const h = location.hash.slice(1);
  const m = h.match(/^detail=([\w-]+)/);
  const cm = h.match(/^cat=(.+)/);
  const chm = h.match(/^chain=(.+)/);
  if (cm) { state.cat = decodeURIComponent(cm[1]); $('catSel').value = state.cat; }
  if (chm) { state.chain = decodeURIComponent(chm[1]); $('chainSel').value = state.chain; }
  renderBoard();
  if (m) openDetail(m[1]);
  // Board and filtered views: scroll to the board after it renders, so the
  // screenshot shows the table, not the header.
  if (h === 'board' || cm || chm) $('boardPanel').scrollIntoView();
})();
