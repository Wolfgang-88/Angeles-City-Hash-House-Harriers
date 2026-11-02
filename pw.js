// Mitgliederliste für das Log In
// Neue Member einfach als weitere Zeile eintragen (Komma am Zeilenende nicht vergessen).
// webmaster: true  -> darf direkt in run.js speichern und Einträge übernehmen, GitHub/Dropbox einrichten
// moderator: true  -> darf direkt in die online run.js speichern und Einträge übernehmen
//                     (ohne „GitHub einrichten“ / „Dropbox einrichten“). Zum Speichern braucht der
//                     Moderator das Moderator-Passwort, das der Webmaster auf „GitHub einrichten“ festlegt.
// ohne Zusatz      -> Member: Einträge werden an den Webmaster gesendet
// Beispiel Moderator:  { name: "Max", password: "123456", moderator: true },

// Moderator-Passwort (dasselbe wie auf „GitHub einrichten“ → „Moderator-Zugang“ festgelegt).
// Ist es hier eingetragen, wird bei Moderatoren beim „Speichern“ / „Einträge übernehmen“
// nicht mehr nachgefragt – GitHub wird automatisch entsperrt. Leer lassen ("") = wie bisher nachfragen.
// ACHTUNG: pw.js ist öffentlich lesbar – wer dieses Passwort kennt, kann run.js auf GitHub ändern.
var MODERATOR_PASSWORD = "2026moderator";

var MEMBERS = [
  { name: "wolfgang", password: "300458", webmaster: true },
  { name: "Bilge Pump", password: "300458", moderator: true },
  { name: "DWD", password: "585151" },
  { name: "Vendor Bender", password: "620595", moderator: true },
  { name: "Facilitator", password: "102907" }
];
