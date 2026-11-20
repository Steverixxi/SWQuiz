// Renderers for all question types.
//
// Each renderer returns { el, check(), keydown(e) }.
// check() locks the question, shows the solution and returns { correct } where
// correct is true / false, or null for self-graded flashcards.

import { h, rich, inline, shuffle } from './util.js';
import { api } from './api.js';

const LETTERS = 'ABCDEFGHIJKLMNOP';

export function renderQuestion(q, ctx = {}) {
  const r = RENDERERS[q.type];
  if (!r) return { el: h('div', { class: 'error-box' }, `Unbekannter Fragetyp: ${q.type}`), check: () => ({ correct: null }) };
  return r(q, { shuffle: ctx.shuffle !== false && q.shuffle !== false });
}

// ---------- image with optional numbered pins and arrows ----------

function imageBlock(q, labels = []) {
  const src = api.asset(q.examId, q.image);
  const wrap = h('div', { class: 'q-image' });
  const img = h('img', { src, alt: '', draggable: 'false' });
  wrap.append(img);
  const pins = new Map();
  const withPos = labels.filter((l) => l.x != null && l.y != null);
  if (withPos.length) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'overlay');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    for (const l of withPos) {
      if (l.ax == null || l.ay == null) continue;
      for (const [color, width] of [['#000', 0.9], ['#fff', 0.45]]) {
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', l.x); line.setAttribute('y1', l.y);
        line.setAttribute('x2', l.ax); line.setAttribute('y2', l.ay);
        line.setAttribute('stroke', color); line.setAttribute('stroke-width', width);
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        line.style.strokeWidth = color === '#000' ? '4px' : '2px';
        svg.append(line);
        const dot = document.createElementNS(ns, 'circle');
        dot.setAttribute('cx', l.ax); dot.setAttribute('cy', l.ay); dot.setAttribute('r', color === '#000' ? 0.9 : 0.55);
        dot.setAttribute('fill', color);
        svg.append(dot);
      }
    }
    wrap.append(svg);
    for (const l of withPos) {
      const pin = h('div', { class: 'pin', style: { left: `${l.x}%`, top: `${l.y}%` } }, String(l.n));
      pins.set(String(l.n), pin);
      wrap.append(pin);
    }
  }
  wrap.addEventListener('click', () => lightboxWithPins(wrap));
  return { el: wrap, pins };
}

function lightboxWithPins(wrap) {
  const el = document.getElementById('lightbox');
  el.innerHTML = '';
  const clone = wrap.cloneNode(true);
  clone.style.cssText = 'max-width:min(96vw,1600px);width:100%;cursor:zoom-out;box-shadow:none;background:transparent';
  const img = clone.querySelector('img');
  img.style.maxHeight = '92vh';
  el.append(clone);
  el.hidden = false;
  el.onclick = () => (el.hidden = true);
}

function header(q) {
  const parts = [];
  if (q.question) parts.push(rich('div', q.question, { class: 'q-text' }));
  return parts;
}

function explanationBox(q, correct, extra) {
  const cls = correct === true ? 'ok' : correct === false ? 'bad' : '';
  const box = h('div', { class: `feedback ${cls}` });
  if (correct === true) box.append(h('div', { class: 'head' }, 'Richtig'));
  if (correct === false) box.append(h('div', { class: 'head' }, 'Leider falsch'));
  if (extra) box.append(extra);
  if (q.explanation) box.append(rich('div', q.explanation));
  if (q.source) box.append(h('div', { class: 'src' }, `Quelle: ${q.source}`));
  if (!correct && !q.explanation && !q.source && !extra && correct == null) return null;
  return box;
}

// ---------- single + multiple choice ----------

