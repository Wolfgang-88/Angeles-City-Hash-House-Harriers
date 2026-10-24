// Sends single entries (new / changed / deleted runs) as small .json files
// into the Dropbox app folder (D:\Dropbox\Apps\<app name>). Uses dropbox-config.js.
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

  async function upload(refreshToken, path, text, overwrite) {
    var at = (await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })).access_token;
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
    startAuth: startAuth, finishAuth: finishAuth
  };
})();
