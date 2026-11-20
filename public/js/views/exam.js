import { h, countdownText, formatDate, plural, markdown, inline } from '../util.js';
import { api } from '../api.js';
import { progressBar, forecastChart } from './dashboard.js';
import { TYPE_LABELS } from '../questions.js';

const STATUS = { new: 'Neu', learning: 'Lernphase', relearning: 'Wiederholen', review: 'Gelernt' };

export async function examView(id) {
  const [e, questions] = await Promise.all([api.exam(id), api.questions(id)]);
  const el = h('div', { class: 'page' });
  const cd = countdownText(e.daysLeft);
  el.append(h('a', { class: 'back', href: '#/' }, '‹ Dashboard'));
  el.append(h('div', { class: 'page-head' },
    h('div', {},
      h('div', { class: 'muted' }, e.exam),
      h('h1', {}, e.topic),
      h('div', { class: 'muted' }, `Prüfung am ${formatDate(e.date)}${e.daysLeft != null && e.daysLeft >= 0 ? ` · ${cd.n === 'Heute' ? 'heute' : `noch ${cd.n} ${cd.u}`}` : ''}`)),
    e.openToday > 0
      ? h('a', { class: 'btn primary big', href: `#/study/${e.id}` }, `Jetzt üben (${e.openToday})`)
      : h('span', { class: 'tag' }, 'Für heute erledigt')));

  if (e.description) el.append(h('p', { class: 'muted', html: inline(e.description) }));
  if (e.errors.length) {
    el.append(h('div', { class: 'error-box', style: { marginBottom: '16px' } },
      h('b', {}, `${e.errors.length} Fehler in den Dateien (diese Fragen werden übersprungen):`),
      h('ul', {}, e.errors.slice(0, 30).map((x) => h('li', {}, x)))));
  }

  el.append(h('div', { class: 'grid cols-4' },
    stat(String(e.newToday), 'neue Karten heute', 'var(--new)'),
    stat(String(e.counts.dueLearning), 'in Lernphase', 'var(--learn)'),
    stat(String(e.counts.dueReview), 'Wiederholungen fällig', 'var(--review)'),
    stat(`${Math.round(e.progress * 100)} %`, `gelernt (${e.counts.total - e.counts.new} von ${e.counts.total} gesehen)`)));

  el.append(h('div', { class: 'card', style: { padding: '16px 18px', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' } },
    progressBar(e.counts),
    h('div', { class: 'legend' },
      h('span', {}, h('span', { class: 'pill-dot', style: { background: 'var(--review)' } }), `${e.counts.mature} sicher (≥ 21 Tage)`),
      h('span', {}, h('span', { class: 'pill-dot', style: { background: 'color-mix(in srgb, var(--review) 50%, transparent)' } }), `${e.counts.young} gelernt`),
      h('span', {}, h('span', { class: 'pill-dot', style: { background: 'var(--learn)' } }), `${e.counts.learning} in Lernphase`),
      h('span', {}, h('span', { class: 'pill-dot', style: { background: 'var(--bg-sunk)', border: '1px solid var(--line-2)' } }), `${e.counts.new} neu`))));

  el.append(h('div', { class: 'section-title' }, 'Kapitel'));
  el.append(h('div', { class: 'card list' },
    e.chapters.map((c) =>
      h('div', { class: 'row click', onclick: () => (location.hash = `#/study/${e.id}/${encodeURIComponent(c.name)}`) },
        h('div', { class: 'grow' },
          h('div', { style: { fontWeight: 600 } }, c.name),
          h('div', { style: { marginTop: '6px' } }, progressBar(c))),
        h('span', { class: 'faint', style: { fontSize: '13px', whiteSpace: 'nowrap' } }, plural(c.total, 'Karte', 'Karten')),
        c.due ? h('span', { class: 'badge hot' }, String(c.due)) : null,
        h('span', { class: 'faint' }, '›')))));

  if (e.notes.length) {
    el.append(h('div', { class: 'section-title' }, 'Lernunterlagen'));
    el.append(h('div', { class: 'card list' },
      e.notes.map((n) =>
        h('a', { class: 'row click', href: `#/exam/${e.id}/notes/${n.file}` },
          h('span', {}, '📄'), h('div', { class: 'grow' }, n.title), h('span', { class: 'faint' }, '›')))));
  }

  el.append(h('div', { class: 'section-title' }, 'Wiederholungen der nächsten 14 Tage'));
  el.append(h('div', { class: 'card' }, forecastChart(e.forecast)));

  el.append(h('div', { class: 'section-title' }, h('span', {}, `Alle Fragen (${questions.length})`)));
  const body = h('div', { class: 'card list' });
  for (const q of questions) {
    const st = q.state;
    const due = st.due ? new Date(st.due).toLocaleDateString('de-AT', { day: 'numeric', month: 'short' }) : null;
    body.append(h('div', { class: 'row' },
      h('div', { class: 'grow' },
        h('div', { html: inline(q.question ?? q.front ?? '') , style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }),
        h('div', { class: 'faint', style: { fontSize: '12.5px' } }, `${q.id} · ${q.chapter ?? 'Allgemein'} · ${q.file}`)),
      h('span', { class: 'tag' }, TYPE_LABELS[q.type] ?? q.type),
      h('span', { class: 'tag' }, STATUS[st.status] ?? st.status),
      due && st.status === 'review' ? h('span', { class: 'faint', style: { fontSize: '12.5px', whiteSpace: 'nowrap' } }, due) : null));
  }
  el.append(body);
  return { el };
}

export async function noteView(examId, file) {
  const [e, text] = await Promise.all([api.exam(examId), api.note(examId, file)]);
  const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
  const el = h('div', { class: 'page' },
    h('a', { class: 'back', href: `#/exam/${examId}` }, `‹ ${e.topic}`),
    h('div', { class: 'card notes-body', html: markdown(text, api.asset(examId, dir)) }));
  return { el };
}

function stat(v, k, color) {
  return h('div', { class: 'card stat' }, h('div', { class: 'v', style: color ? { color } : {} }, v), h('div', { class: 'k' }, k));
}