function choice(q, { shuffle: doShuffle }) {
  const multi = q.type === 'multiple';
  const opts = (doShuffle ? shuffle(q.options) : [...q.options]).map((o, i) => ({ ...o, key: LETTERS[i] }));
  const selected = new Set();
  let locked = false;
  const el = h('div');
  el.append(h('div', { class: 'q-meta' }, h('span', { class: 'tag' }, multi ? 'Multiple Choice · mehrere richtig' : 'Single Choice')));
  if (q.image) el.append(imageBlock(q).el);
  el.append(...header(q));
  const list = h('div', { class: 'options' });
  const buttons = opts.map((o, i) => {
    const b = h('button', { class: `option${multi ? ' multi' : ''}`, type: 'button' },
      h('span', { class: 'key' }, o.key),
      h('span', { class: 'txt', html: inline(o.text) }));
    b.addEventListener('click', () => toggle(i));
    list.append(b);
    return b;
  });
  el.append(list);

  function toggle(i) {
    if (locked) return;
    if (multi) selected.has(i) ? selected.delete(i) : selected.add(i);
    else { selected.clear(); selected.add(i); }
    buttons.forEach((b, j) => b.classList.toggle('selected', selected.has(j)));
  }

  return {
    el,
    hasInput: () => selected.size > 0,
    check() {
      locked = true;
      list.classList.add('locked');
      let correct = true;
      opts.forEach((o, i) => {
        const b = buttons[i];
        const sel = selected.has(i);
        const right = o.correct === true;
        b.classList.remove('selected');
        if (right && sel) b.classList.add('correct');
        else if (right && !sel) { b.classList.add('correct', 'missed'); correct = false; }
        else if (!right && sel) { b.classList.add('wrong'); correct = false; }
        if (o.explain && (sel || right)) b.querySelector('.txt').append(h('span', { class: 'why', html: inline(o.explain) }));
      });
      const box = explanationBox(q, correct);
      if (box) el.append(box);
      return { correct };
    },
    keydown(e) {
      if (locked) return false;
      const idx = LETTERS.indexOf(e.key.toUpperCase());
      if (idx >= 0 && idx < opts.length && !e.metaKey && !e.ctrlKey) { toggle(idx); return true; }
      return false;
    },
  };
}

// ---------- drag & drop assignment (matching + image labels) ----------

function makeDraggable(chip, { onDrop, onTap }) {
  let start = null;
  let ghost = null;
  chip.addEventListener('pointerdown', (e) => {
    if (chip.closest('.locked')) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    chip.setPointerCapture(e.pointerId);
  });
  chip.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    if (!ghost && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) {
      const r = chip.getBoundingClientRect();
      ghost = chip.cloneNode(true);
      ghost.classList.add('dragging');
      ghost.style.width = `${r.width}px`;
      ghost.dataset.dx = String(start.x - r.left);
      ghost.dataset.dy = String(start.y - r.top);
      document.body.append(ghost);
      chip.style.opacity = '.35';
    }
    if (ghost) {
      ghost.style.left = `${e.clientX - Number(ghost.dataset.dx)}px`;
      ghost.style.top = `${e.clientY - Number(ghost.dataset.dy)}px`;
      document.querySelectorAll('.slot.over').forEach((s) => s.classList.remove('over'));
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.slot, .pool');
      if (target?.classList.contains('slot')) target.classList.add('over');
    }
  });
  const end = (e) => {
    if (!start || e.pointerId !== start.id) return;
    const wasDrag = !!ghost;
    if (ghost) {
      ghost.remove();
      ghost = null;
      chip.style.opacity = '';
      document.querySelectorAll('.slot.over').forEach((s) => s.classList.remove('over'));
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.slot, .pool');
      onDrop(target);
    }
    start = null;
    if (!wasDrag && e.type === 'pointerup') onTap();
  };
  chip.addEventListener('pointerup', end);
  chip.addEventListener('pointercancel', end);
}

