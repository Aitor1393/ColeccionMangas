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
  await p.evaluate(() => { localStorage.clear();
    // El panel de filtros va plegado por defecto; estas pruebas lo usan.
    localStorage.setItem('cm:filtrosBiblioteca', 'true'); });
  await p.goto(BASE + '#/biblioteca', { waitUntil: 'networkidle' });
  // Un goto que solo cambia el hash no recarga: hay que recargar para que
  // vistas.js vuelva a leer la preferencia del panel de filtros.
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('.serie__titulo');

  await paso('ningún título de la biblioteca lleva la edición entre paréntesis', async () => {
    const t = await p.locator('.serie__titulo').allTextContents();
    console.log('      → ' + t.join(' · '));
    const malos = t.filter(x => /\(.*\)$/.test(x.trim()));
    if (malos.length) throw new Error('con paréntesis: ' + malos.join(', '));
  });

  await paso('sin series repetidas, no se enseña ninguna edición en las tarjetas', async () => {
    const n = await p.locator('.serie__edicion').count();
    if (n) throw new Error(n + ' tarjetas la enseñan sin hacer falta');
  });

  await paso('la edición sale al abrir la serie', async () => {
    await p.locator('.serie', { hasText: 'Bleach' }).first().click();
    await p.waitForSelector('.detalle h2');
    const h2 = (await p.locator('.detalle h2').textContent()).trim();
    const ed = (await p.locator('.detalle__edicion').textContent()).trim();
    console.log('      → h2 "' + h2 + '" · ' + ed);
    if (h2 !== 'Bleach') throw new Error('h2: ' + h2);
    if (ed !== 'Edición Maximum') throw new Error('edición: ' + ed);
  });

  await paso('el título alternativo sale bajo el nombre', async () => {
    await p.keyboard.press('Escape');
    await p.goto(BASE + '#/biblioteca', { waitUntil: 'networkidle' });
    await p.waitForSelector('.serie');
    await p.locator('.serie', { hasText: 'Atelier of Witch Hat' }).first().click();
    await p.waitForSelector('.detalle h2');
    const h2 = (await p.locator('.detalle h2').textContent()).trim();
    const ed = (await p.locator('.detalle__edicion').textContent()).trim();
    const alt = (await p.locator('.detalle__alt').textContent()).trim();
    console.log('      → "' + h2 + '" · ' + ed + ' · ' + alt);
    if (h2 !== 'Atelier of Witch Hat') throw new Error(h2);
    if (alt !== 'El Atelier de Sombreros de Mago') throw new Error(alt);
  });

  await paso('una serie sin edición no enseña la línea', async () => {
    await p.keyboard.press('Escape');
    await p.goto(BASE + '#/biblioteca', { waitUntil: 'networkidle' });
    await p.waitForSelector('.serie');
    await p.locator('.serie', { hasText: 'Frieren' }).first().click();
    await p.waitForSelector('.detalle h2');
    if (await p.locator('.detalle__edicion').count()) throw new Error('sale una edición vacía');
  });

  await paso('se puede seguir buscando por la edición', async () => {
    await p.keyboard.press('Escape');
    await p.goto(BASE + '#/biblioteca', { waitUntil: 'networkidle' });
    await p.waitForSelector('#fTexto');
    await p.fill('#fTexto', 'maximum');
    await p.waitForTimeout(500);
    const t = await p.locator('.serie__titulo').allTextContents();
    // Cuántas hay lo dice la colección: fijar un número aquí caduca en cuanto
    // se añade otra edición Maximum.
    const esperadas = await p.evaluate(() => D.coleccion.series.filter(s =>
      /maximum/i.test(D.edicionDe(s))).map(s => s.titulo));
    console.log('      → ' + t.join(' · ') + '  (esperadas ' + esperadas.length + ')');
    if (t.length !== esperadas.length) throw new Error('encontradas ' + t.length + ', esperadas ' + esperadas.length + ': ' + t.join(', '));
    if (!esperadas.every(e => t.some(x => x.indexOf(e) !== -1))) throw new Error('faltan: ' + esperadas.join(', '));
  });

  await paso('el formulario reparte obra y edición al elegir en ListadoManga', async () => {
    await p.goto(BASE + '#/biblioteca', { waitUntil: 'networkidle' });
    await p.click('#btnNuevaSerie');
    await p.waitForSelector('#lmBuscar');
    await p.fill('#lmBuscar', 'bleach');
    await p.waitForTimeout(1400);
    // Elegimos un resultado que sí traiga edición entre paréntesis.
    const conParentesis = p.locator('.resultado', { hasText: '(' }).first();
    const elegido = await conParentesis.locator('.resultado__titulo').textContent();
    await conParentesis.click();
    await p.waitForTimeout(400);
    const nombre = elegido.trim();
    const t = await p.inputValue('#cTitulo');
    const e = await p.inputValue('#cEdicion');
    console.log('      → "' + nombre + '" → título "' + t + '" · edición "' + e + '"');
    if (/\(.*\)$/.test(t)) throw new Error('el título se queda el paréntesis: ' + t);
    // Los dos campos juntos tienen que reconstruir el nombre de la colección.
    const rehecho = t + (e ? ' (' + e.split(' · ').join(') (') + ')' : '');
    if (rehecho !== nombre) throw new Error('«' + rehecho + '» ≠ «' + nombre + '»');
    await p.keyboard.press('Escape');
  });

  await paso('dos ediciones de la misma obra sí se distinguen en el listado', async () => {
    await p.evaluate(() => {
      const bleach = D.coleccion.series.find(s => s.titulo === 'Bleach');
      const otra = D.clonar(bleach);
      otra.id = U.id(); otra.edicion = 'Panini'; otra.listadomangaId = '';
      D.coleccion.series.push(otra);
      D.guardar();
    });
    await p.keyboard.press('Escape');
    await p.goto(BASE + '#/biblioteca', { waitUntil: 'networkidle' });
    await p.waitForSelector('#fTexto');
    await p.fill('#fTexto', 'bleach');
    await p.waitForTimeout(500);
    const titulos = await p.locator('.serie__titulo').allTextContents();
    const eds = await p.locator('.serie__edicion').allTextContents();
    console.log('      → ' + titulos.join(' / ') + ' → ediciones: ' + eds.join(' / '));
    if (eds.length !== 2) throw new Error('ediciones visibles: ' + eds.length);
  });

  await paso('y también en Próximas', async () => {
    await p.goto(BASE + '#/calendario', { waitUntil: 'networkidle' });
    await p.waitForSelector('.fila');
    const t = await p.locator('.fila__titulo').allTextContents();
    console.log('      → ' + t.slice(0, 4).map(x => x.replace(/\s+/g,' ').trim()).join(' | '));
  });

  await p.screenshot({ path: CAPTURAS + '25-titulos.png', fullPage: true });
  console.log(errores.length ? '❌ ' + errores.join('\n') : '✅ Títulos normalizados');
  await b.close();
  process.exit(errores.length ? 1 : 0);
})();
