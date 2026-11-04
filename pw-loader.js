// Lädt die Mitgliederliste (pw.js) aus der Dropbox statt aus dem GitHub-Repository.
// Die Datei liegt im Dropbox-App-Ordner (Dropbox → Apps → ACH3_upload → pw.js) und wird
// über den Dropbox-Zugang aus dropbox-config.js gelesen. Inhalt und Format bleiben wie bisher
// (var MEMBERS = [...]; var MODERATOR_PASSWORD = "...";).
// Benötigt: dropbox-config.js und dropbox.js vorher einbinden.
// Danach: PW_READY ist ein Promise – erst wenn es erfüllt ist, sind MEMBERS / MODERATOR_PASSWORD gesetzt.
//         PW_ERROR enthält bei einem Fehler den Fehlertext (sonst '').
var PW_DROPBOX_PATH = '/pw.js';
var PW_ERROR = '';
var PW_READY = (function () {
  function fail(text) {
    PW_ERROR = text;
    console.warn('pw.js aus Dropbox:', text);
    return false;
  }
  if (typeof DROPBOX === 'undefined' || !DROPBOX.configured()) {
    return Promise.resolve(fail('Dropbox ist nicht eingerichtet – pw.js kann nicht geladen werden.'));
  }
  return DROPBOX.readFile(PW_DROPBOX_PATH).then(function (text) {
    // als normales Skript ausführen, damit "var MEMBERS" global wird wie beim <script src="pw.js">
    var s = document.createElement('script');
    s.textContent = text;
    document.head.appendChild(s);
    s.remove();
    if (typeof MEMBERS === 'undefined') return fail('pw.js aus der Dropbox enthält keine Mitgliederliste (MEMBERS).');
    return true;
  }, function (e) {
    var m = e && e.message ? String(e.message) : String(e);
    if (/not_found/.test(m)) return fail('PW not found');
    if (e instanceof TypeError) return fail('Keine Internetverbindung – pw.js konnte nicht aus der Dropbox geladen werden.');
    return fail(m);
  });
})();
