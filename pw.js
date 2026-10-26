// Mitgliederliste für das Log In
// Neue Member einfach als weitere Zeile eintragen (Komma am Zeilenende nicht vergessen).
// webmaster: true  -> darf direkt in run.js speichern und Einträge übernehmen, GitHub/Dropbox einrichten
// moderator: true  -> darf direkt in die online run.js speichern und Einträge übernehmen
//                     (ohne „GitHub einrichten“ / „Dropbox einrichten“). Zum Speichern braucht der
//                     Moderator das Moderator-Passwort, das der Webmaster auf „GitHub einrichten“ festlegt.
// ohne Zusatz      -> Member: Einträge werden an den Webmaster gesendet
// Beispiel Moderator:  { name: "Max", password: "123456", moderator: true },
var MEMBERS = [
  { name: "wolfgang", password: "11wolfgang11", webmaster: true },
  { name: "Bilge Pump", password: "11wolfgang11",  moderator: true },
  { name: "Mustermann", password: "111111" },
  { name: "DWD", password: "111111" }
];
