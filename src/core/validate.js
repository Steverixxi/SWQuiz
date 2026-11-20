// Validation of exam folders (meta.json + question files). Pure, no I/O.
// Returns human readable messages so agents and humans can fix files quickly.

export const QUESTION_TYPES = ['single', 'multiple', 'matching', 'image', 'order', 'flashcard'];

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

export function validateMeta(meta, where = 'meta.json') {
  const errors = [];
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return [`${where}: muss ein JSON-Objekt sein`];
  }
  if (!isStr(meta.exam)) errors.push(`${where}: "exam" (Name der Prüfung) fehlt`);
  if (!isStr(meta.topic)) errors.push(`${where}: "topic" (Thema) fehlt`);
  if (meta.date != null && !/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) {
    errors.push(`${where}: "date" muss im Format JJJJ-MM-TT sein, z. B. "2027-02-05"`);
  }
  if (meta.date == null) errors.push(`${where}: "date" (Prüfungstag) fehlt`);
  if (meta.color != null && !/^#[0-9a-fA-F]{6}$/.test(meta.color)) {
    errors.push(`${where}: "color" muss eine Hex-Farbe wie "#4f7cff" sein`);
  }
  return errors;
}

function checkOptions(q, where, errors, { exactlyOne }) {
  if (!Array.isArray(q.options) || q.options.length < 2) {
    errors.push(`${where}: "options" braucht mindestens 2 Antworten`);
    return;
  }
  q.options.forEach((o, i) => {
    if (!o || typeof o !== 'object' || !isStr(o.text)) {
      errors.push(`${where}: options[${i}] braucht "text"`);
    }
  });
  const correct = q.options.filter((o) => o && o.correct === true).length;
  if (exactlyOne && correct !== 1) {
    errors.push(`${where}: Single Choice braucht genau 1 Antwort mit "correct": true (gefunden: ${correct})`);
  }
  if (!exactlyOne && correct < 1) {
    errors.push(`${where}: Multiple Choice braucht mindestens 1 Antwort mit "correct": true`);
  }
}

export function validateQuestion(q, where, { hasFile } = {}) {
  const errors = [];
  if (!q || typeof q !== 'object' || Array.isArray(q)) return [`${where}: Frage muss ein Objekt sein`];
  if (!isStr(q.id)) errors.push(`${where}: "id" fehlt`);
  else if (!/^[A-Za-z0-9._-]+$/.test(q.id)) {
    errors.push(`${where}: "id" darf nur Buchstaben, Ziffern, . _ - enthalten`);
  }
  if (!QUESTION_TYPES.includes(q.type)) {
    errors.push(`${where}: "type" muss einer von ${QUESTION_TYPES.join(', ')} sein`);
    return errors;
  }
  if (q.type !== 'flashcard' && !isStr(q.question)) errors.push(`${where}: "question" fehlt`);
  if (q.image != null && !isStr(q.image)) errors.push(`${where}: "image" muss ein Pfad sein`);
  if (isStr(q.image) && hasFile && !hasFile(q.image)) {
    errors.push(`${where}: Bild "${q.image}" nicht gefunden`);
  }

  switch (q.type) {
    case 'single':
      checkOptions(q, where, errors, { exactlyOne: true });
      break;
    case 'multiple':
      checkOptions(q, where, errors, { exactlyOne: false });
      break;
    case 'matching':
      if (!Array.isArray(q.pairs) || q.pairs.length < 2) {
        errors.push(`${where}: "pairs" braucht mindestens 2 Paare`);
      } else {
        q.pairs.forEach((p, i) => {
          if (!p || !isStr(p.left) || !isStr(p.right)) errors.push(`${where}: pairs[${i}] braucht "left" und "right"`);
        });
      }
      if (q.distractors != null && !Array.isArray(q.distractors)) errors.push(`${where}: "distractors" muss eine Liste sein`);
      break;
    case 'image':
      if (!isStr(q.image)) errors.push(`${where}: Bildfrage braucht "image"`);
      if (!Array.isArray(q.labels) || q.labels.length < 1) {
        errors.push(`${where}: "labels" braucht mindestens 1 Markierung`);
      } else {
        const seen = new Set();
        q.labels.forEach((l, i) => {
          if (!l || l.n == null || !isStr(String(l.n))) errors.push(`${where}: labels[${i}] braucht "n" (Nummer)`);
          if (!l || !isStr(l.answer)) errors.push(`${where}: labels[${i}] braucht "answer"`);
          if (l && seen.has(String(l.n))) errors.push(`${where}: labels[${i}] Nummer "${l.n}" doppelt`);
          if (l) seen.add(String(l.n));
          const hasX = l && l.x != null;
          const hasY = l && l.y != null;
          if (hasX !== hasY) errors.push(`${where}: labels[${i}] braucht "x" und "y" zusammen`);
          for (const k of ['x', 'y', 'ax', 'ay']) {
            if (l && l[k] != null && !(typeof l[k] === 'number' && l[k] >= 0 && l[k] <= 100)) {
              errors.push(`${where}: labels[${i}].${k} muss eine Zahl 0–100 (Prozent) sein`);
            }
          }
        });
      }
      break;
    case 'order':
      if (!Array.isArray(q.items) || q.items.length < 2 || !q.items.every(isStr)) {
        errors.push(`${where}: "items" braucht mindestens 2 Texte in der richtigen Reihenfolge`);
      }
      break;
    case 'flashcard':
      if (!isStr(q.front)) errors.push(`${where}: Karteikarte braucht "front"`);
      if (!isStr(q.back)) errors.push(`${where}: Karteikarte braucht "back"`);
      break;
  }
  return errors;
}

/**
 * Normalize the content of one question file. Accepts either an array of
 * questions or { chapter, source, questions: [...] }.
 */
export function normalizeQuestionFile(data, file) {
  if (Array.isArray(data)) return { chapter: null, source: null, questions: data };
  if (data && typeof data === 'object' && Array.isArray(data.questions)) {
    return { chapter: data.chapter ?? null, source: data.source ?? null, questions: data.questions };
  }
  throw new Error(`${file}: muss eine Liste von Fragen oder { "questions": [...] } sein`);
}
