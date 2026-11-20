import { h, icon, formatDate, plural, markdown, inline } from '../util.js';
import { api } from '../api.js';
import { progressBar, forecastChart, daysText, breakdown } from './dashboard.js';
import { TYPE_LABELS } from '../questions.js';

const STATUS = { new: 'neu', learning: 'Lernphase', relearning: 'Lernphase', review: 'gelernt' };

export async function examView(id) {
  const [e, questions] = await Promise.all([api.exam(id), api.questions(id)]);
  const el = h('div', { class: 'page' });
  el.append(h('a', { class: 'back', href: '#/' }, icon('arrow-left'), 'Übersicht'));
  el.append(h('div', { class: 'page-head' },
    h('div', {},
      e.exam !== e.topic ? h('div', { class: 'eyebrow' }, e.exam) : null,
      h('h1', {}, e.topic),
      h('div', { class: 'muted', style: { marginTop: '4px' } }, `Prüfung am ${formatDate(e.date)} · ${daysText(e.daysLeft)}`)),
    e.openToday > 0
      ? h('a', { class: 'btn primary lg', href: `#/study/${e.id}` }, `Lernen`, h('span', { class: 'faint', style: { color: 'inherit', opacity: 0.7 } }, String(e.openToday)))
      : h('span', { class: 'muted' }, 'Für heute erledigt')));

  if (e.errors.length) {
    el.append(h('div', { class: 'notice', style: { marginBottom: '20px' } },
      h('b', {}, `${e.errors.length} Fehler in den Dateien. Diese Fragen werden übersprungen:`),
      h('ul', {}, e.errors.slice(0, 30).map((x) => h('li', {}, x)))));
  }

  el.append(h('div', { class: 'panel', style: { padding: '18px 20px' } },
    breakdown({ newCount: e.newToday, learning: e.counts.dueLearning, review: e.counts.dueReview }),
    h('div', { style: { marginTop: '14px' } }, progressBar(e.counts)),
    h('div', { class: 'legend' },
      h('span', {}, h('i', { class: 'sw', style: { background: 'var(--text)' } }), `${e.counts.mature} sicher`),
      h('span', {}, h('i', { class: 'sw', style: { background: 'var(--text-3)' } }), `${e.counts.young} gelernt`),
      h('span', {}, h('i', { class: 'sw', style: { background: 'var(--line-2)' } }), `${e.counts.learning} in Lernphase`),
      h('span', {}, h('i', { class: 'sw', style: { background: 'var(--sunk)', boxShadow: 'inset 0 0 0 1px var(--line-2)' } }), `${e.counts.new} neu`),
      h('span', { style: { marginLeft: 'auto' } }, plural(e.counts.total, 'Karte', 'Karten')))));

  el.append(h('div', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Kapitel'), h('span', { class: 'faint' }, 'Kapitel einzeln lernen')),
    h('div', { class: 'panel rows' },
      e.chapters.map((c) =>
        h('a', { class: 'row', href: `#/study/${e.id}/${encodeURIComponent(c.name)}` },
          h('div', { class: 'grow' },
            h('div', { class: 'title ellipsis', style: { fontWeight: 550 } }, c.name),
            progressBar(c)),
          h('div', { class: 'right' }, c.due ? `${c.due} fällig` : h('span', { class: 'faint' }, plural(c.total, 'Karte', 'Karten'))),
          h('span', { class: 'chev' }, icon('chevron-right')))))));

  if (e.notes.length) {
    el.append(h('div', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Lernunterlagen')),
      h('div', { class: 'panel rows' },
        e.notes.map((n) =>
          h('a', { class: 'row', href: `#/exam/${e.id}/notes/${n.file}` },
            icon('file-lines', 'regular'), h('div', { class: 'grow' }, n.title), h('span', { class: 'chev' }, icon('chevron-right')))))));
  }

  el.append(h('div', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Wiederholungen'), h('span', { class: 'faint' }, 'nächste 14 Tage')),
    h('div', { class: 'panel' }, forecastChart(e.forecast))));

  const list = h('details', { class: 'panel qlist' },
    h('summary', {}, h('span', {}, `Alle Fragen`), h('span', { class: 'faint', style: { fontWeight: 400 } }, String(questions.length))));
  for (const q of questions) {
    const st = q.state;
    const due = st.status === 'review' && st.due ? new Date(st.due).toLocaleDateString('de-AT', { day: 'numeric', month: 'short' }) : null;
    list.append(h('div', { class: 'row' },
      h('div', { class: 'grow' },
        h('div', { class: 'ellipsis', html: inline(q.question ?? q.front ?? '') }),
        h('div', { class: 'sub ellipsis' }, `${q.chapter ?? 'Allgemein'} · ${q.id}`)),
      h('span', { class: 'tag' }, TYPE_LABELS[q.type] ?? q.type),
      h('span', { class: 'tag', style: { width: '90px', textAlign: 'right' } }, due ? `fällig ${due}` : STATUS[st.status] ?? st.status)));
  }
  el.append(h('div', { class: 'section' }, list));
  return { el };
}

export async function noteView(examId, file) {
  const [e, text] = await Promise.all([api.exam(examId), api.note(examId, file)]);
  const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
  const el = h('div', { class: 'page' },
    h('a', { class: 'back', href: `#/exam/${examId}` }, icon('arrow-left'), e.topic),
    h('div', { class: 'panel notes-body', html: markdown(text, api.asset(examId, `notes/${dir}`)) }));
  return { el };
}
