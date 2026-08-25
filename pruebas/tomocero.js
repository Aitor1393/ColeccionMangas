const { chromium } = require('playwright');
const { CHROMIUM, CAPTURAS } = require('./entorno.js');

const BASE = process.env.BASE || 'http://localhost:8777/';
const SHOT = CAPTURAS + '46-tomocero.png';

(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await b.newPage({ viewport: { width: 1280, height: 950 } });
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCIÓN: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/gstatic|listadomanga|net::ERR/.test(m.text())) errores.push('CONSOLA: ' + m.text()); });
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('.stat__valor');

  let fallos = 0;
  const ok = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) fallos++; };

  // --- Modelo: qué series declaran un tomo 0 ---
  const modelo = await p.evaluate(() => {
    return D.coleccion.series
      .filter(s => D.hayTomoCero(s))
      .map(s => ({
        titulo: s.titulo,
        rango: D.rangoTomos(s),
        total: D.totalDe(s),
        declarado: s.tomosTotales || ((D.fichaLM(s) || {}).totalNumeros || 0),
        tengo: D.statsSerie(s).tengo
      }));
  });
  console.log('Series con tomo 0:');
  modelo.forEach(m => console.log(`  · ${m.titulo}: rango ${m.rango.desde}–${m.rango.hasta}, total ${m.total} (LM decía ${m.declarado}), tengo ${m.tengo}`));
  ok(modelo.some(m => /jujutsu/i.test(m.titulo)), 'Jujutsu Kaisen detectada con tomo 0');
  ok(modelo.every(m => m.rango.desde === 0), 'todas empiezan el rango en 0');
  ok(modelo.every(m => m.total === m.declarado + 1), 'el total suma el tomo 0');

  // --- Ninguna serie sin tomo 0 se ha visto afectada ---
  const sinCero = await p.evaluate(() => {
    return D.coleccion.series.filter(s => !D.hayTomoCero(s))
      .map(s => ({ t: s.titulo, d: D.rangoTomos(s).desde, tot: D.totalDe(s),
                   dec: s.tomosTotales || ((D.fichaLM(s) || {}).totalNumeros || 0) }));
  });
  ok(sinCero.every(s => s.d === 1), 'las series sin tomo 0 siguen empezando en 1');
  ok(sinCero.every(s => s.tot === s.dec), 'las series sin tomo 0 no cambian de total');

  // --- La ficha pinta la casilla 0 ---
  await p.click('a[data-vista="biblioteca"]');
  await p.waitForSelector('.serie');
  await p.locator('.serie', { hasText: 'Jujutsu Kaisen' }).first().click();
  await p.waitForSelector('.tomos');
  const celdas = await p.locator('.tomos .tomo').allTextContents();
  const nums = celdas.map(c => c.trim().split(/\s+/)[0]);
  console.log('  Casillas: ' + nums.join(',').slice(0, 120));
  ok(nums[0] === '0', 'la primera casilla es el 0');
  ok(nums.length === 31, 'pinta 31 casillas (0–30), pinta ' + nums.length);

  const cab = (await p.locator('.detalle h3, .detalle label').allTextContents()).join(' | ').replace(/\s+/g, ' ');
  console.log('  Cabecera: ' + cab);
  ok(/Tengo 31 de 31/.test(cab), 'la cabecera dice «Tengo 31 de 31»');
  ok(/Leídos \d+ de 31/.test(cab), 'los leídos también cuentan sobre 31');

  // --- Sin huecos falsos: tener el 0 no puede contar como que falta ---
  const huecos = await p.evaluate(() => {
    const s = D.coleccion.series.find(x => /jujutsu/i.test(x.titulo));
    return D.statsSerie(s).huecos;
  });
  ok(huecos.length === 0, 'Jujutsu Kaisen no inventa huecos: [' + huecos.join(',') + ']');

  // --- La casilla 0 es clicable y da la vuelta entera al ciclo ---
  const clases = [];
  for (let i = 0; i < 4; i++) {
    clases.push((await p.locator('.tomos .tomo').first().getAttribute('class')).replace(/tomo(--conPortada)?\s*/g, '').trim() || '(nada)');
    await p.locator('.tomos .tomo').first().click();
    await p.waitForTimeout(200);
  }
  const vuelta = (await p.locator('.tomos .tomo').first().getAttribute('class')).replace(/tomo(--conPortada)?\s*/g, '').trim() || '(nada)';
  console.log('  Ciclo del 0: ' + clases.join(' → ') + ' → ' + vuelta);
  ok(new Set(clases).size === 4, 'la casilla 0 pasa por los cuatro estados');
  ok(vuelta === clases[0], 'y vuelve al estado de partida');

  await p.screenshot({ path: SHOT });
  if (errores.length) { console.log('ERRORES:'); errores.forEach(e => console.log('  ! ' + e)); }
  console.log(fallos ? `\nFALLOS: ${fallos}` : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
