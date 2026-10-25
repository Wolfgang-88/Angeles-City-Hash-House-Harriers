// Reads and writes files directly in the GitHub repository (GitHub API).
// Only for the webmaster. The access code is stored ENCRYPTED in github-config.js
// (AES-GCM, key derived from the webmaster password with PBKDF2). Without the
// webmaster password it is useless. After unlocking, the plain code is kept only
// for this browser tab (sessionStorage) and is gone when the tab is closed.
// Set up / change on github-setup.html.
var GITHUB = (function () {
  var REPO = 'Wolfgang-88/Angeles-City-Hash-House-Harriers', BRANCH = 'main';
  var SESSION_KEY = 'achhh_gh_token';
  var API = 'https://api.github.com/repos/' + REPO;
  var ITER = 600000; // PBKDF2 rounds: makes guessing the password very slow

  function cfg() { return (typeof GITHUB_CONFIG !== 'undefined' && GITHUB_CONFIG) || null; }
  function sessionToken() { try { return sessionStorage.getItem(SESSION_KEY) || ''; } catch (e) { return ''; } }
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {} // code of the earlier version (stored per computer)

  function headers(t) {
    return {
      'Authorization': 'Bearer ' + t,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  // ---------- Base64 ----------
  function bytesToB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function b64ToBytes(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function toB64(text) { return bytesToB64(new TextEncoder().encode(text)); }
  function fromB64(b64) { return new TextDecoder('utf-8').decode(b64ToBytes(b64)); }

  // ---------- Encryption of the access code ----------
  async function deriveKey(password, salt, iter) {
    if (!window.crypto || !crypto.subtle) throw new Error('Dieser Browser kann hier nicht verschlüsseln. Bitte die Website über https:// öffnen.');
    var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encrypt(token, password) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    var key = await deriveKey(password, salt, ITER);
    var data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(token)));
    return { v: 1, iter: ITER, salt: bytesToB64(salt), iv: bytesToB64(iv), data: bytesToB64(data) };
  }
  async function decrypt(enc, password) {
    var key = await deriveKey(password, b64ToBytes(enc.salt), enc.iter);
    try {
      var plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(enc.iv) }, key, b64ToBytes(enc.data));
      return new TextDecoder().decode(plain);
    } catch (e) { throw new Error('Falsches Webmaster-Passwort.'); }
  }
  function configText(enc) {
    return '// GitHub access for the webmaster – ENCRYPTED with the webmaster password.\n' +
      '// Created on github-setup.html – do not edit by hand.\n' +
      'var GITHUB_CONFIG = ' + JSON.stringify(enc, null, 2) + ';\n';
  }

  // ---------- GitHub API ----------
  async function fail(r) {
    var j = await r.json().catch(function () { return {}; });
    var m = j.message || ('HTTP ' + r.status);
    if (r.status === 401) m = 'Der GitHub-Zugangscode ist ungültig oder abgelaufen. Bitte auf „GitHub einrichten“ einen neuen eintragen.';
    else if (r.status === 403) m = 'Der GitHub-Zugangscode hat keinen Schreib-/Lesezugriff auf ' + REPO +
      ' (nötig: „Contents: Read and write“). GitHub meldet: ' + (j.message || r.status);
    var e = new Error(m); e.status = r.status; throw e;
  }
  function need(t) { if (!t) throw new Error('GitHub ist nicht entsperrt.'); return t; }

  // -> { text, sha }
  async function read(path, t) {
    t = need(t || sessionToken());
    var r = await fetch(API + '/contents/' + path + '?ref=' + BRANCH + '&t=' + Date.now(), { headers: headers(t), cache: 'no-store' });
    if (!r.ok) await fail(r);
    var j = await r.json();
    return { text: fromB64(j.content || ''), sha: j.sha };
  }

  // Writes the file as a new commit. sha = version that was read (protects against overwriting newer changes);
  // leave it out for a new file.
  async function write(path, text, sha, message, t) {
    t = need(t || sessionToken());
    var body = { message: message, content: toB64(text), branch: BRANCH };
    if (sha) body.sha = sha;
    var r = await fetch(API + '/contents/' + path, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers(t)),
      body: JSON.stringify(body)
    });
    if (r.status === 409 || r.status === 422) { var e = new Error(path + ' was changed on GitHub in the meantime.'); e.conflict = true; throw e; }
    if (!r.ok) await fail(r);
    return r.json();
  }

  async function test(t) {
    try { await read('run.js', t); }
    catch (e) {
      if (e.status === 404) throw new Error('Der Zugangscode hat keinen Zugriff auf das Repository ' + REPO + ' (bei „Repository access“ auswählen).');
      throw e;
    }
    var r = await fetch(API, { headers: headers(t), cache: 'no-store' });
    if (!r.ok) await fail(r);
    var j = await r.json();
    if (j.permissions && j.permissions.push === false) throw new Error('Dieser Zugangscode darf im Repository nicht schreiben.');
  }

  return {
    repo: REPO,
    configured: function () { var c = cfg(); return !!(c && c.data && c.salt && c.iv); },
    unlocked: function () { return !!sessionToken(); },
    unlock: async function (password) {
      var t = await decrypt(cfg(), password);
      sessionStorage.setItem(SESSION_KEY, t);
    },
    lock: function () { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {} },
    read: read,
    write: write,
    test: test,
    // Setup: checks the code, encrypts it with the password, writes github-config.js to GitHub.
    // Returns the file text (so it can also be saved in the local website folder).
    setup: async function (token, password) {
      await test(token);
      var text = configText(await encrypt(token, password));
      var sha = null;
      try { sha = (await read('github-config.js', token)).sha; } catch (e) { if (e.status !== 404) throw e; }
      await write('github-config.js', text, sha, 'GitHub-Zugang (verschlüsselt) aktualisiert', token);
      sessionStorage.setItem(SESSION_KEY, token);
      return text;
    }
  };
})();
