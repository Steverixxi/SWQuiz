// Loads exam folders from disk.
//
// exams/<folder>/meta.json          { exam, topic, date, ... }
// exams/<folder>/questions/*.json   question files
// exams/<folder>/notes/*.md         optional study notes
// exams/<folder>/images/...         images referenced by questions

import fs from 'node:fs';
import path from 'node:path';
import { validateMeta, validateQuestion, normalizeQuestionFile } from '../core/validate.js';

function readJson(file) {
  const raw = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`${file}: ungültiges JSON (${e.message})`);
  }
}

function listFiles(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.toLowerCase().endsWith(ext)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

export function loadExamFolder(dir) {
  const id = path.basename(dir);
  const errors = [];
  const rel = (p) => path.relative(dir, p).split(path.sep).join('/');
  let meta = {};
  const metaFile = path.join(dir, 'meta.json');
  try {
    meta = readJson(metaFile);
    errors.push(...validateMeta(meta, `${id}/meta.json`));
  } catch (e) {
    errors.push(e.message);
  }

  const questions = [];
  const ids = new Set();
  const hasFile = (p) => fs.existsSync(path.join(dir, p));
  for (const file of listFiles(path.join(dir, 'questions'), '.json')) {
    const where = `${id}/${rel(file)}`;
    let parsed;
    try {
      parsed = normalizeQuestionFile(readJson(file), where);
    } catch (e) {
      errors.push(e.message);
      continue;
    }
    parsed.questions.forEach((q, i) => {
      const qWhere = `${where} [${i}${q?.id ? ` ${q.id}` : ''}]`;
      const errs = validateQuestion(q, qWhere, { hasFile });
      if (q?.id && ids.has(q.id)) errs.push(`${qWhere}: "id" ist doppelt in diesem Ordner`);
      if (errs.length) {
        errors.push(...errs);
        return;
      }
      ids.add(q.id);
      questions.push({
        ...q,
        chapter: q.chapter ?? parsed.chapter ?? null,
        source: q.source ?? parsed.source ?? null,
        file: rel(file),
        cardId: `${id}/${q.id}`,
        examId: id,
      });
    });
  }

  const notes = listFiles(path.join(dir, 'notes'), '.md').map((f) => {
    const text = fs.readFileSync(f, 'utf8');
    const title = /^#\s+(.+)$/m.exec(text)?.[1] ?? path.basename(f, '.md');
    return { file: rel(f), title };
  });

  return {
    id,
    dir,
    exam: meta.exam ?? id,
    topic: meta.topic ?? id,
    date: meta.date ?? null,
    color: meta.color ?? null,
    description: meta.description ?? '',
    shuffle: meta.shuffle !== false,
    meta,
    questions,
    notes,
    errors,
  };
}

export class ExamLibrary {
  constructor(examsDir) {
    this.examsDir = examsDir;
    this.cache = null;
    this.loadedAt = 0;
  }

  /** Reloads from disk at most every 2 seconds, so edits show up live. */
  all() {
    if (!this.cache || Date.now() - this.loadedAt > 2000) {
      const dirs = fs.existsSync(this.examsDir)
        ? fs
            .readdirSync(this.examsDir, { withFileTypes: true })
            .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
            .map((e) => path.join(this.examsDir, e.name))
            .filter((d) => fs.existsSync(path.join(d, 'meta.json')))
            .sort()
        : [];
      this.cache = dirs.map(loadExamFolder);
      this.loadedAt = Date.now();
    }
    return this.cache;
  }

  get(id) {
    return this.all().find((e) => e.id === id) ?? null;
  }

  card(cardId) {
    const [examId, ...rest] = cardId.split('/');
    const exam = this.get(examId);
    if (!exam) return null;
    const qid = rest.join('/');
    const q = exam.questions.find((x) => x.id === qid);
    return q ? { exam, question: q } : null;
  }
}
