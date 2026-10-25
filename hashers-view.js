// Shows all hashers from hasher.json on hashers.html, sortable by name, last run or runs, with a name search
(function () {
  var box = document.getElementById('hasher-list');
  if (!box) return;
  var tbody = box.querySelector('tbody');
  var info = document.getElementById('hasher-info');
  var buttons = document.querySelectorAll('.sort-bar .sort-btn');
  var hashers = [];
  var state = { key: 'name', dir: 1 };
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

  function render() {
    var list = hashers.slice();
    list.sort(state.key === 'name'
      ? function (a, b) { return cmpName(a, b) * state.dir; }
      : cmpNum(state.key, state.dir));
    var frag = document.createDocumentFragment();
    list.forEach(function (h, i) {
      var tr = document.createElement('tr');
      if (found !== null && h.name === found) tr.className = 'hit';
      [i + 1, h.name || '', h.lastRun == null ? '–' : h.lastRun, h.runs == null ? '–' : h.runs]
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
  }

  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.getAttribute('data-key');
      if (state.key === k) state.dir = -state.dir;   // second click reverses the order
      else { state.key = k; state.dir = DEFAULT_DIR[k]; }
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
    var rows = Array.prototype.slice.call(tbody.rows);
    var names = rows.map(function (r) { return norm(r.cells[1].textContent); });
    var hits = [];
    [function (n) { return n === t; },
     function (n) { return n !== t && n.indexOf(t) === 0; },
     function (n) { return n.indexOf(t) > 0; }].forEach(function (test) {
      names.forEach(function (n, i) { if (test(n)) hits.push(i); });
    });
    rows.forEach(function (r) { r.classList.remove('hit'); });
    if (!hits.length) {
      found = null; lastQ = '';
      info.textContent = 'No hasher found for “' + q.value.trim() + '”.';
      return;
    }
    lastIdx = (t === lastQ) ? (lastIdx + 1) % hits.length : 0;
    lastQ = t;
    var row = rows[hits[lastIdx]];
    found = row.cells[1].textContent;
    row.classList.remove('hit'); void row.offsetWidth; row.classList.add('hit'); // restart the flash
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    info.textContent = hits.length > 1
      ? 'Match ' + (lastIdx + 1) + ' of ' + hits.length + ' – press Search again for the next one.'
      : hashers.length + ' hashers';
  }
  if (form) {
    form.addEventListener('submit', function (e) { e.preventDefault(); search(); });
    q.addEventListener('input', function () { if (!q.value) { found = null; lastQ = ''; render(); info.textContent = hashers.length + ' hashers'; } });
  }

  fetch('hasher.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      hashers = Array.isArray(data) ? data : [];
      info.textContent = hashers.length + ' hashers';
      var dl = document.getElementById('hasher-names');
      if (dl) dl.replaceChildren.apply(dl, hashers.map(function (h) { var o = document.createElement('option'); o.value = h.name || ''; return o; }));
      render();
    })
    .catch(function () {
      info.textContent = 'The hasher list could not be loaded.';
    });
})();
