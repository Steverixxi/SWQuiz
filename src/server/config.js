import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const expand = (p) => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);

/**
 * Configuration, in order of priority:
 * 1. environment variables SWQUIZ_PORT, SWQUIZ_EXAMS_DIR, SWQUIZ_DATA_DIR, SWQUIZ_DEVICE
 * 2. swquiz.config.json in the project root (not committed, see swquiz.config.example.json)
 * 3. defaults: exams/ and progress/ inside the project folder
 */
/**
 * Stable device name. The hostname is not usable on a Mac (it changes with the
 * network, e.g. on eduroam), so a name is generated once and kept in
 * ~/.swquiz-device, outside the synced folder.
 */
function deviceName() {
  const file = path.join(os.homedir(), '.swquiz-device');
  try {
    const saved = fs.readFileSync(file, 'utf8').trim();
    if (saved) return saved;
  } catch {}
  const base = (os.userInfo().username || 'geraet').replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || 'geraet';
  const name = `${base}-${os.platform()}-${Math.random().toString(36).slice(2, 7)}`;
  try {
    fs.writeFileSync(file, name + '\n');
  } catch {}
  return name;
}

export function loadConfig() {
  let file = {};
  const cfgPath = path.join(ROOT, 'swquiz.config.json');
  if (fs.existsSync(cfgPath)) file = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const pick = (env, key, def) => process.env[env] ?? file[key] ?? def;
  const resolve = (p) => path.resolve(ROOT, expand(p));
  return {
    port: Number(pick('SWQUIZ_PORT', 'port', 4321)),
    host: pick('SWQUIZ_HOST', 'host', '127.0.0.1'),
    examsDir: resolve(pick('SWQUIZ_EXAMS_DIR', 'examsDir', 'exams')),
    dataDir: resolve(pick('SWQUIZ_DATA_DIR', 'dataDir', 'progress')),
    device: process.env.SWQUIZ_DEVICE ?? file.device ?? deviceName(),
  };
}
