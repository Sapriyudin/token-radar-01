// Launch Radar dashboard. Reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, filters, and a per-protocol detail view with the model's own inputs and the
// protocol's farm plan. Static: no network, every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var dialog = document.getElementById('detail');
  var state = { q: '', category: 'all', verdict: 'all', watch: false, sort: 'implied', dir: -1, selected: null };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
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
  function fmtFactor(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : n.toFixed(3); }

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

  function readHash() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('p')) state.selected = params.get('p');
    var f = params.get('f');
    if (f === 'watchlist') state.watch = true;
    else if (f === 'farm' || f === 'thin' || f === 'skip') state.verdict = f;
    if (params.get('sort')) state.sort = params.get('sort');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.watch) params.set('f', 'watchlist');
    else if (state.verdict !== 'all') params.set('f', state.verdict);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
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
      else if (key === 'expected') { av = a.expected_airdrop_usd; bv = b.expected_airdrop_usd; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function lede() {
    var v = DATA.verdict_counts;
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.board_size + ' pre-token protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $50M of TVL and no token on record. The board adds every other pre-token protocol in the snapshot, strongest implied value first. Implied value is a model, not a promise — the band on each row is the honest part.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Verdicts: farm / thin / skip' }), el('b', { text: v.farm + ' / ' + v.thin + ' / ' + v.skip })),
        el('div', { class: 'fact' }, el('span', { text: 'Blind test, typical miss' }), el('b', { text: '×' + DATA.model.blind_typical_miss.toFixed(2) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var vse = el('select', { id: 'verdict', 'aria-label': 'Filter by verdict' },
      el('option', { value: 'all', text: 'All verdicts' }),
      ['farm', 'thin', 'skip'].map(function (v) { return el('option', { value: v, text: 'Verdict: ' + v, selected: v === state.verdict ? 'selected' : null }); })
    );
    vse.addEventListener('change', function () { state.verdict = vse.value; writeHash(); render(); });
    var watchBtn = el('button', { type: 'button', class: 'chip-toggle', 'aria-pressed': state.watch ? 'true' : 'false', text: 'Watchlist only', onclick: function () { state.watch = !state.watch; writeHash(); render(); } });
    var srt = el('select', { id: 'sort', 'aria-label': 'Sort the board' },
      [['implied', 'Sort: implied value'], ['tvl', 'Sort: TVL'], ['growth', 'Sort: 7d growth'], ['age', 'Sort: age'], ['expected', 'Sort: expected airdrop'], ['name', 'Sort: name']].map(function (o) { return el('option', { value: o[0], text: o[1], selected: o[0] === state.sort ? 'selected' : null }); })
    );
    srt.addEventListener('change', function () { state.sort = srt.value; writeHash(); render(); });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'verdict', text: 'Verdict' }), vse),
      el('div', { class: 'field' }, el('label', { text: 'Scope' }), watchBtn),
      el('div', { class: 'field' }, el('label', { for: 'sort', text: 'Sort' }), srt),
      el('span', { class: 'count', text: rows().length + ' rows shown' })
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.verdict = 'all'; state.watch = false; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var ratio = r.farm_cost_usd > 0 ? r.expected_airdrop_usd / r.farm_cost_usd : 0;
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          r.watchlist ? el('span', { class: 'wl', text: 'WATCHLIST' }) : null,
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num band', text: fmtUsd(r.implied_low_usd) + ' – ' + fmtUsd(r.implied_high_usd) }),
        el('td', null, el('span', { class: 'verdict v-' + r.verdict, text: r.verdict })),
        el('td', { class: 'num', text: fmtUsd(r.expected_airdrop_usd) + ' / ' + fmtUsd(r.farm_cost_usd) + '  (' + ratio.toFixed(1) + '×)' })
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Rank' }),
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: 'TVL' }),
            el('th', { scope: 'col', text: '7d' }),
            el('th', { scope: 'col', text: 'Implied value' }),
            el('th', { scope: 'col', text: 'Band (low – high)' }),
            el('th', { scope: 'col', text: 'Verdict' }),
            el('th', { scope: 'col', text: 'Expected / cost' })
          )),
          tbody
        )
      )
    );
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var m = DATA.model;
    var adj = m.category_adjustment[row.category];
    var compsLine = adj !== undefined
      ? 'Category adjustment ' + (adj >= 0 ? '+' : '') + adj.toFixed(2) + ' (' + row.category + ', ' + row.comps_n + ' comps behind it).'
      : 'No category adjustment — ' + row.comps_n + ' comps in ' + row.category + ', so the base is TVL × the overall median multiple ' + m.fallback_median.toFixed(3) + '.';
    var ratio = row.farm_cost_usd > 0 ? row.expected_airdrop_usd / row.farm_cost_usd : 0;
    var verdictLine = row.verdict === 'farm'
      ? 'Farm: expected airdrop is ' + ratio.toFixed(1) + '× the cost, above the 3× bar.'
      : row.verdict === 'thin'
        ? 'Thin: expected airdrop is ' + ratio.toFixed(1) + '× the cost — above 1×, below the 3× farm bar.'
        : 'Skip: expected airdrop is ' + ratio.toFixed(1) + '× the cost, below the 1× bar.';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' · watchlist' : '') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · listed ' + (row.listed_at || 'unknown') + ' (' + fmtAge(row.age_days) + ')' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Regression base' }), el('b', { class: 'num', text: fmtUsd(row.regression_base_usd) })),
        el('div', null, el('span', { text: 'Quality (growth × breadth × age)' }), el('b', { class: 'num', text: fmtFactor(row.growth_factor) + ' × ' + fmtFactor(row.breadth_factor) + ' × ' + fmtFactor(row.age_factor) + ' = ' + fmtFactor(row.quality_factor) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'Band (±1σ, ×' + Math.exp(m.sigma).toFixed(2) + ')' }), el('b', { class: 'num', text: fmtUsd(row.implied_low_usd) + ' – ' + fmtUsd(row.implied_high_usd) }))
      ),
      el('p', { class: 'sub', text: compsLine + ' Model ' + DATA.model_version + ': log(mcap) = ' + m.intercept.toFixed(3) + ' + ' + m.slope.toFixed(3) + ' × log(TVL) + adjustment, fitted on ' + m.comps_n + ' comps (R² ' + m.r2.toFixed(3) + ', blind typical miss ×' + m.blind_typical_miss.toFixed(2) + '). This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — ' + row.verdict }),
      el('p', { class: 'sub', text: verdictLine + ' Expected airdrop ' + fmtUsd(row.expected_airdrop_usd) + ' against a cost of ' + fmtUsd(row.farm_cost_usd) + ' (gas on the cheapest chain + 2% opportunity on the capital).' }),
      el('ol', { class: 'steps' }, (row.farm_steps || []).map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    window.__shotReady = true;
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(boardTable());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) document.body.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
    window.__shotReady = true;
  }

  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
  // Same-document hash changes (back button, or a screenshot run reusing one page) re-render.
  window.addEventListener('hashchange', function () {
    var had = state.selected;
    state.q = ''; state.category = 'all'; state.verdict = 'all'; state.watch = false; state.selected = null;
    readHash();
    if (!state.selected && had && dialog.open) dialog.close();
    render();
  });
  readHash();
  render();
})();
