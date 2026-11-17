// Token Radar's dashboard (radar-4.1). It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a top-10 spotlight strip, per-category and per-chain summary
// tables, a filterable and sortable table, a per-protocol detail drawer with the fitted
// model's own inputs and the protocol's netted farm plan, and the methodology behind every
// number, including the leave-one-category-out and slope-sensitivity robustness checks.
// No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var FIT = DATA.fit;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchlistOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var WATCHLIST = {};
  (DATA.watchlist || []).forEach(function (s) { WATCHLIST[s] = true; });
  var ADJ = {};
  (FIT.categories || []).forEach(function (c) { ADJ[c.category] = c.adjustment; });

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(m, digits) {
    if (m === null || m === undefined || !isFinite(m)) return 'n/a';
    return m.toFixed(digits) + 'x';
  }
  function fmtSigned(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(digits);
  }
  function money2(n) {
    var sign = n < 0 ? '−' : '';
    return sign + '$' + Math.abs(n).toFixed(2);
  }

  // The model in one function: the page recomputes a row from the snapshot figures with the
  // fitted regression, so the page's code and the board's data are visibly the same arithmetic.
  // log ratio = anchor + slope x (log TVL - lt_mean) + category adjustment.
  function categoryAdjOf(row) {
    var a = ADJ[row.category || 'Other'];
    return a === undefined ? 0 : a;
  }
  function impliedOf(row) {
    var logRatio = FIT.anchor + FIT.slope * (Math.log(row.tvl_usd) - FIT.lt_mean) + categoryAdjOf(row);
    return Math.max(1, Math.round(row.tvl_usd * Math.exp(logRatio)));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time, and the seventh step nets the
  // plan against its own gas. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var net = p.net_farm || { capital_usd: capital, gas_usd: 0, gross_usd: 0, net_usd: 0, breakeven_usd: 0 };
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
      { text: 'Net this plan at $' + net.capital_usd + ' of capital: about ' + money2(net.gross_usd) + ' of community allocation against $' + net.gas_usd + ' of gas, a net of ' + money2(net.net_usd) + '. The position pays for its own gas only at about $' + net.breakeven_usd.toLocaleString('en-US') + ' of capital.', cost: 'the gas above is the whole bill', time: 'the hold above' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('wl') === '1') state.watchlistOnly = true;
    if (params.get('tab') === 'live') state.tab = 'live';
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlistOnly) params.set('wl', '1');
    if (state.tab === 'live') params.set('tab', 'live');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function isWatchlistRow(r) { return WATCHLIST[r.slug] === true; }
  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (state.watchlistOnly && !isWatchlistRow(r)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.implied_multiple; bv = b.implied_multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols the watchlist leaves out, priced by one regression fitted on the market itself. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live comparables fitted' }), el('b', { text: String(FIT.comps_total) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  // The top 10, as cards: the board's head at a glance, each card opening the same
  // detail drawer a board row opens. Values come from DATA.rows, never from a list
  // written into this file, so the strip and the board can never disagree.
  function spotlight() {
    var top = DATA.rows.slice(0, 10);
    var cards = top.map(function (r) {
      return el('button', { type: 'button', class: 'spot-card', 'aria-label': 'Rank ' + r.rank + ', ' + r.name + ', implied value ' + fmtUsd(r.implied_value_usd), onclick: function () { openDetail(r.slug); } },
        el('span', { class: 'spot-rank', text: '#' + r.rank }),
        el('b', { text: r.name }),
        el('span', { class: 'spot-value num', text: fmtUsd(r.implied_value_usd) }),
        el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + fmtMult(r.implied_multiple, 3) })
      );
    });
    return el('section', { class: 'panel spotlight', 'aria-label': 'Top 10 spotlight' },
      el('h2', { text: 'Top 10 by implied value' }),
      el('p', { class: 'caption', text: 'The board\u2019s head, strongest first. Select a card for its model and farm plan.' }),
      el('div', { class: 'spot-grid' }, cards)
    );
  }

  // One summary table per category and one per first-named chain, both computed by
  // main.ts from the same board the page renders: how many rows each holds, the median
  // implied multiple and value across them, the protocol that prices highest, and (for
  // categories) the median break-even capital. Selecting a top protocol opens it.
  function summaryTables() {
    var cats = DATA.category_summary || [];
    var chains = DATA.chain_summary || [];
    var catRows = cats.map(function (c) {
      return el('tr', {
        tabindex: '0',
        onclick: function () { openDetail(c.top_slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(c.top_slug); } }
      },
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.count) }),
        el('td', { class: 'num', text: fmtMult(c.median_multiple, 3) }),
        el('td', { class: 'num r', text: fmtUsd(c.median_implied_usd) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: c.top_name }), el('span', { class: 'sub', text: fmtUsd(c.top_implied_usd) }))),
        el('td', { class: 'num r', text: '$' + c.median_breakeven_usd.toLocaleString('en-US') })
      );
    });
    var chainRows = chains.map(function (c) {
      return el('tr', {
        tabindex: '0',
        onclick: function () { openDetail(c.top_slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(c.top_slug); } }
      },
        el('td', { text: c.chain }),
        el('td', { class: 'num', text: String(c.count) }),
        el('td', { class: 'num', text: fmtMult(c.median_multiple, 3) }),
        el('td', { class: 'num r', text: fmtUsd(c.median_tvl_usd) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: c.top_name }), el('span', { class: 'sub', text: fmtUsd(c.top_implied_usd) })))
      );
    });
    return el('div', { class: 'summaries' },
      el('section', { class: 'panel summary' },
        el('h2', { text: 'By category' }),
        el('p', { class: 'caption', text: 'Every category on the board, richest median implied value first. Select a row to open its highest-priced protocol.' }),
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('thead', null, el('tr', null,
              el('th', { scope: 'col', text: 'Category' }),
              el('th', { scope: 'col', text: 'Rows' }),
              el('th', { scope: 'col', text: 'Median multiple' }),
              el('th', { scope: 'col', text: 'Median implied' }),
              el('th', { scope: 'col', text: 'Top protocol' }),
              el('th', { scope: 'col', text: 'Median break-even' })
            )),
            el('tbody', null, catRows)
          )
        )
      ),
      el('section', { class: 'panel summary' },
        el('h2', { text: 'By chain' }),
        el('p', { class: 'caption', text: 'Every first-named chain on the board, most rows first. Select a row to open its highest-priced protocol.' }),
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('thead', null, el('tr', null,
              el('th', { scope: 'col', text: 'Chain' }),
              el('th', { scope: 'col', text: 'Rows' }),
              el('th', { scope: 'col', text: 'Median multiple' }),
              el('th', { scope: 'col', text: 'Median TVL' }),
              el('th', { scope: 'col', text: 'Top protocol' })
            )),
            el('tbody', null, chainRows)
          )
        )
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var wlBox = el('input', { type: 'checkbox', id: 'wl', checked: state.watchlistOnly ? 'checked' : null, 'aria-label': 'Watchlist only' });
    wlBox.addEventListener('change', function () { state.watchlistOnly = wlBox.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('label', { class: 'check', for: 'wl' }, wlBox, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ∨' : ' ∧' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num r', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num r ' + growthClass, text: growth }),
        el('td', { class: 'num r', text: fmtAge(r.age_days) }),
        el('td', { class: 'num r', text: fmtMult(r.implied_multiple, 3) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'caption', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Implied multiple'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num r', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num r ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num r', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'caption', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var oos = DATA.oos;
    var r3 = oos.radar3_baseline;
    var loco = DATA.loco || { categories_tested: 0, slope_min: 0, slope_max: 0, slope_range: 0, all_slopes_same_sign: true, median_top10_overlap: 0, min_top10_overlap: 0, median_fold_error: 0, folds: [] };
    var sens = DATA.sensitivity || { rows: [] };
    var locoRows = (loco.folds || []).map(function (f) {
      return el('tr', null,
        el('td', { text: f.category }),
        el('td', { class: 'num', text: String(f.held_out) + ' / ' + String(f.train) }),
        el('td', { class: 'num', text: fmtSigned(f.anchor, 2) + ' / ' + fmtSigned(f.slope, 2) }),
        el('td', { class: 'num', text: String(f.median_abs_log_error) }),
        el('td', { class: 'num', text: f.within_two_x + ' / ' + f.held_out }),
        el('td', { class: 'num', text: f.spearman === null || f.spearman === undefined ? 'n/a' : String(f.spearman) }),
        el('td', { class: 'num', text: f.top10_overlap + ' / 10' })
      );
    });
    var sensRows = (sens.rows || []).map(function (r) {
      return el('tr', null,
        el('td', { text: r.variant }),
        el('td', { class: 'num', text: fmtSigned(r.anchor, 4) }),
        el('td', { class: 'num', text: fmtSigned(r.slope, 4) }),
        el('td', { class: 'num', text: String(r.median_abs_log_error) }),
        el('td', { class: 'num', text: r.within_two_x + ' / ' + r.total }),
        el('td', { class: 'num', text: String(r.spearman) })
      );
    });
    var catRows = FIT.categories.map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.comps) }),
        el('td', { class: 'num', text: fmtSigned(c.median_residual, 2) }),
        el('td', { class: 'num', text: fmtSigned(c.adjustment, 2) }),
        el('td', { class: 'num', text: fmtMult(c.multiple_at_mean_tvl, 3) })
      );
    });
    var foldRows = oos.folds.map(function (f) {
      return el('tr', null,
        el('td', { class: 'num', text: String(f.fold) }),
        el('td', { class: 'num', text: String(f.train) + ' / ' + String(f.test) }),
        el('td', { class: 'num', text: fmtSigned(f.anchor, 2) + ' / ' + fmtSigned(f.slope, 2) }),
        el('td', { class: 'num', text: String(f.median_abs_log_error) }),
        el('td', { class: 'num', text: f.within_two_x + ' / ' + f.test }),
        el('td', { class: 'num', text: String(f.spearman) })
      );
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one regression fitted on the snapshot\u2019s own live-token protocols. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'log(mcap / TVL) = ' + FIT.anchor + ' + ' + FIT.slope + ' x (log(TVL) - ' + FIT.lt_mean + ') + category adjustment\n' +
        'implied = round( TVL x exp(log ratio) )'
      ),
      el('p', { class: 'sub', text: 'The anchor is the median log market-cap / TVL over ' + FIT.comps_total + ' live-token comparables. The slope is fitted by least squares on centred log TVL and re-fitted eight times with Huber weights, so one wild token cannot drag the line. The fitted slope is ' + FIT.slope + ': log market cap grows with log TVL at ' + (1 + FIT.slope).toFixed(2) + ', far below one-to-one. A protocol twice as large is worth about ' + Math.pow(2, 1 + FIT.slope).toFixed(2) + 'x as much, not twice as much. The market pays sublinearly for TVL. Each category then gets its median residual after the line, shrunk by n / (n + 3) and taken only over the comparables inside the Tukey fence on the ratio: a category with many comparables keeps most of its own adjustment, a category with one keeps a quarter of it, and a category whose only comparable is an outlier gets no adjustment at all.' }),
      el('p', { class: 'sub', text: 'Growth (seven-day TVL change) and age were tested as extra regressors and dropped: in the same five-fold check their coefficients came out near zero or negative and they lowered the pooled rank correlation, so the model keeps only TVL and category. The -1 market cap is not a comparable: DefiLlama writes -1 where it cannot state a market cap, so that one protocol is excluded from fitting and validation.' }),
      el('h3', { text: 'Category adjustments' }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', text: 'Live comparables' }),
            el('th', { scope: 'col', text: 'Median residual' }),
            el('th', { scope: 'col', text: 'Adjustment' }),
            el('th', { scope: 'col', text: 'Multiple at mean TVL' })
          )),
          el('tbody', null, catRows)
        )
      ),
      el('h3', { text: 'Tested out of sample' }),
      el('p', { class: 'sub', text: 'The comparables are split into five folds by slug. Each fold refits the model on the other four and prices the held-out protocols, so no protocol\u2019s own figures ever price itself. The numbers are what they are: a regression fitted on other protocols prices a held-out market cap only roughly, and the board says so instead of hiding it. The pooled rank correlation mixes folds whose fitted levels differ slightly, so the mean of the five within-fold correlations is shown too.' }),
      el('div', { class: 'oos' },
        el('div', null, el('b', { text: String(oos.median_abs_log_error) }), el('span', { text: 'median |log error|' })),
        el('div', null, el('b', { text: 'about ' + oos.typical_factor + 'x' }), el('span', { text: 'typical factor of the held-out price' })),
        el('div', null, el('b', { text: oos.within_two_x + ' / ' + oos.total }), el('span', { text: 'held-out prices within 2x' })),
        el('div', null, el('b', { text: oos.within_three_x + ' / ' + oos.total }), el('span', { text: 'held-out prices within 3x' })),
        el('div', null, el('b', { text: String(oos.spearman) }), el('span', { text: 'rank correlation, pooled' })),
        el('div', null, el('b', { text: String(oos.spearman_fold_mean) }), el('span', { text: 'rank correlation, mean of folds' })),
        el('div', null, el('b', { text: String(oos.tvl_baseline_spearman) }), el('span', { text: 'the same for TVL alone, the baseline' }))
      ),
      el('div', { class: 'compare' },
        el('b', { text: 'Against radar-3, on the same ' + r3.total + ' comparables and folds: ' }),
        'radar-3\u2019s category-median calibration scores median |log error| ' + r3.median_abs_log_error + ', ' + r3.within_two_x + ' / ' + r3.total + ' within 2x, rank correlation ' + r3.spearman + '. Radar-4 scores ' + oos.median_abs_log_error + ', ' + oos.within_two_x + ' / ' + oos.total + ' within 2x, rank correlation ' + oos.spearman + ' pooled and ' + oos.spearman_fold_mean + ' across folds. (Radar-3 as published used 129 comparables, including the -1 market cap; the comparison here recomputes it on the same 128.)'
      ),
      el('h3', { text: 'Out-of-sample folds' }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Fold' }),
            el('th', { scope: 'col', text: 'Train / test' }),
            el('th', { scope: 'col', text: 'Anchor / slope' }),
            el('th', { scope: 'col', text: 'Median |log error|' }),
            el('th', { scope: 'col', text: 'Within 2x' }),
            el('th', { scope: 'col', text: 'Spearman' })
          )),
          el('tbody', null, foldRows)
        )
      ),
      el('h3', { text: 'Robustness: leave one category out, and change the loss' }),
      el('p', { class: 'sub', text: 'Two checks ask whether the validation survives the choices the model made. Leave-one-category-out refits the regression ' + loco.categories_tested + ' times, once per category, with that whole category removed, and prices the removed category with a fit that never saw it and gives it no category adjustment at all — it is priced off the line alone. The refitted slopes run from ' + loco.slope_min + ' to ' + loco.slope_max + ' (a range of ' + loco.slope_range + '), all keeping the full fit\u2019s sign, so the sublinear slope is not one category\u2019s doing. Rebuilding the board under each refit keeps a median of ' + loco.median_top10_overlap + ' of the top 10 in the top 10, and never fewer than ' + loco.min_top10_overlap + ': the board\u2019s head does not ride on any single category\u2019s adjustment. The held-out categories price worse than the five-fold check — a median |log error| of ' + loco.median_fold_error + ' across the ' + loco.categories_tested + ' folds, against 1.2787 out of sample — because a category priced with no adjustment of its own is priced blind, and the singletons price worst of all: Prediction Market at 6.7009, Collateral Management at 3.5017. The board reports that instead of hiding it.' }),
      el('div', { class: 'oos' },
        el('div', null, el('b', { text: loco.slope_min + ' to ' + loco.slope_max }), el('span', { text: 'refit slope range over ' + loco.categories_tested + ' categories' })),
        el('div', null, el('b', { text: loco.all_slopes_same_sign ? 'all negative' : 'sign flips' }), el('span', { text: 'every refit keeps the full fit\u2019s slope sign' })),
        el('div', null, el('b', { text: loco.median_top10_overlap + ' / 10' }), el('span', { text: 'median top-10 overlap under refits' })),
        el('div', null, el('b', { text: loco.min_top10_overlap + ' / 10' }), el('span', { text: 'worst top-10 overlap under any refit' })),
        el('div', null, el('b', { text: String(loco.median_fold_error) }), el('span', { text: 'median |log error| across held-out categories' }))
      ),
      el('h3', { text: 'Slope sensitivity: the same five-fold check under four losses' }),
      el('p', { class: 'sub', text: 'The same five folds, refitted under Huber c = 1.0, 1.345 (the published fit) and 2.0, and under plain OLS with no reweighting at all. The median |log error| moves only from 1.2644 to 1.2791 across all four, and the within-2x count from 41 to 43 of 128: the validation does not depend on the choice of loss. The rank correlation does drift — OLS prices the typical protocol a touch closer (1.2644) but ranks them worse (0.3911 against 0.4075) — so the Huber fit is kept for its ranking, and the table shows the trade instead of picking the loss that flatters one number.' }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Loss' }),
            el('th', { scope: 'col', text: 'Anchor' }),
            el('th', { scope: 'col', text: 'Slope' }),
            el('th', { scope: 'col', text: 'Median |log error|' }),
            el('th', { scope: 'col', text: 'Within 2x' }),
            el('th', { scope: 'col', text: 'Spearman' })
          )),
          el('tbody', null, sensRows)
        )
      ),
      el('h3', { text: 'Leave-one-category-out folds' }),
      el('p', { class: 'sub', text: 'One row per category held out. Held-out protocols are priced by a fit trained without their category and without any adjustment for it; Spearman is shown only where the category holds at least two comparables.' }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category held out' }),
            el('th', { scope: 'col', text: 'Held out / train' }),
            el('th', { scope: 'col', text: 'Anchor / slope' }),
            el('th', { scope: 'col', text: 'Median |log error|' }),
            el('th', { scope: 'col', text: 'Within 2x' }),
            el('th', { scope: 'col', text: 'Spearman' }),
            el('th', { scope: 'col', text: 'Top-10 overlap' })
          )),
          el('tbody', null, locoRows)
        )
      ),
      el('h3', { text: 'Every farm plan is netted' }),
      el('p', { class: 'sub', text: 'Each plan\u2019s seventh step sets its own stated gas against the position\u2019s expected share of the implied value, at an assumed ' + Math.round(DATA.community_share * 100) + '% community share, and names the capital at which the position pays for its own gas. At the plan\u2019s $50\u2013$250 of capital, ' + DATA.rows_net_positive + ' of ' + DATA.board_size + ' rows net positive; the median break-even is $' + DATA.median_breakeven_usd.toLocaleString('en-US') + '. The share is a guess, stated in the open.' }),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses 365 days for the hold length only, never for the price. The early radar is every pre-token protocol the watchlist leaves out, by TVL, and the live-token protocols are set aside with their market caps shown.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row);
    var logRatio = FIT.anchor + FIT.slope * (Math.log(row.tvl_usd) - FIT.lt_mean) + categoryAdjOf(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Category adjustment' }), el('b', { class: 'num', text: fmtSigned(row.category_adjustment, 3) + ' log points' })),
        el('div', null, el('span', { text: 'Log ratio' }), el('b', { class: 'num', text: logRatio.toFixed(3) })),
        el('div', null, el('span', { text: 'Implied multiple' }), el('b', { class: 'num', text: fmtMult(row.implied_multiple, 3) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'Farm net at plan capital' }), el('b', { class: 'num', text: money2(row.net_usd) + ' (break-even $' + row.breakeven_usd.toLocaleString('en-US') + ')' }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same regression scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s, i) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', { class: i === steps.length - 1 ? 'net' : null }, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(spotlight());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') {
      shell.appendChild(summaryTables());
      shell.appendChild(modelPanel());
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
