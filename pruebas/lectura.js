const { chromium } = require('playwright');
const { CHROMIUM, CAPTURAS } = require('./entorno.js');

const BASE = process.env.BASE || 'http://localhost:8777/';
const SHOT = CAPTURAS + '51-lectura';

(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await b.newPage({ viewport: { width: 1280, height: 1100 } });
  const errs = [];
  p.on('pageerror', e => errs.push('EXCEPCIÓN: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/gstatic|listadomanga|net::ERR|404/.test(m.text())) errs.push('CONSOLA: ' + m.text()); });
  await p.route('https://encrypted-tbn0.gstatic.com/**', r => r.abort());
  let fallos = 0;
  const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fallos++; };

  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.click('a[data-vista="biblioteca"]');
  await p.waitForSelector('.serie');
  await p.click('[data-accion="alternar-filtros"]');
  await p.waitForSelector('#fLectura');

  /* ---------- El reparto es exhaustivo y sin solapes ---------- */
  const reparto = await p.evaluate(() => {
    const s = D.coleccion.series;
    const de = m => s.filter(x => D.encajaLectura(x, m));
    const c = de('completas'), e = de('empezadas'), n = de('sinEmpezar');
    return {
      total: s.length, c: c.length, e: e.length, n: n.length,
      solapes: s.filter(x => [c, e, n].filter(g => g.indexOf(x) !== -1).length !== 1).map(x => x.titulo),
      // Una completa de muestra, y comprobar que de verdad lo está.
      malas: c.filter(x => { const st = D.statsSerie(x); return !(st.total > 0 && st.leidosTotal >= st.total); }).map(x => x.titulo),
      // Alguna leída entera SIN tenerla: eso también cuenta.
      sinTener: c.filter(x => !x.tomos.some(t => t.tengo)).map(x => x.titulo),
      muestra: c.slice(0, 3).map(x => { const st = D.statsSerie(x); return `${x.titulo} ${st.leidosTotal}/${st.total}`; })
    };
  });
  console.log(`Reparto: ${reparto.c} enteras · ${reparto.e} a medias · ${reparto.n} sin empezar = ${reparto.c + reparto.e + reparto.n} de ${reparto.total}`);
  console.log('  Muestra: ' + reparto.muestra.join(' · '));
  ok(reparto.c + reparto.e + reparto.n === reparto.total, 'los tres estados cubren todas las series');
  ok(reparto.solapes.length === 0, 'y ninguna cae en dos a la vez: ' + (reparto.solapes.join(', ') || 'ninguna'));
  ok(reparto.malas.length === 0, 'todas las «enteras» tienen leídos >= total');
  ok(reparto.c > 0, 'hay ' + reparto.c + ' leídas enteras que enseñar');

  /* ---------- El filtro recorta de verdad ---------- */
  const todas = await p.locator('.serie').count();
  await p.selectOption('#fLectura', 'completas');
  await p.waitForTimeout(400);
  const nCompletas = await p.locator('.serie').count();
  console.log(`  Biblioteca: ${todas} sin filtrar → ${nCompletas} con «Leídas enteras»`);
  ok(nCompletas === reparto.c, 'el filtro «Leídas enteras» enseña justo esas ' + reparto.c);
  ok(nCompletas < todas, 'y recorta la lista');

  const pintadas = await p.evaluate(() =>
    Array.from(document.querySelectorAll('.serie')).map(e => e.dataset.serie));
  const todasEnteras = await p.evaluate(ids =>
    ids.every(id => D.encajaLectura(D.serie(id), 'completas')), pintadas);
  ok(todasEnteras, 'y todas las que salen están de verdad leídas enteras');

  const cuenta = (await p.locator('#bibCuenta').textContent()).replace(/\s+/g, ' ').trim();
  console.log('  Contador: ' + cuenta.slice(0, 70));
  ok(cuenta.indexOf(String(nCompletas)) !== -1, 'el contador refleja el recorte');
  ok(await p.locator('.contador-filtros').count() === 1, 'el botón avisa de que hay un filtro puesto');

  /* ---------- Los otros dos ---------- */
  for (const [modo, esperado] of [['empezadas', reparto.e], ['sinEmpezar', reparto.n]]) {
    await p.selectOption('#fLectura', modo);
    await p.waitForTimeout(350);
    const n = await p.locator('.serie').count();
    ok(n === esperado, `«${modo}» enseña ${esperado}`);
  }

  /* ---------- Se combina con los demás filtros ---------- */
  await p.selectOption('#fLectura', 'completas');
  await p.selectOption('#fSeguimiento', 'sigo');
  await p.waitForTimeout(400);
  const combinado = await p.locator('.serie').count();
  const esperadoComb = await p.evaluate(() =>
    D.coleccion.series.filter(s => D.encajaLectura(s, 'completas') && !s.abandonada).length);
  console.log(`  Enteras + solo las que sigo: ${combinado}`);
  ok(combinado === esperadoComb, 'se combina con los otros filtros (' + esperadoComb + ')');
  ok(await p.locator('.contador-filtros').textContent() === '2', 'y cuenta como dos filtros puestos');

  /* ---------- Quitar filtros lo limpia ---------- */
  await p.click('[data-accion="limpiar-filtros"]');
  await p.waitForTimeout(400);
  ok(await p.locator('.serie').count() === todas, '«Quitar filtros» devuelve las ' + todas);
  ok(await p.evaluate(() => V.filtros.lectura) === '', 'y deja el filtro de lectura vacío');
  ok(await p.inputValue('#fLectura') === '', 'el desplegable vuelve a «Leídas y sin leer»');

  await p.selectOption('#fLectura', 'completas');
  await p.waitForTimeout(400);
  await p.screenshot({ path: SHOT + '.png' });

  if (errs.length) { console.log('ERRORES:'); errs.forEach(e => console.log('  ! ' + e)); }
  console.log(fallos + errs.length ? `\nFALLOS: ${fallos + errs.length}` : '\nTODO OK');
  await b.close();
  process.exit(fallos + errs.length ? 1 : 0);
})();
