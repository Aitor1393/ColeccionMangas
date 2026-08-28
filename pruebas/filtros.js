const { chromium } = require('playwright');
const { CHROMIUM, CAPTURAS } = require('./entorno.js');

const BASE = 'http://localhost:8777/';
(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCIÓN: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|CONNECTION_RESET|404/.test(m.text())) errores.push('CONSOLA: ' + m.text()); });
  await p.route('https://encrypted-tbn0.gstatic.com/**', r => r.abort());
  const paso = async (n, fn) => { try { await fn(); console.log('✓ ' + n); } catch (e) { console.log('✗ ' + n + ' → ' + e.message); errores.push(n); } };

  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE + '#/biblioteca', { waitUntil: 'networkidle' });
  await p.waitForSelector('.serie');

  await paso('el formulario arranca oculto', async () => {
    if (await p.locator('.filtros').isVisible()) throw new Error('se ve el panel');
    if (await p.locator('#fTexto').isVisible()) throw new Error('se ve el buscador');
    const n = await p.locator('.serie').count();
    console.log('      → ' + n + ' series a la vista, sin barra de filtros');
    if (!n) throw new Error('no se ven series');
  });

  await paso('hay un botón que lo abre', async () => {
    const btn = p.locator('[data-accion="alternar-filtros"]');
    console.log('      → botón: "' + (await btn.textContent()).trim() + '"');
    if (await btn.getAttribute('aria-expanded') !== 'false') throw new Error('aria-expanded mal');
    await btn.click();
    await p.waitForTimeout(400);
    if (!await p.locator('.filtros').isVisible()) throw new Error('no se abre');
    if (await p.locator('[data-accion="alternar-filtros"]').getAttribute('aria-expanded') !== 'true') throw new Error('aria-expanded no cambia');
  });

  await paso('al abrirlo el cursor queda en el buscador', async () => {
    const foco = await p.evaluate(() => document.activeElement && document.activeElement.id);
    console.log('      → foco en #' + foco);
    if (foco !== 'fTexto') throw new Error('foco en ' + foco);
  });

  await paso('se puede escribir y filtra', async () => {
    await p.keyboard.type('bleach');
    await p.waitForTimeout(600);
    const t = await p.locator('.serie__titulo').allTextContents();
    console.log('      → ' + t.join(', '));
    if (t.length !== 1) throw new Error(t.length + ' resultados');
    if (await p.evaluate(() => document.activeElement.id) !== 'fTexto') throw new Error('se pierde el foco al escribir');
  });

  await paso('el botón avisa de cuántos filtros hay puestos', async () => {
    const n = await p.locator('.contador-filtros').textContent();
    const clase = await p.locator('[data-accion="alternar-filtros"]').getAttribute('class');
    console.log('      → contador ' + n + ' · clase "' + clase + '"');
    if (n !== '1') throw new Error('contador: ' + n);
    if (!/btn--primario/.test(clase)) throw new Error('no se resalta');
  });

  await paso('cerrado sigue avisando de que la lista está recortada', async () => {
    await p.click('[data-accion="alternar-filtros"]');
    await p.waitForTimeout(400);
    if (await p.locator('.filtros').isVisible()) throw new Error('no se cierra');
    const sub = (await p.locator('.vista__cabecera p').textContent()).trim();
    const cont = await p.locator('.contador-filtros').textContent();
    console.log('      → "' + sub + '" · contador ' + cont);
    if (!/lista filtrada/.test(sub)) throw new Error(sub);
    if (cont !== '1') throw new Error('contador: ' + cont);
  });

  await paso('«Quitar filtros» los borra todos', async () => {
    await p.click('[data-accion="limpiar-filtros"]');
    await p.waitForTimeout(500);
    const n = await p.locator('.serie').count();
    // Las que la biblioteca enseña sin ningún filtro: las deseadas no están.
    const total = await p.evaluate(() => D.coleccion.series.filter(s => !s.deseada).length);
    console.log('      → vuelven ' + n + ' de ' + total + ' series');
    if (await p.locator('.contador-filtros').count()) throw new Error('sigue el contador');
    if (await p.locator('[data-accion="limpiar-filtros"]').count()) throw new Error('sigue el botón de limpiar');
    if (n !== total) throw new Error(n + ' de ' + total);
  });

  await paso('sin filtros no hay botón de limpiar', async () => {
    if (await p.locator('[data-accion="limpiar-filtros"]').count()) throw new Error('está');
  });

  await paso('el panel abierto se recuerda al recargar', async () => {
    await p.click('[data-accion="alternar-filtros"]');
    await p.waitForTimeout(400);
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('.serie');
    if (!await p.locator('.filtros').isVisible()) throw new Error('se cierra al recargar');
    await p.click('[data-accion="alternar-filtros"]');
    await p.waitForTimeout(300);
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('.serie');
    if (await p.locator('.filtros').isVisible()) throw new Error('se abre al recargar');
  });

  await paso('los selects siguen funcionando con el panel abierto', async () => {
    await p.click('[data-accion="alternar-filtros"]');
    await p.waitForTimeout(400);
    await p.selectOption('#fSeguimiento', 'abandonadas');
    await p.waitForTimeout(500);
    const n = await p.locator('.serie').count();
    const ab = await p.evaluate(() => D.abandonadas().length);
    console.log('      → solo abandonadas: ' + n + ' de ' + ab);
    if (n !== ab) throw new Error(n + ' ≠ ' + ab);
    await p.click('[data-accion="limpiar-filtros"]');
    await p.waitForTimeout(400);
  });

  await paso('«Verlas» desde Compras abre el panel ya filtrado', async () => {
    await p.click('[data-accion="alternar-filtros"]');   // lo dejamos cerrado
    await p.waitForTimeout(300);
    await p.goto(BASE + '#/compras', { waitUntil: 'networkidle' });
    await p.waitForSelector('[data-accion="ver-abandonadas"]');
    await p.click('[data-accion="ver-abandonadas"]');
    await p.waitForTimeout(700);
    const abierto = await p.locator('.filtros').isVisible();
    const n = await p.locator('.serie').count();
    const ab = await p.evaluate(() => D.abandonadas().length);
    console.log('      → panel abierto: ' + abierto + ' · ' + n + ' de ' + ab + ' abandonadas');
    if (!abierto) throw new Error('llega con el panel cerrado y no se ve por qué la lista está recortada');
    if (n !== ab) throw new Error(n + ' ≠ ' + ab);
  });

  await p.goto(BASE + '#/biblioteca', { waitUntil: 'networkidle' });
  await p.evaluate(() => { V.filtros.seguimiento = ''; V.filtrosAbiertos = false; U.guardarLocal('cm:filtrosBiblioteca', false); App.render(); });
  await p.waitForTimeout(700);
  await p.screenshot({ path: CAPTURAS + '38-filtros-cerrados.png' });
  await p.click('[data-accion="alternar-filtros"]');
  await p.waitForTimeout(500);
  await p.screenshot({ path: CAPTURAS + '39-filtros-abiertos.png' });

  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(400);
  const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
  console.log('\nmóvil: ancho ' + ancho + 'px' + (ancho > 400 ? ' ❌ desborda' : ' ✓'));

  console.log(errores.length ? '❌ ' + errores.join('\n') : '✅ Buscador plegable correcto');
  await b.close();
  process.exit(errores.length ? 1 : 0);
})();
