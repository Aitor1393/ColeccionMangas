const { chromium } = require('playwright');
const { CHROMIUM, CAPTURAS } = require('./entorno.js');

const BASE = process.env.BASE || 'http://localhost:8777/';
const SHOT = CAPTURAS + '49-ranking';

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
  await p.waitForSelector('.stat__valor');

  /* ---------- La pestaña existe y está vacía al principio ---------- */
  console.log('Pestaña:');
  ok(await p.locator('a[data-vista="ranking"]').count() === 1, 'hay una pestaña «Ranking» en el menú');
  await p.click('a[data-vista="ranking"]');
  await p.waitForSelector('#app h1');
  ok((await p.locator('#app h1').textContent()).trim() === 'Ranking', 'y lleva a la vista');
  const vacio = (await p.locator('#app').textContent()).replace(/\s+/g, ' ');
  const yaValoradas = await p.evaluate(() => D.ranking().length);
  ok(yaValoradas === 0 ? /Aún no has valorado nada/.test(vacio) : /series valoradas/.test(vacio),
     yaValoradas === 0 ? 'de entrada está vacía' : 'ya traes ' + yaValoradas + ' valoradas de antes');
  const valorables = await p.evaluate(() => ({
    total: D.coleccion.series.length,
    val: D.valorables().length,
    sinTener: D.valorables().filter(s => !s.tomos.some(t => t.tengo)).length
  }));
  console.log(`  ${valorables.val} series valorables de ${valorables.total} (${valorables.sinTener} sin tener ningún tomo)`);
  ok(/\d+ series leídas/.test(vacio), 'y te ofrece empezar por una');
  ok(valorables.sinTener > 0, 'entre las valorables hay alguna que no tienes: se puede valorar igual');

  /* ---------- La anotación va bajo el título, no al final ---------- */
  console.log('Anotación:');
  const anot = (await p.evaluate(() =>
    document.querySelector('.vista__cabecera .ayuda') &&
    document.querySelector('.vista__cabecera .ayuda').textContent.replace(/\s+/g, ' ').trim()));
  console.log('  «' + anot + '»');
  ok(!!anot, 'hay una anotación en la cabecera, justo bajo el texto de presentación');
  ok(/las que dejaste también entran/.test(anot),
     'y dice que las abandonadas SÍ entran (antes decía lo contrario)');
  ok(!/queda[n]? fuera de esta cuenta/.test(
       (await p.locator('#app').textContent())),
     'ya no aparece el aviso de «quedan fuera», que aquí era falso');
  ok(!/leíste sin comprar/.test(await p.locator('#app').textContent()),
     'ni el de los tomos leídos sin comprar, que era de Compras');
  const pos = await p.evaluate(() => {
    const a = document.querySelector('.vista__cabecera .ayuda');
    const l = document.querySelector('.lista') || document.querySelector('.vacio');
    return a && l ? a.getBoundingClientRect().top < l.getBoundingClientRect().top : false;
  });
  ok(pos, 'y va por encima del listado, no debajo del todo');

  /* ---------- La rúbrica ---------- */
  console.log('Rúbrica:');
  const crit = await p.evaluate(() => D.CRITERIOS.map(c => c.id));
  console.log('  Criterios: ' + crit.join(', '));
  ok(crit.length === 5, 'son cinco criterios');

  const idA = await p.evaluate(() => D.valorables()[0].id);
  const tituloA = await p.evaluate(id => D.serie(id).titulo, idA);
  await p.evaluate(id => App.abrirSerie(id), idA);
  await p.waitForSelector('.tomos');
  ok(await p.locator('.detalle [data-accion="valorar"]').count() > 0, 'la ficha de una serie leída trae el botón ⭐');
  await p.click('.detalle [data-accion="valorar"]');
  await p.waitForSelector('#vGuardar');

  // La descripción cambia con la nota: es lo que evita la deriva.
  await p.locator('#v_historia').fill('3');
  await p.waitForTimeout(150);
  const a3 = await p.locator('.critfila[data-criterio="historia"] .critfila__ancla').textContent();
  await p.locator('#v_historia').fill('9');
  await p.waitForTimeout(150);
  const a9 = await p.locator('.critfila[data-criterio="historia"] .critfila__ancla').textContent();
  console.log('  Historia 3 → «' + a3 + '»');
  console.log('  Historia 9 → «' + a9 + '»');
  ok(a3 !== a9 && a3.length > 10 && a9.length > 10, 'cada nota lleva su descripción, y cambia al moverla');

  for (const [c, n] of [['historia','8'],['personajes','7'],['dibujo','9'],['ritmo','6']]) {
    await p.locator('#v_' + c).fill(n);
  }
  await p.locator('#v_disfrute').fill('10');
  await p.waitForTimeout(200);
  const nota = (await p.locator('#vNota').textContent()).trim();
  const det = (await p.locator('#vDetalle').textContent()).trim();
  console.log('  8+7+9+6 sin final → nota ' + nota + ' (' + det + ')');
  ok(nota === '7.5', 'la nota es la media de lo puntuado: 7.5');
  ok(/4 criterios de 5/.test(det), 'y dice que va sobre 4 de 5, porque el final está en blanco');

  await p.fill('#vNotas', 'De las mejores que he leído');
  await p.click('#vGuardar');
  await p.waitForTimeout(400);

  const g = await p.evaluate(id => {
    const s = D.serie(id);
    return { nota: D.notaDe(s), v: s.valoracion };
  }, idA);
  ok(g.nota === 7.5, 'se guarda la nota');
  ok(g.v.disfrute === 10, 'y el disfrute aparte (10)');
  ok(!('disfrute' in g.v.criterios), 'el disfrute NO entra en los criterios ni en la nota');
  ok(g.v.notas === 'De las mejores que he leído', 'y el comentario');

  /* ---------- El ranking ordena ---------- */
  console.log('Ranking:');
  await p.evaluate(() => {
    // Tres más para tener con qué ordenar, dos de ellas empatadas a 6.
    const v = D.valorables();
    const pon = (s, h, pe, d, r) => D.actualizarSerie(s.id, { valoracion: D.normalizarValoracion({
      criterios: { historia: h, personajes: pe, dibujo: d, ritmo: r }, disfrute: 5 }) });
    pon(v[1], 9, 9, 9, 9);   // 9
    pon(v[2], 6, 6, 6, 6);   // 6
    pon(v[3], 6, 6, 6, 6);   // 6, empatada con la anterior
    App.render();
  });
  await p.waitForSelector('.fila--ranking');
  const filas = await p.locator('.fila--ranking').allTextContents();
  const notas = await p.evaluate(() => Array.from(document.querySelectorAll('.fila--ranking .puntuacion')).map(n => n.textContent.trim()));
  console.log('  Notas en orden: ' + notas.join(' > '));
  const num = notas.map(Number);
  ok(num.every((n, i) => i === 0 || n <= num[i - 1]), 'ordena de mayor a menor nota, sin subir nunca');
  ok(num.includes(9) && num.includes(7.5) && num.filter(n => n === 6).length >= 2,
     'están las que acabo de puntuar (9, 7.5 y las dos empatadas a 6)');
  const puestos = await p.locator('.puesto').allTextContents();
  ok(puestos.join() === puestos.map((_, i) => i + 1).join(),
     'y numera los puestos del 1 al ' + puestos.length);
  const mia = filas.find(f => f.indexOf(tituloA) !== -1) || '';
  ok(/Historia\s*8/.test(mia) && /Dibujo\s*9/.test(mia),
     'cada fila enseña el desglose: ' + mia.replace(/\s+/g, ' ').slice(0, 70));

  /* ---------- Todas las notas en la misma vertical ---------- */
  console.log('Alineación:');
  await p.evaluate(() => {
    // Un 10 en un apartado ensanchaba la fila y descolocaba la nota global.
    // Se puntúan unas cuantas para tener también puestos de dos cifras.
    const v = D.valorables().filter(s => D.notaDe(s) === null);
    const pon = (s, c) => D.actualizarSerie(s.id, { valoracion: D.normalizarValoracion({
      criterios: c, disfrute: 7 }) });
    pon(v[0], { historia: 10, personajes: 10, dibujo: 10, ritmo: 10, final: 10 }); // global 10
    pon(v[1], { historia: 10, personajes: 4, dibujo: 5, ritmo: 6 });               // un 10 suelto
    pon(v[2], { historia: 5, personajes: 5, dibujo: 5, ritmo: 5 });
    for (let i = 3; i < 10 && i < v.length; i++) pon(v[i], { historia: 9 - (i % 5), personajes: 7, dibujo: 6 });
    App.render();
  });
  await p.waitForSelector('.fila--ranking');

  const alin = await p.evaluate(() => {
    const filas = Array.from(document.querySelectorAll('.fila--ranking'));
    const caja = (f, sel) => { const r = f.querySelector(sel).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; };
    return {
      n: filas.length,
      notas: [...new Set(filas.map(f => caja(f, '.puntuacion').join(':')))],
      puestos: [...new Set(filas.map(f => caja(f, '.puesto').join(':')))],
      conDiez: filas.filter(f => /(^|[^\d])10([^\d]|$)/.test(f.querySelector('.fila__sub').textContent)).length,
      global10: filas.filter(f => f.querySelector('.puntuacion').textContent.trim() === '10').length,
      puestoLargo: filas.filter(f => f.querySelector('.puesto').textContent.trim().length > 1).length,
      desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });
  console.log(`  ${alin.n} filas · ${alin.conDiez} con un 10 en algún apartado · ` +
              `${alin.global10} con nota global 10 · ${alin.puestoLargo} con puesto de dos cifras`);
  ok(alin.conDiez > 0 && alin.global10 > 0, 'hay filas con un 10 suelto y con nota global 10');
  ok(alin.puestoLargo > 0, 'y puestos de dos cifras, que también descolocaban');
  ok(alin.notas.length === 1, 'todas las notas caen en la misma vertical: ' + alin.notas.join(' / '));
  ok(alin.puestos.length === 1, 'y todos los puestos también: ' + alin.puestos.join(' / '));
  ok(!alin.desborda, 'y nada se sale de la página');

  // Y lo mismo en el móvil, donde el botón «Cambiar» no está.
  await p.setViewportSize({ width: 390, height: 850 });
  await p.waitForTimeout(300);
  // Que el número quepa dentro de su fila. Se salía porque la clase se llamaba
  // «nota», que ya era la de los avisos emergentes, y heredaba su relleno de
  // 11x16 y su borde: no cabía en la caja.
  const dentro = await p.evaluate(() => Array.from(document.querySelectorAll('.fila--ranking')).map(f => {
    const n = f.querySelector('.puntuacion');
    const cs = getComputedStyle(n), cf = getComputedStyle(f);
    const nb = n.getBoundingClientRect(), fb = f.getBoundingClientRect();
    return {
      sale: Math.round(nb.right - (fb.right - parseFloat(cf.paddingRight))),
      relleno: parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight),
      borde: parseFloat(cs.borderLeftWidth),
      cabe: n.scrollWidth <= Math.ceil(nb.width)
    };
  }));
  console.log('  se sale ' + [...new Set(dentro.map(d => d.sale))].join(',') + 'px · ' +
    'relleno ' + [...new Set(dentro.map(d => d.relleno))].join(',') + 'px');
  ok(dentro.every(d => d.sale <= 0), 'la nota no se sale de su fila');
  ok(dentro.every(d => d.relleno === 0 && d.borde === 0),
     'y no hereda relleno ni borde de ninguna otra clase');
  ok(dentro.every(d => d.cabe), 'el número cabe en su caja, sin recortarse');

  // Los dos bordes, no solo el derecho: ese cuadra igual aunque la caja se
  // ensanche con el contenido, y era justo lo que fallaba.
  const movil = await p.evaluate(() => [...new Set(Array.from(document.querySelectorAll('.fila--ranking .puntuacion'))
    .map(n => { const r = n.getBoundingClientRect(); return Math.round(r.left) + ':' + Math.round(r.right); }))]);
  ok(movil.length === 1, 'en móvil también: ' + movil.join(' / '));

  // Y el texto de presentación, a ancho completo: con el conmutador al lado se
  // quedaba en una columna de cuatro palabras por línea.
  const cab = await p.evaluate(() => {
    const c = document.querySelector('.vista__cabecera');
    const crece = c.querySelector('.crece');
    return {
      ancho: Math.round(crece.getBoundingClientRect().width),
      dentro: Math.round(c.getBoundingClientRect().width)
    };
  });
  console.log('  cabecera en móvil: el texto ocupa ' + cab.ancho + ' de ' + cab.dentro + 'px');
  ok(cab.ancho >= cab.dentro * 0.9, 'el texto de la cabecera usa el ancho entero');
  await p.setViewportSize({ width: 1280, height: 1100 });
  await p.waitForTimeout(300);

  /* ---------- Ordenar por disfrute ---------- */
  await p.click('[data-accion="modo-ranking"][data-modo="disfrute"]');
  await p.waitForTimeout(400);
  const porDis = await p.locator('.fila--ranking').allTextContents();
  console.log('  Por disfrute, el primero: ' + porDis[0].replace(/\s+/g, ' ').slice(0, 60));
  ok(porDis[0].indexOf(tituloA) !== -1, 'por disfrute manda otro orden (el 10 se pone primero)');
  await p.reload({ waitUntil: 'networkidle' });
  await p.click('a[data-vista="ranking"]');
  await p.waitForSelector('.fila--ranking');
  ok(await p.locator('[data-accion="modo-ranking"][data-modo="disfrute"].activo').count() === 1,
     'y el modo elegido se recuerda tras recargar');
  await p.click('[data-accion="modo-ranking"][data-modo="nota"]');
  await p.waitForTimeout(300);

  /* ---------- El duelo ---------- */
  console.log('Duelo:');
  const hayDuelo = await p.locator('.duelo-aviso').count();
  ok(hayDuelo === 1, 'con dos series empatadas, ofrece desempatarlas');
  const par = await p.evaluate(() => { const d = D.duelo(); return d && [d[0].titulo, d[1].titulo, D.notaDe(d[0])]; });
  console.log('  Empatadas a ' + par[2] + ': ' + par[0] + ' / ' + par[1]);
  await p.click('[data-accion="duelo"]');
  await p.waitForSelector('.duelo__carta');
  ok(await p.locator('.duelo__carta').count() === 2, 'el duelo enseña las dos');
  const antes = (await p.locator('.fila--ranking .fila__titulo').allTextContents()).map(s => s.trim());
  const ganador = await p.locator('.duelo__carta').nth(1).getAttribute('data-gana');
  const tGana = await p.evaluate(id => D.serie(id).titulo, ganador);
  await p.locator('.duelo__carta').nth(1).click();
  await p.waitForTimeout(500);

  const despues = (await p.locator('.fila--ranking .fila__titulo').allTextContents()).map(s => s.trim());
  console.log('  Antes:   ' + antes.slice(2).join(' | '));
  console.log('  Después: ' + despues.slice(2).join(' | '));
  const tPierde = par[0] === tGana ? par[1] : par[0];
  const iGana = despues.findIndex(t => t.indexOf(tGana) !== -1);
  const iPierde = despues.findIndex(t => t.indexOf(tPierde) !== -1);
  ok(iGana >= 0 && iPierde >= 0 && iGana < iPierde,
     '«' + tGana + '» gana y queda por delante de «' + tPierde + '» (' + iGana + ' < ' + iPierde + ')');

  const tras = await p.evaluate(() => D.ranking().map(s => ({
    t: s.titulo, n: D.notaDe(s), d: s.valoracion.desempate, du: s.valoracion.duelos })));
  console.log('  ' + tras.map(x => `${x.t.slice(0,14)}=${x.n}(${x.d >= 0 ? '+' : ''}${x.d})`).join(' '));
  ok(tras.every((x, i) => i === 0 || x.n <= tras[i - 1].n),
     'el duelo NO adelanta a quien tiene mejor nota: el orden por nota sigue intacto');
  ok(tras.filter(x => x.du > 0).length === 2, 'y solo las dos del duelo lo tienen apuntado');

  /* ---------- Quitar la nota ---------- */
  console.log('Quitar:');
  await p.evaluate(id => App.abrirSerie(id), idA);
  await p.waitForSelector('.tomos');
  const ficha = (await p.locator('.detalle').textContent()).replace(/\s+/g, ' ');
  ok(/⭐/.test(ficha) && /7\.5/.test(ficha), 'la ficha enseña la nota y su desglose');
  ok(/del ranking/.test(ficha), 'y en qué puesto va');
  await p.click('.detalle [data-accion="valorar"]');
  await p.waitForSelector('#vBorrar');
  await p.click('#vBorrar');
  await p.waitForTimeout(400);
  const sinNota = await p.evaluate(id => D.serie(id).valoracion, idA);
  ok(sinNota === null, 'se puede quitar la nota y la serie sale del ranking');

  /* ---------- Series sin leer: no se valoran ---------- */
  const noLeida = await p.evaluate(() => {
    const s = D.coleccion.series.find(x => !x.tomos.some(t => t.leido));
    return s ? { id: s.id, titulo: s.titulo, valorable: D.esValorable(s) } : null;
  });
  if (noLeida) {
    await p.evaluate(id => App.abrirSerie(id), noLeida.id);
    await p.waitForSelector('.tomos');
    ok(await p.locator('.detalle [data-accion="valorar"]').count() === 0,
       '«' + noLeida.titulo + '», que no has leído, no ofrece valorar');
  }

  await p.click('.modal__cerrar').catch(() => {});
  await p.waitForTimeout(200);
  await p.click('a[data-vista="ranking"]');
  await p.waitForSelector('.fila--ranking');
  await p.screenshot({ path: SHOT + '.png' });
  await p.setViewportSize({ width: 390, height: 850 });
  await p.waitForTimeout(300);
  const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
  ok(ancho <= 390, 'en móvil no se desborda (' + ancho + 'px)');
  await p.screenshot({ path: SHOT + '-movil.png' });

  if (errs.length) { console.log('ERRORES:'); errs.forEach(e => console.log('  ! ' + e)); }
  console.log(fallos + errs.length ? `\nFALLOS: ${fallos + errs.length}` : '\nTODO OK');
  await b.close();
  process.exit(fallos + errs.length ? 1 : 0);
})();
