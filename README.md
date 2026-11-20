# SWQuiz

Lernsystem für das Medizinstudium, das wie Anki funktioniert (**Nochmal, Schlecht,
Gut, Einfach**), dessen Wiederholungen sich aber automatisch auf den **Prüfungstag**
jedes Themas ausrichten.

- Fragetypen: Single Choice, Multiple Choice, Zuordnung per Drag & Drop,
  Bildfragen (Nummern und Pfeile auf Gewebefotos zuordnen), Reihenfolge, Karteikarten
- Dashboard mit allem, was heute offen ist, und **„Alles Fällige üben“** über alle Themen
- Prüfungen sind einfache Ordner mit `meta.json` und JSON-Fragen, gut von Hand
  und von AI-Agents zu bearbeiten (siehe [AGENTS.md](AGENTS.md))
- Lernfortschritt synchronisiert über Nextcloud (oder jeden anderen Sync-Ordner)
- Keine Abhängigkeiten: nur Node.js ≥ 20

## Starten

```bash
npm start
```

Dann <http://localhost:4321> öffnen. Am Mac geht auch ein Doppelklick auf
`SWQuiz starten.command` (startet den Server und öffnet den Browser).

Tastatur beim Üben: `A`–`H` Antwort wählen, `Leertaste` prüfen bzw. „Gut“,
`1`–`4` bewerten, `Z` rückgängig, `Esc` beenden.

## Sync zwischen Geräten

Der Lernfortschritt liegt standardmäßig in `progress/` im Projektordner (nicht in
Git). Liegt der Projektordner in Nextcloud, ist der Fortschritt automatisch
synchron. Jedes Gerät schreibt **seine eigene** Datei `reviews-<gerät>.jsonl`,
deshalb gibt es keine Sync-Konflikte; die App liest alle Dateien zusammen.

Anderer Ort: `swquiz.config.example.json` nach `swquiz.config.json` kopieren und
`dataDir` setzen, z. B. `"~/Nextcloud/SWQuiz-Daten"`.

## Inhalte hinzufügen

```bash
npm run new-exam -- anatomie-obere-extremitaet "Anatomie Testat 1" "Obere Extremität" 2027-03-12
npm run validate
```

Das komplette Format steht in [AGENTS.md](AGENTS.md).

## Entwicklung

```bash
npm test          # Scheduler-Tests
npm run validate  # alle Prüfungsordner prüfen
npm run dev       # Server mit Auto-Reload
```

`src/core/` enthält Scheduler und Validierung ohne Node-Abhängigkeiten, damit
spätere native Apps (Electron oder Swift) dieselbe Logik bzw. dasselbe Datenformat
nutzen können.
