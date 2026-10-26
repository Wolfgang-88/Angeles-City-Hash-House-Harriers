// Shows the runs from run.js on index.html and on the hash sub pages
(function () {
  var runs = (typeof RUNS !== 'undefined' && Array.isArray(RUNS)) ? RUNS : [];
  var PAST_PER_PAGE = 10;

  // Date -> 20261024 (sortable number); no/invalid date -> 0.
  // Tolerant: ignores spaces/tabs around the date, accepts "-" or "." as separator,
  // and reads MM/DD/YYYY if the value cannot be DD/MM/YYYY (e.g. 10/18/2026).
  function key(s) {
    var m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(String(s || '').trim());
    if (!m) return 0;
    var d = +m[1], mo = +m[2], y = +m[3];
    if (mo > 12 && d <= 12) { var t = d; d = mo; mo = t; } // MM/DD/YYYY
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return 0;
    return y * 10000 + mo * 100 + d;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function showDate(s) { // always shown as DD/MM/YYYY
    var k = key(s);
    if (!k) return String(s || '').trim();
    return pad(k % 100) + '/' + pad(Math.floor(k / 100) % 100) + '/' + Math.floor(k / 10000);
  }
  var now = new Date();
  var today = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  var BIG = 99999999; // runs without a date count as upcoming and come last

  function runsOf(hash) { return runs.filter(function (r) { return r.hash === hash; }); }
  function isPast(r) { var k = key(r.date); return k > 0 && k < today; }
  // nearest first (for "Next run" and the activities box)
  function upcoming(hash) {
    return runsOf(hash).filter(function (r) { return !isPast(r); })
      .sort(function (a, b) {
        return (key(a.date) || BIG) - (key(b.date) || BIG) || (+a.number || 0) - (+b.number || 0);
      });
  }
  // newest (latest date) first, oldest last
  function newestFirst(a, b) {
    return (key(b.date) || BIG) - (key(a.date) || BIG) || (+b.number || 0) - (+a.number || 0);
  }
  function past(hash) { return runsOf(hash).filter(isPast).sort(newestFirst); }

  function vals(r) { return [r.number, showDate(r.date), r.location, r.remarks, r.hare]; }
  var LABELS = ['Hash Number', 'Date', 'Location', 'Remarks', 'Hare'];

  // "Next run" boxes: <section class="run" data-hash="Angeles Hash">
  document.querySelectorAll('.run[data-hash]').forEach(function (sec) {
    var next = upcoming(sec.getAttribute('data-hash'))[0];
    if (!next) return;
    var v = vals(next);
    sec.querySelectorAll('dd').forEach(function (dd, i) {
      var t = (v[i] || '').toString().trim();
      dd.textContent = t || 'TBA';
      dd.classList.toggle('tba', !t);
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
      d.textContent = showDate(it.run.date) || 'TBA';
      var a = document.createElement('a');
      a.className = 'act-cat';
      a.href = '#' + it.id;
      a.textContent = it.name;
      li.appendChild(d); li.appendChild(a);
      ul.appendChild(li);
    });
  });

  // One run as a block like "Next run"
  function runBlock(r) {
    var dl = document.createElement('dl');
    var v = vals(r);
    LABELS.forEach(function (label, i) {
      var dt = document.createElement('dt'); dt.textContent = label;
      var dd = document.createElement('dd');
      var t = (v[i] || '').toString().trim();
      dd.textContent = t || 'TBA';
      if (!t) dd.className = 'tba';
      dl.appendChild(dt); dl.appendChild(dd);
    });
    return dl;
  }

  // Run lists on the sub pages: <div class="run-list" data-hash="..." data-when="upcoming|past">
  // Both lists: newest date on top, oldest at the bottom. Past runs: 10 per page.
  document.querySelectorAll('.run-list[data-hash]').forEach(function (box) {
    var hash = box.getAttribute('data-hash');
    var isPastList = box.getAttribute('data-when') === 'past';
    var list = isPastList ? past(hash) : upcoming(hash).slice().sort(newestFirst);
    if (!list.length) return; // keep the placeholder text
    var perPage = isPastList ? PAST_PER_PAGE : list.length;
    var pages = Math.ceil(list.length / perPage);

    function render(page, scroll) {
      box.innerHTML = '';
      list.slice(page * perPage, (page + 1) * perPage).forEach(function (r) { box.appendChild(runBlock(r)); });
      if (pages > 1) box.appendChild(pager(page));
      if (scroll) {
        var sec = box.closest('section') || box;
        sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    function pager(page) {
      var nav = document.createElement('nav');
      nav.className = 'pager';
      nav.setAttribute('aria-label', 'Past runs pages');
      function btn(label, target, opts) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'pager-btn' + (opts && opts.cls ? ' ' + opts.cls : '');
        b.textContent = label;
        if (opts && opts.title) b.setAttribute('aria-label', opts.title);
        if (target === page) b.setAttribute('aria-current', 'page');
        if (target < 0 || target >= pages || (opts && opts.disabled)) b.disabled = true;
        else if (target !== page) b.addEventListener('click', function () { render(target, true); });
        nav.appendChild(b);
      }
      btn('‹ Newer', page - 1, { cls: 'pager-step', disabled: page === 0 });
      for (var i = 0; i < pages; i++) btn(String(i + 1), i, { title: 'Page ' + (i + 1) });
      btn('Older ›', page + 1, { cls: 'pager-step', disabled: page === pages - 1 });
      var info = document.createElement('p');
      info.className = 'pager-info';
      info.textContent = 'Runs ' + (page * perPage + 1) + '–' + Math.min(list.length, (page + 1) * perPage) + ' of ' + list.length;
      var wrap = document.createElement('div');
      wrap.className = 'pager-wrap';
      wrap.appendChild(nav); wrap.appendChild(info);
      return wrap;
    }

    render(0, false);
  });
})();
