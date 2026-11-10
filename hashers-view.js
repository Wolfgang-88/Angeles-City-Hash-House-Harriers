// Shows all hashers from ACH3_Webpage.js (global "var hashers") on hashers.html, sortable by name, last run or runs, with a name search; 20 hashers per page
(function () {
  var box = document.getElementById('hasher-list');
  if (!box) return;
  var tbody = box.querySelector('tbody');
  var info = document.getElementById('hasher-info');
  var buttons = document.querySelectorAll('.sort-bar .sort-btn');
  var hashers = [];
  var state = { key: 'lastRun', dir: -1 };
  var found = null;   // name of the row found by the search (stays highlighted after re-sorting)
  var lastQ = '', lastIdx = -1;
  var DEFAULT_DIR = { name: 1, lastRun: -1, runs: -1 }; // A–Z, newest first, most runs first

  function cmpName(a, b) {
    return (a.name || '').localeCompare(b.name || '', 'en', { sensitivity: 'base' });
  }
  function cmpNum(k, dir) {
    return function (a, b) {
      var x = a[k], y = b[k];
      var xn = typeof x !== 'number', yn = typeof y !== 'number';
      if (xn || yn) return xn === yn ? cmpName(a, b) : (xn ? 1 : -1); // no value always last
      return (x - y) * dir || cmpName(a, b);
    };
  }

  var PER_PAGE = 50;
  var page = 0;
  var sorted = [];   // current sort order of all hashers (all pages)

  function sortList() {
    sorted = hashers.slice();
    sorted.sort(state.key === 'name'
      ? function (a, b) { return cmpName(a, b) * state.dir; }
      : cmpNum(state.key, state.dir));
  }

  function pageOf(name) {
    for (var i = 0; i < sorted.length; i++) if (sorted[i].name === name) return Math.floor(i / PER_PAGE);
    return -1;
  }

  function render() {
    var pages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
    if (page >= pages) page = pages - 1;
    if (page < 0) page = 0;
    var start = page * PER_PAGE;
    var frag = document.createDocumentFragment();
    sorted.slice(start, start + PER_PAGE).forEach(function (h, i) {
      var tr = document.createElement('tr');
      if (found !== null && h.name === found) tr.className = 'hit';
      [start + i + 1, h.name || '', h.lastRun == null ? '–' : h.lastRun, h.runs == null ? '–' : h.runs]
        .forEach(function (v, c) {
          var td = document.createElement('td');
          td.textContent = v;
          if (c !== 1) td.className = 'num';
          tr.appendChild(td);
        });
      frag.appendChild(tr);
    });
    tbody.replaceChildren(frag);
    buttons.forEach(function (b) {
      var on = b.getAttribute('data-key') === state.key;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.querySelector('.dir').textContent = on ? (state.dir === 1 ? '↑' : '↓') : '';
    });
    renderPager(pages);
  }

  // Pager below the table: ‹ Previous · 1 … 4 5 [6] 7 8 … 49 · Next ›
  var pagerBox = document.createElement('div');
  pagerBox.className = 'pager-wrap';
  box.parentNode.insertBefore(pagerBox, box.nextSibling);

  function goTo(p) {
    page = p;
    render();
    (box.closest('section') || box).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderPager(pages) {
    pagerBox.replaceChildren();
    if (pages < 2) { pagerBox.hidden = true; return; }
    pagerBox.hidden = false;
    var nav = document.createElement('nav');
    nav.className = 'pager';
    nav.setAttribute('aria-label', 'Hasher list pages');
    function btn(label, target, opts) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pager-btn' + (opts && opts.cls ? ' ' + opts.cls : '');
      b.textContent = label;
      if (opts && opts.title) b.setAttribute('aria-label', opts.title);
      if (opts && opts.num && target === page) b.setAttribute('aria-current', 'page');
      if (target < 0 || target >= pages) b.disabled = true;
      else if (target !== page) b.addEventListener('click', function () { goTo(target); });
      nav.appendChild(b);
    }
    function gap() {
      var g = document.createElement('span');
      g.className = 'pager-gap';
      g.textContent = '…';
      g.setAttribute('aria-hidden', 'true');
      nav.appendChild(g);
    }
    btn('‹ Previous', page - 1, { cls: 'pager-step' });
    var from = Math.max(1, page - 2), to = Math.min(pages - 2, page + 2);
    btn('1', 0, { num: true, title: 'Page 1' });
    if (from > 1) gap();
    for (var i = from; i <= to; i++) btn(String(i + 1), i, { num: true, title: 'Page ' + (i + 1) });
    if (to < pages - 2) gap();
    btn(String(pages), pages - 1, { num: true, title: 'Page ' + pages });
    btn('Next ›', page + 1, { cls: 'pager-step' });
    var pi = document.createElement('p');
    pi.className = 'pager-info';
    pi.textContent = 'Hashers ' + (page * PER_PAGE + 1) + '–' + Math.min(sorted.length, (page + 1) * PER_PAGE) + ' of ' + sorted.length;
    pagerBox.appendChild(nav);
    pagerBox.appendChild(pi);
  }

  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.getAttribute('data-key');
      if (state.key === k) state.dir = -state.dir;   // second click reverses the order
      else { state.key = k; state.dir = DEFAULT_DIR[k]; }
      sortList();
      var fp = found !== null ? pageOf(found) : -1;
      page = fp >= 0 ? fp : 0;   // keep the found hasher in view, otherwise back to page 1
      render();
    });
  });

  // Search: exact name first, then names starting with the text, then names containing it.
  // Pressing Search again with the same text jumps to the next match.
  var form = document.getElementById('hasher-search');
  var q = document.getElementById('hasher-q');
  function norm(t) { return (t || '').toLocaleLowerCase('en').trim(); }
  function search() {
    var t = norm(q.value);
    if (!t) return;
    var names = sorted.map(function (h) { return norm(h.name); });
    var hits = [];
    [function (n) { return n === t; },
     function (n) { return n !== t && n.indexOf(t) === 0; },
     function (n) { return n.indexOf(t) > 0; }].forEach(function (test) {
      names.forEach(function (n, i) { if (test(n)) hits.push(i); });
    });
    if (!hits.length) {
      found = null; lastQ = '';
      render();
      info.textContent = 'No hasher found for “' + q.value.trim() + '”.';
      return;
    }
    lastIdx = (t === lastQ) ? (lastIdx + 1) % hits.length : 0;
    lastQ = t;
    var idx = hits[lastIdx];
    found = sorted[idx].name;
    page = Math.floor(idx / PER_PAGE);   // switch to the page with the match
    render();
    var row = tbody.rows[idx - page * PER_PAGE];
    if (row) {
      row.classList.remove('hit'); void row.offsetWidth; row.classList.add('hit'); // restart the flash
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    info.textContent = hits.length > 1
      ? 'Match ' + (lastIdx + 1) + ' of ' + hits.length + ' – press Search again for the next one.'
      : hashers.length + ' hashers';
  }
  if (form) {
    form.addEventListener('submit', function (e) { e.preventDefault(); search(); });
    q.addEventListener('input', function () { if (!q.value) { found = null; lastQ = ''; render(); info.textContent = hashers.length + ' hashers'; } });
  }

  function show(data) {
    hashers = Array.isArray(data) ? data : [];
    info.textContent = hashers.length + ' hashers';
    var dl = document.getElementById('hasher-names');
    if (dl) dl.replaceChildren.apply(dl, hashers.map(function (h) { var o = document.createElement('option'); o.value = h.name || ''; return o; }));
    sortList();
    page = 0;
    render();
  }
  function failed() {
    info.textContent = 'The hasher list could not be loaded.';
  }

  // ACH3_Webpage.js (created by ACH3 Data) defines the global list:  var hashers = [ ... ];
  // It is loaded as a <script>, so it also works offline (file://), where fetch() is blocked.
  // Online a timestamp is added so the browser always gets the latest version.
  var s = document.createElement('script');
  s.src = 'ACH3_Webpage.js' + (/^https?:$/.test(location.protocol) ? '?t=' + Date.now() : '');
  s.onload = function () {
    if (Array.isArray(window.hashers)) show(window.hashers);
    else failed();
  };
  s.onerror = failed;
  document.head.appendChild(s);
})();
