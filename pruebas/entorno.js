/* ============================================================
   entorno.js — lo que cambia de una máquina a otra
   ============================================================ */
const path = require('path');
const fs = require('fs');

const CAPTURAS = path.join(__dirname, 'capturas') + path.sep;
fs.mkdirSync(CAPTURAS, { recursive: true });

/**
 * Dónde está Chromium.
 *
 * Playwright suele saber encontrarlo solo; se le indica a mano cuando viene
 * preinstalado fuera de su sitio habitual, que es lo que pasa en los entornos
 * de Claude Code (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers).
 *
 * Con CHROMIUM se puede apuntar a otro. Si no hay ninguno, se deja en undefined
 * y que lo busque Playwright.
 */
function buscarChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    // Ojo con «chromium_headless_shell-1194», que está al lado y no vale: es
    // otro binario y con otro nombre. Solo «chromium» o «chromium-<versión>».
    const dirs = fs.readdirSync(base)
      .filter(d => /^chromium(-\d+)?$/.test(d))
      .sort((a, b) => (Number(b.split('-')[1]) || 0) - (Number(a.split('-')[1]) || 0));
    for (const d of dirs) {
      const exe = path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
    }
  } catch (e) { /* no está: que lo busque Playwright */ }
  return undefined;
}

module.exports = { CHROMIUM: buscarChromium(), CAPTURAS };
