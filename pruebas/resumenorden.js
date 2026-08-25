const { chromium } = require('playwright');
const { CHROMIUM, CAPTURAS } = require('./entorno.js');

const BASE = process.env.BASE || 'http://localhost:8777/';
const SHOT = CAPTURAS + '47-resumen-orden.png';

(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await b.newPage({ viewport: { width: 1280, height: 1100 } });
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCIÓN: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/gstatic|listadomanga|net::ERR|404/.test(m.text())) errores.push('CONSOLA: ' + m.text()); });
  await p.route('https://encrypted-tbn0.gstatic.com/**', r => r.abort());
  let fallos = 0;
  const ok = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) fallos++; };

  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForSelector('.stat__valor');

  // El resumen recorta a 5; leemos los títulos de la sección «Ya a la venta».
  const enResumen = async () => {
    await p.click('a[data-vista="resumen"]');
    await p.waitForSelector('.stat__valor');
    const sec = p.locator('section.seccion', { hasText: 'Ya a la venta y aún no lo tienes' });
    await sec.waitFor();
    return (await sec.locator('.lista .fila').allTextContents())
      .map(t => t.replace(/\s+/g, ' ').trim());
  };

  /* ---------- Modo «Por serie» ---------- */
  await p.click('a[data-vista="compras"]');
  await p.waitForSelector('.fila--compra');
  await p.click('[data-accion="modo-compras"][data-modo="series"]');
  await p.waitForTimeout(300);

  const series = await p.locator('.fila--compra .fila__titulo').allTextContents();
  console.log('Series en Compras (por defecto): ' + series.slice(0, 3).map(s => s.trim()).join(' / '));
  // Subimos la 3ª serie al primer puesto escribiendo la posición.
  const tercera = series[2].trim();
  await p.locator('.fila--compra').nth(2).locator('.orden__num').fill('1');
  await p.locator('.fila--compra').nth(2).locator('.orden__num').press('Enter');
  await p.waitForTimeout(400);
  const nuevas = (await p.locator('.fila--compra .fila__titulo').allTextContents()).map(s => s.trim());
  ok(nuevas[0] === tercera, `«${tercera}» sube al primer puesto en Compras`);

  let filas = await enResumen();
  console.log('  Resumen: ' + filas.slice(0, 3).join(' · '));
  ok(filas.length > 0 && filas[0].indexOf(tercera) === 0,
    `el resumen abre por «${tercera}», la serie que has puesto primera`);

  // Y los cinco de la lista son, uno a uno, los cinco primeros de Compras.
  const esperado = await p.evaluate(() => D.compraOrdenada('series').slice(0, 5)
    .map(t => t.serie.titulo + ' Tomo ' + t.numero));
  const visto = filas.map(f => esperado.find(e => f.indexOf(e) === 0) || f.slice(0, 40));
  console.log('  Compras dice: ' + esperado.join(' | '));
  ok(JSON.stringify(esperado) === JSON.stringify(visto),
    'los cinco del resumen son los cinco primeros de Compras, en su orden');

  /* ---------- Modo «Tomo a tomo» ---------- */
  await p.click('a[data-vista="compras"]');
  await p.waitForSelector('.fila--compra');
  await p.click('[data-accion="modo-compras"][data-modo="tomos"]');
  await p.waitForTimeout(400);
  const tomos = (await p.locator('.fila--compra .fila__titulo').allTextContents()).map(s => s.trim());
  console.log('Tomos en Compras (por defecto): ' + tomos.slice(0, 3).join(' / '));
  const cuarto = tomos[3];
  await p.locator('.fila--compra').nth(3).locator('.orden__num').fill('1');
  await p.locator('.fila--compra').nth(3).locator('.orden__num').press('Enter');
  await p.waitForTimeout(400);
  const tomosNuevos = (await p.locator('.fila--compra .fila__titulo').allTextContents()).map(s => s.trim());
  ok(tomosNuevos[0] === cuarto, `«${cuarto}» sube al primer puesto tomo a tomo`);

  filas = await enResumen();
  console.log('  Resumen: ' + filas.slice(0, 3).join(' · '));
  ok(filas[0].indexOf(cuarto.replace(/\s+Tomo\s+\d+$/, '')) === 0,
    'el resumen sigue ahora el orden de «Tomo a tomo»');

  /* ---------- Aguanta la recarga ---------- */
  const antes = filas[0];
  await p.reload({ waitUntil: 'networkidle' });
  filas = await enResumen();
  ok(filas[0] === antes, 'y lo recuerda tras recargar');

  await p.screenshot({ path: SHOT, fullPage: false });
  if (errores.length) { console.log('ERRORES:'); errores.forEach(e => console.log('  ! ' + e)); }
  console.log(fallos || errores.length ? `\nFALLOS: ${fallos + errores.length}` : '\nTODO OK');
  await b.close();
  process.exit(fallos + errores.length ? 1 : 0);
})();
