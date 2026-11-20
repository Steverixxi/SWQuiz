import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ExamLibrary } from '../src/server/exams.js';
import { ProgressStore } from '../src/server/progress.js';
import { StudyService } from '../src/server/study.js';
import { validateQuestion } from '../src/core/validate.js';

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'swquiz-'));
  const exam = path.join(root, 'exams', 'demo');
  fs.mkdirSync(path.join(exam, 'questions'), { recursive: true });
  fs.writeFileSync(path.join(exam, 'meta.json'), JSON.stringify({ exam: 'Demo', topic: 'Thema', date: '2099-01-01' }));
  const qs = Array.from({ length: 3 }, (_, i) => ({
    id: `q${i}`, type: 'single', question: `Frage ${i}`, options: [{ text: 'a', correct: true }, { text: 'b' }],
  }));
  fs.writeFileSync(path.join(exam, 'questions', '01.json'), JSON.stringify({ chapter: 'K1', questions: qs }));
  const library = new ExamLibrary(path.join(root, 'exams'));
  const mk = (device) => new StudyService({ library, progress: new ProgressStore({ dataDir: path.join(root, 'progress'), device }) });
  return { root, mk };
}

test('queue serves new cards, then learning cards, and syncs across devices', () => {
  const { mk } = setup();
  const a = mk('mac');
  let next = a.next({});
  assert.equal(next.done, false);
  assert.equal(next.card.cardId, 'demo/q0');
  assert.equal(next.counts.new, 3);
  a.progress.addReview({ card: 'demo/q0', rating: 3 });
  next = a.next({});
  assert.equal(next.card.cardId, 'demo/q1');

  // second device sees the same progress via the shared folder
  const b = mk('iphone');
  const dash = b.dashboard();
  assert.equal(dash.exams[0].counts.learning, 1);
  b.progress.addReview({ card: 'demo/q1', rating: 4 });
  assert.equal(a.dashboard().exams[0].counts.young, 1);
  assert.ok(fs.existsSync(path.join(a.progress.dataDir, 'reviews-mac.jsonl')));
  assert.ok(fs.existsSync(path.join(a.progress.dataDir, 'reviews-iphone.jsonl')));
});

test('undo removes the last own review', () => {
  const { mk } = setup();
  const a = mk('mac');
  a.progress.addReview({ card: 'demo/q0', rating: 4 });
  assert.equal(a.dashboard().exams[0].counts.new, 2);
  a.progress.undoLast();
  assert.equal(a.dashboard().exams[0].counts.new, 3);
});

test('validation reports readable errors', () => {
  assert.deepEqual(validateQuestion({ id: 'x', type: 'single', question: 'q', options: [{ text: 'a', correct: true }, { text: 'b' }] }, 'f'), []);
  assert.match(validateQuestion({ id: 'x', type: 'single', question: 'q', options: [{ text: 'a' }, { text: 'b' }] }, 'f')[0], /genau 1/);
  assert.match(validateQuestion({ id: 'x', type: 'image', question: 'q', image: 'a.jpg', labels: [{ n: 1, x: 120, y: 5, answer: 'z' }] }, 'f')[0], /0–100/);
  assert.match(validateQuestion({ id: 'x', type: 'nope' }, 'f')[0], /type/);
});
