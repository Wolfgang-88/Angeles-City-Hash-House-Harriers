// Add Run form
// - Members: the entry is sent to the webmaster's Dropbox (dropbox.js)
// - Webmaster (webmaster: true in pw.js): saves directly to run.js and can
//   import the entries sent by members ("Einträge übernehmen")
// - Moderator (moderator: true in pw.js): like the webmaster, saves and imports
//   directly into run.js on GitHub (moderator password, set up by the webmaster
//   on github-setup.html) – but without "GitHub einrichten" / "Dropbox einrichten"
// - Only upcoming runs can be added, changed or deleted – past runs are locked
(function () {
  var form = document.getElementById('runForm');
  var err = document.getElementById('err');
  var $ = function (id) { return document.getElementById(id); };

  var who = '';
  try { who = sessionStorage.getItem('achhh_member') || ''; } catch (e) {}
  if (who) $('hello').textContent = 'Logged in as ' + who;

  var me = (typeof MEMBERS !== 'undefined' ? MEMBERS : []).filter(function (m) {
    return m.name.toLowerCase() === who.toLowerCase();
  })[0] || null;
  var isWebmaster = !!(me && me.webmaster);
  var isModerator = !isWebmaster && !!(me && me.moderator);
  var canPublish = isWebmaster || isModerator;   // saves directly instead of sending to the webmaster
  var ghRole = isWebmaster ? 'webmaster' : 'moderator';
  var roleName = isWebmaster ? 'Webmaster' : 'Moderator';
  // Webmaster/Moderator and GitHub set up (github-setup.html): save run.js directly on GitHub
  function useGitHub() { return canPublish && typeof GITHUB !== 'undefined' && GITHUB.configured(ghRole); }

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

  // Asks for the webmaster password and unlocks GitHub for this browser tab.
  // Returns true when unlocked, false when cancelled.
  function ensureUnlocked() {
    if (GITHUB.unlocked()) return Promise.resolve(true);
    return new Promise(function (resolve) {
      var d = document.createElement('dialog');
      d.className = 'modal';
      d.innerHTML = '<h2>' + roleName + '-Passwort</h2><form class="panel form" autocomplete="off">' +
        '<p>Zum Speichern auf GitHub bitte das ' + roleName + '-Passwort eingeben (einmal pro Sitzung).</p>' +
        '<input type="password" aria-label="' + roleName + '-Passwort" style="margin-top:10px" autocomplete="current-password">' +
        '<p class="err" role="alert"></p>' +
        '<div class="buttons"><button class="btn" type="submit">Entsperren</button>' +
        '<button class="btn ghost" type="button">Abbrechen</button></div></form>';
      var f = d.querySelector('form'), inp = d.querySelector('input'), e = d.querySelector('.err');
      var btns = d.querySelectorAll('button');
      function done(v) { d.close(); d.remove(); resolve(v); }
      btns[1].addEventListener('click', function () { done(false); });
      f.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        if (!inp.value) return;
        btns[0].disabled = true; e.textContent = 'Prüfe …';
        try { await GITHUB.unlock(inp.value, ghRole); done(true); }
        catch (x) { e.textContent = msgOf(x); inp.select(); }
        finally { btns[0].disabled = false; }
      });
      d.addEventListener('cancel', function (ev) { ev.preventDefault(); });
      document.body.appendChild(d);
      d.showModal();
      inp.focus();
    });
  }
  // No internet: the browsers report this as TypeError "Failed to fetch" (Chrome/Edge),
  // "NetworkError when attempting to fetch resource" (Firefox) or "Load failed" (Safari)
  function isOffline(e) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    var m = e && e.message ? String(e.message) : '';
    return e instanceof TypeError && /failed to fetch|networkerror|load failed|network request failed/i.test(m);
  }
  var OFFLINE_MSG = 'Keine Internetverbindung – bitte später erneut versuchen.';
  function msgOf(e) { return isOffline(e) ? OFFLINE_MSG : e && e.message ? e.message : String(e); }

  // ---------- Date helpers ----------
  function validDate(s) { // exactly DD/MM/YYYY and a real calendar day
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (!m) return false;
    var d = +m[1], mo = +m[2], y = +m[3];
    var dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
  }
  // Date of a stored run -> 20261024; tolerant like runs-view.js (spaces/tabs, MM/DD/YYYY)
  function key(s) {
    var m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(String(s || '').trim());
    if (!m) return 0;
    var d = +m[1], mo = +m[2], y = +m[3];
    if (mo > 12 && d <= 12) { var t = d; d = mo; mo = t; }
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return 0;
    return y * 10000 + mo * 100 + d;
  }
  function todayKey() { var n = new Date(); return n.getFullYear() * 10000 + (n.getMonth() + 1) * 100 + n.getDate(); }
  function isPastRun(r) { var k = key(r && r.date); return k > 0 && k < todayKey(); }
  var MAX_YEARS_AHEAD = 2;
  // Returns an error text, or '' if the date is fine (valid, today or later, not too far ahead)
  function dateError(s) {
    if (!s) return 'Please enter the date (DD/MM/YYYY).';
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return 'Please enter the date as DD/MM/YYYY, e.g. 01/11/2026.';
    if (!validDate(s)) {
      var mo = +s.slice(3, 5);
      if (mo < 1 || mo > 12) return s + ' is not a valid date (month ' + s.slice(3, 5) + ' does not exist). Format: DD/MM/YYYY.';
      return s + ' is not a valid date (day ' + s.slice(0, 2) + ' does not exist in month ' + s.slice(3, 5) + ').';
    }
    var k = key(s);
    if (k < todayKey()) return s + ' is in the past. Only upcoming runs can be added or edited.';
    if (Math.floor(k / 10000) > new Date().getFullYear() + MAX_YEARS_AHEAD) return s + ' is too far in the future – please check the year.';
    return '';
  }
  function pastMsg(r) {
    return r.hash + ' #' + r.number + ' (' + (String(r.date || '').trim()) + ') is a past run. Past runs cannot be edited or deleted.';
  }

  // Auto-insert the slashes while typing (24102026 -> 24/10/2026)
  $('date').addEventListener('input', function (e) {
    if (e.inputType && e.inputType.indexOf('delete') === 0) return;
    var v = this.value.replace(/[^\d]/g, '').slice(0, 8);
    if (v.length > 4) v = v.slice(0, 2) + '/' + v.slice(2, 4) + '/' + v.slice(4);
    else if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
    this.value = v;
  });

  // Check the date as soon as the field is left
  $('date').addEventListener('blur', function () {
    var v = this.value.trim();
    var msg = v ? dateError(v) : '';
    this.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg) err.textContent = msg;
    else if (/date|DD\/MM\/YYYY/.test(err.textContent)) err.textContent = '';
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

  // ---------- Save (only with the Save button – Enter does not save) ----------
  form.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') e.preventDefault();
  });
  var saveBtn = $('saveBtn'), delBtn = $('delBtn'), busy = false;
  function setBusy(on) {
    busy = on;
    saveBtn.disabled = on;
    delBtn.disabled = on;
    saveBtn.textContent = on ? 'Saving …' : 'Save';
  }
  function resetForm() {
    FIELDS.forEach(function (id) { $(id).value = ''; });
    clearLoaded();
    $('number').focus();
  }

  // ---------- Load an existing run when its Hash Number is typed ----------
  // Source: run.js on GitHub (always the current version).
  // Only if GitHub cannot be reached: run.js on this computer / the run list of this page.
  var GH_REPO = 'Wolfgang-88/Angeles-City-Hash-House-Harriers', GH_BRANCH = 'main', GH_FILE = 'run.js';
  // GitHub API: delivers the current file (no 5-minute cache like raw.githubusercontent.com)
  var GH_API_URL = 'https://api.github.com/repos/' + GH_REPO + '/contents/' + GH_FILE + '?ref=' + GH_BRANCH;
  // Fallback if the API refuses (limit: 60 requests per hour) – may be up to 5 minutes old
  var GH_RAW_URL = 'https://raw.githubusercontent.com/' + GH_REPO + '/' + GH_BRANCH + '/' + GH_FILE;
  var FIELDS = ['date', 'location', 'remarks', 'hare'];
  var loadedKey = null;   // "<hash>#<number>" of the run currently shown in the form
  var loadedVals = null;  // field values as loaded (to see if the user changed them)
  var skipKey = null;     // run the user chose not to load ("Keep my input")
  var askingKey = null;   // run for which the "Load?" popup is open
  var lookupSeq = 0, lookupTimer = null;

  function runKey(hash, number) { return hash + '#' + String(number).trim(); }
  function fieldVals() { var v = {}; FIELDS.forEach(function (id) { v[id] = $(id).value; }); return v; }
  function anyInput() { return FIELDS.some(function (id) { return $(id).value.trim() !== ''; }); }
  function unchangedSinceLoad() {
    if (!loadedVals) return false;
    return FIELDS.every(function (id) { return $(id).value === loadedVals[id]; });
  }
  function showLoaded(text) { var el = $('loaded'); el.textContent = text; el.hidden = !text; }
  function clearLoaded() { loadedKey = null; loadedVals = null; skipKey = null; showLoaded(''); delBtn.hidden = true; setLocked(false); }
  // Past run typed in: form is locked (no Save), only another number can be entered
  function setLocked(on) {
    form.classList.toggle('locked', on);
    FIELDS.forEach(function (id) { $(id).disabled = on; });
    saveBtn.disabled = on || busy;
  }

  // run.js from GitHub. Kept for 20 s so typing does not cause a download for
  // every key. Returns the run list, or null if GitHub is not reachable.
  var online = { at: 0, runs: null, pending: null };
  function b64utf8(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }
  function fromApi() {
    // Webmaster with access code: read with the code (no limit of 60 requests per hour)
    if (useGitHub() && GITHUB.unlocked()) return GITHUB.read(GH_FILE).then(function (f) { return f.text; });
    return fetch(GH_API_URL + '&t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { if (!j || !j.content) throw new Error('no content'); return b64utf8(j.content); });
  }
  function fromRaw() {
    return fetch(GH_RAW_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
  }
  function onlineRuns(fresh) {
    if (!fresh && online.runs && Date.now() - online.at < 20000) return Promise.resolve(online.runs);
    if (online.pending) return online.pending;
    online.pending = fromApi().catch(fromRaw)
      .then(function (t) { var r = parseRuns(t); if (!r) throw new Error('run.js unreadable'); online.runs = r; online.at = Date.now(); return r; })
      .catch(function () { return null; })
      .then(function (r) { online.pending = null; return r; });
    return online.pending;
  }

  async function localRuns() {
    if (isWebmaster && canWrite) {
      try {
        var h = await getHandle('runFile');
        if (h && await permitted(h, false)) { // no prompt while typing
          var r = parseRuns(await (await h.getFile()).text());
          if (r) return r;
        }
      } catch (e) {}
    }
    return (typeof RUNS !== 'undefined' && Array.isArray(RUNS)) ? RUNS : [];
  }

  // Returns { run, online: true|false } – run is null if the number does not exist
  async function findExisting(hash, number) {
    var q = { hash: hash, number: number };
    var on = await onlineRuns();
    if (on) { var i = findRun(on, q); return { run: i >= 0 ? on[i] : null, online: true }; }
    var loc = await localRuns(); // GitHub not reachable
    var j = findRun(loc, q);
    return { run: j >= 0 ? loc[j] : null, online: false };
  }

  function fill(run, isOnline) {
    FIELDS.forEach(function (id) { $(id).value = run[id] == null ? '' : String(run[id]); });
    loadedKey = runKey(run.hash, run.number);
    loadedVals = fieldVals();
    skipKey = null;
    showLoaded(run.hash + ' #' + run.number + ' already exists – the data has been loaded from ' +
      (isOnline ? 'run.js on GitHub' : 'the local run.js (GitHub could not be reached)') + '. Edit the fields and click Save.');
    delBtn.hidden = false;
  }

  async function lookup() {
    var seq = ++lookupSeq;
    var hash = $('hash').value, number = $('number').value.trim();
    var k = runKey(hash, number);
    if (k === loadedKey || k === skipKey || k === askingKey) return;

    var found = null;
    if (number) {
      found = await findExisting(hash, number);
      if (seq !== lookupSeq) return; // a newer lookup has started meanwhile
    }
    var run = found && found.run;

    // A past run was shown before: empty the form again and unlock it
    if (form.classList.contains('locked')) {
      FIELDS.forEach(function (id) { $(id).value = ''; });
      clearLoaded();
    }

    if (run && isPastRun(run)) {
      // Past run: do not load it for editing
      if (loadedKey && unchangedSinceLoad()) FIELDS.forEach(function (id) { $(id).value = ''; });
      clearLoaded();
      FIELDS.forEach(function (id) { $(id).value = id === 'date' ? String(run.date || '').trim() : ''; });
      showLoaded(pastMsg(run) + ' Please enter the number of an upcoming run or a new run.');
      setLocked(true);
      return;
    }

    if (run) {
      // Form holds the user's own input (not a loaded run): ask before replacing it
      if (anyInput() && !unchangedSinceLoad()) {
        askingKey = k;
        var load = await popup('Run already exists',
          hash + ' #' + number + ' already exists (' + (run.date || 'no date') + ').\nLoad the stored data into the form? Your current input will be replaced.',
          [{ label: 'Load', value: true }, { label: 'Keep my input', value: false, cls: 'ghost' }]);
        askingKey = null;
        if (k !== runKey($('hash').value, $('number').value)) return; // number changed meanwhile
        if (!load) {
          loadedKey = null; loadedVals = null; skipKey = k; delBtn.hidden = true;
          showLoaded(hash + ' #' + number + ' already exists – saving will overwrite it with your input.');
          return;
        }
      }
      fill(run, found.online);
    } else {
      // Number not found: remove the data of a previously loaded run, unless it was edited
      if (loadedKey && unchangedSinceLoad()) FIELDS.forEach(function (id) { $(id).value = ''; });
      clearLoaded();
    }
  }
  function lookupSoon(delay) {
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(function () { lookup().catch(function () {}); }, delay);
  }
  $('number').addEventListener('input', function () { lookupSoon(500); });
  $('number').addEventListener('change', function () { lookupSoon(0); });
  $('hash').addEventListener('change', function () { lookupSoon(0); });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var mode = e.submitter === saveBtn ? 'save' : e.submitter === delBtn ? 'delete' : null;
    if (!mode || busy) return; // ignore anything but a click on Save / Delete, and double clicks
    clearTimeout(lookupTimer);
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
    if (form.classList.contains('locked')) { err.textContent = 'This is a past run – it cannot be edited.'; return; }
    if (mode === 'save') {
      var dErr = dateError(run.date);
      if (dErr) { err.textContent = dErr; $('date').setAttribute('aria-invalid', 'true'); $('date').focus(); return; }
    }

    setBusy(true);
    try {
      if (canPublish) await saveDirect(run, mode);
      else await sendToWebmaster(run, mode);
    } catch (ex) {
      err.textContent = 'Saving failed: ' + msgOf(ex);
    } finally {
      setBusy(false);
    }
  });

  // Decides what happens with the entry. Returns { type: 'save' | 'delete', idx } or null (cancel)
  async function existingChoice(runs, run, mode) {
    var idx = findRun(runs, run);
    if (idx >= 0 && isPastRun(runs[idx])) {
      await popup('Past run', pastMsg(runs[idx]), OK);
      return null;
    }
    if (mode === 'delete') {
      if (idx < 0) { await popup('Not found', run.hash + ' #' + run.number + ' does not exist.', OK); return null; }
      var del = await popup('Delete run',
        'Do you really want to delete ' + run.hash + ' #' + run.number + ' (' + (runs[idx].date || 'no date') + ')?',
        [{ label: 'Delete', value: true, cls: 'danger' }, { label: 'Cancel', value: false, cls: 'ghost' }]);
      return del ? { type: 'delete', idx: idx } : null;
    }
    if (idx < 0) return { type: 'save', idx: -1 };
    // The run was loaded into the form and edited: just save the changes
    if (loadedKey === runKey(run.hash, run.number)) return { type: 'save', idx: idx };
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
  async function sendToWebmaster(run, mode) {
    var published = (await onlineRuns(true)) || ((typeof RUNS !== 'undefined' && Array.isArray(RUNS)) ? RUNS : []);
    var c = await existingChoice(published, run, mode);
    if (!c) return;
    var entry = { type: c.type, run: run, member: who, sentAt: new Date().toISOString() };
    for (;;) {
      try {
        await DROPBOX.send(entry);
        await popup('Sent', run.hash + ' #' + run.number + (c.type === 'delete' ? ' (delete)' : '') +
          ' has been sent to the webmaster.\nIt will appear on the website as soon as the webmaster has published it.', OK);
        resetForm();
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

  // ---------- Webmaster: publish run.js directly on GitHub ----------
  // file = { text, sha } as read from GitHub; apply(runs) makes the change in the list.
  // If run.js was changed on GitHub in the meantime, it is read again and the change is applied once more.
  async function commitToGitHub(file, apply, message) {
    for (var attempt = 0; attempt < 3; attempt++) {
      var runs = parseRuns(file.text);
      if (!runs) throw new Error('run.js on GitHub could not be read. Please check the file.');
      apply(runs);
      var text = fileText(runs);
      try {
        await GITHUB.write(GH_FILE, text, file.sha, typeof message === 'function' ? message() : message);
      } catch (e) {
        if (!e.conflict) throw e;
        file = await GITHUB.read(GH_FILE);
        continue;
      }
      online.runs = runs; online.at = Date.now();
      try { RUNS = runs; } catch (e) {}
      await syncLocal(text);
      return runs;
    }
    throw new Error('run.js keeps changing on GitHub. Please try again in a moment.');
  }

  // Keep the run.js in the website folder up to date as well – only if access was already granted (no prompt)
  async function syncLocal(text) {
    if (!canWrite) return;
    try {
      var h = await getHandle('runFile');
      if (h && await permitted(h, false)) await writeFile(h, text);
    } catch (e) {}
  }

  async function saveToGitHub(run, mode) {
    if (!(await ensureUnlocked())) return;
    var file = await GITHUB.read(GH_FILE);
    var runs = parseRuns(file.text);
    if (!runs) { err.textContent = 'run.js on GitHub could not be read. Please check the file.'; return; }
    var c = await existingChoice(runs, run, mode);
    if (!c) return;
    var action = 'saved';
    await commitToGitHub(file, function (list) {
      var i = findRun(list, run);
      if (c.type === 'delete') { if (i >= 0) list.splice(i, 1); action = 'deleted'; }
      else if (i >= 0) { list[i] = run; action = 'updated'; }
      else { list.push(run); action = 'saved'; }
    }, function () {
      return 'Run ' + run.hash + ' #' + run.number + ' ' + action + (who ? ' (' + who + ')' : '');
    });
    await popup(action === 'deleted' ? 'Deleted' : 'Saved',
      run.hash + ' #' + run.number + ' has been ' + action + ' on GitHub.\nIt will be visible on the website in about 1–2 minutes.', OK);
    resetForm();
  }

  // Webmaster / Moderator: save directly to run.js
  async function saveDirect(run, mode) {
    if (useGitHub()) return saveToGitHub(run, mode);
    if (isModerator) { // no moderator access on GitHub yet: send to the webmaster instead
      var go = await popup('Moderator-Zugang fehlt',
        'Der Moderator-Zugang zu GitHub ist noch nicht eingerichtet (macht der Webmaster auf „GitHub einrichten“).\nDer Eintrag wird deshalb an den Webmaster gesendet.',
        [{ label: 'Senden', value: true }, { label: 'Abbrechen', value: false, cls: 'ghost' }]);
      return go ? sendToWebmaster(run, mode) : undefined;
    }
    var handle = null, runs;
    if (canWrite) {
      handle = await runFileHandle();
      if (!handle) return;
      runs = parseRuns(await (await handle.getFile()).text());
      if (!runs) { err.textContent = 'run.js could not be read. Please check the file.'; return; }
    } else {
      runs = (typeof RUNS !== 'undefined' && Array.isArray(RUNS)) ? RUNS.slice() : [];
    }
    var c = await existingChoice(runs, run, mode);
    if (!c) return;
    var action = 'saved';
    if (c.idx >= 0 && c.type === 'save') { runs[c.idx] = run; action = 'updated'; }
    else if (c.type === 'delete') { runs.splice(c.idx, 1); action = 'deleted'; }
    else runs.push(run);

    await writeRuns(handle, runs);
    try { RUNS = runs; } catch (e) {} // later lookups on this page see the change
    var msg = run.hash + ' #' + run.number + ' has been ' + action + ' in run.js on your computer.';
    if (!handle) msg = run.hash + ' #' + run.number + ' has been ' + action + '. Your browser cannot save directly, so run.js has been downloaded – please replace the run.js in your website folder with it.';
    msg += '\nTo show it on the website, upload run.js to GitHub.\nTip: after „GitHub einrichten“ this happens automatically.';
    await popup(action === 'deleted' ? 'Deleted' : 'Saved', msg, OK);
    resetForm();
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

  // Reads the members' entries: online from Dropbox (works on every computer).
  // Only if that is not possible yet (Dropbox permissions not switched on), the webmaster
  // can still use the local Dropbox folder as before.
  // -> { online: bool, dir, list, bad, label } or null (cancelled)
  async function loadInbox() {
    try {
      var r = await DROPBOX.inbox();
      return { online: true, dir: null, list: r.list, bad: r.bad, label: 'Dropbox (Apps → ACH3_upload)' };
    } catch (e) {
      if (!(isWebmaster && canWrite && e.scope)) throw e;
      var local = await popup('Dropbox online nicht lesbar', e.message + '\nStattdessen den Dropbox-Ordner auf diesem Computer verwenden?',
        [{ label: 'Lokalen Ordner verwenden', value: true }, { label: 'Abbrechen', value: false, cls: 'ghost' }]);
      if (!local) return null;
      var dir = await inboxHandle(true);
      if (!dir) return null;
      var l = await readInbox(dir);
      return { online: false, dir: dir, list: l.list, bad: l.bad, label: 'Ordner „' + dir.name + '“' };
    }
  }

  async function importEntries() {
    if (isModerator && !useGitHub()) {
      await popup('Moderator-Zugang fehlt', 'Der Moderator-Zugang zu GitHub ist noch nicht eingerichtet. Bitte den Webmaster, ihn auf „GitHub einrichten“ anzulegen.', OK);
      return;
    }
    if (!useGitHub() && !canWrite) {
      await popup('Nicht möglich', 'Ohne GitHub-Zugang muss run.js auf diesem Computer gespeichert werden – das funktioniert nur in Chrome oder Edge.', OK);
      return;
    }
    var inbox = await loadInbox();
    if (!inbox) return;
    if (!inbox.list.length) {
      await popup('Keine neuen Einträge', 'In ' + inbox.label + ' liegen keine neuen Meldungen.' +
        (inbox.bad.length ? '\nNicht lesbar: ' + inbox.bad.join(', ') : ''), OK);
      return showPending();
    }
    var gh = useGitHub(), handle = null, file = null, runs;
    if (gh) {
      if (!(await ensureUnlocked())) return;
      file = await GITHUB.read(GH_FILE);
      runs = parseRuns(file.text);
    } else {
      handle = await runFileHandle();
      if (!handle) return;
      runs = parseRuns(await (await handle.getFile()).text());
    }
    if (!runs) { await popup('Fehler', 'run.js konnte nicht gelesen werden.', OK); return; }

    function applyAll(list) {
      return inbox.list.map(function (it) {
        var e = it.entry, idx = findRun(list, e.run), what;
        if (e.type === 'delete') {
          if (idx >= 0) { list.splice(idx, 1); what = 'gelöscht'; } else what = 'löschen – war nicht vorhanden';
        } else if (idx >= 0) { list[idx] = e.run; what = 'geändert'; }
        else { list.push(e.run); what = 'neu'; }
        return '• ' + e.run.hash + ' #' + e.run.number + ' (' + (e.run.date || 'ohne Datum') + ') – ' + what +
          (e.member ? ', von ' + e.member : '');
      });
    }
    var lines = applyAll(runs);
    var ok = await popup('Einträge übernehmen',
      inbox.list.length + ' Meldung(en) gefunden:\n' + lines.join('\n') +
      (inbox.bad.length ? '\nNicht lesbar (bleiben liegen): ' + inbox.bad.join(', ') : '') +
      (gh ? '\nÜbernehmen und auf GitHub veröffentlichen?' : '\nIn run.js übernehmen?'),
      [{ label: 'Übernehmen', value: true }, { label: 'Abbrechen', value: false, cls: 'ghost' }]);
    if (!ok) return;

    if (gh) {
      await commitToGitHub(file, applyAll, inbox.list.length + ' Meldung(en) der Mitglieder übernommen' +
        (lines.length ? '\n\n' + lines.join('\n') : ''));
    } else {
      await writeRuns(handle, runs);
    }
    var notMoved = [];
    for (var i = 0; i < inbox.list.length; i++) {
      try {
        if (inbox.online) await DROPBOX.done(inbox.list[i]);
        else await moveToDone(inbox.dir, inbox.list[i]);
      } catch (x) { notMoved.push(inbox.list[i].name); }
    }
    await popup('Übernommen', inbox.list.length + ' Meldung(en) wurden übernommen und in den Unterordner „erledigt“ verschoben.\n' +
      (gh ? 'run.js ist auf GitHub gespeichert – in etwa 1–2 Minuten auf der Website sichtbar.'
          : 'Damit sie auf der Website erscheinen: run.js bei GitHub hochladen.') +
      (notMoved.length ? '\nKonnten nicht verschoben werden (bitte von Hand löschen): ' + notMoved.join(', ') : ''), OK);
    location.reload();
  }

  async function showPending() {
    var el = $('pending');
    try {
      var c = await DROPBOX.count();
      el.textContent = c ? c + ' neue Meldung(en) warten auf Übernahme.' : 'Keine neuen Meldungen.';
      return;
    } catch (e) {
      if (!isWebmaster) {
        el.textContent = e.scope
          ? 'Die Meldungen können noch nicht online gelesen werden – der Webmaster muss dafür die Dropbox-Berechtigungen einschalten.'
          : 'Meldungen konnten nicht geprüft werden: ' + msgOf(e);
        return;
      }
      if (!e.scope) { el.textContent = 'Meldungen konnten nicht geprüft werden: ' + msgOf(e); return; }
    }
    // Webmaster, online reading not switched on yet: local Dropbox folder as before
    var dir = await inboxHandle(false);
    if (!dir) { el.textContent = 'Dropbox kann noch nicht online gelesen werden (Berechtigungen einschalten, siehe „Dropbox einrichten“). Klicken, um den lokalen Ordner zu prüfen.'; return; }
    try {
      var n = (await readInbox(dir)).list.length;
      el.textContent = n ? n + ' neue Meldung(en) warten auf Übernahme.' : 'Keine neuen Meldungen.';
    } catch (e) { el.textContent = ''; }
  }

  if (canPublish) {
    $('webmaster').hidden = false;
    $('wmTitle').textContent = roleName;
    if (isModerator) document.querySelectorAll('#webmaster .wm-only').forEach(function (el) { el.hidden = true; });
    var ghEl = $('ghStatus');
    if (ghEl) {
      ghEl.textContent = useGitHub()
        ? '✓ GitHub eingerichtet – Speichern veröffentlicht run.js direkt (' + roleName + '-Passwort einmal pro Sitzung).'
        : isModerator
          ? 'Moderator-Zugang zu GitHub ist noch nicht eingerichtet – bitte beim Webmaster melden.'
          : 'GitHub ist nicht eingerichtet – run.js muss von Hand hochgeladen werden.';
    }
    $('importBtn').addEventListener('click', function () {
      importEntries().catch(function (e) { popup('Fehler', msgOf(e), OK); });
    });
    showPending();
  }
})();
