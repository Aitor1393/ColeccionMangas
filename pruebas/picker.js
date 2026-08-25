const { chromium } = require('playwright');
const { CHROMIUM, CAPTURAS } = require('./entorno.js');

const BASE = 'http://localhost:8777/';
(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCIÓN: ' + e.message));
  await p.route('https://encrypted-tbn0.gstatic.com/**', r => r.abort());
  const paso = async (n, fn) => { try { await fn(); console.log('✓ ' + n); } catch (e) { console.log('✗ ' + n + ' → ' + e.message); errores.push(n); } };

  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE + '#/biblioteca', { waitUntil: 'networkidle' });
  await p.waitForSelector('.serie');

  await paso('los resultados de ListadoManga llevan la versión', async () => {
    await p.click('#btnNuevaSerie');
    await p.waitForSelector('#lmBuscar');
    await p.fill('#lmBuscar', 'bleach');
    await p.waitForTimeout(1400);
    const t = await p.locator('.resultado__titulo').allTextContents();
    console.log('      → ' + t.slice(0, 5).join(' | '));
    if (!t.length) throw new Error('sin resultados');
    if (!t.some(x => /\(.+\)$/.test(x.trim()))) throw new Error('ninguno enseña la edición');
  });

  await paso('la línea de confirmación también la lleva', async () => {
    const conParen = p.locator('.resultado', { hasText: '(' }).first();
    const nombre = (await conParen.locator('.resultado__titulo').textContent()).trim();
    await conParen.click();
    await p.waitForTimeout(500);
    const linea = (await p.locator('#lmElegida').textContent()).replace(/\s+/g, ' ').trim();
    console.log('      → ' + linea.slice(0, 100));
    if (linea.indexOf(nombre) === -1) throw new Error('no nombra «' + nombre + '»');
    await p.keyboard.press('Escape');
  });

  await paso('al editar una serie enlazada se dice qué edición es', async () => {
    await p.goto(BASE + '#/biblioteca', { waitUntil: 'networkidle' });
    await p.locator('.serie', { hasText: 'Bleach' }).first().click();
    await p.waitForSelector('.detalle h2');
    await p.click('[data-accion="editar-serie"]');
    await p.waitForSelector('#lmElegida');
    const linea = (await p.locator('#lmElegida').textContent()).replace(/\s+/g, ' ').trim();
    console.log('      → ' + linea);
    if (!/Bleach \(Maximum\)/.test(linea)) throw new Error(linea);
    await p.keyboard.press('Escape');
  });

  await paso('el buscador se prerrellena con la versión en una serie sin enlazar', async () => {
    await p.evaluate(() => {
      const s = D.coleccion.series.find(x => x.titulo === 'Bleach');
      const copia = D.clonar(s);
      copia.id = U.id(); copia.listadomangaId = ''; copia.edicion = 'Maximum';
      D.coleccion.series.push(copia); D.guardar();
      window.__id = copia.id;
    });
    await p.evaluate(() => App.abrirSerie(window.__id));
    await p.waitForSelector('.detalle h2');
    await p.click('[data-accion="editar-serie"]');
    await p.waitForSelector('#lmBuscar');
    const v = await p.inputValue('#lmBuscar');
    console.log('      → buscador prerrellenado con "' + v + '"');
    if (v !== 'Bleach (Maximum)') throw new Error('«' + v + '», sin la edición');
  });

  await paso('y ese prerrellenado encuentra la edición correcta', async () => {
    await p.press('#lmBuscar', 'Enter');
    await p.waitForTimeout(1500);
    const t = await p.locator('.resultado__titulo').allTextContents();
    console.log('      → ' + t.slice(0, 4).join(' | '));
    if (t[0] !== 'Bleach (Maximum)') throw new Error('el primero es «' + t[0] + '»');
  });

  console.log(errores.length ? '❌ ' + errores.join('\n') : '✅ El buscador de ediciones sigue enseñando la versión');
  await b.close();
  process.exit(errores.length ? 1 : 0);
})();
