// Shows the runs from run.js on index.html and on the hash sub pages
(function () {
  var runs = (typeof RUNS !== 'undefined' && Array.isArray(RUNS)) ? RUNS : [];

  function key(d) { // "DD/MM/YYYY" -> 20261024, no/invalid date -> 0
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || '');
    return m ? +(m[3] + m[2] + m[1]) : 0;
  }
  var now = new Date();
  var today = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  var BIG = 99999999; // runs without a date count as upcoming and come last

  function runsOf(hash) { return runs.filter(function (r) { return r.hash === hash; }); }
  function upcoming(hash) {
    return runsOf(hash).filter(function (r) { return !key(r.date) || key(r.date) >= today; })
      .sort(function (a, b) {
        return (key(a.date) || BIG) - (key(b.date) || BIG) || (+a.number || 0) - (+b.number || 0);
      });
  }
  function past(hash) {
    return runsOf(hash).filter(function (r) { var k = key(r.date); return k && k < today; })
      .sort(function (a, b) { return key(b.date) - key(a.date); });
  }

  // "Next run" boxes: <section class="run" data-hash="Angeles Hash">
  document.querySelectorAll('.run[data-hash]').forEach(function (sec) {
    var next = upcoming(sec.getAttribute('data-hash'))[0];
    if (!next) return;
    var vals = [next.number, next.date, next.location, next.remarks, next.hare];
    sec.querySelectorAll('dd').forEach(function (dd, i) {
      var v = (vals[i] || '').toString().trim();
      dd.textContent = v || 'TBA';
      dd.classList.toggle('tba', !v);
    });
  });

  // Activities box on index.html: next run of every hash, sorted by date.
  // <ul class="act-list"> ; target section on the page: <section class="run" id="..." data-hash="...">
  document.querySelectorAll('.act-list').forEach(function (ul) {
    var items = [];
    document.querySelectorAll('.run[data-hash][id]').forEach(function (sec) {
      var next = upcoming(sec.getAttribute('data-hash'))[0];
      if (next) items.push({ run: next, id: sec.id, name: sec.getAttribute('data-hash') });
    });
    if (!items.length) return; // keep the placeholder text
    items.sort(function (a, b) { return (key(a.run.date) || BIG) - (key(b.run.date) || BIG); });
    ul.innerHTML = '';
    items.forEach(function (it) {
      var li = document.createElement('li');
      var d = document.createElement('span');
      d.className = 'act-date';
      d.textContent = (it.run.date || '').trim() || 'TBA';
      var a = document.createElement('a');
      a.className = 'act-cat';
      a.href = '#' + it.id;
      a.textContent = it.name;
      li.appendChild(d); li.appendChild(a);
      ul.appendChild(li);
    });
  });

  // Run lists on the sub pages: <div class="run-list" data-hash="..." data-when="upcoming|past">
  document.querySelectorAll('.run-list[data-hash]').forEach(function (box) {
    var hash = box.getAttribute('data-hash');
    var list = box.getAttribute('data-when') === 'past' ? past(hash) : upcoming(hash);
    if (!list.length) return; // keep the placeholder text
    var table = document.createElement('table');
    table.className = 'runs-table';
    table.innerHTML = '<thead><tr><th>No.</th><th>Date</th><th>Location</th><th>Hare</th><th>Remarks</th></tr></thead><tbody></tbody>';
    var tb = table.querySelector('tbody');
    list.forEach(function (r) {
      var tr = document.createElement('tr');
      [r.number, r.date || 'TBA', r.location, r.hare, r.remarks].forEach(function (v) {
        var td = document.createElement('td');
        td.textContent = (v || '').toString().trim() || '–';
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    box.innerHTML = '';
    box.appendChild(table);
  });
})();
