#!/usr/bin/env node
// Checks all exam folders and prints every problem. Exit code 1 on errors.
// Usage: npm run validate            (all folders)
//        npm run validate -- zug

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../src/server/config.js';
import { loadExamFolder } from '../src/server/exams.js';

const { examsDir } = loadConfig();
const only = process.argv.slice(2);
const dirs = fs
  .readdirSync(examsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
  .map((e) => e.name)
  .filter((n) => !only.length || only.includes(n));

let errors = 0;
for (const name of dirs) {
  const dir = path.join(examsDir, name);
  if (!fs.existsSync(path.join(dir, 'meta.json'))) {
    console.log(`✗ ${name}: meta.json fehlt`);
    errors++;
    continue;
  }
  const exam = loadExamFolder(dir);
  const types = {};
  for (const q of exam.questions) types[q.type] = (types[q.type] ?? 0) + 1;
  const summary = Object.entries(types).map(([t, n]) => `${n} ${t}`).join(', ') || 'keine Fragen';
  if (exam.errors.length) {
    console.log(`✗ ${name}: ${exam.errors.length} Fehler (${summary})`);
    for (const e of exam.errors) console.log(`    - ${e}`);
    errors += exam.errors.length;
  } else {
    console.log(`✓ ${name}: ${exam.exam} / ${exam.topic}, ${exam.date ?? 'ohne Datum'}, ${summary}`);
  }
}
if (!dirs.length) console.log('Keine Prüfungsordner gefunden.');
process.exit(errors ? 1 : 0);
