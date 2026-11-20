# SWQuiz – Anleitung für AI-Agents (und Menschen)

SWQuiz ist ein Lernsystem wie Anki, dessen Wiederholungen sich auf den Prüfungstag
jedes Themas ausrichten. Inhalte sind reine JSON-Dateien. **Du musst keinen Code
ändern, um Prüfungen oder Fragen hinzuzufügen.**

## Neue Prüfung / neues Thema anlegen

1. Lege einen Ordner unter `exams/` an. Name: Kleinbuchstaben, Ziffern, `-`
   (z. B. `exams/anatomie-obere-extremitaet/`). Oder:
   `npm run new-exam -- <ordner> "<Prüfung>" "<Thema>" <JJJJ-MM-TT>`
2. Lege darin `meta.json` an:

   ```json
   {
     "exam": "Anatomie Testat 1",
     "topic": "Obere Extremität",
     "date": "2027-03-12",
     "color": "#4f7cff",
     "description": "Optional, kurze Beschreibung"
   }
   ```

   - `exam` = Name der Prüfung. Ordner mit gleichem `exam` werden in der App
     gruppiert (eine Prüfung kann mehrere Themen-Ordner haben).
   - `topic` = Thema dieses Ordners.
   - `date` = Prüfungstag, **immer** `JJJJ-MM-TT`. Danach richtet sich das Timing.
   - optional: `color` (Hex), `description`, `archived: true` (blendet das Thema
     aus „Alles Fällige“ aus), `shuffle: false` (Antworten nicht mischen).
3. Lege Fragen als `.json` in `questions/` ab (beliebig viele Dateien, Unterordner
   erlaubt, Dateien werden alphabetisch geladen, also gern `01-…`, `02-…`).
4. Bilder nach `images/`, Lernunterlagen als Markdown nach `notes/`.
5. **Immer prüfen:** `npm run validate` (oder `npm run validate -- <ordner>`).
   Fehlerhafte Fragen werden in der App übersprungen und im Thema angezeigt.

Dateien und Ordner, die mit `_` oder `.` beginnen, werden ignoriert (gut für Entwürfe).

## Aufbau einer Fragendatei

```json
{
  "chapter": "VL 8 – Epithelgewebe",
  "source": "Skript Teil 1, S. 80–102",
  "questions": [ … ]
}
```

`chapter` und `source` gelten für alle Fragen der Datei (pro Frage überschreibbar).
Statt des Objekts darf die Datei auch direkt eine Liste von Fragen sein.

### Felder, die jede Frage hat

| Feld | Pflicht | Bedeutung |
| --- | --- | --- |
| `id` | ja | Eindeutig **innerhalb des Ordners**, nur `A–Z a–z 0–9 . _ -`. **Nie ändern**, sonst geht der Lernfortschritt der Frage verloren. |
| `type` | ja | `single`, `multiple`, `matching`, `image`, `order`, `flashcard` |
| `question` | ja (außer flashcard) | Fragetext |
| `image` | nein | Bildpfad relativ zum Ordner, z. B. `images/trachea.jpg` (bei jedem Typ möglich) |
| `explanation` | nein | Erklärung, wird nach dem Prüfen gezeigt |
| `source` | nein | Quelle, z. B. Skriptseite |
| `chapter` | nein | Kapitel (sonst aus der Datei) |
| `tags` | nein | Liste von Stichworten |

Texte erlauben `**fett**`, `*kursiv*`, `^hoch^`, `~tief~` (z. B. `O~2~`, `Ca^2+^`).

### `single` – Single Choice (genau eine richtig)

```json
{
  "id": "epi-ernaehrung",
  "type": "single",
  "question": "Wie werden Epithelien ernährt?",
  "options": [
    { "text": "Durch Diffusion aus dem Bindegewebe", "correct": true },
    { "text": "Über eigene Kapillaren", "explain": "Optional: warum falsch" }
  ],
  "explanation": "Epithelien sind gefäßfrei."
}
```

### `multiple` – Multiple Choice (mindestens eine richtig)

Wie `single`, nur dürfen mehrere Optionen `"correct": true` haben. Gewertet wird
alles oder nichts.

### `matching` – Zuordnung per Drag & Drop

