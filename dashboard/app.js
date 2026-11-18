// Token Radar's night dashboard, radar-5. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail drawer with the
// curve's own inputs, the live comparables behind its value, the value band, the stress lab and
// the protocol's costed farm plan. No network: every byte it shows is in data.js. The page
// renders data the program computed; it recomputes nothing but the display — one model for the
// page and the board, so the screenshots and the code agree.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', verdict: 'all', watch: false, growing: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null, ticket: 1000, scroll: '' };
  var WATCH = {};
  (DATA.watchlist || []).forEach(function (s) { WATCH[s] = true; });

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
  /** Dollars with cents, for the farm economics where a slice can be $0.36. */
  function fmtUsd2(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var sign = n < 0 ? '-' : '';
    var a = Math.abs(n);
    if (a >= 1e6) return sign + fmtUsd(a);
    if (a >= 1e3) return sign + '$' + Math.round(a).toLocaleString('en-US');
    return sign + '$' + a.toFixed(2);
  }
  /** One row's farm economics at the chosen ticket: the slice scales with the ticket, the fees do not.
   *  At the $1,000 ticket the stored values are shown as computed, so the page and board.json agree
   *  to the cent; at $10,000 the slice is rescaled and the net, break-even and net/hour follow. */
  function econ(r) {
    if (state.ticket === 1000) return { slice: r.slice_usd, net: r.net_usd, breakeven: r.breakeven_pct, netPerHour: r.net_per_hour_usd };
    var slice = r.slice_usd * 10;
    var net = slice - r.total_fees_usd;
    var breakeven = slice > 0 ? (r.total_fees_usd / slice) * 100 : 0;
    return { slice: slice, net: net, breakeven: breakeven, netPerHour: net / r.farmer_hours };
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return n === null || n === undefined ? 'n/a' : n.toFixed(3) + 'x'; }
  function fmtFee(n) { return '$' + (Math.round(n * 100) / 100); }

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

  // Log-scale band: where [p10, p90] sits between the board's smallest p10 and largest p90.
  var bandLo = Math.log10(Math.min.apply(null, DATA.rows.map(function (r) { return r.p10_usd; })));
  var bandHi = Math.log10(Math.max.apply(null, DATA.rows.map(function (r) { return r.p90_usd; })));
  function bandBar(r) {
    var span = Math.max(0.001, bandHi - bandLo);
    var left = Math.max(0, ((Math.log10(r.p10_usd) - bandLo) / span) * 100);
    var width = Math.max(2, ((Math.log10(r.p90_usd) - Math.log10(r.p10_usd)) / span) * 100);
    var mark = Math.max(0, Math.min(100, ((Math.log10(r.implied_value_usd) - bandLo) / span) * 100));
    var wrap = el('div', { class: 'bar', 'aria-hidden': 'true' });
    wrap.innerHTML = '<i style="margin-left:' + left.toFixed(1) + '%;width:' + width.toFixed(1) + '%"></i>';
    var dot = el('i', { style: 'position:absolute;left:' + mark.toFixed(1) + '%;top:-2px;width:2px;height:10px;background:#f2b544' });
    wrap.style.position = 'relative';
    wrap.appendChild(dot);
    return wrap;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('verdict')) state.verdict = params.get('verdict');
    if (params.get('watch') === '1') state.watch = true;
    if (params.get('growing') === '1') state.growing = true;
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('sort') && ['implied', 'name', 'tvl', 'growth', 'age', 'verdict', 'fees', 'slice', 'net', 'netperhour'].indexOf(params.get('sort')) >= 0) state.sort = params.get('sort');
    if (params.get('scroll') === 'table') state.scroll = 'table';
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.watch) params.set('watch', '1');
    if (state.growing) params.set('growing', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (state.watch && !WATCH[r.slug]) return false;
      if (state.growing && !(r.change_7d !== null && r.change_7d > 0)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    var order = { FARM: 0, THIN: 1, SKIP: 2 };
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'verdict') { av = order[a.verdict]; bv = order[b.verdict]; }
      else if (key === 'fees') { av = a.total_fees_usd; bv = b.total_fees_usd; }
      else if (key === 'slice') { av = econ(a).slice; bv = econ(b).slice; }
      else if (key === 'net') { av = econ(a).net; bv = econ(b).net; }
      else if (key === 'netperhour') { av = econ(a).netPerHour; bv = econ(b).netPerHour; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'TOKEN RADAR' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model · size curve, tested' })
      )
    );
  }

  function lede() {
    var v = DATA.validation;
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Every pre-token protocol, ranked by what its token would be worth' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, at any size. Implied value comes from a size curve fitted to live-token prices and tested on them — leave-one-out median miss ×' + v.leave_one_out.med_mult + ', walk-forward ×' + v.walk_forward.med_mult + ', against a flat multiple’s ×' + v.baselines.flat_med_mult_loo + ' and ×' + v.baselines.flat_med_mult_wf + ' — not a promise of a launch.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(DATA.total_implied_usd) })),
        el('div', { class: 'fact' }, el('span', { text: 'Curve slope (log mcap on log TVL)' }), el('b', { text: DATA.curve.slope.toFixed(3) + ' · R² ' + DATA.curve.r_squared_full + ' with offsets · ' + DATA.curve.live_count + ' live' })),
        el('div', { class: 'fact' }, el('span', { text: 'FARM / THIN / SKIP plans' }), el('b', { text: DATA.rows.filter(function (r) { return r.verdict === 'FARM'; }).length + ' / ' + DATA.rows.filter(function (r) { return r.verdict === 'THIN'; }).length + ' / ' + DATA.rows.filter(function (r) { return r.verdict === 'SKIP'; }).length }))
      )
    );
  }

  function kpiStrip() {
    var v = DATA.validation;
    var tiles = [
      { big: String(DATA.board_size), lbl: 'ranked', sub: 'of ' + DATA.ledger.total + ' protocols read' },
      { big: fmtUsd(DATA.total_implied_usd), lbl: 'total implied value', sub: DATA.board_size + ' rows, strongest first' },
      { big: '×' + v.leave_one_out.med_mult, lbl: 'leave-one-out median miss', sub: 'walk-forward ×' + v.walk_forward.med_mult + ' · flat multiple ×' + v.baselines.flat_med_mult_loo },
      { big: v.range_hold_p90_pct + '%', lbl: 'held-out caps inside P10–P90', sub: v.range_hold_p50_pct + '% inside P25–P75 (50% by construction)' },
      { big: String(DATA.farm_count), lbl: 'worth farming', sub: 'FARM verdicts of ' + DATA.board_size + ' plans' },
      { big: '+$' + DATA.best_net_per_hour_usd.toFixed(2), lbl: 'best net per farmer hour', sub: DATA.best_net_per_hour_name + ' · $1,000 ticket' },
    ];
    return el('section', { class: 'kpi' }, tiles.map(function (t) {
      return el('div', { class: 'kpi-tile' },
        el('div', { class: 'big', text: t.big }),
        el('div', { class: 'lbl', text: t.lbl }),
        el('div', { class: 'sub', text: t.sub }));
    }));
  }

  function ledgerStrip() {
    var colors = { ranked: '#f2b544', trades: '#4fd1c5', record: '#7c8bc4', excluded: '#5a6486', versioned: '#c98a4b', wrapped: '#8a4b4b' };
    var total = DATA.ledger.total;
    var bar = el('div', { class: 'ledger-bar', 'aria-hidden': 'true' },
      DATA.ledger.groups.map(function (g) {
        return el('i', { style: 'width:' + (g.count / total * 100).toFixed(2) + '%;background:' + (colors[g.key] || '#5a6486'), title: g.label + ': ' + g.count });
      }));
    var groups = el('div', { class: 'ledger-groups' },
      DATA.ledger.groups.map(function (g) {
        return el('span', null, el('b', { text: String(g.count) }), ' ' + g.label + ' — ' + g.reason);
      }));
    return el('section', { class: 'ledger' },
      el('div', { class: 'ledger-head' },
        el('b', { text: total + ' protocols read — every one accounted for' }),
        el('span', { text: 'The board never pretends the universe is only the rows it shows.' })),
      bar, groups);
  }

  /** The fit as a picture: live-token market cap against TVL on log scales, the fitted curve, and the board's top 10 implied values. */
  function scatterSvg() {
    var W = 620, H = 290, padL = 48, padR = 14, padT = 12, padB = 30;
    var live = DATA.live.filter(function (r) { return r.tvl_usd > 0 && r.mcap_usd > 0; });
    var top = DATA.rows.slice(0, 10);
    var xs = live.map(function (r) { return Math.log10(r.tvl_usd); }).concat(top.map(function (r) { return Math.log10(r.tvl_usd); }));
    var ys = live.map(function (r) { return Math.log10(r.mcap_usd); }).concat(top.map(function (r) { return Math.log10(r.implied_value_usd); }));
    var x0 = Math.floor(Math.min.apply(null, xs)), x1 = Math.ceil(Math.max.apply(null, xs));
    var y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
    function X(v) { return padL + ((v - x0) / (x1 - x0)) * (W - padL - padR); }
    function Y(v) { return padT + (1 - (v - y0) / (y1 - y0)) * (H - padT - padB); }
    var c0 = DATA.curve.intercept / Math.LN10, s = DATA.curve.slope;
    var parts = [];
    parts.push('<svg class="scatter" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Scatter plot of live-token market cap against TVL on log scales, with the fitted curve and the board top 10">');
    parts.push('<defs><clipPath id="plot"><rect x="' + padL + '" y="' + padT + '" width="' + (W - padL - padR) + '" height="' + (H - padT - padB) + '"/></clipPath></defs>');
    for (var gx = x0; gx <= x1; gx++) {
      parts.push('<line x1="' + X(gx).toFixed(1) + '" y1="' + padT + '" x2="' + X(gx).toFixed(1) + '" y2="' + (H - padB) + '" stroke="#26305a" stroke-width="1"/>');
      parts.push('<text x="' + X(gx).toFixed(1) + '" y="' + (H - padB + 16) + '" fill="#9aa5c4" font-size="11" text-anchor="middle">$10^' + gx + '</text>');
    }
    for (var gy = y0; gy <= y1; gy++) {
      parts.push('<line x1="' + padL + '" y1="' + Y(gy).toFixed(1) + '" x2="' + (W - padR) + '" y2="' + Y(gy).toFixed(1) + '" stroke="#26305a" stroke-width="1"/>');
      parts.push('<text x="' + (padL - 6) + '" y="' + (Y(gy) + 4).toFixed(1) + '" fill="#9aa5c4" font-size="11" text-anchor="end">$10^' + gy + '</text>');
    }
    parts.push('<g clip-path="url(#plot)">');
    live.forEach(function (r) {
      parts.push('<circle cx="' + X(Math.log10(r.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log10(r.mcap_usd)).toFixed(1) + '" r="3" fill="#9aa5c4" opacity="0.65"/>');
    });
    parts.push('<line x1="' + X(x0).toFixed(1) + '" y1="' + Y(c0 + s * x0).toFixed(1) + '" x2="' + X(x1).toFixed(1) + '" y2="' + Y(c0 + s * x1).toFixed(1) + '" stroke="#f2b544" stroke-width="2"/>');
    top.forEach(function (r) {
      parts.push('<circle cx="' + X(Math.log10(r.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log10(r.implied_value_usd)).toFixed(1) + '" r="4.5" fill="#f2b544" stroke="#0b1020" stroke-width="1.5"/>');
    });
    parts.push('</g>');
    parts.push('<text x="' + padL + '" y="' + (H - 8) + '" fill="#9aa5c4" font-size="11">TVL (log scale) →</text>');
    parts.push('</svg>');
    return parts.join('');
  }

  function proofGrid() {
    var v = DATA.validation;
    var ageRow = DATA.ablation.filter(function (a) { return a.name.indexOf('age') >= 0; })[0];
    var ablRows = DATA.ablation.map(function (a) {
      return el('tr', null,
        el('td', { text: a.name }),
        el('td', { class: 'num', text: '×' + a.loo_med.toFixed(2) }),
        el('td', { class: 'num', text: '×' + a.wf_med.toFixed(2) }),
        el('td', { class: a.kept ? 'kept' : 'dropped', text: a.kept ? 'KEPT' : 'dropped' })
      );
    });
    return el('section', { class: 'proof' },
      el('div', { class: 'panel' },
        el('h2', { text: 'The fit, on the market’s own prices' }),
        el('div', { html: scatterSvg() }),
        el('p', { class: 'scatter-note', text: DATA.curve.live_count + ' live-token protocols (grey), the fitted curve log(mcap) = ' + DATA.curve.intercept.toFixed(3) + ' + ' + DATA.curve.slope.toFixed(3) + ' × log(TVL) (gold), the board’s top 10 implied values (gold dots). R² ' + DATA.curve.r_squared_full + ' with the shrunk category offsets, ' + DATA.curve.r_squared + ' for the curve alone.' })
      ),
      el('div', { class: 'panel' },
        el('h2', { text: 'How a value is built' }),
        el('div', { class: 'formula' }, el('b', { text: 'implied = exp(curve + offset) × growth × maturity' })),
        el('table', { class: 'calib ablation' },
          el('thead', null, el('tr', null, el('th', { text: 'Specification' }), el('th', { class: 'num', text: 'LOO median miss' }), el('th', { class: 'num', text: 'Walk-forward' }), el('th', { text: 'Kept?' }))),
          el('tbody', null, ablRows)
        ),
        el('p', { class: 'sub', text: 'Each row was scored blind on the same ' + v.leave_one_out.n + ' live protocols. The curve beats the flat multiple on both tests. A fitted age term wins in-sample and collapses on listings the model never saw (×' + (ageRow ? ageRow.wf_med.toFixed(2) : '5.46') + '), so the model refuses it; growth stays a small stated prior, not a fitted term. Offsets move the blind scores by less than the noise and are kept for the category story, not for a win they do not earn.' })
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains || []; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    function select(id, label, values, current, allLabel) {
      var s = el('select', { id: id, 'aria-label': label }, el('option', { value: 'all', text: allLabel }),
        values.map(function (c) { return el('option', { value: c, text: c, selected: c === current ? 'selected' : null }); }));
      s.addEventListener('change', function () { state[id === 'category' ? 'category' : id === 'chain' ? 'chain' : 'verdict'] = s.value; writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { for: id, text: label }), s);
    }
    var watchBox = el('input', { type: 'checkbox', id: 'watch', checked: state.watch ? 'checked' : null });
    watchBox.addEventListener('change', function () { state.watch = watchBox.checked; writeHash(); render(); });
    var growBox = el('input', { type: 'checkbox', id: 'growing', checked: state.growing ? 'checked' : null });
    growBox.addEventListener('change', function () { state.growing = growBox.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    var t1000 = el('button', { type: 'button', 'aria-pressed': state.ticket === 1000 ? 'true' : 'false', text: '$1,000', onclick: function () { state.ticket = 1000; render(); } });
    var t10000 = el('button', { type: 'button', 'aria-pressed': state.ticket === 10000 ? 'true' : 'false', text: '$10,000', onclick: function () { state.ticket = 10000; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      select('category', 'Category', categories, state.category, 'All categories'),
      select('chain', 'Chain', chains, state.chain, 'All chains'),
      select('verdict', 'Farm verdict', ['FARM', 'THIN', 'SKIP'], state.verdict, 'All verdicts'),
      el('label', { class: 'check', for: 'watch' }, watchBox, 'Watchlist only'),
      el('label', { class: 'check', for: 'growing' }, growBox, 'Growing only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Deposit ticket' }), el('div', { class: 'ticket' }, t1000, t10000)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols in the fit' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.verdict = 'all'; state.watch = false; state.growing = false; writeHash(); render(); } })
      ));
    }
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var e = econ(r);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (WATCH[r.slug] ? ' · watchlist' : '') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', null, el('div', { class: 'implied' },
          bandBar(r),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'range', text: fmtUsd(r.p10_usd) + ' – ' + fmtUsd(r.p90_usd) })
        )),
        el('td', { class: 'num fees', text: fmtUsd2(e.slice) }),
        el('td', { class: 'num fees ' + (e.net >= 0 ? 'econ-pos' : 'econ-neg'), text: fmtUsd2(e.net) }),
        el('td', { class: 'num fees ' + (e.netPerHour >= 0 ? 'econ-pos' : 'econ-neg'), text: fmtUsd2(e.netPerHour) + '/h' }),
        el('td', null, el('span', { class: 'verdict ' + r.verdict, text: r.verdict })),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. The gold bar is the P10–P90 value band on a log scale, the tick is the point estimate. Slice is the plan’s share of the airdrop at a $' + state.ticket.toLocaleString('en-US') + ' ticket — ' + Math.round(DATA.drop_share * 100) + '% of the implied value times the ticket’s share of TVL — net is the slice minus the farm fees, net/hour divides the net by the farmer’s own hours. Select a row for its model, its comparables, its stress lab and its farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('implied', 'Implied value'),
            sortHeader('slice', 'Slice @ $' + state.ticket.toLocaleString('en-US')),
            sortHeader('net', 'Net'),
            sortHeader('netperhour', 'Net / hour'),
            sortHeader('verdict', 'Verdict'),
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
      var res = r.log_residual === null ? 'n/a' : (r.log_residual > 0 ? '+' : '') + r.log_residual.toFixed(2);
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_per_tvl === null ? 'n/a' : r.mcap_per_tvl.toFixed(3) + 'x' }),
        el('td', { class: 'num', text: fmtUsd(r.predicted_mcap_usd) }),
        el('td', { class: 'num ' + (r.log_residual !== null && r.log_residual >= 0 ? 'pos' : 'neg'), text: res }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Tokens live: these ' + DATA.live.length + ' protocols already trade, so their market cap is a fact, not a model. Predicted is the curve’s price for them; the residual is log(actual) minus log(predicted). This is the whole evidence the curve is fitted on — every one of them, not a top 24.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }), el('th', { scope: 'col', text: 'Curve predicts' }), el('th', { scope: 'col', text: 'Log residual' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var c = DATA.curve;
    var rows = c.rows.map(function (r) {
      return el('tr', null,
        el('td', { text: r.category }),
        el('td', { class: 'num', text: String(r.sample_size) }),
        el('td', { class: 'num', text: (r.offset > 0 ? '+' : '') + r.offset.toFixed(3) }),
        el('td', { class: 'num', text: r.multiple_at_100m.toFixed(3) + 'x' })
      );
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one fitted curve, not a list of names. The curve is an ordinary-least-squares fit of log market cap on log TVL over ' + c.live_count + ' live-token protocols with a positive market cap, outside the wrapped/staked/bridged categories the board never ranks. A category offset — its mean residual from the curve, shrunk toward zero with prior ' + m.offset_prior + ' — moves a category off the curve only as far as its own evidence earns. Growth and maturity are small priors, not calibrated effects: the live set shows no signal for either (see the tests below), so a week of growth passes through at weight ' + m.growth_weight + ' and age adds at most ' + m.maturity_range + ' — the curve, not these two, decides the ranking.' }),
      el('div', { class: 'formula' },
        el('b', { text: 'log(mcap) = ' + c.intercept.toFixed(3) + ' + ' + c.slope.toFixed(3) + ' x log(tvl) + offset(category)' })
      ),
      el('div', { class: 'formula' },
        el('b', { text: 'implied = round( exp(curve) x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )' })
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The slope is below 1, so market cap grows slower than TVL: the biggest protocols trade cheaper per TVL dollar than the small ones, and a flat multiple would overprice them. One caveat: the live comparables are mostly much smaller than the board’s top rows, so the largest rows are priced off small-protocol evidence — that is exactly what the P10–P90 bands show, widest where the evidence is thinnest.' }),
      el('h3', { text: 'Calibration: the curve and what each category adds to it' }),
      el('table', { class: 'calib' },
        el('thead', null, el('tr', null, el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Live sample' }), el('th', { class: 'num', text: 'Offset (log pts)' }), el('th', { class: 'num', text: 'Multiple at $100M TVL' }))),
        el('tbody', null, rows)
      )
    );
  }

  function validationPanel() {
    var v = DATA.validation;
    var b = v.baselines;
    return el('section', { class: 'panel' },
      el('h2', { text: 'How this radar is tested' }),
      el('p', { class: 'sub', text: 'The model was scored on the live-token protocols before it touched the board. Leave-one-out refits the curve without each protocol and predicts its market cap; walk-forward fits on protocols listed before ' + v.walk_forward.cutoff + ' and tests on the ' + v.walk_forward.test_n + ' listed after it — a test the model never saw. The baselines are the same tests on plain median multiples. Lower log-RMSE is better; the curve beats both baselines leave-one-out.' }),
      el('table', { class: 'calib' },
        el('thead', null, el('tr', null, el('th', { text: 'Test' }), el('th', { class: 'num', text: 'Log-RMSE' }), el('th', { text: 'Note' }))),
        el('tbody', null,
          el('tr', null, el('td', { text: 'Size curve, leave-one-out' }), el('td', { class: 'num', text: v.leave_one_out.log_rmse.toFixed(3) }), el('td', { text: v.leave_one_out.n + ' protocols · median miss ×' + v.leave_one_out.med_mult + ' · ' + v.leave_one_out.within_2x_pct + '% within 2x, ' + v.leave_one_out.within_3x_pct + '% within 3x' })),
          el('tr', null, el('td', { text: 'Overall-median multiple, leave-one-out' }), el('td', { class: 'num', text: b.overall_median_loo.toFixed(3) }), el('td', { text: 'Naive baseline · median miss ×' + b.flat_med_mult_loo })),
          el('tr', null, el('td', { text: 'Category-median multiple, leave-one-out' }), el('td', { class: 'num', text: b.category_median_loo.toFixed(3) }), el('td', { text: 'Naive baseline, per category' })),
          el('tr', null, el('td', { text: 'Size curve, walk-forward' }), el('td', { class: 'num', text: v.walk_forward.log_rmse.toFixed(3) }), el('td', { text: 'Trained on ' + v.walk_forward.train_n + ', tested on ' + v.walk_forward.test_n + ' later listings · median miss ×' + v.walk_forward.med_mult + ' · ' + v.walk_forward.within_2x_pct + '% within 2x' })),
          el('tr', null, el('td', { text: 'Overall-median multiple, walk-forward' }), el('td', { class: 'num', text: b.overall_median_wf.toFixed(3) }), el('td', { text: 'Same split · median miss ×' + b.flat_med_mult_wf })),
          el('tr', null, el('td', { text: 'Category-median multiple, walk-forward' }), el('td', { class: 'num', text: b.category_median_wf.toFixed(3) }), el('td', { text: 'Same split, ' + b.category_median_wf_n + ' of the test set in a seen category — a small, easy subset' })),
          el('tr', null, el('td', { text: 'Value bands, held out' }), el('td', { class: 'num', text: v.range_hold_p90_pct + '% in P10–P90' }), el('td', { text: v.range_hold_p50_pct + '% of held-out market caps fell inside their leave-one-out P25–P75 band (50% by construction), ' + v.range_hold_p90_pct + '% inside P10–P90 (80% by construction) — the bands hold almost exactly as printed.' }))
        )
      ),
      el('p', { class: 'sub', text: 'Signal tests on ' + v.signals.n + ' live protocols with a listing date: seven-day growth correlates ' + v.signals.growth_corr + ' with the multiple, and age ' + v.signals.age_corr + ' — neither predicts it, so both stay small priors and the curve does the work. Value bands come from ' + v.bootstrap.refits + ' bootstrap refits of the curve and offsets (seeded, deterministic): P10 and P90 are the band, and the band is widest where a category has the fewest live protocols. The early radar is every rankable pre-token protocol below the watchlist floor, at any size, and the live-token protocols are set aside with their market caps shown.' })
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
    var comps = DATA.comparables[row.category || 'Other'] || [];
    var compBlock;
    if (comps.length > 0) {
      var compRows = comps.map(function (x) {
        return el('tr', null,
          el('td', { text: x.name }),
          el('td', { class: 'num', text: fmtUsd(x.tvl_usd) }),
          el('td', { class: 'num', text: fmtUsd(x.mcap_usd) }),
          el('td', { class: 'num', text: fmtUsd(x.predicted_mcap_usd) }),
          el('td', { class: 'num ' + (x.log_residual >= 0 ? 'pos' : 'neg'), text: (x.log_residual > 0 ? '+' : '') + x.log_residual.toFixed(2) })
        );
      });
      compBlock = el('div', null,
        el('table', { class: 'calib' },
          el('thead', null, el('tr', null, el('th', { text: 'Live protocol' }), el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Mcap' }), el('th', { class: 'num', text: 'Curve predicts' }), el('th', { class: 'num', text: 'Log residual' }))),
          el('tbody', null, compRows)
        ),
        el('p', { class: 'sub', text: 'The live-token protocols in this category the curve predicts best — smallest log residuals first. The offset for this category is ' + (row.category_offset > 0 ? '+' : '') + row.category_offset.toFixed(3) + ' log points over ' + row.category_sample + ' live protocols.' })
      );
    } else {
      compBlock = el('p', { class: 'sub', text: 'No live-token protocol in this category is in the snapshot, so the curve alone prices it (offset 0).' });
    }
    var verdictNote = row.verdict === 'FARM'
      ? 'FARM: the plan’s fees are ' + (row.total_fees_usd / row.capital_usd * 100).toFixed(1) + '% of the capital — cheap enough to farm.'
      : row.verdict === 'THIN'
        ? 'THIN: the plan’s fees are ' + (row.total_fees_usd / row.capital_usd * 100).toFixed(1) + '% of the capital — farmable, but the fees bite.'
        : 'SKIP: the plan’s fees are ' + (row.total_fees_usd / row.capital_usd * 100).toFixed(1) + '% of the capital — the fees eat the position.';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'RANK ' + row.rank + ' OF ' + DATA.board_size + (WATCH[row.slug] ? ' · WATCHLIST' : ' · EARLY RADAR') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Curve at this TVL' }), el('b', { class: 'num', text: fmtUsd(Math.exp(row.curve_intercept + row.curve_slope * Math.log(row.tvl_usd))) })),
        el('div', null, el('span', { text: 'Category offset (' + (row.category || 'Other') + ')' }), el('b', { class: 'num', text: (row.category_offset > 0 ? '+' : '') + row.category_offset.toFixed(3) + ' · n=' + row.category_sample })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num gold', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'Value band (P10 – P90)' }), el('b', { class: 'num', text: fmtUsd(row.p10_usd) + ' – ' + fmtUsd(row.p90_usd) })),
        el('div', null, el('span', { text: 'Farm verdict' }), el('b', { class: 'num', text: row.verdict + ' · fees ' + fmtFee(row.total_fees_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same curve scores every protocol, and the band is 200 bootstrap refits of it. This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm economics · $' + state.ticket.toLocaleString('en-US') + ' ticket' }),
      el('div', { class: 'kv' },
        el('div', null, el('span', { text: 'Airdrop slice (' + Math.round(DATA.drop_share * 100) + '% of implied × ticket/TVL)' }), el('b', { class: 'num', text: fmtUsd2(econ(row).slice) })),
        el('div', null, el('span', { text: 'Farm fees over the hold' }), el('b', { class: 'num', text: fmtFee(row.total_fees_usd) })),
        el('div', null, el('span', { text: 'Net (slice minus fees)' }), el('b', { class: 'num ' + (econ(row).net >= 0 ? 'econ-pos' : 'econ-neg'), text: fmtUsd2(econ(row).net) })),
        el('div', null, el('span', { text: 'Break-even (fees as a share of the slice)' }), el('b', { class: 'num', text: econ(row).breakeven.toFixed(1) + '%' })),
        el('div', null, el('span', { text: 'Farmer’s hours' }), el('b', { class: 'num', text: row.farmer_hours.toFixed(2) + ' h' })),
        el('div', null, el('span', { text: 'Net per farmer hour' }), el('b', { class: 'num ' + (econ(row).netPerHour >= 0 ? 'econ-pos' : 'econ-neg'), text: fmtUsd2(econ(row).netPerHour) + '/h' }))
      ),
      el('p', { class: 'sub', text: 'The slice assumes ' + Math.round(DATA.drop_share * 100) + '% of the implied value goes to depositors and the ticket is the only deposit. At a $' + state.ticket.toLocaleString('en-US') + ' ticket the slice scales with the ticket and the fees do not — switch the ticket above the board to see it. A negative net means the fees alone eat the whole share.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Stress lab' }),
      el('div', { class: 'kv' },
        el('div', null, el('span', { text: 'Bear case (P10)' }), el('b', { class: 'num', text: fmtUsd(row.stress.bear_usd) })),
        el('div', null, el('span', { text: 'Bull case (P90)' }), el('b', { class: 'num', text: fmtUsd(row.stress.bull_usd) })),
        el('div', null, el('span', { text: 'TVL falls 30%' }), el('b', { class: 'num', text: fmtUsd(row.stress.tvl_down30_usd) })),
        el('div', null, el('span', { text: 'Growth goes to zero' }), el('b', { class: 'num', text: fmtUsd(row.stress.growth_zero_usd) }))
      ),
      el('p', { class: 'sub', text: 'The bear and bull cases are the bootstrap band. TVL −30% moves the value by the curve’s slope; growth at zero removes the growth multiplier. Nothing here is a prediction of a launch.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Where the value comes from' }),
      compBlock
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan · ' + row.verdict }),
      el('p', { class: 'sub', text: verdictNote + ' Capital $' + row.capital_usd + ' for ' + row.hold_days + ' days · total fees ' + fmtFee(row.total_fees_usd) + ' · implied value per $1 of fees: ' + fmtUsd(row.cover_x) + '.' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    dialog.appendChild(el('p', { class: 'note', text: 'No token is promised and no launch date is claimed. The snapshot records no token for this protocol; that is the record, not a guarantee.' }));
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
    if (state.tab === 'pre-token') {
      shell.appendChild(kpiStrip());
      shell.appendChild(ledgerStrip());
      shell.appendChild(proofGrid());
    }
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') {
      shell.appendChild(modelPanel());
      shell.appendChild(validationPanel());
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
    if (state.scroll === 'table') {
      state.scroll = '';
      var tw = document.querySelector('.table-wrap');
      if (tw) tw.scrollIntoView();
    }
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
