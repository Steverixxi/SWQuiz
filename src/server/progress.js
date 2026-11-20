// Learning progress, stored as append-only review logs.
//
// Each device writes only its own file `reviews-<device>.jsonl` inside the data
// folder. Put the data folder into Nextcloud (or any synced folder) and every
// device sees all reviews without sync conflicts: the card states are rebuilt
// by replaying all logs in time order.

import fs from 'node:fs';
import path from 'node:path';
import { review, newCardState } from '../core/scheduler.js';

export class ProgressStore {
  constructor({ dataDir, device }) {
    this.dataDir = dataDir;
    this.device = device.replace(/[^A-Za-z0-9_-]/g, '_') || 'device';
    fs.mkdirSync(dataDir, { recursive: true });
    this.ownFile = path.join(dataDir, `reviews-${this.device}.jsonl`);
    this.signature = null;
    this.entries = [];
  }

  logFiles() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    return fs
      .readdirSync(this.dataDir)
      .filter((f) => /^reviews-.*\.jsonl$/.test(f) && !f.includes('conflict'))
      .map((f) => path.join(this.dataDir, f));
  }

  /** Re-read logs when any file changed (e.g. Nextcloud synced another device). */
  load() {
    const files = this.logFiles();
    const sig = files
      .map((f) => {
        const st = fs.statSync(f);
        return `${f}:${st.size}:${st.mtimeMs}`;
      })
      .join('|');
    if (sig === this.signature) return this.entries;
    const entries = [];
    for (const f of files) {
      for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          entries.push(JSON.parse(line));
        } catch {
          // a half-synced last line is ignored and read again next time
        }
      }
    }
    entries.sort((a, b) => a.t - b.t || String(a.dev).localeCompare(String(b.dev)));
    this.entries = entries;
    this.signature = sig;
    return entries;
  }

  append(entry) {
    const full = { ...entry, dev: this.device };
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.appendFileSync(this.ownFile, JSON.stringify(full) + '\n');
    return full;
  }

  addReview({ card, rating, ms, now = Date.now() }) {
    return this.append({ t: now, card, r: rating, ms: ms ?? null });
  }

  /** Undo the latest review made on this device that is not yet undone. */
  undoLast() {
    const entries = this.load();
    const undone = new Set(entries.filter((e) => e.undo).map((e) => `${e.dev}:${e.undo}`));
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (e.dev === this.device && e.r && !undone.has(`${e.dev}:${e.t}`)) {
        this.append({ t: Date.now(), undo: e.t });
        return e;
      }
    }
    return null;
  }

  /**
   * Replay all logs into card states.
   * @param {(cardId: string) => {examDate: string|null} | null} contextFor
   * @param {object} settings
   */
  states(contextFor, settings, resolve = (id) => id) {
    const entries = this.load();
    const undone = new Set(entries.filter((e) => e.undo).map((e) => `${e.dev}:${e.undo}`));
    const states = new Map();
    const history = [];
    for (const e of entries) {
      if (!e.r || undone.has(`${e.dev}:${e.t}`)) continue;
      const card = resolve(e.card);
      const ctx = contextFor(card);
      if (!ctx) continue; // card was deleted
      const before = states.get(card) ?? newCardState();
      states.set(card, review(before, e.r, e.t, ctx, settings));
      history.push({ t: e.t, card, r: e.r, wasNew: before.status === 'new' });
    }
    return { states, history };
  }

  readSettings() {
    const f = path.join(this.dataDir, 'settings.json');
    try {
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {
      return {};
    }
  }

  writeSettings(settings) {
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(path.join(this.dataDir, 'settings.json'), JSON.stringify(settings, null, 2) + '\n');
  }
}