function assign(q, { shuffle: doShuffle }) {
  const isImage = q.type === 'image';
  const targets = isImage
    ? q.labels.map((l) => ({ key: String(l.n), left: String(l.n), answer: l.answer, label: l }))
    : q.pairs.map((p, i) => ({ key: String(i), left: p.left, answer: p.right }));
  const chipTexts = [...targets.map((t) => t.answer), ...(q.distractors ?? [])];
  const chips = (doShuffle ? shuffle(chipTexts) : chipTexts).map((text, i) => ({ id: i, text }));
  const placed = new Map(); // target key -> chip id
  let picked = null;
  let locked = false;

  const el = h('div', { class: 'assign' });
  const head = h('div');
  head.append(h('div', { class: 'q-meta' }, h('span', { class: 'tag' }, isImage ? 'Bild · Strukturen zuordnen' : 'Zuordnung')));
  let pins = new Map();
  if (q.image) {
    const img = imageBlock(q, isImage ? q.labels : []);
    pins = img.pins;
    head.append(img.el);
  }
  head.append(...header(q));
  head.append(h('div', { class: 'q-hint' }, 'Ziehe die Begriffe in die Felder, oder tippe erst einen Begriff und dann ein Feld an.'));
  el.append(head);

  const slotsEl = h('div', { class: 'slots' });
  const pool = h('div', { class: 'pool' });
  const slotEls = new Map();
  for (const t of targets) {
    const slot = h('div', { class: 'slot', 'data-key': t.key });
    slotEls.set(t.key, slot);
    slot.addEventListener('click', (e) => {
      if (locked || e.target.closest('.chip')) return;
      if (picked != null) place(picked, t.key);
    });
    if (isImage) {
      slot.addEventListener('pointerenter', () => pins.get(t.key)?.classList.add('hl'));
      slot.addEventListener('pointerleave', () => pins.get(t.key)?.classList.remove('hl'));
    }
    slotsEl.append(
      h('div', { class: `slot-row${isImage ? ' image-row' : ''}` },
        isImage ? h('div', { class: 'slot-num' }, t.left) : h('div', { class: 'slot-left', html: inline(t.left) }),
        slot),
    );
  }
  pool.addEventListener('click', (e) => {
    if (!locked && picked != null && !e.target.closest('.chip')) unplace(picked);
  });
  el.append(slotsEl, pool);

  const chipEls = new Map();
  for (const c of chips) {
    const chip = h('div', { class: 'chip', html: inline(c.text) });
    chipEls.set(c.id, chip);
    makeDraggable(chip, {
      onDrop: (target) => {
        if (target?.classList.contains('slot')) place(c.id, target.dataset.key);
        else if (target?.classList.contains('pool')) unplace(c.id);
      },
      onTap: () => {
        if (locked) return;
        picked = picked === c.id ? null : c.id;
        render();
      },
    });
  }

  function place(chipId, key) {
    for (const [k, v] of placed) if (v === chipId) placed.delete(k);
    placed.set(key, chipId);
    picked = null;
    render();
  }
  function unplace(chipId) {
    for (const [k, v] of placed) if (v === chipId) placed.delete(k);
    picked = null;
    render();
  }
  function render() {
    const inSlots = new Set(placed.values());
    for (const [key, slot] of slotEls) {
      const id = placed.get(key);
      slot.querySelector('.chip')?.remove();
      if (id != null) slot.prepend(chipEls.get(id));
      slot.classList.toggle('target', picked != null && !locked);
    }
    for (const c of chips) {
      const chip = chipEls.get(c.id);
      chip.classList.toggle('picked', picked === c.id);
      if (!inSlots.has(c.id) && chip.parentElement !== pool) pool.append(chip);
    }
    // keep pool order stable
    for (const c of chips) if (!inSlots.has(c.id)) pool.append(chipEls.get(c.id));
  }
  render();

  return {
    el,
    hasInput: () => placed.size > 0,
    check() {
      locked = true;
      picked = null;
      el.classList.add('locked');
      render();
      let correct = true;
      for (const t of targets) {
        const slot = slotEls.get(t.key);
        const id = placed.get(t.key);
        const ok = id != null && chips.find((c) => c.id === id).text === t.answer;
        slot.classList.add(ok ? 'ok' : 'bad');
        pins.get(t.key)?.classList.add(ok ? 'ok' : 'bad');
        if (!ok) {
          correct = false;
          slot.append(h('span', { class: 'fix', html: '→ ' + inline(t.answer) }));
        }
      }
      const box = explanationBox(q, correct);
      if (box) el.append(box);
      return { correct };
    },
    keydown: () => false,
  };
}

// ---------- order ----------

