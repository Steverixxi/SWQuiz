// Builds study queues and dashboard statistics from exams + progress.

import {
  DEFAULT_SETTINGS,
  classify,
  daysUntilExam,
  isDue,
  newCardsAllowedToday,
  previewRatings,
  studyDayStart,
  addStudyDays,
} from '../core/scheduler.js';

const LEARN_AHEAD_MS = 20 * 60_000;

export class StudyService {
  constructor({ library, progress }) {
    this.library = library;
    this.progress = progress;
  }

  settings() {
    return { ...DEFAULT_SETTINGS, ...this.progress.readSettings() };
  }

  snapshot(now = Date.now()) {
    const settings = this.settings();
    const exams = this.library.all();
    const byId = new Map(exams.map((e) => [e.id, e]));
    const contextFor = (cardId) => {
      const exam = byId.get(cardId.split('/')[0]);
      if (!exam || !exam.questions.some((q) => q.cardId === cardId)) return null;
      return { examDate: exam.date };
    };
    // "formerIds" in meta.json keeps progress when a folder is renamed or merged
    const alias = new Map();
    for (const e of exams) for (const old of e.meta.formerIds ?? []) alias.set(old, e.id);
    const resolve = (cardId) => {
      const i = cardId.indexOf('/');
      const to = alias.get(cardId.slice(0, i));
      return to ? `${to}${cardId.slice(i)}` : cardId;
    };
    const { states, history } = this.progress.states(contextFor, settings, resolve);
    const dayStart = studyDayStart(now, settings);
    return { now, settings, exams, byId, states, history, dayStart };
  }

  examStats(exam, snap) {
    const { now, states, history, dayStart, settings } = snap;
    const counts = { total: exam.questions.length, new: 0, learning: 0, young: 0, mature: 0, dueReview: 0, dueLearning: 0 };
    const chapters = new Map();
    for (const q of exam.questions) {
      const st = states.get(q.cardId);
      const cls = classify(st, now);
      counts[cls]++;
      const ch = q.chapter ?? 'Allgemein';
      if (!chapters.has(ch)) chapters.set(ch, { name: ch, total: 0, new: 0, learning: 0, young: 0, mature: 0, due: 0 });
      const c = chapters.get(ch);
      c.total++;
      c[cls]++;
      if (st && st.status !== 'new' && st.due != null) {
        const endOfDay = addStudyDays(now, 1, settings);
        if (st.status === 'review' && isDue(st, now, settings)) {
          counts.dueReview++;
          c.due++;
        } else if (st.status !== 'review' && st.due < endOfDay) {
          counts.dueLearning++;
          c.due++;
        }
      }
    }
    const daysLeft = daysUntilExam(now, exam.date, settings);
    const introducedToday = history.filter((h) => h.wasNew && h.t >= dayStart && h.card.startsWith(exam.id + '/')).length;
    const newToday = newCardsAllowedToday({ unseen: counts.new, introducedToday, daysLeft }, settings);
    const reviewsToday = history.filter((h) => h.t >= dayStart && h.card.startsWith(exam.id + '/')).length;

    // forecast of review cards due on each of the next 14 days
    const forecast = new Array(14).fill(0);
    for (const q of exam.questions) {
      const st = states.get(q.cardId);
      if (!st || st.status !== 'review') continue;
      const idx = Math.round((studyDayStart(st.due, settings) - dayStart) / 86_400_000);
      forecast[Math.max(0, Math.min(13, idx))]++;
    }

    const learned = counts.young + counts.mature;
    return {
      id: exam.id,
      exam: exam.exam,
      topic: exam.topic,
      date: exam.date,
      color: exam.color,
      description: exam.description,
      archived: exam.meta.archived === true,
      daysLeft,
      counts,
      due: counts.dueReview + counts.dueLearning,
      newToday,
      openToday: counts.dueReview + counts.dueLearning + newToday,
      reviewsToday,
      progress: counts.total ? learned / counts.total : 0,
      seen: counts.total ? (counts.total - counts.new) / counts.total : 0,
      chapters: [...chapters.values()],
      notes: exam.notes,
      errors: exam.errors,
      forecast,
    };
  }

