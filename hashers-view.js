// Shows all hashers from hasher.json on hashers.html, sortable by name, last run or runs
(function () {
  var box = document.getElementById('hasher-list');
  if (!box) return;
  var tbody = box.querySelector('tbody');
  var info = document.getElementById('hasher-info');
  var buttons = document.querySelectorAll('.sort-btn');
  var hashers = [];
  var state = { key: 'name', dir: 1 };
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

  fetch('hasher.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      hashers = Array.isArray(data) ? data : [];
      info.textContent = hashers.length + ' hashers';
      render();
    })
    .catch(function () {
      info.textContent = 'The hasher list could not be loaded.';
    });
})();
