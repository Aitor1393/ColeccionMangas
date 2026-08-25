const { chromium } = require('playwright');
const { CHROMIUM, CAPTURAS } = require('./entorno.js');

const BASE = 'http://localhost:8777/';
(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await b.newPage({ viewport: { width: 1280, height: 950 } });
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCIÓN: ' + e.message));
  // Las portadas que el usuario pone a mano viven fuera (gstatic, panini…) y el
// sandbox no sale a internet: eso no es un fallo de la web.
p.on('console', m => { if (m.type() === 'error' && !/net::ERR|404|gstatic|panini|listadomanga/.test(m.text())) errores.push('CONSOLA: ' + m.text()); });
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('.stat__valor');

  const stats = await p.locator('.stat').allTextContents();
  console.log('Resumen:'); stats.forEach(s => console.log('  · ' + s.replace(/\s+/g,' ').trim()));

  for (const v of ['biblioteca','pendientes','calendario','ajustes']) {
    await p.click(`a[data-vista="${v}"]`);
    await p.waitForTimeout(500);
    const t = (await p.locator('#app').textContent()).replace(/\s+/g,' ').trim();
    console.log(`  ${t ? '✓' : '✗'} ${v}`);
    if (!t) errores.push(v);
  }
  await p.click('a[data-vista="biblioteca"]');
  await p.waitForSelector('.serie');
  await p.locator('.serie').first().click();
  await p.waitForSelector('.tomos');
  const chips = await p.locator('.detalle__meta .chip').allTextContents();
  console.log('  Detalle: ' + chips.join(' | '));
  await p.screenshot({ path: CAPTURAS + '17-real.png' });
  console.log(errores.length ? '\n❌ ' + errores.join('\n') : '\n✅ Sin errores con los datos reales');
  await b.close();
})();