  dashboard(now = Date.now()) {
    const snap = this.snapshot(now);
    const exams = snap.exams.map((e) => this.examStats(e, snap));
    const active = exams.filter((e) => !e.archived);
    const sum = (k) => active.reduce((a, e) => a + e[k], 0);
    const forecast = new Array(14).fill(0);
    for (const e of active) e.forecast.forEach((v, i) => (forecast[i] += v));
    const today = snap.history.filter((h) => h.t >= snap.dayStart);
    return {
      now,
      exams,
      totals: {
        due: sum('due'),
        newToday: sum('newToday'),
        openToday: sum('openToday'),
        reviewsToday: today.length,
        correctToday: today.filter((h) => h.r >= 3).length,
        cards: active.reduce((a, e) => a + e.counts.total, 0),
      },
      streak: this.streak(snap),
      forecast,
      device: this.progress.device,
    };
  }

  streak(snap) {
    const days = new Set(snap.history.map((h) => studyDayStart(h.t, snap.settings)));
    let streak = 0;
    let day = snap.dayStart;
    if (!days.has(day)) day = addStudyDays(day, -1, snap.settings);
    while (days.has(day)) {
      streak++;
      day = addStudyDays(day, -1, snap.settings);
    }
    return streak;
  }

  /**
   * Next card for a scope.
   * @param {{exam?: string, chapter?: string, now?: number}} opts  exam "all" = all active exams
   */
  next({ exam = 'all', chapter = null, now = Date.now(), exclude = null } = {}) {
    const snap = this.snapshot(now);
    const { states, settings, history, dayStart } = snap;
    const exams = exam === 'all' ? snap.exams.filter((e) => e.meta.archived !== true) : snap.exams.filter((e) => e.id === exam);
    if (!exams.length) return { error: 'Prüfung nicht gefunden' };

    const learning = [];
    const reviews = [];
    const fresh = [];
    const ahead = [];
    for (const ex of exams) {
      const daysLeft = daysUntilExam(now, ex.date, settings);
      const qs = ex.questions.filter((q) => !chapter || (q.chapter ?? 'Allgemein') === chapter);
      let unseen = 0;
      const newOnes = [];
      for (const q of qs) {
        if (q.cardId === exclude) continue;
        const st = states.get(q.cardId);
        if (!st || st.status === 'new') {
          unseen++;
          newOnes.push(q);
        } else if (st.status === 'review') {
          if (isDue(st, now, settings)) reviews.push({ q, st, daysLeft });
        } else if (st.due <= now) {
          learning.push({ q, st, daysLeft });
        } else if (st.due <= now + LEARN_AHEAD_MS) {
          ahead.push({ q, st, daysLeft });
        }
      }
      const introducedToday = history.filter((h) => h.wasNew && h.t >= dayStart && h.card.startsWith(ex.id + '/')).length;
      const allowed = newCardsAllowedToday(
        { unseen: ex.questions.filter((q) => !states.get(q.cardId) || states.get(q.cardId).status === 'new').length, introducedToday, daysLeft },
        settings,
      );
      // with a chapter filter the new limit still counts for the whole topic
      for (const q of newOnes.slice(0, allowed)) fresh.push({ q, st: null, daysLeft });
    }

    const exam_ = (x) => (x.daysLeft == null || x.daysLeft < 0 ? 9999 : x.daysLeft);
    learning.sort((a, b) => a.st.due - b.st.due);
    reviews.sort((a, b) => exam_(a) - exam_(b) || a.st.due - b.st.due);
    // interleave new cards of different exams, closest exam first
    fresh.sort((a, b) => exam_(a) - exam_(b));
    ahead.sort((a, b) => a.st.due - b.st.due);

    const answeredToday = history.filter((h) => h.t >= dayStart).length;
    let pick = null;
    if (learning.length) pick = learning[0];
    else if (reviews.length && fresh.length) pick = answeredToday % 4 === 3 ? fresh[0] : reviews[0];
    else pick = reviews[0] ?? fresh[0] ?? ahead[0] ?? null;

    const counts = { learning: learning.length + ahead.length, review: reviews.length, new: fresh.length };
    if (!pick) {
      // find when the next card becomes due
      let nextDue = null;
      for (const ex of exams) {
        for (const q of ex.questions) {
          const st = states.get(q.cardId);
          if (st && st.status !== 'new' && st.due != null && (nextDue == null || st.due < nextDue)) nextDue = st.due;
        }
      }
      return { done: true, counts, nextDue };
    }

    const ex = snap.byId.get(pick.q.examId);
    const state = pick.st ?? null;
    return {
      done: false,
      counts,
      card: {
        ...pick.q,
        examTitle: ex.exam,
        topic: ex.topic,
        examDate: ex.date,
        color: ex.color,
        shuffle: ex.shuffle,
        daysLeft: pick.daysLeft,
      },
      state: state ?? { status: 'new' },
      previews: previewRatings(state, now, { examDate: ex.date }, settings),
    };
  }
}
