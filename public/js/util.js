// Small DOM + formatting helpers.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Inline formatting for question texts: **bold**, *italic*, `code`, line breaks. */
export function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\^(\S+?)\^/g, '<sup>$1</sup>')
    .replace(/~(\S+?)~/g, '<sub>$1</sub>');
}

export function rich(tag, text, attrs = {}) {
  return h(tag, { ...attrs, html: inline(text) });
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Minimal Markdown for study notes: headings, lists, bold/italic, images, tables, paragraphs. */
export function markdown(md, base = '') {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [];
  let list = null;
  let para = [];
  let table = null;
  const fmt = (s) =>
    inline(s)
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => `<img alt="${alt}" src="${/^https?:|^\//.test(src) ? src : base + src}">`)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const flush = () => {
    if (para.length) out.push(`<p>${fmt(para.join(' '))}</p>`);
    para = [];
    if (list) out.push(`</${list}>`);
    list = null;
    if (table) {
      out.push('<table>' + table.map((r, i) => '<tr>' + r.map((c) => (i ? `<td>${fmt(c)}</td>` : `<th>${fmt(c)}</th>`)).join('') + '</tr>').join('') + '</table>');
      table = null;
    }
  };
  for (const line of lines) {
    let m;
    if (!line.trim()) { flush(); continue; }
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { flush(); out.push(`<h${m[1].length}>${fmt(m[2])}</h${m[1].length}>`); continue; }
    if (/^\|.*\|\s*$/.test(line)) {
      if (/^\|[\s:|-]+\|\s*$/.test(line)) continue;
      if (!table) { flush(); table = []; }
      table.push(line.trim().slice(1, -1).split('|').map((c) => c.trim()));
      continue;
    }
    if ((m = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(line))) {
      const type = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (list !== type) { flush(); out.push(`<${type}>`); list = type; }
      out.push(`<li>${fmt(m[2])}</li>`);
      continue;
    }
    if (list) flush();
    para.push(line.trim());
  }
  flush();
  return out.join('\n');
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatDate(iso) {
  if (!iso) return 'kein Datum';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

export function countdownText(daysLeft) {
  if (daysLeft == null) return { n: '–', u: 'kein Datum' };
  if (daysLeft < 0) return { n: '✓', u: 'vorbei' };
  if (daysLeft === 0) return { n: 'Heute', u: 'Prüfung' };
  return { n: String(daysLeft), u: daysLeft === 1 ? 'Tag' : 'Tage' };
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2200);
}

export function lightbox(src) {
  const el = document.getElementById('lightbox');
  el.innerHTML = '';
  el.append(h('img', { src }));
  el.hidden = false;
  el.onclick = () => (el.hidden = true);
}

/** Font Awesome icon, e.g. icon('house') or icon('clock', 'regular'). */
export const icon = (name, style = 'solid') => h('i', { class: `fa-${style} fa-${name}`, 'aria-hidden': 'true' });
