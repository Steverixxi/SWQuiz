// SWQuiz scheduler: Anki-style spaced repetition (SM-2 family) that adapts every
// interval to the exam date of the card's topic.
//
// Pure functions only, no I/O. Shared by the server and (later) native apps.

export const RATING = Object.freeze({ AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 });
export const RATING_LABELS = Object.freeze({ 1: 'Nochmal', 2: 'Schlecht', 3: 'Gut', 4: 'Einfach' });

const MINUTE = 60_000;
const DAY = 86_400_000;

export const DEFAULT_SETTINGS = Object.freeze({
  learningSteps: [1, 10], // minutes
  relearningSteps: [10], // minutes
  graduatingInterval: 1, // days
  easyInterval: 4, // days
  startEase: 2.5,
  minEase: 1.3,
  hardFactor: 1.2,
  easyBonus: 1.3,
  maxInterval: 365, // days
  dayStartHour: 4, // a new study day starts at 04:00 local time (like Anki)
  // Exam adaptation: before the exam, an interval may cover at most this share
  // of the days that are left, and never jumps past the day before the exam.
  examCapFactor: 0.6,
  // New cards per day are spread so that every card is introduced this many
  // days before the exam at the latest.
  newCardBufferDays: 3,
  minNewPerDay: 10,
  maxNewPerDay: 200,
  newPerDayAfterExam: 20,
});

export function newCardState() {
  return {
    status: 'new', // new | learning | review | relearning
    step: 0,
    ease: null,
    interval: 0, // days (review cards)
    due: null, // epoch ms
    reps: 0,
    lapses: 0,
    lastReview: null,
    lastRating: null,
  };
}

