// Add Run form
// - Members: the entry is sent to the webmaster's db (db.js)
// - Webmaster (webmaster: true in pw.js): saves directly to run.js and can
//   import the entries sent by members ("Einträge übernehmen")
// - Moderator (moderator: true in pw.js): like the webmaster, saves and imports
//   directly into run.js on GitHub (moderator password, set up by the webmaster
//   on github-setup.html; if MODERATOR_PASSWORD is set in pw.js it unlocks
//   automatically) – but without "Set up GitHub" / "Set up db"
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
  // Moderator: password from pw.js (MODERATOR_PASSWORD) – unlocks automatically, no dialog
  var autoPw = isModerator && typeof MODERATOR_PASSWORD === 'string' ? MODERATOR_PASSWORD : '';
  var autoTried = null; // Promise of the automatic unlock (only tried once per page)
  function autoUnlock() {
    if (!autoPw || !useGitHub()) return Promise.resolve(false);
    if (GITHUB.unlocked()) return Promise.resolve(true);
    if (!autoTried) autoTried = GITHUB.unlock(autoPw, ghRole).then(function () { return true; }, function (x) {
      if (isOffline(x)) autoTried = null; // try again next time
      else console.warn('MODERATOR_PASSWORD in pw.js does not match:', msgOf(x));
      return false;
    });
    return autoTried;
  }
  async function ensureUnlocked() {
    if (GITHUB.unlocked()) return true;
    if (await autoUnlock()) return true;
    return askPassword();
  }
  function askPassword() {
    return new Promise(function (resolve) {
      var d = document.createElement('dialog');
      d.className = 'modal';
      d.innerHTML = '<h2>' + roleName + ' password</h2><form class="panel form" autocomplete="off">' +
        '<p>To save on GitHub, please enter the ' + roleName + ' password (once per session).</p>' +
        '<input type="password" aria-label="' + roleName + ' password" style="margin-top:10px" autocomplete="current-password">' +
        '<p class="err" role="alert"></p>' +
        '<div class="buttons"><button class="btn" type="submit">Unlock</button>' +
        '<button class="btn ghost" type="button">Cancel</button></div></form>';
      var f = d.querySelector('form'), inp = d.querySelector('input'), e = d.querySelector('.err');
      var btns = d.querySelectorAll('button');
      function done(v) { d.close(); d.remove(); resolve(v); }
      btns[1].addEventListener('click', function () { done(false); });
      f.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        if (!inp.value) return;
        btns[0].disabled = true; e.textContent = 'Checking …';
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
  var OFFLINE_MSG = 'No internet connection – please try again later.';
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

  // ---------- Picture of a run (Webmaster / Moderator with GitHub) ----------
  // The picture is made smaller in the browser and uploaded as its own file to
  // Bilder/Runs/ on GitHub; run.js only stores its path in "image".
  var PIC_DIR = 'Bilder/Runs/', PIC_MAX = 1000, PIC_QUALITY = 0.8;
  var pic = { existing: null, blob: null, url: null, remove: false };

  function picShow() {
    var img = $('picPreview'), has = false;
    img.onerror = null;
    if (pic.blob) { img.src = pic.url; has = true; }
    else if (pic.existing && !pic.remove) {
      has = true;
      img.onerror = function () { // not on this website yet (GitHub Pages is still updating): show it from GitHub
        img.onerror = function () { img.hidden = true; };
        img.src = 'https://raw.githubusercontent.com/' + GH_REPO + '/' + GH_BRANCH + '/' + pic.existing.split('/').map(encodeURIComponent).join('/');
      };
      img.src = pic.existing;
    }
    img.hidden = !has;
    $('picRemove').hidden = !has;
    $('picChoose').textContent = has ? 'Replace picture' : 'Choose picture';
  }
  function picClearNew() {
    if (pic.url) URL.revokeObjectURL(pic.url);
    pic.blob = null; pic.url = null; $('picFile').value = '';
  }
  function picReset() { picClearNew(); pic.existing = null; pic.remove = false; picShow(); }
  function picSetExisting(path) { picClearNew(); pic.existing = path || null; pic.remove = false; picShow(); }

  function loadImage(file) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function () { res(im); setTimeout(function () { URL.revokeObjectURL(u); }, 0); };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('bad image')); };
      im.src = u;
    });
  }
  // Any photo -> JPEG, longest side at most PIC_MAX px (rotation of phone photos is respected)
  async function shrink(file) {
    var src;
    try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) { src = await loadImage(file); }
    var w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
    var s = Math.min(1, PIC_MAX / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); // transparent PNGs get a white background
    ctx.drawImage(src, 0, 0, c.width, c.height);
    if (src.close) src.close();
    return new Promise(function (res, rej) {
      c.toBlob(function (b) { b ? res(b) : rej(new Error('The picture could not be converted.')); }, 'image/jpeg', PIC_QUALITY);
    });
  }
  function blobB64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1]); };
      r.onerror = function () { rej(r.error); };
      r.readAsDataURL(blob);
    });
  }
  function picPath(run) {
    var n = new Date();
    var stamp = n.getFullYear() + pad2(n.getMonth() + 1) + pad2(n.getDate()) + '-' + pad2(n.getHours()) + pad2(n.getMinutes()) + pad2(n.getSeconds());
    var hash = run.hash.split(' ')[0].replace(/[^\w-]/g, '');
    var num = String(run.number).replace(/[^\w-]/g, '') || 'run';
    return PIC_DIR + hash + '-' + num + '-' + stamp + '.jpg';
  }
  function pad2(x) { return (x < 10 ? '0' : '') + x; }

  $('picFile').addEventListener('change', async function () {
    var f = this.files && this.files[0];
    if (!f) return;
    var note = $('picNote');
    note.textContent = 'Preparing the picture …';
    try {
      var b = await shrink(f);
      picClearNew();
      pic.blob = b; pic.url = URL.createObjectURL(b); pic.remove = false;
      note.textContent = 'New picture (' + Math.round(b.size / 1024) + ' KB) – it is uploaded when you click Save.';
    } catch (e) {
      this.value = '';
      note.textContent = 'This picture could not be read. Please use a JPG or PNG photo.';
    }
    picShow();
  });
  $('picRemove').addEventListener('click', function () {
    var hadNew = !!pic.blob;
    picClearNew();
    if (!hadNew && pic.existing) pic.remove = true;
    $('picNote').textContent = pic.remove ? 'The picture will be removed when you click Save.' :
      'One picture per run. It is made smaller automatically and shown with "Next run" and "Upcoming runs".';
    picShow();
  });

  // Deletes pictures that are no longer used by any run (after run.js was saved)
  async function cleanupImages(before, after) {
    if (!before || typeof GITHUB === 'undefined') return;
    var used = {};
    after.forEach(function (r) { if (r.image) used[r.image] = 1; });
    var gone = {};
    before.forEach(function (r) { if (r.image && !used[r.image] && r.image.indexOf(PIC_DIR) === 0) gone[r.image] = 1; });
    for (var p in gone) {
      try { await GITHUB.remove(p, 'Picture removed: ' + p + (who ? ' (' + who + ')' : '')); } catch (e) { console.warn('Picture not deleted:', p, e); }
    }
  }

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
  function idb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('achhh', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function getHandle(name) {
    return idb().then(function (d) {
      return new Promise(function (res) {
        var q = d.transaction('kv').objectStore('kv').get(name);
        q.onsuccess = function () { res(q.result || null); };
        q.onerror = function () { res(null); };
      });
    }).catch(function () { return null; });
  }
  function setHandle(h, name) {
    return idb().then(function (d) {
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
    var go = await popup('Select run.js',
      'Please select the file run.js in the website folder (only once).',
      [{ label: 'Select run.js', value: true }, { label: 'Cancel', value: false, cls: 'ghost' }]);
    if (!go) return null;
    try {
      h = (await window.showOpenFilePicker({ types: [{ description: 'run.js', accept: { 'text/javascript': ['.js'] } }] }))[0];
    } catch (e) { return null; }
    if (h.name.toLowerCase() !== 'run.js') {
      await popup('Wrong file', 'Please select the file run.js.', OK);
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
    var go = await popup('Copy to the Desktop',
      'run.js is also saved on the Desktop.\nPlease confirm the location once (Desktop, file name run.js).',
      [{ label: 'Choose Desktop', value: true }, { label: 'Not now', value: false, cls: 'ghost' }]);
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
        await popup('Desktop copy failed', 'run.js has been saved, but the copy on the Desktop has not.\n' + msgOf(e), OK);
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
    picReset();
    $('picNote').textContent = 'One picture per run. It is made smaller automatically and shown with "Next run" and "Upcoming runs".';
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
  function clearLoaded() { loadedKey = null; loadedVals = null; skipKey = null; showLoaded(''); delBtn.hidden = true; setLocked(false); pic.existing = null; pic.remove = false; picShow(); }
  // Past run typed in: form is locked (no Save), only another number can be entered
  function setLocked(on) {
    form.classList.toggle('locked', on);
    FIELDS.forEach(function (id) { $(id).disabled = on; });
    $('picFile').disabled = on; $('picRemove').disabled = on;
    $('picChoose').classList.toggle('disabled', on);
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
    pic.existing = run.image || null; pic.remove = false; picShow(); // a newly chosen picture stays
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

  // Member: send the entry to the webmaster's db
  async function sendToWebmaster(run, mode) {
    var published = (await onlineRuns(true)) || ((typeof RUNS !== 'undefined' && Array.isArray(RUNS)) ? RUNS : []);
    var c = await existingChoice(published, run, mode);
    if (!c) return;
    var entry = { type: c.type, run: run, member: who, sentAt: new Date().toISOString() };
    for (;;) {
      try {
        await db.send(entry);
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
      var before = parseRuns(file.text);
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
      await cleanupImages(before, runs);
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
    // Picture: upload a new one first (its own file), then save run.js with its path
    var newPic = null, dropPic = c.type === 'save' && pic.remove && !pic.blob;
    if (c.type === 'save' && pic.blob) {
      saveBtn.textContent = 'Uploading picture …';
      newPic = picPath(run);
      await GITHUB.writeBase64(newPic, await blobB64(pic.blob), null,
        'Picture for ' + run.hash + ' #' + run.number + (who ? ' (' + who + ')' : ''));
      saveBtn.textContent = 'Saving …';
    }
    try {
      await commitToGitHub(file, function (list) {
        var i = findRun(list, run);
        if (c.type === 'delete') { if (i >= 0) list.splice(i, 1); action = 'deleted'; return; }
        var r = Object.assign({}, run), old = i >= 0 ? list[i] : null;
        if (newPic) r.image = newPic;
        else if (!dropPic && old && old.image) r.image = old.image; // no new picture: keep the stored one
        if (i >= 0) { list[i] = r; action = 'updated'; }
        else { list.push(r); action = 'saved'; }
      }, function () {
        return 'Run ' + run.hash + ' #' + run.number + ' ' + action + (who ? ' (' + who + ')' : '');
      });
    } catch (e) {
      if (newPic) GITHUB.remove(newPic, 'Unused picture removed').catch(function () {}); // run.js not saved: picture not needed
      throw e;
    }
    await popup(action === 'deleted' ? 'Deleted' : 'Saved',
      run.hash + ' #' + run.number + ' has been ' + action + ' on GitHub.\nIt will be visible on the website in about 1–2 minutes.', OK);
    resetForm();
  }

  // Webmaster / Moderator: save directly to run.js
  async function saveDirect(run, mode) {
    if (useGitHub()) return saveToGitHub(run, mode);
    if (isModerator) { // no moderator access on GitHub yet: send to the webmaster instead
      var go = await popup('Moderator access missing',
        'Moderator access to GitHub has not been set up yet (the webmaster does this on "Set up GitHub").\nThe entry will therefore be sent to the webmaster.',
        [{ label: 'Send', value: true }, { label: 'Cancel', value: false, cls: 'ghost' }]);
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
    if (c.idx >= 0 && c.type === 'save') { if (runs[c.idx].image && !run.image) run.image = runs[c.idx].image; runs[c.idx] = run; action = 'updated'; }
    else if (c.type === 'delete') { runs.splice(c.idx, 1); action = 'deleted'; }
    else runs.push(run);

    await writeRuns(handle, runs);
    try { RUNS = runs; } catch (e) {} // later lookups on this page see the change
    var msg = run.hash + ' #' + run.number + ' has been ' + action + ' in run.js on your computer.';
    if (!handle) msg = run.hash + ' #' + run.number + ' has been ' + action + '. Your browser cannot save directly, so run.js has been downloaded – please replace the run.js in your website folder with it.';
    msg += '\nTo show it on the website, upload run.js to GitHub.\nTip: after "Set up GitHub" this happens automatically.';
    await popup(action === 'deleted' ? 'Deleted' : 'Saved', msg, OK);
    resetForm();
  }

  // ---------- Webmaster: import entries from the db folder ----------
  var INBOX_HINT = 'D:\\Dropbox\\Apps\\ACH3_upload';

  async function inboxHandle(ask) {
    var h = await getHandle('inboxDir');
    if (h && await permitted(h, ask)) return h;
    if (!ask) return null;
    var go = await popup('Select db folder',
      'Please select the folder where the members\' entries arrive (only once):\n' + INBOX_HINT,
      [{ label: 'Select folder', value: true }, { label: 'Cancel', value: false, cls: 'ghost' }]);
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

  // Reads the members' entries: online from db (works on every computer).
  // Only if that is not possible yet (db permissions not switched on), the webmaster
  // can still use the local db folder as before.
  // -> { online: bool, dir, list, bad, label } or null (cancelled)
  async function loadInbox() {
    try {
      var r = await db.inbox();
      return { online: true, dir: null, list: r.list, bad: r.bad, label: 'db (Apps → ACH3_upload)' };
    } catch (e) {
      if (!(isWebmaster && canWrite && e.scope)) throw e;
      var local = await popup('db cannot be read online', e.message + '\nUse the db folder on this computer instead?',
        [{ label: 'Use local folder', value: true }, { label: 'Cancel', value: false, cls: 'ghost' }]);
      if (!local) return null;
      var dir = await inboxHandle(true);
      if (!dir) return null;
      var l = await readInbox(dir);
      return { online: false, dir: dir, list: l.list, bad: l.bad, label: 'folder "' + dir.name + '"' };
    }
  }

  async function importEntries() {
    if (isModerator && !useGitHub()) {
      await popup('Moderator access missing', 'Moderator access to GitHub has not been set up yet. Please ask the webmaster to set it up on "Set up GitHub".', OK);
      return;
    }
    if (!useGitHub() && !canWrite) {
      await popup('Not possible', 'Without GitHub access, run.js must be saved on this computer – this only works in Chrome or Edge.', OK);
      return;
    }
    var inbox = await loadInbox();
    if (!inbox) return;
    if (!inbox.list.length) {
      await popup('No new entries', 'There are no new entries in ' + inbox.label + '.' +
        (inbox.bad.length ? '\nUnreadable: ' + inbox.bad.join(', ') : ''), OK);
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
    if (!runs) { await popup('Error', 'run.js could not be read.', OK); return; }

    function applyAll(list) {
      return inbox.list.map(function (it) {
        var e = it.entry, idx = findRun(list, e.run), what;
        if (e.type === 'delete') {
          if (idx >= 0) { list.splice(idx, 1); what = 'deleted'; } else what = 'delete – did not exist';
        } else if (idx >= 0) { var nr = Object.assign({}, e.run); if (!nr.image && list[idx].image) nr.image = list[idx].image; list[idx] = nr; what = 'changed'; }
        else { list.push(e.run); what = 'new'; }
        return '• ' + e.run.hash + ' #' + e.run.number + ' (' + (e.run.date || 'no date') + ') – ' + what +
          (e.member ? ', from ' + e.member : '');
      });
    }
    var lines = applyAll(runs);
    var ok = await popup('Import entries',
      inbox.list.length + ' entr(y/ies) found:\n' + lines.join('\n') +
      (inbox.bad.length ? '\nUnreadable (left in place): ' + inbox.bad.join(', ') : '') +
      (gh ? '\nImport and publish on GitHub?' : '\nImport into run.js?'),
      [{ label: 'Import', value: true }, { label: 'Cancel', value: false, cls: 'ghost' }]);
    if (!ok) return;

    if (gh) {
      await commitToGitHub(file, applyAll, inbox.list.length + ' member entr(y/ies) imported' +
        (lines.length ? '\n\n' + lines.join('\n') : ''));
    } else {
      await writeRuns(handle, runs);
    }
    var notMoved = [];
    for (var i = 0; i < inbox.list.length; i++) {
      try {
        if (inbox.online) await db.done(inbox.list[i]);
        else await moveToDone(inbox.dir, inbox.list[i]);
      } catch (x) { notMoved.push(inbox.list[i].name); }
    }
    await popup('Imported', inbox.list.length + ' entr(y/ies) imported and moved to the subfolder "erledigt" (done).\n' +
      (gh ? 'run.js has been saved on GitHub – visible on the website in about 1–2 minutes.'
          : 'To show them on the website: upload run.js to GitHub.') +
      (notMoved.length ? '\nCould not be moved (please delete by hand): ' + notMoved.join(', ') : ''), OK);
    location.reload();
  }

  async function showPending() {
    var el = $('pending');
    try {
      var c = await db.count();
      el.textContent = c ? c + ' new entr(y/ies) waiting to be imported.' : 'No new entries.';
      return;
    } catch (e) {
      if (!isWebmaster) {
        el.textContent = e.scope
          ? 'The entries cannot be read online yet – the webmaster has to switch on the db permissions first.'
          : 'Entries could not be checked: ' + msgOf(e);
        return;
      }
      if (!e.scope) { el.textContent = 'Entries could not be checked: ' + msgOf(e); return; }
    }
    // Webmaster, online reading not switched on yet: local db folder as before
    var dir = await inboxHandle(false);
    if (!dir) { el.textContent = 'db cannot be read online yet (switch on the permissions, see "Set up db"). Click "Import entries" to check the local folder.'; return; }
    try {
      var n = (await readInbox(dir)).list.length;
      el.textContent = n ? n + ' new entr(y/ies) waiting to be imported.' : 'No new entries.';
    } catch (e) { el.textContent = ''; }
  }

  // ---------- Hare list (upcoming_hares.js) – Webmaster / Moderator ----------
  // Read from GitHub, edited here, saved back to GitHub with the same access as run.js
  var HL_FILE = 'upcoming_hares.js';
  var hl = { list: [], sha: null, dirty: false, loaded: false };
  var hlSaving = false;

  function hlKey(d) { var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || ''); return m ? +(m[3] + m[2] + m[1]) : 0; }
  function hlParse(text) {
    try {
      var r = new Function(text + '\n;return typeof upcomingHares !== "undefined" ? upcomingHares : [];')();
      if (!Array.isArray(r)) return null;
      return r.map(function (e) {
        var h = Array.isArray(e && e.hares) ? e.hares : (e && e.hares ? [e.hares] : []);
        return { date: String((e && e.date) || '').trim(), hares: h.map(function (x) { return String(x).trim(); }).filter(Boolean) };
      });
    } catch (e) { return null; }
  }
  function hlText(list) {
    var clean = list.filter(function (e) { return e.hares.length; })
      .sort(function (a, b) { return hlKey(a.date) - hlKey(b.date); });
    return '// upcoming_hares.js – list of upcoming hares for angeles.html\n' +
           'var upcomingHares = ' + JSON.stringify(clean, null, 2) + ';\n';
  }
  function hlStatus(text, dirty) {
    var el = $('hlStatus'); el.textContent = text; el.classList.toggle('dirty', !!dirty);
  }
  function hlSetDirty(on) {
    hl.dirty = on;
    hlStatus(on ? 'Unsaved changes – click "Save hare list" to publish them.' :
      'Upcoming hares. Add or delete hares below, then click "Save hare list".', on);
  }

  function hlRender() {
    var box = $('hlList');
    box.innerHTML = '';
    var list = hl.list.filter(function (e) { return e.hares.length; })
      .sort(function (a, b) { return hlKey(a.date) - hlKey(b.date); });
    if (!list.length) { var p = document.createElement('p'); p.textContent = 'No hares listed yet.'; box.appendChild(p); return; }
    var table = document.createElement('table');
    table.className = 'runs-table hares-table';
    table.innerHTML = '<thead><tr><th>Date</th><th>Hares</th></tr></thead><tbody></tbody>';
    var tb = table.querySelector('tbody'), today = todayKey();
    list.forEach(function (e) {
      var tr = document.createElement('tr');
      if (hlKey(e.date) && hlKey(e.date) < today) tr.className = 'past';
      var td1 = document.createElement('td'); td1.textContent = e.date || '(no date)';
      var td2 = document.createElement('td');
      e.hares.forEach(function (name, i) {
        var chip = document.createElement('span'); chip.className = 'hl-chip';
        var t = document.createElement('span'); t.textContent = name;
        var x = document.createElement('button');
        x.type = 'button'; x.className = 'hl-del'; x.textContent = '×';
        x.title = 'Delete ' + name + ' (' + e.date + ')';
        x.setAttribute('aria-label', x.title);
        x.addEventListener('click', function () { hlDelete(e, i); });
        chip.appendChild(t); chip.appendChild(x); td2.appendChild(chip);
      });
      tr.appendChild(td1); tr.appendChild(td2); tb.appendChild(tr);
    });
    box.appendChild(table);
  }

  async function hlDelete(entry, i) {
    var name = entry.hares[i];
    var ok = await popup('Delete hare', 'Remove ' + name + ' from ' + entry.date + '?',
      [{ label: 'Delete', value: true, cls: 'danger' }, { label: 'Cancel', value: false, cls: 'ghost' }]);
    if (!ok) return;
    entry.hares.splice(i, 1);
    if (!entry.hares.length) hl.list.splice(hl.list.indexOf(entry), 1);
    hlRender(); hlSetDirty(true);
  }

  function hlAdd() {
    var e = $('hlErr'); e.textContent = '';
    var name = $('hlName').value.trim(), date = $('hlDate').value.trim();
    if (!name) { e.textContent = 'Please enter the hare name.'; $('hlName').focus(); return false; }
    if (!date) { e.textContent = 'Please enter the date (DD/MM/YYYY).'; $('hlDate').focus(); return false; }
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) { e.textContent = 'Please enter the date as DD/MM/YYYY, e.g. 08/11/2026.'; $('hlDate').focus(); return false; }
    if (!validDate(date)) { e.textContent = date + ' is not a valid date. Format: DD/MM/YYYY.'; $('hlDate').focus(); return false; }
    if (hlKey(date) < todayKey()) { e.textContent = date + ' is in the past. Only upcoming hares can be added.'; $('hlDate').focus(); return false; }
    if (Math.floor(hlKey(date) / 10000) > new Date().getFullYear() + MAX_YEARS_AHEAD) { e.textContent = date + ' is too far in the future – please check the year.'; $('hlDate').focus(); return false; }
    var entry = hl.list.filter(function (x) { return x.date === date; })[0];
    if (entry && entry.hares.some(function (h) { return h.toLowerCase() === name.toLowerCase(); })) {
      e.textContent = name + ' is already listed for ' + date + '.'; return false;
    }
    if (entry) entry.hares.push(name); else hl.list.push({ date: date, hares: [name] });
    $('hlName').value = '';
    hlRender(); hlSetDirty(true);
    $('hlName').focus();
    return true;
  }

  // Current upcoming_hares.js: GitHub (with access code) -> public GitHub -> the copy on this website
  async function hlLoad() {
    hlStatus('Loading the hare list …');
    var text = null, sha = null, src = 'GitHub';
    try {
      if (useGitHub() && (GITHUB.unlocked() || await autoUnlock())) {
        var f = await GITHUB.read(HL_FILE); text = f.text; sha = f.sha;
      }
    } catch (e) { if (e.status === 404) { text = ''; } }
    if (text === null) {
      try {
        var ra = await fetch('https://api.github.com/repos/' + GH_REPO + '/contents/' + HL_FILE + '?ref=' + GH_BRANCH + '&t=' + Date.now(), { cache: 'no-store' });
        if (ra.ok) { var j = await ra.json(); if (j && typeof j.content === 'string') { text = b64utf8(j.content); sha = j.sha; } }
        else if (ra.status === 404) text = '';
      } catch (e) {}
    }
    if (text === null) {
      try {
        var r = await fetch('https://raw.githubusercontent.com/' + GH_REPO + '/' + GH_BRANCH + '/' + HL_FILE + '?t=' + Date.now(), { cache: 'no-store' });
        if (r.ok) text = await r.text();
      } catch (e) {}
    }
    if (text === null) {
      try {
        var r2 = await fetch(HL_FILE + '?t=' + Date.now(), { cache: 'no-store' });
        if (r2.ok) { text = await r2.text(); src = 'this website'; }
      } catch (e) {}
    }
    var list = text === '' ? [] : text === null ? null : hlParse(text);
    if (!list) { hl.loaded = false; hlStatus('The hare list could not be loaded. Please reload the page.', true); return; }
    hl.list = list; hl.sha = sha; hl.loaded = true;
    hlRender(); hlSetDirty(false);
    if (src !== 'GitHub') hlStatus('Loaded from ' + src + ' (GitHub could not be reached).', true);
  }

  async function hlSave() {
    var e = $('hlErr'); e.textContent = '';
    if (hlSaving) return;
    if (!hl.loaded) { await popup('Not loaded', 'The hare list could not be loaded, so it cannot be saved.\nPlease reload the page.', OK); return; }
    // Name/date typed but "Add hare" not clicked: add them first
    if ($('hlName').value.trim() || $('hlDate').value.trim()) {
      if (!hlAdd()) return; // error is shown below the fields
    }
    if (!hl.dirty) {
      await popup('Nothing to save', 'The hare list has not been changed.\nEnter a hare name and date and click "Add hare", or delete a hare with ×, then click "Save hare list".', OK);
      return;
    }
    var text = hlText(hl.list);
    var btn = $('hlSave'); hlSaving = true; btn.disabled = true; btn.textContent = 'Saving …';
    hlStatus('Saving the hare list …', true);
    try {
      if (!useGitHub()) {
        download(HL_FILE, text, 'text/javascript');
        await popup('Downloaded', 'GitHub is not set up, so ' + HL_FILE + ' has been downloaded.\nPlease upload it to GitHub by hand.', OK);
        hlSetDirty(false);
        return;
      }
      if (!(await ensureUnlocked())) { hlSetDirty(true); return; }
      if (!hl.sha) { try { hl.sha = (await GITHUB.read(HL_FILE)).sha; } catch (x) { if (x.status !== 404) throw x; } }
      try {
        var res = await GITHUB.write(HL_FILE, text, hl.sha, 'Hare list updated' + (who ? ' (' + who + ')' : ''));
        hl.sha = res && res.content ? res.content.sha : null;
      } catch (x) {
        if (!x.conflict) throw x;
        var reload = await popup('Hare list changed',
          HL_FILE + ' was changed on GitHub in the meantime (by someone else).\nReload the current list? Your unsaved changes will be lost.',
          [{ label: 'Reload', value: true }, { label: 'Cancel', value: false, cls: 'ghost' }]);
        if (reload) await hlLoad(); else hlSetDirty(true);
        return;
      }
      hlSetDirty(false);
      var t = new Date();
      hlStatus('✓ Saved on GitHub at ' + ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2) +
        ' – visible on the ACH3 page in about 1–2 minutes.');
      await popup('Saved', 'The hare list has been saved on GitHub.\nIt will be visible on the ACH3 page (angeles.html) in about 1–2 minutes.', OK);
    } catch (x) {
      e.textContent = 'Saving failed: ' + msgOf(x);
      hlStatus('Not saved – see the error below.', true);
      await popup('Saving failed', 'The hare list could not be saved:\n' + msgOf(x), OK);
    } finally {
      hlSaving = false;
      btn.textContent = 'Save hare list';
      btn.disabled = false;
    }
  }

  // Auto-insert the slashes in the hare date (same as the run date)
  $('hlDate').addEventListener('input', function (e) {
    if (e.inputType && e.inputType.indexOf('delete') === 0) return;
    var v = this.value.replace(/[^\d]/g, '').slice(0, 8);
    if (v.length > 4) v = v.slice(0, 2) + '/' + v.slice(2, 4) + '/' + v.slice(4);
    else if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
    this.value = v;
  });
  $('hlForm').addEventListener('submit', function (e) { e.preventDefault(); });
  $('hlForm').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); hlAdd(); }
  });
  $('hlAdd').addEventListener('click', hlAdd);
  $('hlSave').addEventListener('click', function () {
    hlSave().catch(function (x) { popup('Error', msgOf(x), OK); });
  });
  window.addEventListener('beforeunload', function (e) { if (hl.dirty) { e.preventDefault(); e.returnValue = ''; } });

  if (canPublish) {
    if (useGitHub()) $('picBox').hidden = false; // pictures need the GitHub access
    $('hareEditor').hidden = false;
    hlLoad();
    $('webmaster').hidden = false;
    $('wmTitle').textContent = roleName;
    if (isModerator) document.querySelectorAll('#webmaster .wm-only').forEach(function (el) { el.hidden = true; });
    var ghEl = $('ghStatus');
    if (ghEl) {
      ghEl.textContent = useGitHub()
        ? '✓ GitHub is set up – Save publishes run.js and the hare list directly (' +
          (autoPw ? 'unlocked automatically' : roleName + ' password once per session') + ').'
        : isModerator
          ? 'Moderator access to GitHub has not been set up yet – please contact the webmaster.'
          : 'GitHub is not set up – run.js has to be uploaded by hand.';
    }
    $('importBtn').addEventListener('click', function () {
      importEntries().catch(function (e) { popup('Error', msgOf(e), OK); });
    });
    showPending();
    autoUnlock(); // Moderator with MODERATOR_PASSWORD: unlock right away in the background
  }
})();
