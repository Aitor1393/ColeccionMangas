const { chromium } = require('playwright');
const { CHROMIUM, CAPTURAS } = require('./entorno.js');
const BASE = process.env.BASE || 'http://localhost:8777/';

(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  const errs = [];
  p.on('pageerror', e => errs.push('EXCEPCIÓN: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/gstatic|panini|listadomanga|net::ERR|404/.test(m.text())) errs.push('CONSOLA: ' + m.text()); });
  await p.route('https://encrypted-tbn0.gstatic.com/**', r => r.abort());
  let fallos = 0;
  const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fallos++; };

  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForSelector('.stat__valor');

  /* ---------- La pestaña ---------- */
  console.log('Pestaña:');
  ok(await p.locator('a[data-vista="deseados"]').count() === 1, 'hay una pestaña «Los quiero»');
  await p.click('a[data-vista="deseados"]');
  await p.waitForSelector('#app h1');
  ok((await p.locator('#app h1').textContent()).trim() === 'Los quiero', 'y lleva a su vista');

  const antes = await p.evaluate(() => ({
    deseadas: D.deseadas().length,
    series: D.statsGlobales().series,
    compras: D.pendientesDeCompra().length,
    biblioteca: V.filtrar(D.coleccion.series).length
  }));
  console.log(`  de partida: ${antes.deseadas} deseadas · ${antes.series} series · ` +
              `${antes.compras} tomos en compras · ${antes.biblioteca} en la biblioteca`);

  /* ---------- Marcar una serie con muchos tomos como deseada ---------- */
  console.log('Al desear una serie:');
  const elegida = await p.evaluate(() => {
    // Una enlazada y con muchos tomos publicados: es la que peor se portaría
    // si se colara en Compras.
    const s = D.coleccion.series
      .filter(x => x.listadomangaId && D.numerosLM(x).length > 8 && !x.deseada)
      .sort((a, b) => D.numerosLM(b).length - D.numerosLM(a).length)[0];
    // Se le quitan los tomos para que sea de verdad «no la he empezado».
    D.actualizarSerie(s.id, { tomos: [] });
    D.alternarDeseada(s.id);
    App.render();
    return { id: s.id, t: s.titulo, publicados: D.numerosLM(s).length };
  });
  console.log(`  «${elegida.t}» (${elegida.publicados} tomos publicados)`);

  const tras = await p.evaluate(() => ({
    deseadas: D.deseadas().length,
    series: D.statsGlobales().series,
    compras: D.pendientesDeCompra().length,
    biblioteca: V.filtrar(D.coleccion.series).length,
    proximas: D.proximasPublicaciones().length
  }));
  ok(tras.deseadas === antes.deseadas + 1, 'entra en la lista de deseos');
  ok(tras.compras === antes.compras,
     `NO mete sus ${elegida.publicados} tomos en Compras (${antes.compras} → ${tras.compras})`);
  ok(tras.series === antes.series - 1, 'deja de contar como serie de la colección');
  ok(tras.biblioteca === antes.biblioteca - 1, 'y sale de la biblioteca');

  /* ---------- Se ve en su vista ---------- */
  await p.click('a[data-vista="deseados"]');
  await p.waitForSelector('.fila--deseada');
  const filas = await p.locator('.fila--deseada').count();
  ok(filas === tras.deseadas, `la vista enseña las ${tras.deseadas}`);
  const fila = (await p.locator('.fila--deseada', { hasText: elegida.t }).first().textContent()).replace(/\s+/g, ' ');
  console.log('  ' + fila.trim().slice(0, 90));
  ok(fila.indexOf(elegida.t) !== -1, 'con su título');
  const cab = (await p.locator('.vista__cabecera').textContent()).replace(/\s+/g, ' ');
  ok(/serie/.test(cab) && /tomo/.test(cab), 'y la cabecera resume cuántas son y cuántos tomos');

  /* ---------- El coste, solo si enseñas el dinero ---------- */
  console.log('Coste:');
  const coste = await p.evaluate(id => D.costeDeseada(D.serie(id)), elegida.id);
  console.log(`  ${coste.tomos} tomos · ${coste.coste.toFixed(2)} € · completo=${coste.completo}`);
  ok(coste.coste > 0, 'se calcula lo que costaría entera');
  ok(coste.conPrecio > 0 && coste.conPrecio <= coste.tomos, 'a partir de los tomos con precio conocido');

  const oculto = await p.evaluate(() => {
    D.guardarMostrarGasto(false); App.render();
    return document.querySelector('#app').textContent;
  });
  ok(oculto.indexOf('€') === -1, 'con el gasto oculto no aparece ningún importe');
  const visible = await p.evaluate(() => {
    D.guardarMostrarGasto(true); App.render();
    return document.querySelector('#app').textContent;
  });
  ok(visible.indexOf('€') !== -1, 'y al enseñarlo sí');
  await p.evaluate(() => { D.guardarMostrarGasto(false); App.render(); });

  /* ---------- Marcar un tomo la saca sola ---------- */
  console.log('Al empezarla:');
  const trasMarcar = await p.evaluate(id => {
    D.ciclarTomo(id, 1);
    return { deseada: D.serie(id).deseada, tiene: D.serie(id).tomos.some(t => t.tengo) };
  }, elegida.id);
  ok(trasMarcar.tiene && !trasMarcar.deseada,
     'marcar el tomo 1 la saca de los deseos sola, sin tener que acordarse');

  // Y el contrato lo garantiza aunque el cambio venga de otro sitio.
  const contrato = await p.evaluate(() => D.normalizarSerie({
    titulo: 'Imposible', deseada: true, tomos: [{ numero: 1, tengo: true }]
  }).deseada);
  ok(contrato === false, 'normalizarSerie no deja que algo esté deseado y comprado a la vez');

  /* ---------- El botón «La empiezo» ---------- */
  await p.evaluate(id => { D.alternarDeseada(id); D.actualizarSerie(id, { tomos: [] }); App.render(); }, elegida.id);
  await p.click('a[data-vista="deseados"]');
  await p.waitForSelector('.fila--deseada');
  await p.locator('.fila--deseada', { hasText: elegida.t }).locator('[data-accion="empezar-deseada"]').click();
  await p.waitForTimeout(400);
  ok(!(await p.evaluate(id => D.serie(id).deseada, elegida.id)), '«La empiezo» la pasa a la colección');
  ok(await p.locator('.tomos').count() === 1, 'y abre su ficha para marcar tomos');

  /* ---------- El filtro de la biblioteca ---------- */
  console.log('Biblioteca:');
  await p.evaluate(id => { D.actualizarSerie(id, { tomos: [] }); D.alternarDeseada(id); App.render(); }, elegida.id);
  await p.evaluate(() => { V.filtros.seguimiento = 'deseadas'; V.filtrosAbiertos = true; App.render(); });
  await p.waitForTimeout(300);
  const soloDeseadas = await p.evaluate(() =>
    Array.from(document.querySelectorAll('.serie')).every(e => D.serie(e.dataset.serie).deseada));
  ok(soloDeseadas, 'el filtro «Las que quiero tener» enseña solo esas');
  await p.evaluate(() => { V.filtros.seguimiento = ''; App.render(); });
  await p.waitForTimeout(300);
  const ningunaDeseada = await p.evaluate(() =>
    Array.from(document.querySelectorAll('.serie')).every(e => !D.serie(e.dataset.serie).deseada));
  ok(ningunaDeseada, 'y sin filtro no ensucian la rejilla');

  /* ---------- Aguanta la recarga y ofrece publicar ---------- */
  ok(await p.evaluate(() => D.numCambios()) > 0, 'cuenta como cambio sin publicar');
  await p.reload({ waitUntil: 'networkidle' });
  ok(await p.evaluate(id => D.serie(id).deseada, elegida.id), 'y aguanta la recarga');

  await p.click('a[data-vista="deseados"]');
  await p.waitForSelector('.fila--deseada');
  await p.screenshot({ path: CAPTURAS + '53-deseados.png' });
  await p.setViewportSize({ width: 390, height: 850 });
  await p.waitForTimeout(300);
  const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
  ok(ancho <= 390, 'en móvil no se desborda (' + ancho + 'px)');

  if (errs.length) { console.log('ERRORES:'); errs.forEach(e => console.log('  ! ' + e)); }
  console.log(fallos + errs.length ? `\nFALLOS: ${fallos + errs.length}` : '\nTODO OK');
  await b.close();
  process.exit(fallos + errs.length ? 1 : 0);
})();
