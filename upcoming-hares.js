// Lists all hares from upcoming_hares.json on angeles.html (oldest first; past dates shown muted)
(function () {
  var box = document.getElementById('upcoming-hares');
  if (!box) return;
  function key(d) { // "DD/MM/YYYY" -> 20261024, no/invalid date -> 0
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || '');
    return m ? +(m[3] + m[2] + m[1]) : 0;
  }
  var now = new Date();
  var today = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  function msg(t) { box.innerHTML = ''; var p = document.createElement('p'); p.textContent = t; box.appendChild(p); }

  fetch('upcoming_hares.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      var list = (Array.isArray(data) ? data : [])
        .sort(function (a, b) { return key(a.date) - key(b.date); });
      if (!list.length) return msg('No hares listed yet.');
      var table = document.createElement('table');
      table.className = 'runs-table hares-table';
      table.innerHTML = '<thead><tr><th>Date</th><th>Hares</th></tr></thead><tbody></tbody>';
      var tb = table.querySelector('tbody');
      list.forEach(function (e) {
        var tr = document.createElement('tr');
        if (key(e.date) && key(e.date) < today) tr.className = 'past';
        var hares = Array.isArray(e.hares) ? e.hares : [e.hares];
        [e.date, hares.filter(Boolean).join(' & ') || 'TBA'].forEach(function (v) {
          var td = document.createElement('td');
          td.textContent = v;
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      box.innerHTML = '';
      box.className = 'run-list';
      box.appendChild(table);
    })
    .catch(function () { msg('The hare list could not be loaded.'); });
})();
