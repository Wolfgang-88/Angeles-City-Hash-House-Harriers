// Add Run form: validates input and saves it to run.js
(function () {
  var form = document.getElementById('runForm');
  var err = document.getElementById('err');
  var $ = function (id) { return document.getElementById(id); };

  try {
    var who = sessionStorage.getItem('achhh_member');
    if (who) $('hello').textContent = 'Logged in as ' + who;
  } catch (e) {}

  // ---------- Popup (same look as the Log In window) ----------
  function popup(title, text, buttons) {
    return new Promise(function (resolve) {
      var d = document.createElement('dialog');
      d.className = 'modal';
      var h = document.createElement('h2'); h.textContent = title;
      var box = document.createElement('div'); box.className = 'panel';
      String(text).split('\n').forEach(function (line, i) {
        var p = document.createElement('p'); p.textContent = line;
        if (i) p.style.marginTop = '8px';
        box.appendChild(p);
      });
      var bar = document.createElement('div'); bar.className = 'buttons';
      buttons.forEach(function (b) {
        var btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'btn ' + (b.cls || ''); btn.textContent = b.label;
        btn.addEventListener('click', function () { d.close(); d.remove(); resolve(b.value); });
        bar.appendChild(btn);
      });
      box.appendChild(bar);
      d.appendChild(h); d.appendChild(box);
      d.addEventListener('cancel', function (e) { e.preventDefault(); }); // no closing with Esc
      document.body.appendChild(d);
      d.showModal();
    });
  }

  // ---------- Date helpers ----------
  function validDate(s) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (!m) return false;
    var d = +m[1], mo = +m[2], y = +m[3];
    var dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
  }
  function key(s) { var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || ''); return m ? +(m[3] + m[2] + m[1]) : 0; }

  // Auto-insert the slashes while typing (24102026 -> 24/10/2026)
  $('date').addEventListener('input', function (e) {
    if (e.inputType && e.inputType.indexOf('delete') === 0) return;
    var v = this.value.replace(/[^\d]/g, '').slice(0, 8);
    if (v.length > 4) v = v.slice(0, 2) + '/' + v.slice(2, 4) + '/' + v.slice(4);
    else if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
    this.value = v;
  });

  // ---------- run.js file access ----------
  function fileText(runs) {
    runs = runs.slice().sort(function (a, b) {
      return a.hash === b.hash ? key(a.date) - key(b.date) : (a.hash < b.hash ? -1 : 1);
    });
    return '// Run list – written by the "Add Run" form (eingabe.html).\n' +
           'var RUNS = ' + JSON.stringify(runs, null, 2) + ';\n';
  }
  function parseRuns(text) {
    try { var r = new Function(text + '\n;return typeof RUNS !== "undefined" ? RUNS : [];')(); return Array.isArray(r) ? r : []; }
    catch (e) { return null; }
  }

  // Remember the chosen run.js between visits (IndexedDB)
  function db() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('achhh', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function getHandle() {
    return db().then(function (d) {
      return new Promise(function (res) {
        var q = d.transaction('kv').objectStore('kv').get('runFile');
        q.onsuccess = function () { res(q.result || null); };
        q.onerror = function () { res(null); };
      });
    }).catch(function () { return null; });
  }
  function setHandle(h) {
    return db().then(function (d) {
      return new Promise(function (res) {
        var t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(h, 'runFile');
        t.oncomplete = res; t.onerror = res;
      });
    }).catch(function () {});
  }

  var canWrite = 'showOpenFilePicker' in window;

  // Returns a file handle with write permission, or null if the user cancelled
  async function runFileHandle() {
    var h = await getHandle();
    if (h) {
      var p = await h.queryPermission({ mode: 'readwrite' });
      if (p !== 'granted') p = await h.requestPermission({ mode: 'readwrite' });
      if (p === 'granted') {
        try { await h.getFile(); if (h.name.toLowerCase() === 'run.js') return h; } catch (e) {} // file renamed or moved: pick again
      }
    }
    var go = await popup('Select run.js',
      'To save runs, please select the file run.js in your website folder.\nThis is only needed once.',
      [{ label: 'Select run.js', value: true }, { label: 'Cancel', value: false, cls: 'ghost' }]);
    if (!go) return null;
    try {
      var picked = await window.showOpenFilePicker({
        types: [{ description: 'run.js', accept: { 'text/javascript': ['.js'] } }]
      });
      h = picked[0];
    } catch (e) { return null; }
    if (h.name.toLowerCase() !== 'run.js') {
      await popup('Wrong file', 'Please select the file named run.js.', [{ label: 'OK', value: 1 }]);
      return null;
    }
    if ((await h.requestPermission({ mode: 'readwrite' })) !== 'granted') return null;
    await setHandle(h);
    return h;
  }

  async function writeRuns(handle, runs) {
    var text = fileText(runs);
    if (handle) {
      var w = await handle.createWritable();
      await w.write(text);
      await w.close();
    } else { // Browser cannot write files (Firefox, Safari): download instead
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
      a.download = 'run.js';
      document.body.appendChild(a); a.click(); a.remove();
    }
  }

  // ---------- Save ----------
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    err.textContent = '';
    var run = {
      hash: $('hash').value,
      number: $('number').value.trim(),
      date: $('date').value.trim(),
      location: $('location').value.trim(),
      remarks: $('remarks').value.trim(),
      hare: $('hare').value.trim()
    };
    if (!run.number) { err.textContent = 'Please enter the Hash Number.'; $('number').focus(); return; }
    if (!validDate(run.date)) { err.textContent = 'Please enter a valid date as DD/MM/YYYY.'; $('date').focus(); return; }

    try {
      var handle = null, runs;
      if (canWrite) {
        handle = await runFileHandle();
        if (!handle) return;
        runs = parseRuns(await (await handle.getFile()).text());
        if (!runs) { err.textContent = 'run.js could not be read. Please check the file.'; return; }
      } else {
        runs = (typeof RUNS !== 'undefined' && Array.isArray(RUNS)) ? RUNS.slice() : [];
      }

      var idx = runs.findIndex(function (r) { return r.hash === run.hash && String(r.number) === run.number; });
      var action = 'saved';
      if (idx >= 0) {
        var old = runs[idx];
        var choice = await popup('Run already exists',
          run.hash + ' #' + run.number + ' already exists (' + (old.date || 'no date') + (old.location ? ', ' + old.location : '') + ').\n' +
          'Do you want to overwrite it with the new entry or delete it?',
          [{ label: 'Overwrite', value: 'overwrite' },
           { label: 'Delete', value: 'delete', cls: 'danger' },
           { label: 'Cancel', value: 'cancel', cls: 'ghost' }]);
        if (choice === 'cancel') return;
        if (choice === 'overwrite') { runs[idx] = run; action = 'overwritten'; }
        else { runs.splice(idx, 1); action = 'deleted'; }
      } else {
        runs.push(run);
      }

      await writeRuns(handle, runs);

      var msg = run.hash + ' #' + run.number + ' has been ' + action + '.';
      if (!handle) msg += '\nYour browser cannot save directly, so run.js has been downloaded. Please replace the run.js in your website folder with this file.';
      await popup(action === 'deleted' ? 'Deleted' : 'Saved', msg, [{ label: 'OK', value: 1 }]);
      location.href = 'index.html';
    } catch (ex) {
      err.textContent = 'Saving failed: ' + (ex && ex.message ? ex.message : ex);
    }
  });
})();
