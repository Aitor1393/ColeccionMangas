const { chromium } = require('playwright');
const { CHROMIUM } = require('./entorno.js');
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

  /* ---------- Varios cambios seguidos se guardan todos ---------- */
  console.log('Editar seguido:');
  const puestas = await p.evaluate(() => {
    const nombres = [];
    D.sinValorar().slice(0, 5).forEach((s, i) => {
      D.actualizarSerie(s.id, { valoracion: D.normalizarValoracion({
        criterios: { historia: 5 + i, personajes: 6, dibujo: 7, ritmo: 8 }, disfrute: 7 }) });
      nombres.push(s.titulo);
    });
    return nombres;
  });
  const enDisco = await p.evaluate(() =>
    JSON.parse(localStorage.getItem('cm:coleccion')).series.filter(s => s.valoracion).length);
  const enMemoria = await p.evaluate(() => D.ranking().length);
  console.log('  ' + puestas.length + ' valoradas · en memoria ' + enMemoria + ' · en localStorage ' + enDisco);
  ok(enDisco === enMemoria, 'todas llegan a localStorage, no solo la primera');

  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  ok(await p.evaluate(() => D.ranking().length) === enMemoria, 'y siguen ahí tras recargar');

  /* ---------- Publicar y recargar antes de que se despliegue ---------- */
  console.log('Publicar y volver enseguida:');
  const trasPublicar = await p.evaluate(() => {
    D.marcarPublicada();
    return {
      valoradas: D.ranking().length,
      sucia: D.sucia,
      local: localStorage.getItem('cm:coleccion') !== null
    };
  });
  ok(trasPublicar.local,
     'la copia local NO se borra al publicar: el despliegue tarda un minuto');
  ok(!trasPublicar.sucia, 'pero deja de haber cambios pendientes');

  // data/coleccion.json sigue siendo el viejo, como durante el despliegue.
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  const trasVolver = await p.evaluate(() => D.ranking().length);
  console.log('  publicadas ' + trasPublicar.valoradas + ' · tras volver ' + trasVolver);
  ok(trasVolver === trasPublicar.valoradas,
     'lo recién publicado sigue viéndose aunque el JSON no haya llegado aún');

  /* ---------- Cuando el despliegue llega, la copia se retira sola ---------- */
  console.log('Cuando el despliegue llega:');
  const retirada = await p.evaluate(async () => {
    // Se simula que lo publicado ya es igual a lo local.
    const local = JSON.parse(localStorage.getItem('cm:coleccion'));
    D.publicada = D.normalizarColeccion(local);
    D.coleccion = D.normalizarColeccion(local);
    // Y se repite lo que hace la carga: si no hay diferencias, sobra la copia.
    const cambios = D.numCambios();
    return { cambios };
  });
  ok(retirada.cambios === 0, 'sin diferencias entre lo local y lo publicado');

  /* ---------- La copia de seguridad se puede ver y restaurar ---------- */
  console.log('Copia de seguridad:');
  ok(await p.evaluate(() => D.copiaGuardada()) === null, 'de entrada no hay ninguna');
  const conCopia = await p.evaluate(() => {
    // Es lo que guarda la web al detectar que el repositorio se ha adelantado.
    const c = D.clonar(D.coleccion);
    c.series[0].titulo = 'SERIE DE LA COPIA';
    localStorage.setItem('cm:copia', JSON.stringify(c));
    App.render();
    const g = D.copiaGuardada();
    return { series: g.series, valoradas: g.valoradas, tarjeta: !!document.querySelector('[data-accion="restaurar-copia"]') };
  });
  await p.goto(BASE + '#/ajustes', { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  const enAjustes = await p.evaluate(() => ({
    hay: !!document.querySelector('[data-accion="restaurar-copia"]'),
    texto: (document.querySelector('#app').textContent.match(/Hay una copia guardada[^]{0,400}/) || [''])[0].replace(/\s+/g, ' ')
  }));
  console.log('  ' + enAjustes.texto.slice(0, 220));
  ok(enAjustes.hay, 'Ajustes ofrece restaurarla');
  ok(/serie/.test(enAjustes.texto) && /valorada/.test(enAjustes.texto),
     'diciendo cuántas series y valoraciones tiene');

  const restaurada = await p.evaluate(() => {
    D.restaurarCopia();
    return {
      titulo: D.coleccion.series[0].titulo,
      hayCopiaNueva: !!D.copiaGuardada()
    };
  });
  ok(restaurada.titulo === 'SERIE DE LA COPIA', 'restaurarla trae sus datos de vuelta');
  ok(restaurada.hayCopiaNueva, 'y lo que había queda guardado como copia, sin perderse');

  await p.evaluate(() => { D.descartarCopia(); App.render(); });
  ok(await p.evaluate(() => D.copiaGuardada()) === null, 'y se puede descartar');

  if (errs.length) { console.log('ERRORES:'); errs.forEach(e => console.log('  ! ' + e)); }
  console.log(fallos + errs.length ? `\nFALLOS: ${fallos + errs.length}` : '\nTODO OK');
  await b.close();
  process.exit(fallos + errs.length ? 1 : 0);
})();
