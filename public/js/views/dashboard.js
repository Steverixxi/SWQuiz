import { h, icon, formatDate } from '../util.js';
import { api } from '../api.js';

export function progressBar(c) {
  const t = Math.max(1, c.total);
  return h('div', { class: 'bar', title: `${c.mature} sicher, ${c.young} gelernt, ${c.learning} in Lernphase, ${c.new} neu` },
    h('span', { class: 'mature', style: { width: `${(c.mature / t) * 100}%` } }),
    h('span', { class: 'young', style: { width: `${(c.young / t) * 100}%` } }),
    h('span', { class: 'learning', style: { width: `${(c.learning / t) * 100}%` } }));
}

export function forecastChart(values) {
  const max = Math.max(1, ...values);
  const day = (i) => {
    if (i === 0) return 'Heute';
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toLocaleDateString('de-AT', { weekday: 'short' }).replace('.', '');
  };
  return h('div', { class: 'forecast' },
    values.map((v, i) =>
      h('div', { class: `col${i === 0 ? ' today' : ''}`, title: `${day(i)}: ${v} Wiederholungen` },
        h('div', { class: 'n' }, v ? String(v) : ''),
        h('div', { class: 'b', style: { height: `${(v / max) * 64}%` } }),
        h('div', { class: 'lbl' }, day(i)))));
}

export function daysText(daysLeft) {
  if (daysLeft == null) return 'kein Prüfungsdatum';
  if (daysLeft < 0) return 'Prüfung vorbei';
  if (daysLeft === 0) return 'Prüfung heute';
  if (daysLeft === 1) return 'Prüfung morgen';
  return `noch ${daysLeft} Tage`;
}

export function breakdown({ newCount, learning, review }) {
  return h('div', { class: 'breakdown' },
    h('span', {}, h('b', { class: 'c-new' }, String(newCount)), ' neu'),
    h('span', {}, h('b', { class: 'c-learn' }, String(learning)), ' in Lernphase'),
    h('span', {}, h('b', { class: 'c-review' }, String(review)), ' Wiederholungen'));
}

export async function dashboardView() {
  const d = await api.dashboard();
  const el = h('div', { class: 'page' });
  const today = new Date().toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' });
  el.append(h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, today), h('h1', {}, 'Übersicht'))));

  const active = d.exams.filter((e) => !e.archived);
  const learnDue = active.reduce((a, e) => a + e.counts.dueLearning, 0);
  const reviewDue = active.reduce((a, e) => a + e.counts.dueReview, 0);
  const acc = d.totals.reviewsToday ? Math.round((d.totals.correctToday / d.totals.reviewsToday) * 100) : null;
  const metaParts = [];
  if (d.totals.reviewsToday) metaParts.push(`Heute ${d.totals.reviewsToday} beantwortet, ${acc} % mit Gut oder Einfach`);
  if (d.streak > 1) metaParts.push(`${d.streak} Tage in Folge gelernt`);

  el.append(h('div', { class: 'panel summary' },
    h('div', {},
      h('div', { class: 'big' }, String(d.totals.openToday), h('small', {}, d.totals.openToday === 1 ? 'Karte heute offen' : 'Karten heute offen')),
      breakdown({ newCount: d.totals.newToday, learning: learnDue, review: reviewDue }),
      metaParts.length ? h('div', { class: 'meta-line' }, metaParts.join(' · ')) : null),
    d.totals.openToday > 0
      ? h('a', { class: 'btn primary lg', href: '#/study/all' }, 'Alles Fällige lernen', h('span', { class: 'kbd' }, 'Leertaste'))
      : h('div', { class: 'muted' }, active.length ? 'Für heute ist alles erledigt.' : '')));

  el.append(h('div', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Prüfungen')),
    d.exams.length
      ? h('div', { class: 'panel rows' }, [...active].sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999)).map(examRow))
      : h('div', { class: 'panel empty' }, icon('folder-open'), h('div', {}, 'Noch keine Prüfungen. Lege einen Ordner in exams/ an (siehe AGENTS.md).'))));

  el.append(h('div', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Wiederholungen'), h('span', { class: 'faint' }, 'nächste 14 Tage')),
    h('div', { class: 'panel' }, forecastChart(d.forecast))));

  const onKey = (e) => {
    if (e.key === ' ' && d.totals.openToday > 0 && document.activeElement === document.body) {
      e.preventDefault();
      location.hash = '#/study/all';
    }
  };
  window.addEventListener('keydown', onKey);
  return { el, cleanup: () => window.removeEventListener('keydown', onKey) };
}

function examRow(e) {
  const name = e.exam === e.topic ? e.topic : `${e.topic}`;
  return h('a', { class: 'row', href: `#/exam/${e.id}` },
    h('div', { class: 'grow' },
      h('div', { class: 'title ellipsis' }, name),
      h('div', { class: 'sub' }, `${formatDate(e.date)} · ${daysText(e.daysLeft)} · ${Math.round(e.progress * 100)} % gelernt`),
      progressBar(e.counts)),
    h('div', { class: 'right' }, e.openToday ? `${e.openToday} offen` : h('span', { class: 'faint' }, 'erledigt')),
    h('span', { class: 'chev' }, icon('chevron-right')),
    e.errors.length ? h('span', { class: 'tag', title: 'Fehler in den Dateien' }, icon('triangle-exclamation')) : null);
}
