const { chromium } = require('playwright');
const { CHROMIUM, CAPTURAS } = require('./entorno.js');

const BASE = process.env.BASE || 'http://localhost:8777/';
(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await b.newPage({ viewport: { width: 1280, height: 950 } });
  const errs = [];
  p.on('pageerror', e => errs.push('EXCEPCIÓN: ' + e.message));
  await p.route('https://encrypted-tbn0.gstatic.com/**', r => r.abort());
  let fallos = 0;
  const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fallos++; };

  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForSelector('.stat__valor');

  console.log('Pie:');
  const pie = (await p.locator('#pieActualizado').textContent()).replace(/\s+/g, ' ').trim();
  console.log('  «' + pie + '»');
  ok(/datos de ListadoManga/.test(pie), 'dice cuándo se trajeron los datos de ListadoManga');
  ok(!/⚠/.test(pie), 'y hoy no avisa, porque están recién traídos');

  // Con datos viejos sí avisa.
  await p.evaluate(() => { D.calendario.actualizado = '2026-07-01'; App.render(); });
  await p.waitForTimeout(200);
  const viejo = (await p.locator('#pieActualizado').textContent()).replace(/\s+/g, ' ').trim();
  console.log('  con datos del 1 de julio: «' + viejo + '»');
  ok(/⚠/.test(viejo), 'con datos viejos sale el aviso');
  ok(await p.locator('.pie--alerta').count() === 1, 'y se destaca en ámbar');
  const titulo = await p.locator('.pie--alerta').getAttribute('title');
  ok(/sin funcionar/.test(titulo || ''), 'con una explicación al pasar el ratón');

  // Justo en el límite no avisa.
  await p.evaluate(() => {
    const d = new Date(); d.setDate(d.getDate() - 9);
    D.calendario.actualizado = d.toISOString().slice(0, 10); App.render();
  });
  await p.waitForTimeout(200);
  ok(!/⚠/.test(await p.locator('#pieActualizado').textContent()), 'a los 9 días todavía no avisa');

  console.log('Platinum End:');
  const pe = await p.evaluate(() => {
    const s = D.coleccion.series.find(x => /platinum/i.test(x.titulo));
    if (!s) return null;
    const f = D.fichaLM(s) || {};
    return {
      numeros: (f.numeros || []).length,
      conPortada: (f.numeros || []).filter(n => n.portada).length,
      editorial: f.editorial, propia: !!D.portadaEditorialDe(s),
      usa: V.urlPortada(s)
    };
  });
  console.log('  ' + JSON.stringify(pe));
  ok(pe && pe.numeros === 14, 'trae sus 14 tomos de ListadoManga');
  ok(pe && pe.conPortada === 14, 'con las 14 portadas de tomo');
  ok(pe && pe.propia, 'y su portada de serie de Norma');
  ok(pe && /portadas-serie/.test(pe.usa), 'que es la que enseña la biblioteca');

  await p.evaluate(() => { const s = D.coleccion.series.find(x => /platinum/i.test(x.titulo)); App.abrirSerie(s.id); });
  await p.waitForSelector('.tomos');
  const casillas = await p.locator('.tomos .tomo--conPortada').count();
  ok(casillas === 14, 'y las 14 casillas de la ficha llevan miniatura (' + casillas + ')');
  await p.screenshot({ path: CAPTURAS + '52-platinum.png' });

  if (errs.length) { console.log('ERRORES:'); errs.forEach(e => console.log('  ! ' + e)); }
  console.log(fallos + errs.length ? `\nFALLOS: ${fallos + errs.length}` : '\nTODO OK');
  await b.close();
  process.exit(fallos + errs.length ? 1 : 0);
})();
