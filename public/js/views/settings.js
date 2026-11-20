import { h, toast } from '../util.js';
import { api } from '../api.js';

const FIELDS = [
  ['learningSteps', 'Lernschritte (Minuten)', 'Abstände für neue Karten, z. B. 1, 10', 'list'],
  ['relearningSteps', 'Wiederholschritte (Minuten)', 'Nach „Nochmal“ bei gelernten Karten', 'list'],
  ['graduatingInterval', 'Intervall nach dem Lernen (Tage)', 'Erster Abstand nach „Gut“', 'number'],
  ['easyInterval', 'Intervall bei „Einfach“ (Tage)', 'Erster Abstand nach „Einfach“', 'number'],
  ['examCapFactor', 'Prüfungs-Anpassung', 'Höchstens dieser Anteil der Resttage bis zur Prüfung pro Intervall (0.6 = 60 %)', 'number'],
  ['newCardBufferDays', 'Puffer vor der Prüfung (Tage)', 'Bis so viele Tage vor der Prüfung sind alle Karten eingeführt', 'number'],
  ['minNewPerDay', 'Neue Karten pro Tag, mindestens', 'Pro Thema', 'number'],
  ['maxNewPerDay', 'Neue Karten pro Tag, höchstens', 'Pro Thema', 'number'],
  ['dayStartHour', 'Neuer Tag beginnt um (Uhr)', 'Wie in Anki, standardmäßig 4 Uhr', 'number'],
];

export async function settingsView() {
  const { defaults, settings, config } = await api.settings();
  const el = h('div', { class: 'page' });
  el.append(h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Einstellungen'), h('div', { class: 'muted' }, 'Gelten für alle Prüfungen und werden mit synchronisiert'))));

  const inputs = {};
  const form = h('div', { class: 'card form' });
  for (const [key, title, desc, kind] of FIELDS) {
    const val = settings[key] ?? defaults[key];
    const input = h('input', { value: Array.isArray(val) ? val.join(', ') : String(val), placeholder: String(defaults[key]) });
    inputs[key] = { input, kind };
    form.append(h('div', {}, h('div', { class: 'h' }, title), h('div', { class: 'd' }, desc)), input);
  }
  el.append(form);
  el.append(h('div', { style: { display: 'flex', gap: '10px', marginTop: '16px' } },
    h('button', { class: 'btn primary', onclick: save }, 'Speichern'),
    h('button', { class: 'btn', onclick: reset }, 'Standard wiederherstellen')));

  el.append(h('div', { class: 'section-title' }, 'Speicherorte'));
  el.append(h('div', { class: 'card form' },
    h('div', {}, h('div', { class: 'h' }, 'Prüfungen'), h('div', { class: 'd' }, 'Ordner mit meta.json und Fragen')), h('code', { class: 'path' }, config.examsDir),
    h('div', {}, h('div', { class: 'h' }, 'Lernfortschritt'), h('div', { class: 'd' }, 'In einen Nextcloud-Ordner legen, damit alle Geräte synchron bleiben')), h('code', { class: 'path' }, config.dataDir),
    h('div', {}, h('div', { class: 'h' }, 'Dieses Gerät'), h('div', { class: 'd' }, 'Jedes Gerät schreibt seine eigene Datei, so gibt es keine Sync-Konflikte')), h('code', { class: 'path' }, config.device)));
  el.append(h('p', { class: 'faint', style: { fontSize: '13px' } }, 'Ändern über swquiz.config.json im Projektordner (Vorlage: swquiz.config.example.json), danach Server neu starten.'));

  async function save() {
    const out = {};
    for (const [key, { input, kind }] of Object.entries(inputs)) {
      const raw = input.value.trim();
      if (!raw) continue;
      if (kind === 'list') {
        const arr = raw.split(/[,\s]+/).map(Number).filter((n) => n > 0);
        if (arr.length) out[key] = arr;
      } else {
        const n = Number(raw.replace(',', '.'));
        if (Number.isFinite(n) && n >= 0) out[key] = n;
      }
    }
    await api.saveSettings(out);
    toast('Gespeichert');
  }
  async function reset() {
    await api.saveSettings({});
    toast('Standardwerte wiederhergestellt');
    location.reload();
  }
  return { el };
}
