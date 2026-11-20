import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  review,
  newCardState,
  capForExam,
  daysUntilExam,
  newCardsAllowedToday,
  studyDayStart,
  addStudyDays,
  previewRatings,
  isDue,
  DEFAULT_SETTINGS,
} from '../src/core/scheduler.js';

const at = (y, m, d, h = 10) => new Date(y, m - 1, d, h, 0, 0).getTime();
const MIN = 60_000;

test('new card: learning steps then graduation', () => {
  const now = at(2027, 1, 1);
  let s = review(newCardState(), 3, now, {});
  assert.equal(s.status, 'learning');
  assert.equal(s.step, 1);
  assert.equal(s.due, now + 10 * MIN);
  s = review(s, 3, s.due, {});
  assert.equal(s.status, 'review');
  assert.equal(s.interval, 1);
  assert.equal(s.due, addStudyDays(now, 1));
});

test('again resets to the first learning step', () => {
  const now = at(2027, 1, 1);
  let s = review(newCardState(), 3, now, {});
  s = review(s, 1, now + 10 * MIN, {});
  assert.equal(s.step, 0);
  assert.equal(s.due, now + 11 * MIN);
});

test('easy on a new card graduates with the easy interval', () => {
  const s = review(newCardState(), 4, at(2027, 1, 1), {});
  assert.equal(s.status, 'review');
  assert.equal(s.interval, 4);
});

test('review intervals grow and ratings keep their order', () => {
  const now = at(2027, 1, 1);
  const card = { ...newCardState(), status: 'review', ease: 2.5, interval: 10, due: now };
  const p = previewRatings(card, now, {});
  assert.equal(p[1].status, 'relearning');
  assert.ok(p[2].interval < p[3].interval);
  assert.ok(p[3].interval < p[4].interval);
  assert.equal(p[3].interval, 25);
});

test('lapse lowers ease and enters relearning', () => {
  const now = at(2027, 1, 1);
  const card = { ...newCardState(), status: 'review', ease: 2.5, interval: 10, due: now };
  const s = review(card, 1, now, {});
  assert.equal(s.status, 'relearning');
  assert.equal(s.lapses, 1);
  assert.equal(s.ease, 2.3);
  const back = review(s, 3, now + 10 * MIN, {});
  assert.equal(back.status, 'review');
  assert.equal(back.interval, 1);
});

test('ease never drops below the minimum', () => {
  let s = { ...newCardState(), status: 'review', ease: 1.35, interval: 3, due: at(2027, 1, 1) };
  s = review(s, 2, at(2027, 1, 1), {});
  assert.equal(s.ease, DEFAULT_SETTINGS.minEase);
});

test('daysUntilExam uses calendar days and the 4:00 day start', () => {
  assert.equal(daysUntilExam(at(2027, 1, 1, 10), '2027-01-11'), 10);
  assert.equal(daysUntilExam(at(2027, 1, 11, 10), '2027-01-11'), 0);
  assert.equal(daysUntilExam(at(2027, 1, 12, 10), '2027-01-11'), -1);
  // 02:00 still belongs to the previous study day
  assert.equal(daysUntilExam(at(2027, 1, 2, 2), '2027-01-11'), 10);
  assert.equal(daysUntilExam(at(2027, 1, 1), null), null);
});

test('capForExam keeps every interval before the exam', () => {
  assert.equal(capForExam(100, null), 100);
  assert.equal(capForExam(100, -3), 100);
  assert.equal(capForExam(100, 0), 1);
  assert.equal(capForExam(100, 1), 1);
  assert.equal(capForExam(100, 2), 1);
  assert.equal(capForExam(100, 11), 6);
  assert.equal(capForExam(3, 30), 3);
  for (let d = 2; d < 200; d++) assert.ok(capForExam(1000, d) <= d - 1, `daysLeft ${d}`);
});

test('a well known card is reviewed repeatedly right before the exam', () => {
  const exam = '2027-03-01';
  let now = at(2027, 1, 1);
  let s = review(newCardState(), 4, now, { examDate: exam });
  const reviewDays = [];
  for (let i = 0; i < 40 && daysUntilExam(now, exam) > 0; i++) {
    now = s.due + 9 * 3600_000; // study at 13:00 on the due day
    if (daysUntilExam(now, exam) <= 0) break;
    reviewDays.push(daysUntilExam(now, exam));
    s = review(s, 4, now, { examDate: exam });
  }
  // the last review happens on the day before the exam at the latest ...
  assert.equal(reviewDays.at(-1), 1);
  // ... and gaps shrink towards the exam instead of jumping past it
  assert.ok(reviewDays.length >= 4, `reviews: ${reviewDays}`);
  // after the last review the card is due on exam day, not later
  assert.ok(s.due <= at(2027, 3, 1, 23));
});

test('without exam date intervals are not capped', () => {
  const now = at(2027, 1, 1);
  const card = { ...newCardState(), status: 'review', ease: 2.5, interval: 40, due: now };
  assert.equal(review(card, 3, now, {}).interval, 100);
  assert.equal(review(card, 3, now, { examDate: '2027-01-21' }).interval, 12);
});

test('new cards are spread so all are introduced before the exam', () => {
  assert.equal(newCardsAllowedToday({ unseen: 300, introducedToday: 0, daysLeft: 33 }), 10);
  assert.equal(newCardsAllowedToday({ unseen: 300, introducedToday: 0, daysLeft: 13 }), 30);
  assert.equal(newCardsAllowedToday({ unseen: 300, introducedToday: 25, daysLeft: 13 }), 8);
  assert.equal(newCardsAllowedToday({ unseen: 5, introducedToday: 0, daysLeft: 50 }), 5);
  assert.equal(newCardsAllowedToday({ unseen: 300, introducedToday: 0, daysLeft: 2 }), 200);
  assert.equal(newCardsAllowedToday({ unseen: 300, introducedToday: 0, daysLeft: -5 }), 20);
  assert.equal(newCardsAllowedToday({ unseen: 0, introducedToday: 3, daysLeft: 5 }), 0);
});

test('study day starts at 04:00', () => {
  assert.equal(studyDayStart(at(2027, 1, 2, 3)), at(2027, 1, 1, 4));
  assert.equal(studyDayStart(at(2027, 1, 2, 5)), at(2027, 1, 2, 4));
});

test('isDue: review cards are due for the whole study day', () => {
  const card = { ...newCardState(), status: 'review', interval: 1, due: at(2027, 1, 2, 4) };
  assert.equal(isDue(card, at(2027, 1, 2, 3)), false);
  assert.equal(isDue(card, at(2027, 1, 2, 4)), true);
  assert.equal(isDue(card, at(2027, 1, 2, 23)), true);
  assert.equal(isDue(newCardState(), at(2027, 1, 2)), false);
});