```json
{
  "id": "kollagen-typen",
  "type": "matching",
  "question": "Ordne die Kollagentypen ihrem Vorkommen zu.",
  "pairs": [
    { "left": "Typ I", "right": "Sehne, Knochen" },
    { "left": "Typ II", "right": "Knorpel" }
  ],
  "distractors": ["Optional: falsche Zusatzbegriffe"]
}
```

### `image` – Bildfrage: Nummern/Pfeile auf einem Foto zuordnen

```json
{
  "id": "trachea-strukturen",
  "type": "image",
  "question": "Ordne die markierten Strukturen zu.",
  "image": "images/trachea.jpg",
  "labels": [
    { "n": 1, "x": 7, "y": 37, "ax": 31, "ay": 37, "answer": "Becherzelle" },
    { "n": 2, "x": 64, "y": 46, "answer": "Lamina propria" }
  ],
  "distractors": ["Mikrovilli"]
}
```

- `n` = Nummer, `answer` = richtige Bezeichnung.
- `x`, `y` = Position der Nummer in **Prozent** (0–100) von links bzw. oben.
- `ax`, `ay` = optional: Pfeilspitze in Prozent; dann wird ein Pfeil von der
  Nummer zur Struktur gezeichnet.
- Stehen die Nummern **schon im Foto**, lass `x`/`y` einfach weg.
- Position bestimmen: Bild öffnen, Pixel-Position durch Breite bzw. Höhe teilen, × 100.

### `order` – Reihenfolge

```json
{ "id": "mitose", "type": "order", "question": "Ordne die Phasen.", "items": ["Prophase", "Prometaphase", "Metaphase", "Anaphase", "Telophase"] }
```

`items` in der **richtigen** Reihenfolge angeben, die App mischt sie.

### `flashcard` – Karteikarte (selbst bewertet)

```json
{ "id": "osteon", "type": "flashcard", "front": "Aufbau eines Osteons?", "back": "Speziallamellen um einen Havers-Kanal …", "image": "images/x.jpg", "imageOnBack": true }
```

## Lernunterlagen

Markdown-Dateien in `notes/` erscheinen im Thema unter „Lernunterlagen“. Die erste
`# Überschrift` ist der Titel. Bilder relativ zur Datei: `![](../images/x.jpg)`.

## Regeln für gute Fragen

- Fakten nur aus den Unterlagen des Studierenden, Quelle in `source` angeben.
- Eine Frage prüft einen Gedanken. Lieber mehrere kurze Fragen.
- Falsche Optionen plausibel machen, `explain` nutzen, um Verwechslungen zu klären.
- Bei Bildern nie den Antworttext im Bild lassen (Beschriftungen wegschneiden).
- IDs mit Kapitelpräfix vergeben (`epi-…`, `bgw-…`), nie wiederverwenden.

## Wie das Timing funktioniert (Kurzfassung)

Bewertung wie in Anki: **Nochmal / Schlecht / Gut / Einfach**. Neue Karten
durchlaufen Lernschritte (1 und 10 Min), danach wachsen die Intervalle mit dem
Ease-Faktor (SM-2). Zusätzlich gilt pro Thema:

- Kein Intervall springt über den Prüfungstag. Jedes Intervall ist höchstens 60 %
  der verbleibenden Tage, so werden die Wiederholungen vor der Prüfung dichter
  und die letzte liegt am Tag davor.
- Neue Karten werden so verteilt, dass alle spätestens 3 Tage vor der Prüfung
  einmal gesehen wurden (mindestens 10, höchstens 200 pro Tag und Thema).
- Nach dem Prüfungstag läuft das Thema wie normales Anki weiter.

Code: `src/core/scheduler.js` (rein, ohne I/O, getestet mit `npm test`).

## Projektstruktur für Code-Änderungen

```
src/core/        Scheduler + Validierung (plattformunabhängig, für spätere native Apps)
src/server/      Node-Server ohne Abhängigkeiten: Laden der Ordner, Fortschritt, API
public/          Web-App (Vanilla JS, ES-Module, kein Build-Schritt)
exams/           Inhalte
scripts/         validate, new-exam
test/            node --test
```

Nach Code-Änderungen: `npm test` und `npm run validate`.
