// SWQuiz web app: hash router + sidebar.

import { h, icon, countdownText } from './util.js';
import { api } from './api.js';
import { dashboardView } from './views/dashboard.js';
import { examView, noteView } from './views/exam.js';
import { studyView } from './views/study.js';
import { settingsView } from './views/settings.js';

const main = document.getElementById('main');
const nav = document.getElementById('nav');
const tabbar = document.getElementById('tabbar');
const appEl = document.getElementById('app');

let cleanup = null;
let lastDash = null;

export async function refreshSidebar() {
  try {
    lastDash = await api.dashboard();
  } catch {
    return;
  }
  renderSidebar();
}

function renderSidebar() {
  const d = lastDash;
  if (!d) return;
  const route = location.hash || '#/';
  const item = (href, iconName, label, badge, opts = {}) =>
    h('a', { class: `nav-item${route === href || (opts.prefix && route.startsWith(opts.prefix)) ? ' active' : ''}`, href },
      opts.dot ? h('span', { class: 'dot', style: { background: opts.dot } }) : icon(iconName),
      h('span', { class: 'label' }, label, opts.sub ? h('span', { class: 'sub' }, opts.sub) : null),
      badge != null && badge > 0 ? h('span', { class: `badge${opts.hot ? ' hot' : ''}` }, String(badge)) : null);

  nav.innerHTML = '';
  nav.append(item('#/', 'home', 'Dashboard'));
  nav.append(item('#/study/all', 'play', 'Alles Fällige üben', d.totals.openToday, { hot: true }));

  // group topics by exam
  const groups = new Map();
  for (const e of d.exams) {
    const key = e.archived ? 'Archiv' : e.exam;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  for (const [name, list] of groups) {
    nav.append(h('div', { class: 'nav-section' }, name));
    for (const e of list) {
      const cd = countdownText(e.daysLeft);
      nav.append(item(`#/exam/${e.id}`, 'book', e.topic, e.openToday, {
        dot: e.color ?? 'var(--accent)',
        sub: e.daysLeft == null ? 'kein Datum' : e.daysLeft < 0 ? 'Prüfung vorbei' : e.daysLeft === 0 ? 'Prüfung heute' : `noch ${cd.n} ${cd.u}`,
        prefix: `#/exam/${e.id}`,
      }));
    }
  }
  if (!d.exams.length) nav.append(h('div', { class: 'nav-section' }, 'Noch keine Prüfungen'));

  document.querySelectorAll('.sidebar-foot .nav-item').forEach((a) => a.classList.toggle('active', route === '#/settings'));

  tabbar.innerHTML = '';
  const tab = (href, iconName, label, active) => h('a', { href, class: active ? 'active' : '' }, icon(iconName), label);
  tabbar.append(
    tab('#/', 'home', 'Dashboard', route === '#/' || route.startsWith('#/exam')),
    tab('#/study/all', 'play', `Üben${d.totals.openToday ? ` (${d.totals.openToday})` : ''}`, route.startsWith('#/study')),
    tab('#/settings', 'gear', 'Einstellungen', route === '#/settings'),
  );
}

async function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  const hash = location.hash.replace(/^#/, '') || '/';
  const parts = hash.split('/').filter(Boolean).map(decodeURIComponent);
  appEl.classList.toggle('studying', parts[0] === 'study');
  renderSidebar();
  main.scrollTop = 0;
  let view;
  try {
    if (!parts.length) view = await dashboardView();
    else if (parts[0] === 'exam' && parts[2] === 'notes') view = await noteView(parts[1], parts.slice(3).join('/'));
    else if (parts[0] === 'exam') view = await examView(parts[1]);
    else if (parts[0] === 'study') view = await studyView({ exam: parts[1] ?? 'all', chapter: parts[2] ?? null, onChange: refreshSidebar });
    else if (parts[0] === 'settings') view = await settingsView();
    else view = { el: h('div', { class: 'page empty' }, 'Seite nicht gefunden') };
  } catch (e) {
    view = { el: h('div', { class: 'page' }, h('div', { class: 'error-box' }, `Fehler: ${e.message}. Läuft der Server (npm start)?`)) };
  }
  main.innerHTML = '';
  main.append(view.el);
  cleanup = view.cleanup ?? null;
}

window.addEventListener('hashchange', () => { route(); refreshSidebar(); });
window.addEventListener('focus', refreshSidebar);
setInterval(refreshSidebar, 60_000);

refreshSidebar().then(route);
