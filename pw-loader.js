// Lädt die Mitgliederliste (pw.js) aus der db statt aus dem GitHub-Repository.
// Die Datei liegt im db-App-Ordner (db → Apps → ACH3_upload → pw.js) und wird
// über den db-Zugang aus db-config.js gelesen. Inhalt und Format bleiben wie bisher
// (var MEMBERS = [...]; var MODERATOR_PASSWORD = "...";).
// Benötigt: db-config.js und db.js vorher einbinden.
// Danach: PW_READY ist ein Promise – erst wenn es erfüllt ist, sind MEMBERS / MODERATOR_PASSWORD gesetzt.
//         PW_ERROR enthält bei einem Fehler den Fehlertext (sonst '').
var PW_db_PATH = '/pw.js';
var PW_ERROR = '';
var PW_READY = (function () {
  function fail(text) {
    PW_ERROR = text;
    console.warn('pw.js aus db:', text);
    return false;
  }
  if (typeof db === 'undefined' || !db.configured()) {
    return Promise.resolve(fail('db ist nicht eingerichtet – pw.js kann nicht geladen werden.'));
  }
  return db.readFile(PW_db_PATH).then(function (text) {
    // als normales Skript ausführen, damit "var MEMBERS" global wird wie beim <script src="pw.js">
    var s = document.createElement('script');
    s.textContent = text;
    document.head.appendChild(s);
    s.remove();
    if (typeof MEMBERS === 'undefined') return fail('pw.js aus der db enthält keine Mitgliederliste (MEMBERS).');
    return true;
  }, function (e) {
    var m = e && e.message ? String(e.message) : String(e);
    if (/not_found/.test(m)) return fail('PW not found');
    if (e instanceof TypeError) return fail('Keine Internetverbindung – pw.js konnte nicht aus der db geladen werden.');
    return fail(m);
  });
})();