function order(q, { shuffle: doShuffle }) {
  let items = q.items.map((text, i) => ({ text, i }));
  if (doShuffle) {
    // make sure the start order is not already the solution
    for (let tries = 0; tries < 10; tries++) {
      items = shuffle(items);
      if (items.some((it, idx) => it.i !== idx)) break;
    }
  }
  let locked = false;
  let touched = false;
  const el = h('div');
  el.append(h('div', { class: 'q-meta' }, h('span', { class: 'tag' }, 'Reihenfolge')));
  if (q.image) el.append(imageBlock(q).el);
  el.append(...header(q));
  el.append(h('div', { class: 'q-hint' }, 'Bringe die Einträge in die richtige Reihenfolge (ziehen oder Pfeile).'));
  const list = h('div', { class: 'order-list' });
  el.append(list);

  function move(from, to) {
    if (locked || to < 0 || to >= items.length) return;
    const [it] = items.splice(from, 1);
    items.splice(to, 0, it);
    touched = true;
    render();
  }

  function render() {
    list.innerHTML = '';
    items.forEach((it, idx) => {
      const row = h('div', { class: 'order-item' },
        h('span', { class: 'grip' }, '⋮⋮'),
        h('span', { class: 'pos' }, String(idx + 1)),
        h('span', { class: 'txt', html: inline(it.text) }),
        h('button', { class: 'mv', type: 'button', title: 'nach oben', onclick: () => move(idx, idx - 1) }, '↑'),
        h('button', { class: 'mv', type: 'button', title: 'nach unten', onclick: () => move(idx, idx + 1) }, '↓'));
      if (locked) {
        row.classList.add(it.i === idx ? 'ok' : 'bad');
        row.querySelectorAll('.mv').forEach((b) => b.remove());
        if (it.i !== idx) row.append(h('span', { class: 'faint' }, `richtig: ${it.i + 1}`));
      }
      row.querySelector('.grip').addEventListener('pointerdown', (e) => startDrag(e, idx, row));
      list.append(row);
    });
  }

  function startDrag(e, idx, row) {
    if (locked) return;
    e.preventDefault();
    row.classList.add('drag-ghost');
    let cur = idx;
    const onMove = (ev) => {
      const rows = [...list.children];
      for (let j = 0; j < rows.length; j++) {
        const r = rows[j].getBoundingClientRect();
        if (ev.clientY > r.top && ev.clientY < r.bottom && j !== cur) {
          const [it] = items.splice(cur, 1);
          items.splice(j, 0, it);
          cur = j;
          touched = true;
          render();
          list.children[cur].classList.add('drag-ghost');
          break;
        }
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      render();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  render();

  return {
    el,
    hasInput: () => touched,
    check() {
      locked = true;
      render();
      const correct = items.every((it, idx) => it.i === idx);
      const box = explanationBox(q, correct);
      if (box) el.append(box);
      return { correct };
    },
    keydown: () => false,
  };
}

// ---------- flashcard ----------

function flashcard(q) {
  const el = h('div');
  el.append(h('div', { class: 'q-meta' }, h('span', { class: 'tag' }, 'Karteikarte')));
  if (q.image && !q.imageOnBack) el.append(imageBlock(q).el);
  el.append(rich('div', q.front, { class: 'q-text' }));
  return {
    el,
    selfGraded: true,
    hasInput: () => true,
    check() {
      el.append(h('div', { class: 'divider' }));
      if (q.image && q.imageOnBack) el.append(imageBlock(q).el);
      el.append(rich('div', q.back, { class: 'flash-back' }));
      const box = explanationBox(q, null);
      if (box && (q.explanation || q.source)) el.append(box);
      return { correct: null };
    },
    keydown: () => false,
  };
}

const RENDERERS = {
  single: choice,
  multiple: choice,
  matching: assign,
  image: assign,
  order,
  flashcard,
};

export const TYPE_LABELS = {
  single: 'Single Choice',
  multiple: 'Multiple Choice',
  matching: 'Zuordnung',
  image: 'Bildfrage',
  order: 'Reihenfolge',
  flashcard: 'Karteikarte',
};

