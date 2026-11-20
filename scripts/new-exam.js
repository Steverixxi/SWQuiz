#!/usr/bin/env node
// Creates a new exam folder with meta.json and an example question file.
// Usage: npm run new-exam -- <ordner-name> "<Prüfung>" "<Thema>" <JJJJ-MM-TT>

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../src/server/config.js';

const [name, exam, topic, date] = process.argv.slice(2);
if (!name || !exam || !topic || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
  console.log('Aufruf: npm run new-exam -- <ordner-name> "<Prüfung>" "<Thema>" <JJJJ-MM-TT>');
  console.log('Beispiel: npm run new-exam -- anatomie-obere-extremitaet "Anatomie Testat 1" "Obere Extremität" 2027-03-12');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
  console.log('Der Ordnername darf nur Kleinbuchstaben, Ziffern und - enthalten.');
  process.exit(1);
}
const dir = path.join(loadConfig().examsDir, name);
if (fs.existsSync(dir)) {
  console.log(`${dir} existiert schon.`);
  process.exit(1);
}
fs.mkdirSync(path.join(dir, 'questions'), { recursive: true });
fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
fs.mkdirSync(path.join(dir, 'notes'), { recursive: true });
fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ exam, topic, date }, null, 2) + '\n');
fs.writeFileSync(
  path.join(dir, 'questions', '01-beispiel.json'),
  JSON.stringify(
    {
      chapter: 'Beispiel',
      questions: [
        {
          id: 'beispiel-001',
          type: 'single',
          question: 'Beispielfrage: Welche Antwort ist richtig?',
          options: [
            { text: 'Diese hier', correct: true },
            { text: 'Diese nicht' },
          ],
          explanation: 'Ersetze diese Datei durch echte Fragen.',
        },
      ],
    },
    null,
    2,
  ) + '\n',
);
console.log(`✓ ${dir} angelegt. Fragen kommen nach ${path.join(dir, 'questions')}/`);
