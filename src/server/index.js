// SWQuiz local server: JSON API + static web app. No dependencies.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, ROOT } from './config.js';
import { ExamLibrary } from './exams.js';
import { ProgressStore } from './progress.js';
import { StudyService } from './study.js';
import { DEFAULT_SETTINGS } from '../core/scheduler.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function serveFile(res, base, rel) {
  const file = path.resolve(base, '.' + path.posix.normalize('/' + rel));
  if (!file.startsWith(path.resolve(base) + path.sep) && file !== path.resolve(base)) return send(res, 403, { error: 'forbidden' });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export function createServer(config = loadConfig()) {
  const library = new ExamLibrary(config.examsDir);
  const progress = new ProgressStore({ dataDir: config.dataDir, device: config.device });
  const study = new StudyService({ library, progress });
  const publicDir = path.join(ROOT, 'public');

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);
    try {
      if (p === '/api/dashboard' && req.method === 'GET') return send(res, 200, study.dashboard());

      if (p === '/api/study/next' && req.method === 'GET') {
        return send(res, 200, study.next({
          exam: url.searchParams.get('exam') ?? 'all',
          chapter: url.searchParams.get('chapter') || null,
          exclude: url.searchParams.get('exclude') || null,
        }));
      }

      if (p === '/api/review' && req.method === 'POST') {
        const body = await readBody(req);
        const rating = Number(body.rating);
        if (![1, 2, 3, 4].includes(rating)) return send(res, 400, { error: 'rating muss 1–4 sein' });
        if (!library.card(String(body.cardId ?? ''))) return send(res, 404, { error: 'Karte nicht gefunden' });
        const entry = progress.addReview({ card: body.cardId, rating, ms: body.ms });
        return send(res, 200, { ok: true, entry });
      }

      if (p === '/api/undo' && req.method === 'POST') {
        const undone = progress.undoLast();
        return send(res, 200, { ok: !!undone, undone });
      }

      if (p === '/api/settings') {
        if (req.method === 'GET') return send(res, 200, { defaults: DEFAULT_SETTINGS, settings: progress.readSettings(), config: { ...config } });
        if (req.method === 'PUT') {
          const body = await readBody(req);
          const clean = {};
          for (const [k, v] of Object.entries(body)) if (k in DEFAULT_SETTINGS && v !== null && v !== '') clean[k] = v;
          progress.writeSettings(clean);
          return send(res, 200, { ok: true, settings: clean });
        }
      }

      let m;
      if ((m = /^\/api\/exams\/([^/]+)$/.exec(p)) && req.method === 'GET') {
        const exam = library.get(m[1]);
        if (!exam) return send(res, 404, { error: 'Prüfung nicht gefunden' });
        const snap = study.snapshot();
        return send(res, 200, study.examStats(exam, snap));
      }

      if ((m = /^\/api\/exams\/([^/]+)\/questions$/.exec(p)) && req.method === 'GET') {
        const exam = library.get(m[1]);
        if (!exam) return send(res, 404, { error: 'Prüfung nicht gefunden' });
        const snap = study.snapshot();
        return send(res, 200, exam.questions.map((q) => ({ ...q, state: snap.states.get(q.cardId) ?? { status: 'new' } })));
      }

      if ((m = /^\/exams\/([^/]+)\/(.+)$/.exec(p)) && req.method === 'GET') {
        const exam = library.get(m[1]);
        if (!exam) return send(res, 404, { error: 'not found' });
        return serveFile(res, exam.dir, m[2]);
      }

      if (p.startsWith('/api/')) return send(res, 404, { error: 'unbekannter Endpunkt' });
      return serveFile(res, publicDir, p === '/' ? 'index.html' : p);
    } catch (e) {
      console.error(e);
      return send(res, 500, { error: e.message });
    }
  });
  return { server, library, progress, study, config };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { server, config, library } = createServer();
  server.listen(config.port, config.host, () => {
    const exams = library.all();
    const errors = exams.flatMap((e) => e.errors);
    console.log(`\n  SWQuiz läuft auf  http://localhost:${config.port}\n`);
    console.log(`  Prüfungen:  ${config.examsDir}  (${exams.length} Themen, ${exams.reduce((a, e) => a + e.questions.length, 0)} Fragen)`);
    console.log(`  Fortschritt: ${config.dataDir}  (Gerät: ${config.device})`);
    if (errors.length) console.log(`\n  ⚠ ${errors.length} Fehler in den Fragen, siehe "npm run validate"`);
    console.log('');
  });
}
