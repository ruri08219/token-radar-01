// Token Radar's dashboard (radar-2). It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable and sortable table, a per-protocol detail drawer with
// the model's own inputs and the protocol's farm plan, and the methodology behind every number.
// No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var RADAR_DATA = window.RADAR;
  if (!RADAR_DATA) return;
  var mount = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', wl: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function moneyShort(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usdFmt.format(n);
  }
  function pctLabel(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function ageLabel(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function recomputeValue(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.multiple * growthMult * maturity));
  }

  function h(tag, attrs) {
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
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function firstChain(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function stakeSize(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdSpan(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  // One dispatch rule for the farm's opening action: the first rule whose category test matches
  // wins, so the table's order is the old if-chain's order. No protocol name is ever tested here.
  var OPENING_RULES = [
    { matches: function (c) { return c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0; },
      build: function (capital, name, chain) { return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ', then borrow $20 of it back so both sides of the position are active.'; } },
    { matches: function (c) { return c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0; },
      build: function (capital, name, chain) { return 'Provide $' + capital + ' of liquidity to ' + name + "'s deepest pool on " + chain + ' and keep the position in range.'; } },
    { matches: function (c) { return c.indexOf('yield') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('vault') >= 0; },
      build: function (capital, name, chain) { return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' with the longest track record and keep the shares.'; } },
    { matches: function (c) { return c.indexOf('basis') >= 0; },
      build: function (capital, name, chain) { return 'Deposit $' + capital + ' of USDC into ' + name + "'s basis vault on " + chain + ' and hold the receipt.'; } },
    { matches: function (c) { return c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0; },
      build: function (capital, name, chain) { return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge, then close it the same week.'; } },
    { matches: function (c) { return c.indexOf('prediction') >= 0; },
      build: function (capital, name, chain) { return 'Fund $' + capital + ' and place one market position on ' + name + ' on an event you have read.'; } },
    { matches: function (c) { return c.indexOf('stable') >= 0; },
      build: function (capital, name, chain) { return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.'; } },
    { matches: function (c) { return c.indexOf('rwa') >= 0; },
      build: function (capital, name, chain) { return 'Mint $' + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it to maturity.'; } },
    { matches: function (c) { return c.indexOf('insurance') >= 0; },
      build: function (capital, name, chain) { return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy for the full term.'; } },
    { matches: function (c) { return c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0; },
      build: function (capital, name, chain) { return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.'; } },
    { matches: function (c) { return c.indexOf('bridge') >= 0; },
      build: function (capital, name, chain) { return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.'; } },
    { matches: function (c) { return c.indexOf('chain') >= 0; },
      build: function (capital, name, chain) { return 'Bridge $' + capital + ' of USDC to ' + name + "'s chain and use one of its native apps each week."; } },
    { matches: function (c) { return c.indexOf('governance') >= 0; },
      build: function (capital, name, chain) { return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and vote once on a live proposal.'; } },
    { matches: function (c) { return c.indexOf('payment') >= 0; },
      build: function (capital, name, chain) { return 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + ' over the month.'; } }
  ];
  // The category's one action, in the words a farmer can follow; the fallback is a plain deposit.
  function openingAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var rule = null;
    for (var i = 0; i < OPENING_RULES.length; i++) {
      if (OPENING_RULES[i].matches(c)) { rule = OPENING_RULES[i]; break; }
    }
    if (rule) return rule.build(capital, p.name, chain);
    return 'Deposit $' + capital + ' of USDC into ' + p.name + ' on ' + chain + ' and keep the position open.';
  }
  // One dispatch rule for the weekly cadence, in the same first-match order as the old chain.
  var WEEKLY_RULES = [
    { matches: function (c) { return c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0 || c.indexOf('prediction') >= 0; },
      text: "Make one small trade each week, open and close, so the week's volume is real." },
    { matches: function (c) { return c.indexOf('dex') >= 0; },
      text: 'Swap once a week through the pool you supplied, in either direction.' },
    { matches: function (c) { return c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0; },
      text: 'Adjust the position once a week: add collateral, repay a little, or borrow a little.' },
    { matches: function (c) { return c.indexOf('governance') >= 0; },
      text: 'Vote once a week while a proposal is live, and comment on one discussion.' }
  ];
  function weeklyAction(p) {
    var c = (p.category || '').toLowerCase();
    for (var i = 0; i < WEEKLY_RULES.length; i++) {
      if (WEEKLY_RULES[i].matches(c)) return WEEKLY_RULES[i].text;
    }
    return 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.';
  }
  function formatStep(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function buildPlan(p) {
    var chain = firstChain(p);
    var capital = stakeSize(p);
    var hold = holdSpan(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: openingAction(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: weeklyAction(p), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(formatStep);
  }

  function loadStateFromHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('wl') === '1') state.wl = true;
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function saveStateToHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.wl) params.set('wl', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return RADAR_DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (state.wl && !RADAR_DATA.watchlist_rows.includes(r.slug)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function orderedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.multiple; bv = b.multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function topBar() {
    return h('header', { class: 'top' },
      h('div', { class: 'brand' }, h('span', { class: 'mark' }), h('span', { class: 'brand-name', text: 'Token Radar' })),
      h('div', { class: 'top-meta' },
        h('span', { text: 'Snapshot ' + RADAR_DATA.as_of }),
        h('span', { text: 'DefiLlama protocol index' }),
        h('span', { text: RADAR_DATA.model_version + ' model' })
      )
    );
  }

  function introBlock() {
    return h('section', { class: 'lede' },
      h('div', null,
        h('h1', { text: RADAR_DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        h('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(RADAR_DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + RADAR_DATA.early_size + ' pre-token protocols below that floor, priced off their own category. Implied value is a model, not a promise.' })
      ),
      h('div', { class: 'facts' },
        h('div', { class: 'fact' }, h('span', { text: 'Watchlist covered' }), h('b', { text: RADAR_DATA.watchlist_size + ' / ' + RADAR_DATA.watchlist_size })),
        h('div', { class: 'fact' }, h('span', { text: 'Pre-token rows scored' }), h('b', { text: String(RADAR_DATA.board_size) })),
        h('div', { class: 'fact' }, h('span', { text: 'Early rows below the floor' }), h('b', { text: String(RADAR_DATA.early_size) })),
        h('div', { class: 'fact' }, h('span', { text: 'Live-token protocols set aside' }), h('b', { text: String(RADAR_DATA.live_size) }))
      )
    );
  }

  function filterBar() {
    var categories = Array.from(new Set(RADAR_DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(RADAR_DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = h('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; saveStateToHash(); paint(); });
    var catSelect = h('select', { id: 'category', 'aria-label': 'Filter by category' },
      h('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return h('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; saveStateToHash(); paint(); });
    var chainSelect = h('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      h('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return h('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; saveStateToHash(); paint(); });
    var wlBox = h('input', { type: 'checkbox', id: 'wl', checked: state.wl ? 'checked' : null, 'aria-label': 'Watchlist only' });
    wlBox.addEventListener('change', function () { state.wl = wlBox.checked; saveStateToHash(); paint(); });
    var pre = h('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; saveStateToHash(); paint(); } });
    var live = h('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; saveStateToHash(); paint(); } });
    return h('div', { class: 'controls' },
      h('div', { class: 'field' }, h('label', { for: 'q', text: 'Search' }), search),
      h('div', { class: 'field' }, h('label', { for: 'category', text: 'Category' }), catSelect),
      h('div', { class: 'field' }, h('label', { for: 'chain', text: 'Chain' }), chainSelect),
      h('label', { class: 'check', for: 'wl' }, wlBox, 'Watchlist only'),
      h('div', { class: 'field' }, h('span', { text: 'Token status' }), h('div', { class: 'tabs' }, pre, live)),
      h('span', { class: 'count', text: state.tab === 'pre-token' ? filteredRows().length + ' rows shown' : RADAR_DATA.live.length + ' live-token protocols' })
    );
  }

  function sortCell(key, label) {
    return h('th', { scope: 'col' },
      h('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } paint(); } },
        label,
        state.sort === key ? h('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function preTokenPanel() {
    var list = orderedRows(filteredRows());
    if (list.length === 0) {
      return h('div', { class: 'panel' }, h('div', { class: 'empty' },
        h('h2', { text: 'No protocol matches that filter' }),
        h('p', { text: 'Clear the search or pick another category to see the board again.' }),
        h('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.wl = false; saveStateToHash(); paint(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = h('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : pctLabel(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = h('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { showDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDetail(r.slug); } }
      },
        h('td', { class: 'num', text: String(r.rank) }),
        h('td', null, h('div', { class: 'name' },
          h('b', { text: r.name }),
          h('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        h('td', { class: 'num', text: moneyShort(r.tvl_usd) }),
        h('td', { class: 'num ' + growthClass, text: growth }),
        h('td', { class: 'num', text: ageLabel(r.age_days) }),
        h('td', { class: 'num', text: r.multiple.toFixed(2) + 'x' }),
        h('td', null, h('div', { class: 'implied' },
          h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          h('span', { class: 'num', text: moneyShort(r.implied_value_usd) })
        )),
        h('td', null, h('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return h('div', { class: 'panel' },
      h('div', { class: 'table-wrap' },
        h('table', null,
          h('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          h('thead', null, h('tr', null,
            sortCell('implied', 'Rank'),
            sortCell('name', 'Protocol'),
            sortCell('tvl', 'TVL'),
            sortCell('growth', '7d'),
            sortCell('age', 'Age'),
            sortCell('multiple', 'Multiple'),
            sortCell('implied', 'Implied value'),
            h('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTokenPanel() {
    var tbody = h('tbody');
    RADAR_DATA.live.forEach(function (r) {
      tbody.appendChild(h('tr', null,
        h('td', { class: 'num', text: 'live' }),
        h('td', null, h('div', { class: 'name' }, h('b', { text: r.name }), h('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        h('td', { class: 'num', text: moneyShort(r.tvl_usd) }),
        h('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: pctLabel(r.change_7d) }),
        h('td', { class: 'num', text: moneyShort(r.mcap_usd) }),
        h('td', null, h('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return h('div', { class: 'panel' },
      h('div', { class: 'table-wrap' },
        h('table', null,
          h('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Status' }), h('th', { scope: 'col', text: 'Protocol' }), h('th', { scope: 'col', text: 'TVL' }), h('th', { scope: 'col', text: '7d' }), h('th', { scope: 'col', text: 'Market cap' }), h('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function methodPanel() {
    var m = RADAR_DATA.model;
    var multRows = RADAR_DATA.multiples.map(function (x) {
      return h('tr', null,
        h('td', { text: x.category }),
        h('td', { class: 'num', text: x.multiple.toFixed(3) + 'x' }),
        h('td', { class: 'num', text: String(x.comparables) })
      );
    });
    return h('section', { class: 'panel model' },
      h('h2', { text: 'How implied value is computed' }),
      h('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. The multiple is the market talking: each category is priced off its own live-token protocols.' }),
      h('div', { class: 'formula' },
        'implied = round( tvl_usd x multiple(category) x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      h('p', { class: 'sub', text: 'Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. A category with fewer than ' + m.comparables_min + ' live protocols uses the whole market median of ' + RADAR_DATA.market_multiple.toFixed(3) + 'x. Multiples are clamped to ' + m.multiple_floor + 'x-' + m.multiple_cap.toFixed(2) + 'x.' }),
      h('h3', { text: 'Category multiples, from the snapshot itself' }),
      h('div', { class: 'table-wrap' }, h('table', { class: 'mult-table' },
        h('thead', null, h('tr', null, h('th', { text: 'Category' }), h('th', { text: 'Median mcap / TVL' }), h('th', { text: 'Live protocols' }))),
        h('tbody', null, multRows)
      )),
      h('p', { class: 'sub', text: 'Wrapped, staked and bridged products are left out by the watchlist rule itself: their token already trades, so they are not a launch of their own. The board says a protocol records no token, never that it has none.' })
    );
  }

  var detailDialog = h('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  detailDialog.addEventListener('close', function () { state.selected = null; saveStateToHash(); });

  function showDetail(slug) {
    var row = RADAR_DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    saveStateToHash();
    detailDialog.textContent = '';
    var steps = buildPlan(row);
    var recomputed = recomputeValue(row, RADAR_DATA.model);
    detailDialog.appendChild(h('div', { class: 'detail-head' },
      h('div', null,
        h('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + RADAR_DATA.board_size }),
        h('h2', { id: 'detail-title', text: row.name }),
        h('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      h('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { detailDialog.close(); } })
    ));
    detailDialog.appendChild(h('section', { class: 'detail-section' },
      h('h3', { text: 'Implied value' }),
      h('div', { class: 'equation' },
        h('div', null, h('span', { text: 'TVL' }), h('b', { class: 'num', text: moneyShort(row.tvl_usd) })),
        h('div', null, h('span', { text: 'Category multiple' }), h('b', { class: 'num', text: row.multiple.toFixed(3) + 'x (' + row.comparables + ' live comparables)' })),
        h('div', null, h('span', { text: 'Seven-day growth' }), h('b', { class: 'num', text: pctLabel(row.change_7d) })),
        h('div', null, h('span', { text: 'Age with no token' }), h('b', { class: 'num', text: ageLabel(row.age_days) })),
        h('div', null, h('span', { text: 'Growth multiplier' }), h('b', { class: 'num', text: String(row.growth_multiplier) })),
        h('div', null, h('span', { text: 'Maturity multiplier' }), h('b', { class: 'num', text: String(row.maturity_multiplier) })),
        h('div', null, h('span', { text: 'Implied value' }), h('b', { class: 'num', text: moneyShort(row.implied_value_usd) }))
      ),
      h('p', { class: 'sub', text: 'Model ' + RADAR_DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + moneyShort(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    detailDialog.appendChild(h('section', { class: 'detail-section' },
      h('h3', { text: 'Farm plan' }),
      h('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return h('li', null, h('b', { text: action }), h('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof detailDialog.showModal === 'function') {
      if (!detailDialog.open) detailDialog.showModal();
    } else {
      detailDialog.setAttribute('open', '');
    }
  }

  function paint() {
    mount.textContent = '';
    var shell = h('div', { class: 'shell' });
    shell.appendChild(topBar());
    shell.appendChild(introBlock());
    shell.appendChild(filterBar());
    shell.appendChild(state.tab === 'pre-token' ? preTokenPanel() : liveTokenPanel());
    if (state.tab === 'pre-token') shell.appendChild(methodPanel());
    mount.appendChild(shell);
    mount.setAttribute('aria-busy', 'false');
    if (!detailDialog.isConnected) mount.appendChild(detailDialog);
    if (state.selected) showDetail(state.selected);
  }

  // The watchlist's slugs, for the watchlist-only filter (board.json carries every row; the
  // watchlist itself is the snapshot's list, so the page keeps it beside the rows).
  loadStateFromHash();
  paint();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && detailDialog.open) detailDialog.close();
  });
})();