/** Epoch ms of the start of the study day that contains `now`. */
export function studyDayStart(now, s = DEFAULT_SETTINGS) {
  const d = new Date(now);
  d.setHours(s.dayStartHour, 0, 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

/** Study-day start that is `days` study days after the one containing `now`. */
export function addStudyDays(now, days, s = DEFAULT_SETTINGS) {
  const d = new Date(studyDayStart(now, s));
  d.setDate(d.getDate() + days); // setDate keeps DST transitions correct
  return d.getTime();
}

/** Parse "YYYY-MM-DD" as a local calendar date (midnight). */
export function parseDate(str) {
  if (!str) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

/**
 * Whole calendar days from the study day containing `now` to the exam day.
 * 0 = exam is today, negative = exam is over, null = no exam date.
 */
export function daysUntilExam(now, examDate, s = DEFAULT_SETTINGS) {
  const exam = typeof examDate === 'number' ? examDate : parseDate(examDate);
  if (exam == null) return null;
  const today = new Date(studyDayStart(now, s));
  today.setHours(0, 0, 0, 0);
  return Math.round((exam - today.getTime()) / DAY);
}

/**
 * Cap an interval (days) so the card comes back in time for the exam.
 * - Exam over or unknown: unchanged.
 * - Exam today or tomorrow: 1 day.
 * - Otherwise at most ceil((daysLeft - 1) * capFactor), so repetitions get
 *   denser towards the exam and the last one lands before exam day.
 */
export function capForExam(intervalDays, daysLeft, s = DEFAULT_SETTINGS) {
  if (daysLeft == null || daysLeft < 0) return intervalDays;
  if (daysLeft <= 1) return 1;
  const cap = Math.max(1, Math.ceil((daysLeft - 1) * s.examCapFactor));
  return Math.max(1, Math.min(intervalDays, cap));
}

function clampEase(e, s) {
  return Math.max(s.minEase, Math.round(e * 1000) / 1000);
}

function stepDelayMinutes(steps, step, rating) {
  const cur = steps[Math.min(step, steps.length - 1)] ?? 1;
  if (rating === RATING.HARD) {
    if (step === 0 && steps.length > 1) return (steps[0] + steps[1]) / 2;
    return cur * 1.5;
  }
  return cur;
}

function graduate(state, now, days, ctx, s) {
  const daysLeft = daysUntilExam(now, ctx.examDate, s);
  const interval = capForExam(Math.min(days, s.maxInterval), daysLeft, s);
  return {
    ...state,
    status: 'review',
    step: 0,
    ease: state.ease ?? s.startEase,
    interval,
    due: addStudyDays(now, interval, s),
  };
}

/**
 * Apply a rating to a card state.
 * @param {object} state  card state (see newCardState)
 * @param {1|2|3|4} rating
 * @param {number} now    epoch ms
 * @param {{examDate?: string|number|null}} ctx
 * @param {object} settings
 */
export function review(state, rating, now, ctx = {}, settings = DEFAULT_SETTINGS) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  if (![1, 2, 3, 4].includes(rating)) throw new Error(`invalid rating ${rating}`);
  const base = {
    ...(state ?? newCardState()),
    reps: (state?.reps ?? 0) + 1,
    lastReview: now,
    lastRating: rating,
  };
  if (base.status === 'new') {
    base.status = 'learning';
    base.step = 0;
    base.ease = s.startEase;
  }

  if (base.status === 'learning' || base.status === 'relearning') {
    const steps = base.status === 'learning' ? s.learningSteps : s.relearningSteps;
    const relearn = base.status === 'relearning';
    switch (rating) {
      case RATING.AGAIN:
        return { ...base, step: 0, due: now + steps[0] * MINUTE };
      case RATING.HARD:
        return { ...base, due: now + stepDelayMinutes(steps, base.step, rating) * MINUTE };
      case RATING.GOOD: {
        const next = base.step + 1;
        if (next < steps.length) return { ...base, step: next, due: now + steps[next] * MINUTE };
        return graduate(base, now, relearn ? Math.max(1, base.interval) : s.graduatingInterval, ctx, s);
      }
      case RATING.EASY:
        return graduate(base, now, relearn ? Math.max(2, base.interval + 1) : s.easyInterval, ctx, s);
    }
  }

  // review card
  const daysLeft = daysUntilExam(now, ctx.examDate, s);
  const ease = base.ease ?? s.startEase;
  const scheduledDue = state.due ?? now;
  const overdueDays = Math.max(0, Math.round((studyDayStart(now, s) - studyDayStart(scheduledDue, s)) / DAY));
  const ivl = Math.max(1, base.interval);

  if (rating === RATING.AGAIN) {
    return {
      ...base,
      status: 'relearning',
      step: 0,
      lapses: base.lapses + 1,
      ease: clampEase(ease - 0.2, s),
      interval: 1,
      due: now + s.relearningSteps[0] * MINUTE,
    };
  }

  const hardIvl = Math.max(ivl + 1, Math.round(ivl * s.hardFactor));
  const goodIvl = Math.max(hardIvl + 1, Math.round((ivl + overdueDays / 2) * ease));
  const easyIvl = Math.max(goodIvl + 1, Math.round((ivl + overdueDays) * ease * s.easyBonus));

  let nextIvl;
  let nextEase = ease;
  if (rating === RATING.HARD) {
    nextIvl = hardIvl;
    nextEase = clampEase(ease - 0.15, s);
  } else if (rating === RATING.GOOD) {
    nextIvl = goodIvl;
  } else {
    nextIvl = easyIvl;
    nextEase = clampEase(ease + 0.15, s);
  }
  nextIvl = capForExam(Math.min(nextIvl, s.maxInterval), daysLeft, s);
  return { ...base, ease: nextEase, interval: nextIvl, due: addStudyDays(now, nextIvl, s) };
}

/** Preview the due time of each rating, for labels like "10 Min" / "3 T". */
export function previewRatings(state, now, ctx = {}, settings = DEFAULT_SETTINGS) {
  const out = {};
  for (const r of [1, 2, 3, 4]) {
    const next = review(state, r, now, ctx, settings);
    out[r] = { due: next.due, interval: next.interval, status: next.status, label: formatDelay(next, now) };
  }
  return out;
}

export function formatDelay(state, now) {
  if (state.status === 'review') {
    const d = state.interval;
    if (d < 30) return `${d} T`;
    if (d < 365) return `${Math.round(d / 30 * 10) / 10} Mo`;
    return `${Math.round(d / 365 * 10) / 10} J`;
  }
  const min = Math.max(1, Math.round((state.due - now) / MINUTE));
  if (min < 60) return `${min} Min`;
  return `${Math.round(min / 60 * 10) / 10} Std`;
}

/**
 * How many new cards may be introduced today for one topic, so that all
 * cards are seen at least `newCardBufferDays` before the exam.
 */
export function newCardsAllowedToday({ unseen, introducedToday, daysLeft }, settings = DEFAULT_SETTINGS) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  if (unseen <= 0) return 0;
  let perDay;
  if (daysLeft == null || daysLeft < 0) {
    perDay = s.newPerDayAfterExam;
  } else {
    const days = Math.max(1, daysLeft - s.newCardBufferDays);
    perDay = Math.ceil((unseen + introducedToday) / days);
    perDay = Math.min(s.maxNewPerDay, Math.max(s.minNewPerDay, perDay));
  }
  return Math.max(0, Math.min(unseen, perDay - introducedToday));
}

/** Rough mastery classification used by the dashboard. */
export function classify(state, now) {
  if (!state || state.status === 'new') return 'new';
  if (state.status === 'learning' || state.status === 'relearning') return 'learning';
  if (state.interval >= 21) return 'mature';
  return 'young';
}

export function isDue(state, now, settings = DEFAULT_SETTINGS) {
  if (!state || state.status === 'new' || state.due == null) return false;
  if (state.status === 'review') return state.due <= studyDayStart(now, settings);
  return state.due <= now;
}
