// Add Run form
// - Members: the entry is sent to the webmaster's Dropbox (dropbox.js)
// - Webmaster (webmaster: true in pw.js): saves directly to run.js and can
//   import the entries sent by members ("Einträge übernehmen")
(function () {
  var form = document.getElementById('runForm');
  var err = document.getElementById('err');
  var $ = function (id) { return document.getElementById(id); };

  var who = '';
  try { who = sessionStorage.getItem('achhh_member') || ''; } catch (e) {}
  if (who) $('hello').textContent = 'Logged in as ' + who;

  var isWebmaster = typeof MEMBERS !== 'undefined' && MEMBERS.some(function (m) {
    return m.webmaster && m.name.toLowerCase() === who.toLowerCase();
  });

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
  var OK = [{ label: 'OK', value: 1 }];
  function msgOf(e) { return e && e.message ? e.message : String(e); }

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

  // ---------- run.js text ----------
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
  function findRun(runs, run) {
    return runs.findIndex(function (r) { return r.hash === run.hash && String(r.number) === String(run.number); });
  }

  // ---------- Remember chosen files/folders between visits (IndexedDB) ----------
  function db() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('achhh', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function getHandle(name) {
    return db().then(function (d) {
      return new Promise(function (res) {
        var q = d.transaction('kv').objectStore('kv').get(name);
        q.onsuccess = function () { res(q.result || null); };
        q.onerror = function () { res(null); };
      });
    }).catch(function () { return null; });
  }
  function setHandle(h, name) {
    return db().then(function (d) {
      return new Promise(function (res) {
        var t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(h, name);
        t.oncomplete = res; t.onerror = res;
      });
    }).catch(function () {});
  }
  async function permitted(h, ask) {
    try {
      var p = await h.queryPermission({ mode: 'readwrite' });
      if (p !== 'granted' && ask) p = await h.requestPermission({ mode: 'readwrite' });
      return p === 'granted';
    } catch (e) { return false; }
  }

  var canWrite = 'showOpenFilePicker' in window;

  // run.js in the website folder
  async function runFileHandle() {
    var h = await getHandle('runFile');
    if (h && await permitted(h, true)) {
      try { await h.getFile(); if (h.name.toLowerCase() === 'run.js') return h; } catch (e) {} // renamed or moved: pick again
    }
    var go = await popup('run.js auswählen',
      'Bitte einmalig die Datei run.js im Website-Ordner auswählen.',
      [{ label: 'run.js auswählen', value: true }, { label: 'Abbrechen', value: false, cls: 'ghost' }]);
    if (!go) return null;
    try {
      h = (await window.showOpenFilePicker({ types: [{ description: 'run.js', accept: { 'text/javascript': ['.js'] } }] }))[0];
    } catch (e) { return null; }
    if (h.name.toLowerCase() !== 'run.js') {
      await popup('Falsche Datei', 'Bitte die Datei run.js auswählen.', OK);
      return null;
    }
    if (!(await permitted(h, true))) return null;
    await setHandle(h, 'runFile');
    return h;
  }

  // Copy of run.js on the Desktop
  async function desktopHandle() {
    var h = await getHandle('desktopFile');
    if (h && await permitted(h, true)) return h;
    var go = await popup('Kopie auf den Desktop',
      'run.js wird zusätzlich auf dem Desktop gespeichert.\nBitte einmalig den Speicherort bestätigen (Desktop, Dateiname run.js).',
      [{ label: 'Desktop wählen', value: true }, { label: 'Jetzt nicht', value: false, cls: 'ghost' }]);
    if (!go) return null;
    try {
      h = await window.showSaveFilePicker({
        suggestedName: 'run.js', startIn: 'desktop',
        types: [{ description: 'run.js', accept: { 'text/javascript': ['.js'] } }]
      });
    } catch (e) { return null; }
    await setHandle(h, 'desktopFile');
    return h;
  }

  async function writeFile(handle, text) {
    var w = await handle.createWritable();
    await w.write(text);
    await w.close();
  }

  // Webmaster: write run.js (+ Desktop copy); without file access: download
  async function writeRuns(handle, runs) {
    var text = fileText(runs);
    if (handle) {
      await writeFile(handle, text);
      try {
        var dh = await desktopHandle();
        if (dh) await writeFile(dh, text);
      } catch (e) {
        await popup('Desktop-Kopie fehlgeschlagen', 'run.js wurde gespeichert, aber die Kopie auf dem Desktop nicht.\n' + msgOf(e), OK);
      }
    } else {
      download('run.js', text, 'text/javascript');
    }
  }
  function download(name, text, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
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
      if (isWebmaster) await saveDirect(run);
      else await sendToWebmaster(run);
    } catch (ex) {
      err.textContent = 'Saving failed: ' + msgOf(ex);
    }
  });

  // Asks what to do if the run already exists. Returns 'save' | 'delete' | null (cancel)
  async function existingChoice(runs, run) {
    var idx = findRun(runs, run);
    if (idx < 0) return { type: 'save', idx: -1 };
    var old = runs[idx];
    var choice = await popup('Run already exists',
      run.hash + ' #' + run.number + ' already exists (' + (old.date || 'no date') + (old.location ? ', ' + old.location : '') + ').\n' +
      'Do you want to overwrite it with the new entry or delete it?',
      [{ label: 'Overwrite', value: 'save' },
       { label: 'Delete', value: 'delete', cls: 'danger' },
       { label: 'Cancel', value: null, cls: 'ghost' }]);
    return choice ? { type: choice, idx: idx } : null;
  }

  // Member: send the entry to the webmaster's Dropbox
  async function sendToWebmaster(run) {
    var published = (typeof RUNS !== 'undefined' && Array.isArray(RUNS)) ? RUNS : [];
    var c = await existingChoice(published, run);
    if (!c) return;
    var entry = { type: c.type, run: run, member: who, sentAt: new Date().toISOString() };
    for (;;) {
      try {
        await DROPBOX.send(entry);
        await popup('Sent', run.hash + ' #' + run.number + (c.type === 'delete' ? ' (delete)' : '') +
          ' has been sent to the webmaster.\nIt will appear on the website as soon as the webmaster has published it.', OK);
        location.href = 'index.html';
        return;
      } catch (ex) {
        var next = await popup('Sending failed',
          'Your entry could not be sent:\n' + msgOf(ex) + '\nPlease try again. If it keeps failing, download the entry and send the file to the webmaster.',
          [{ label: 'Try again', value: 'again' }, { label: 'Download entry', value: 'dl', cls: 'ghost' }, { label: 'Cancel', value: 'x', cls: 'ghost' }]);
        if (next === 'dl') { download('entry_' + run.hash.split(' ')[0] + '-' + run.number + '.json', JSON.stringify(entry, null, 2), 'application/json'); return; }
        if (next !== 'again') return;
      }
    }
  }

  // Webmaster: save directly to run.js
  async function saveDirect(run) {
    var handle = null, runs;
    if (canWrite) {
      handle = await runFileHandle();
      if (!handle) return;
      runs = parseRuns(await (await handle.getFile()).text());
      if (!runs) { err.textContent = 'run.js could not be read. Please check the file.'; return; }
    } else {
      runs = (typeof RUNS !== 'undefined' && Array.isArray(RUNS)) ? RUNS.slice() : [];
    }
    var c = await existingChoice(runs, run);
    if (!c) return;
    var action = 'saved';
    if (c.idx >= 0 && c.type === 'save') { runs[c.idx] = run; action = 'overwritten'; }
    else if (c.type === 'delete') { runs.splice(c.idx, 1); action = 'deleted'; }
    else runs.push(run);

    await writeRuns(handle, runs);
    var msg = run.hash + ' #' + run.number + ' has been ' + action + '.';
    if (!handle) msg += '\nYour browser cannot save directly, so run.js has been downloaded. Please replace the run.js in your website folder with this file.';
    await popup(action === 'deleted' ? 'Deleted' : 'Saved', msg, OK);
    location.href = 'index.html';
  }

  // ---------- Webmaster: import entries from the Dropbox folder ----------
  var INBOX_HINT = 'D:\\Dropbox\\Apps\\ACH3_upload';

  async function inboxHandle(ask) {
    var h = await getHandle('inboxDir');
    if (h && await permitted(h, ask)) return h;
    if (!ask) return null;
    var go = await popup('Dropbox-Ordner auswählen',
      'Bitte einmalig den Ordner auswählen, in dem die Meldungen der Mitglieder ankommen:\n' + INBOX_HINT,
      [{ label: 'Ordner auswählen', value: true }, { label: 'Abbrechen', value: false, cls: 'ghost' }]);
    if (!go) return null;
    try { h = await window.showDirectoryPicker({ id: 'achhh-inbox', mode: 'readwrite' }); }
    catch (e) { return null; }
    await setHandle(h, 'inboxDir');
    return h;
  }

  async function readInbox(dir) {
    var list = [], bad = [];
    for await (var pair of dir.entries()) {
      var name = pair[0], h = pair[1];
      if (h.kind !== 'file' || !/\.json$/i.test(name)) continue;
      try {
        var e = JSON.parse(await (await h.getFile()).text());
        if (!e || !e.run || !e.run.hash || !e.run.number || (e.type !== 'save' && e.type !== 'delete')) throw 0;
        list.push({ name: name, handle: h, entry: e });
      } catch (x) { bad.push(name); }
    }
    list.sort(function (a, b) { return (a.entry.sentAt || a.name) < (b.entry.sentAt || b.name) ? -1 : 1; });
    return { list: list, bad: bad };
  }

  async function moveToDone(dir, item) {
    var done = await dir.getDirectoryHandle('erledigt', { create: true });
    var target = await done.getFileHandle(item.name, { create: true });
    await writeFile(target, await (await item.handle.getFile()).text());
    await dir.removeEntry(item.name);
  }

  async function importEntries() {
    if (!canWrite) { await popup('Nicht möglich', 'Das Übernehmen funktioniert nur in Chrome oder Edge.', OK); return; }
    var dir = await inboxHandle(true);
    if (!dir) return;
    var inbox = await readInbox(dir);
    if (!inbox.list.length) {
      await popup('Keine neuen Einträge', 'Im Ordner „' + dir.name + '“ liegen keine neuen Meldungen.' +
        (inbox.bad.length ? '\nNicht lesbar: ' + inbox.bad.join(', ') : ''), OK);
      return showPending();
    }
    var handle = await runFileHandle();
    if (!handle) return;
    var runs = parseRuns(await (await handle.getFile()).text());
    if (!runs) { await popup('Fehler', 'run.js konnte nicht gelesen werden.', OK); return; }

    var lines = inbox.list.map(function (it) {
      var e = it.entry, idx = findRun(runs, e.run), what;
      if (e.type === 'delete') {
        if (idx >= 0) { runs.splice(idx, 1); what = 'gelöscht'; } else what = 'löschen – war nicht vorhanden';
      } else if (idx >= 0) { runs[idx] = e.run; what = 'geändert'; }
      else { runs.push(e.run); what = 'neu'; }
      return '• ' + e.run.hash + ' #' + e.run.number + ' (' + (e.run.date || 'ohne Datum') + ') – ' + what +
        (e.member ? ', von ' + e.member : '');
    });
    var ok = await popup('Einträge übernehmen',
      inbox.list.length + ' Meldung(en) gefunden:\n' + lines.join('\n') +
      (inbox.bad.length ? '\nNicht lesbar (bleiben liegen): ' + inbox.bad.join(', ') : '') +
      '\nIn run.js übernehmen?',
      [{ label: 'Übernehmen', value: true }, { label: 'Abbrechen', value: false, cls: 'ghost' }]);
    if (!ok) return;

    await writeRuns(handle, runs);
    var notMoved = [];
    for (var i = 0; i < inbox.list.length; i++) {
      try { await moveToDone(dir, inbox.list[i]); } catch (x) { notMoved.push(inbox.list[i].name); }
    }
    await popup('Übernommen', inbox.list.length + ' Meldung(en) wurden in run.js übernommen und in den Unterordner „erledigt“ verschoben.' +
      (notMoved.length ? '\nKonnten nicht verschoben werden (bitte von Hand löschen): ' + notMoved.join(', ') : ''), OK);
    location.reload();
  }

  async function showPending() {
    var el = $('pending');
    var dir = await inboxHandle(false);
    if (!dir) { el.textContent = 'Klicken, um die Meldungen der Mitglieder zu prüfen.'; return; }
    try {
      var n = (await readInbox(dir)).list.length;
      el.textContent = n ? n + ' neue Meldung(en) warten auf Übernahme.' : 'Keine neuen Meldungen.';
    } catch (e) { el.textContent = ''; }
  }

  if (isWebmaster) {
    $('webmaster').hidden = false;
    $('importBtn').addEventListener('click', function () {
      importEntries().catch(function (e) { popup('Fehler', msgOf(e), OK); });
    });
    showPending();
  }
})();
