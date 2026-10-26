// Sends single entries (new / changed / deleted runs) as small .json files
// into the Dropbox app folder (D:\Dropbox\Apps\<app name>). Uses dropbox-config.js.
// Webmaster / Moderator: reads the entries directly from Dropbox (online, from any
// computer) and moves them into the subfolder "erledigt" after the import.
// Needs the Dropbox app permissions files.content.read + files.metadata.read
// (and files.content.write, as before) – see dropbox-setup.html.
var DROPBOX = (function () {
  function cfg() { return (typeof DROPBOX_CONFIG !== 'undefined' && DROPBOX_CONFIG) || {}; }

  async function tokenRequest(params) {
    params.client_id = cfg().appKey;
    var r = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString()
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(j.error_description || j.error || ('HTTP ' + r.status));
    return j;
  }

  // Access token (valid ~4 h) – kept for 30 minutes so a list + several downloads need only one token request
  var cache = { rt: '', at: '', until: 0 };
  async function accessToken(refreshToken) {
    if (cache.rt === refreshToken && cache.at && Date.now() < cache.until) return cache.at;
    var at = (await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })).access_token;
    cache = { rt: refreshToken, at: at, until: Date.now() + 30 * 60 * 1000 };
    return at;
  }

  // Dropbox-API-Arg header must be plain ASCII
  function apiArg(o) {
    return JSON.stringify(o).replace(/[\u007f-\uffff]/g, function (c) { return '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4); });
  }

  // Readable German error messages for the read/move calls
  async function apiError(r) {
    var t = await r.text().catch(function () { return ''; });
    var j = {}; try { j = JSON.parse(t); } catch (e) {}
    var summary = j.error_summary || t || ('HTTP ' + r.status);
    var e;
    if (/missing_scope/.test(summary) || (j.error && j.error['.tag'] === 'missing_scope')) {
      e = new Error('Der Dropbox-Zugang darf die Meldungen noch nicht lesen. Der Webmaster muss in der Dropbox App Console die Berechtigungen „files.content.read“ und „files.metadata.read“ einschalten und danach „Dropbox einrichten“ neu durchlaufen.');
      e.scope = true;
    } else if (r.status === 401) {
      e = new Error('Der Dropbox-Zugang ist ungültig oder abgelaufen. Der Webmaster muss „Dropbox einrichten“ neu durchlaufen.');
      e.scope = true;
    } else {
      e = new Error('Dropbox meldet: ' + summary);
    }
    e.status = r.status;
    throw e;
  }
  async function rpc(endpoint, args, refreshToken) {
    var at = await accessToken(refreshToken || cfg().refreshToken);
    var r = await fetch('https://api.dropboxapi.com/2/' + endpoint, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + at, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    if (!r.ok) await apiError(r);
    return r.json();
  }
  async function downloadText(path) {
    var at = await accessToken(cfg().refreshToken);
    var r = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + at, 'Dropbox-API-Arg': apiArg({ path: path }) }
    });
    if (!r.ok) await apiError(r);
    return r.text();
  }
  // All files directly in the app folder (not in "erledigt")
  async function listFiles(refreshToken) {
    var res = await rpc('files/list_folder', { path: '', recursive: false, include_deleted: false }, refreshToken);
    var all = res.entries.slice();
    while (res.has_more) {
      res = await rpc('files/list_folder/continue', { cursor: res.cursor }, refreshToken);
      all = all.concat(res.entries);
    }
    return all.filter(function (f) { return f['.tag'] === 'file'; });
  }

  async function upload(refreshToken, path, text, overwrite) {
    var at = await accessToken(refreshToken);
    var r = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + at,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ path: path, mode: overwrite ? 'overwrite' : 'add', autorename: !overwrite, mute: false })
      },
      body: new Blob([text], { type: 'application/octet-stream' })
    });
    if (!r.ok) throw new Error((await r.text()) || ('HTTP ' + r.status));
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fileName(entry) {
    var d = new Date();
    var stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '_' +
                pad(d.getHours()) + '-' + pad(d.getMinutes()) + '-' + pad(d.getSeconds());
    var what = (entry.run.hash.split(' ')[0] + '-' + entry.run.number).replace(/[^A-Za-z0-9-]/g, '');
    return stamp + '_' + what + '_' + Math.random().toString(36).slice(2, 6) + '.json';
  }

  // ---------- one-time setup (dropbox-setup.html), PKCE: no app secret needed ----------
  function b64url(bytes) {
    var s = ''; bytes.forEach(function (b) { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function startAuth() {
    var verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    var challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    sessionStorage.setItem('achhh_dbx_verifier', verifier);
    return 'https://www.dropbox.com/oauth2/authorize?client_id=' + encodeURIComponent(cfg().appKey) +
      '&response_type=code&token_access_type=offline&code_challenge_method=S256&code_challenge=' + challenge;
  }
  async function finishAuth(code) { // returns the permanent refresh token
    var verifier = sessionStorage.getItem('achhh_dbx_verifier');
    if (!verifier) throw new Error('Bitte zuerst auf „Mit Dropbox verbinden“ klicken.');
    var j = await tokenRequest({ grant_type: 'authorization_code', code: code.trim(), code_verifier: verifier });
    if (!j.refresh_token) throw new Error('Dropbox hat keinen dauerhaften Zugangscode geliefert.');
    sessionStorage.removeItem('achhh_dbx_verifier');
    return j.refresh_token;
  }

  return {
    configured: function () { return !!(cfg().appKey && cfg().refreshToken); },
    // entry = { type: 'save' | 'delete', run: {...}, member: '...', sentAt: ISO date }
    send: function (entry) {
      if (!this.configured()) return Promise.reject(new Error('Dropbox is not set up yet (dropbox-config.js).'));
      return upload(cfg().refreshToken, '/' + fileName(entry), JSON.stringify(entry, null, 2));
    },
    test: function (refreshToken) {
      return upload(refreshToken, '/verbindungstest.txt', 'Verbindungstest ' + new Date().toLocaleString() + ' – diese Datei kann gelöscht werden.', true);
    },
    startAuth: startAuth, finishAuth: finishAuth,

    // ---------- Reading the members' entries (Webmaster / Moderator) ----------
    // -> { list: [{ name, path, entry }], bad: [names] }, oldest entry first
    inbox: async function () {
      if (!this.configured()) throw new Error('Dropbox ist noch nicht eingerichtet (dropbox-config.js).');
      var files = (await listFiles()).filter(function (f) { return /\.json$/i.test(f.name); });
      var list = [], bad = [];
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        try {
          var e = JSON.parse(await downloadText(f.path_lower || f.path_display));
          if (!e || !e.run || !e.run.hash || !e.run.number || (e.type !== 'save' && e.type !== 'delete')) throw 0;
          list.push({ name: f.name, path: f.path_lower || f.path_display, entry: e });
        } catch (x) {
          if (x && x.scope) throw x;
          bad.push(f.name);
        }
      }
      list.sort(function (a, b) { return (a.entry.sentAt || a.name) < (b.entry.sentAt || b.name) ? -1 : 1; });
      return { list: list, bad: bad };
    },
    // Number of waiting entries (only lists the folder, no downloads)
    count: async function () {
      if (!this.configured()) return 0;
      return (await listFiles()).filter(function (f) { return /\.json$/i.test(f.name); }).length;
    },
    // Moves an imported entry into the subfolder "erledigt"
    done: async function (item) {
      try { await rpc('files/create_folder_v2', { path: '/erledigt', autorename: false }); }
      catch (e) { if (e.scope) throw e; } // already exists
      await rpc('files/move_v2', { from_path: item.path, to_path: '/erledigt/' + item.name, autorename: true });
    },
    // Setup: checks whether the code may also read (list) the folder. Returns '' or an error text.
    testRead: async function (refreshToken) {
      try { await listFiles(refreshToken); return ''; }
      catch (e) { return e.message; }
    }
  };
})();
