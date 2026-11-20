import { h, icon, toast } from '../util.js';
import { api } from '../api.js';
import { renderQuestion } from '../questions.js';

const RATINGS = [
  { r: 1, t: 'Nochmal' },
  { r: 2, t: 'Schlecht' },
  { r: 3, t: 'Gut' },
  { r: 4, t: 'Einfach' },
];

export async function studyView({ exam, chapter, onChange }) {
  const el = h('div', { class: 'study' });
  const top = h('div', { class: 'study-top' });
  const body = h('div', { class: 'study-body' });
  const actions = h('div', { class: 'study-actions' });
  el.append(top, body, actions);

  const backHref = exam === 'all' ? '#/' : `#/exam/${exam}`;
  let current = null;
  let renderer = null;
  let phase = 'loading';
  let started = 0;
  let suggested = null;
  let answered = 0;
  let busy = false;

  function renderTop(data) {
    top.innerHTML = '';
    const c = data?.counts ?? { new: 0, learning: 0, review: 0 };
    const status = data?.state?.status;
    const cur = status === 'new' ? 'new' : status === 'review' ? 'review' : status ? 'learning' : null;
    top.append(
      h('a', { class: 'btn icon', href: backHref, title: 'Beenden (Esc)' }, icon('xmark')),
      h('div', { class: 'where' },
        h('b', {}, data?.card ? data.card.chapter ?? data.card.topic : exam === 'all' ? 'Alles Fällige' : 'Lernen'),
        h('span', { class: 'faint' }, data?.card
          ? [data.card.topic, data.card.daysLeft != null && data.card.daysLeft >= 0 ? `Prüfung in ${data.card.daysLeft} ${data.card.daysLeft === 1 ? 'Tag' : 'Tagen'}` : null].filter(Boolean).join(' · ')
          : chapter ?? '')),
      h('div', { class: 'study-counts', title: 'neu · Lernphase · fällig' },
        h('span', { class: `c-new${cur === 'new' ? ' cur' : ''}` }, String(c.new)),
        h('span', { class: `c-learn${cur === 'learning' ? ' cur' : ''}` }, String(c.learning)),
        h('span', { class: `c-review${cur === 'review' ? ' cur' : ''}` }, String(c.review))),
      h('button', { class: 'btn icon', title: 'Letzte Bewertung rückgängig (Z)', onclick: undo }, icon('rotate-left')),
    );
  }

  async function load() {
    phase = 'loading';
    const data = await api.next({ exam, chapter });
    current = data;
    renderTop(data);
    body.innerHTML = '';
    actions.innerHTML = '';
    if (data.error) {
      body.append(h('div', { class: 'notice' }, data.error));
      return;
    }
    if (data.done) {
      phase = 'done';
      actions.hidden = true;
      const next = data.nextDue ? new Date(data.nextDue) : null;
      const nextTxt = next
        ? next.toDateString() === new Date().toDateString()
          ? `Nächste Karte um ${next.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}`
          : `Nächste Wiederholung am ${next.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' })}`
        : '';
      body.append(h('div', { class: 'done-wrap' },
        icon('circle-check'),
        h('h2', {}, answered ? `Fertig für jetzt. ${answered} ${answered === 1 ? 'Karte' : 'Karten'} gelernt.` : 'Gerade ist nichts fällig'),
        h('div', { class: 'muted' }, nextTxt),
        h('div', { style: { marginTop: '24px', display: 'flex', gap: '10px', justifyContent: 'center' } },
          h('a', { class: 'btn', href: backHref }, 'Zurück'),
          exam !== 'all' ? h('a', { class: 'btn', href: '#/study/all' }, 'Alles Fällige lernen') : null)));
      return;
    }
    actions.hidden = false;
    phase = 'answer';
    suggested = null;
    started = Date.now();
    renderer = renderQuestion(data.card, { shuffle: data.card.shuffle });
    body.append(renderer.el);
    renderAnswerBar();
    el.closest('.main')?.scrollTo({ top: 0 });
  }

  function renderAnswerBar() {
    actions.innerHTML = '';
    const label = renderer.selfGraded ? 'Antwort zeigen' : 'Prüfen';
    actions.append(h('div', { class: 'inner' },
      h('button', { class: 'btn primary lg', style: { minWidth: '220px' }, onclick: reveal }, label, h('span', { class: 'kbd' }, 'Leertaste'))));
  }

  function reveal() {
    if (phase !== 'answer') return;
    if (!renderer.selfGraded && renderer.hasInput && !renderer.hasInput()) {
      toast('Keine Antwort gewählt. Nochmal drücken zeigt die Lösung.');
      renderer.hasInput = () => true;
      return;
    }
    const { correct } = renderer.check();
    suggested = correct === true ? 3 : correct === false ? 1 : null;
    phase = 'rate';
    actions.innerHTML = '';
    const p = current.previews;
    actions.append(h('div', { class: 'inner' },
      RATINGS.map(({ r, t }) =>
        h('button', { class: `rate r${r}${suggested === r ? ' sugg' : ''}`, onclick: () => rate(r) },
          h('span', { class: 't' }, t),
          h('span', { class: 'd' }, p[r].label, h('span', { class: 'kbd' }, String(r)))))));
  }

  async function rate(r) {
    if (phase !== 'rate' || busy) return;
    busy = true;
    try {
      await api.review(current.card.cardId, r, Date.now() - started);
      answered++;
      onChange?.();
      await load();
    } catch (e) {
      toast(`Speichern fehlgeschlagen: ${e.message}`);
    } finally {
      busy = false;
    }
  }

  async function undo() {
    const res = await api.undo();
    if (!res.ok) return toast('Nichts zum Rückgängigmachen');
    answered = Math.max(0, answered - 1);
    toast('Rückgängig gemacht');
    onChange?.();
    await load();
  }

  const onKey = (e) => {
    if (e.target.closest?.('input, textarea, select')) return;
    if (e.key === 'Escape') {
      if (!document.getElementById('lightbox').hidden) document.getElementById('lightbox').hidden = true;
      else location.hash = backHref;
      return;
    }
    if ((e.key === 'z' || e.key === 'Z') && !e.altKey) { e.preventDefault(); undo(); return; }
    if (phase === 'answer') {
      if (renderer?.keydown?.(e)) { e.preventDefault(); return; }
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); reveal(); }
    } else if (phase === 'rate') {
      if (['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); rate(Number(e.key)); }
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); rate(suggested ?? 3); }
    }
  };
  window.addEventListener('keydown', onKey);
  renderTop(null);
  await load();
  return { el, cleanup: () => window.removeEventListener('keydown', onKey) };
}
