import { h, countdownText, formatDate, plural } from '../util.js';
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
    if (i === 1) return 'Morgen';
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toLocaleDateString('de-AT', { weekday: 'short' });
  };
  return h('div', { class: 'forecast' },
    values.map((v, i) =>
      h('div', { class: `col${i === 0 ? ' today' : ''}`, title: `${day(i)}: ${v} Wiederholungen` },
        h('div', { class: 'num' }, v ? String(v) : ''),
        h('div', { class: 'b', style: { height: `${(v / max) * 70}%` } }),
        h('div', { class: 'lbl' }, day(i)))));
}

export function examCard(e) {
  const cd = countdownText(e.daysLeft);
  const card = h('div', { class: 'card exam-card', onclick: () => (location.hash = `#/exam/${e.id}`) },
    h('div', { class: 'top' },
      h('span', { class: 'dot', style: { background: e.color ?? 'var(--accent)', marginTop: '6px' } }),
      h('div', {},
        h('div', { class: 'title' }, e.topic),
        h('div', { class: 'exam-name' }, `${e.exam} · ${formatDate(e.date)}`)),
      h('div', { class: `countdown${e.daysLeft != null && e.daysLeft >= 0 && e.daysLeft <= 7 ? ' soon' : ''}` },
        h('div', { class: 'n' }, cd.n), h('div', { class: 'u' }, cd.u))),
    h('div', { class: 'counts' },
      h('span', {}, h('b', { class: 'c-new' }, String(e.newToday)), ' neu'),
      h('span', {}, h('b', { class: 'c-learn' }, String(e.counts.dueLearning)), ' in Lernphase'),
      h('span', {}, h('b', { class: 'c-review' }, String(e.counts.dueReview)), ' fällig'),
      h('span', { class: 'faint' }, plural(e.counts.total, 'Karte', 'Karten'))),
    progressBar(e.counts),
    h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center' } },
      h('span', { class: 'faint', style: { fontSize: '12.5px' } }, `${Math.round(e.progress * 100)} % gelernt · ${Math.round(e.seen * 100)} % gesehen`),
      e.openToday > 0
        ? h('a', { class: 'btn primary', href: `#/study/${e.id}`, onclick: (ev) => ev.stopPropagation() }, `Üben (${e.openToday})`)
        : h('span', { class: 'tag' }, 'Für heute erledigt')));
  if (e.errors.length) card.append(h('div', { class: 'error-box' }, `${e.errors.length} Fehler in den Dateien, siehe Thema`));
  return card;
}

export async function dashboardView() {
  const d = await api.dashboard();
  const el = h('div', { class: 'page' });
  const today = new Date().toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' });
  el.append(h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, 'Dashboard'), h('div', { class: 'muted' }, today))));

  const active = d.exams.filter((e) => !e.archived);
  const learnDue = active.reduce((a, e) => a + e.counts.dueLearning, 0);
  const reviewDue = active.reduce((a, e) => a + e.counts.dueReview, 0);
  el.append(h('div', { class: 'card hero' },
    h('div', {},
      h('div', { class: 'muted' }, 'Heute offen, über alle Themen'),
      h('div', { class: 'big-num' }, String(d.totals.openToday)),
      h('div', { class: 'pills' },
        h('span', {}, h('span', { class: 'pill-dot', style: { background: 'var(--new)' } }), `${d.totals.newToday} neu`),
        h('span', {}, h('span', { class: 'pill-dot', style: { background: 'var(--learn)' } }), `${learnDue} in Lernphase`),
        h('span', {}, h('span', { class: 'pill-dot', style: { background: 'var(--review)' } }), `${reviewDue} Wiederholungen`))),
    d.totals.openToday > 0
      ? h('a', { class: 'btn primary big', href: '#/study/all' }, 'Alles Fällige üben', h('span', { class: 'kbd' }, 'Leertaste'))
      : h('div', { class: 'muted' }, active.length ? 'Alles erledigt für heute 🎉' : 'Lege eine Prüfung im Ordner exams/ an.')));

  const acc = d.totals.reviewsToday ? Math.round((d.totals.correctToday / d.totals.reviewsToday) * 100) : null;
  const next = active.filter((e) => e.daysLeft != null && e.daysLeft >= 0).sort((a, b) => a.daysLeft - b.daysLeft)[0];
  el.append(h('div', { class: 'grid cols-4', style: { marginTop: '16px' } },
    stat(String(d.totals.reviewsToday), 'heute beantwortet'),
    stat(acc == null ? '–' : `${acc} %`, 'heute richtig (Gut/Einfach)'),
    stat(`${d.streak} 🔥`, d.streak === 1 ? 'Tag in Folge' : 'Tage in Folge'),
    stat(next ? countdownText(next.daysLeft).n : '–', next ? `bis ${next.topic}` : 'keine Prüfung geplant')));

  el.append(h('div', { class: 'section-title' }, 'Themen'));
  if (!d.exams.length) {
    el.append(h('div', { class: 'card empty' },
      h('div', { class: 'em' }, '📚'),
      h('div', {}, 'Noch keine Prüfungen. Lege einen Ordner in exams/ an, siehe AGENTS.md.')));
  } else {
    const sorted = [...active].sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
    el.append(h('div', { class: 'grid cols-2' }, sorted.map(examCard)));
  }

  el.append(h('div', { class: 'section-title' }, 'Wiederholungen der nächsten 14 Tage'));
  el.append(h('div', { class: 'card' }, forecastChart(d.forecast)));

  const onKey = (e) => {
    if (e.key === ' ' && d.totals.openToday > 0 && document.activeElement === document.body) {
      e.preventDefault();
      location.hash = '#/study/all';
    }
  };
  window.addEventListener('keydown', onKey);
  return { el, cleanup: () => window.removeEventListener('keydown', onKey) };
}

function stat(v, k) {
  return h('div', { class: 'card stat' }, h('div', { class: 'v' }, v), h('div', { class: 'k' }, k));
}
