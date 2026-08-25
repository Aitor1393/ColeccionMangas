const { chromium } = require('playwright');
const { CHROMIUM, CAPTURAS } = require('./entorno.js');

const BASE = process.env.BASE || 'http://localhost:8777/';
const SHOT = CAPTURAS + '50-relectura';

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

  /* ================= Valorar las abandonadas ================= */
  console.log('Abandonadas:');
  const ab = await p.evaluate(() => {
    const abs = D.coleccion.series.filter(s => s.abandonada);
    return {
      total: abs.length,
      sinLeer: abs.filter(s => !s.tomos.some(t => t.leido)).map(s => ({ id: s.id, t: s.titulo })),
      todasValorables: abs.every(s => D.esValorable(s))
    };
  });
  console.log(`  ${ab.total} abandonadas, ${ab.sinLeer.length} sin ningún tomo marcado como leído`);
  ok(ab.todasValorables, 'todas las abandonadas se pueden valorar, hayan marcado tomos o no');

  const sinLeer = ab.sinLeer[0];
  await p.evaluate(id => App.abrirSerie(id), sinLeer.id);
  await p.waitForSelector('.tomos');
  ok(await p.locator('.detalle [data-accion="valorar"]').count() === 1,
     '«' + sinLeer.t + '», abandonada sin tomos leídos, ofrece valorar');

  await p.click('.detalle [data-accion="valorar"]');
  await p.waitForSelector('#vGuardar');
  const etiq = (await p.locator('label[for="vNotas"]').textContent()).trim();
  const ph = await p.locator('#vNotas').getAttribute('placeholder');
  const intro = (await p.locator('.modal__caja .ayuda').first().textContent()).replace(/\s+/g, ' ');
  console.log('  Campo: «' + etiq + '» · pista: «' + ph.slice(0, 45) + '…»');
  ok(etiq === 'Por qué la dejaste', 'en una abandonada el campo pregunta por qué la dejaste');
  ok(/la dejaste, así que puntúa lo que llegaste a leer/.test(intro), 'y lo explica arriba');

  await p.locator('#v_historia').fill('4');
  await p.locator('#v_dibujo').fill('7');
  await p.locator('#v_ritmo').fill('2');
  await p.fill('#vNotas', 'Se hizo pesadísima a partir del tomo 2');
  await p.click('#vGuardar');
  await p.waitForTimeout(400);
  const guardada = await p.evaluate(id => ({ nota: D.notaDe(D.serie(id)), v: D.serie(id).valoracion }), sinLeer.id);
  console.log('  Guardada con nota ' + guardada.nota + ': «' + guardada.v.notas + '»');
  ok(guardada.nota === 4.3, 'la nota sale de lo que llegaste a leer (4+7+2)/3 = 4.3');
  ok(/pesadísima/.test(guardada.v.notas), 'y queda apuntado por qué la dejaste');

  await p.click('a[data-vista="ranking"]');
  await p.waitForSelector('.fila--ranking');
  const enRanking = (await p.locator('.fila--ranking').allTextContents()).join(' ');
  ok(enRanking.indexOf(sinLeer.t) !== -1, 'y entra en el ranking como una más');

  /* ================= Relectura ================= */
  console.log('Relectura:');
  // Una serie leída entera.
  const cand = await p.evaluate(() => {
    const s = D.coleccion.series.find(x => {
      const st = D.statsSerie(x);
      return st.total > 4 && st.leidosTotal >= st.total;
    });
    return s ? { id: s.id, t: s.titulo, total: D.statsSerie(s).total } : null;
  });
  console.log('  Probando con «' + cand.t + '» (' + cand.total + ' tomos, leída entera)');

  await p.evaluate(id => App.abrirSerie(id), cand.id);
  await p.waitForSelector('.tomos');
  ok(await p.locator('[data-accion="relectura-empezar"]').count() === 1, 'una serie leída entera ofrece 🔁 Releer');

  const leidosAntes = await p.evaluate(id => D.serie(id).tomos.filter(t => t.leido).map(t => t.numero), cand.id);
  await p.click('[data-accion="relectura-empezar"]');
  await p.waitForSelector('.relectura');
  const cab = (await p.locator('.relectura__cabecera').textContent()).replace(/\s+/g, ' ').trim();
  console.log('  ' + cab);
  ok(/2ª lectura/.test(cab), 'arranca como 2ª lectura');
  ok(/Tomo 1/.test(await p.locator('.relectura__tomo').textContent()), 'y por el tomo 1');
  ok(/🔁 Releyendo/.test(await p.locator('.detalle__meta').textContent()), 'la cabecera lleva el chip «Releyendo»');

  // Lo importante: no se pierde nada de lo leído.
  const leidosDespues = await p.evaluate(id => D.serie(id).tomos.filter(t => t.leido).map(t => t.numero), cand.id);
  ok(JSON.stringify(leidosAntes) === JSON.stringify(leidosDespues),
     'los ' + leidosAntes.length + ' tomos leídos siguen exactamente igual');

  // Avanzar.
  for (let i = 0; i < 3; i++) {
    await p.click('[data-accion="relectura-mover"][data-a="' + (i + 2) + '"]');
    await p.waitForTimeout(200);
  }
  ok(/Tomo 4/.test(await p.locator('.relectura__tomo').textContent()), 'el + avanza tomo a tomo');
  const marcada = await p.locator('.tomo--releyendo').count();
  const cual = await p.locator('.tomo--releyendo .tomo__numero').textContent();
  ok(marcada === 1 && cual === '4', 'y la casilla del tomo 4 queda señalada en la cuadrícula');
  const tip = await p.locator('.tomo--releyendo').getAttribute('title');
  console.log('  Casilla: ' + tip);
  ok(/leído/.test(tip) && /2ª lectura/.test(tip), 'la casilla sigue diciendo «leído» Y que vas por ahí');

  // No se sale del rango.
  await p.evaluate(id => D.avanzarRelectura(id, 9999), cand.id);
  const tope = await p.evaluate(id => D.serie(id).relectura.tomo, cand.id);
  ok(tope === cand.total, 'no se puede pasar del último tomo (' + tope + ')');
  await p.evaluate(id => D.avanzarRelectura(id, -5), cand.id);
  ok(await p.evaluate(id => D.serie(id).relectura.tomo, cand.id) === 1, 'ni bajar del primero');
  await p.evaluate(id => { D.avanzarRelectura(id, 4); App.abrirSerie(id); }, cand.id);
  await p.waitForSelector('.relectura');

  // Aguanta la recarga.
  await p.reload({ waitUntil: 'networkidle' });
  await p.evaluate(id => App.abrirSerie(id), cand.id);
  await p.waitForSelector('.relectura');
  ok(/Tomo 4/.test(await p.locator('.relectura__tomo').textContent()), 'la relectura aguanta la recarga');
  await p.screenshot({ path: SHOT + '.png' });

  // En la biblioteca se ve.
  await p.click('.modal__cerrar');
  await p.waitForTimeout(200);
  await p.click('a[data-vista="biblioteca"]');
  await p.waitForSelector('.serie');
  ok(await p.locator('.serie__insignia--releyendo').count() === 1, 'la tarjeta lleva la insignia 🔁');
  await p.evaluate(() => { V.filtros.seguimiento = 'releyendo'; V.filtrosAbiertos = true; App.render(); });
  await p.waitForTimeout(300);
  const filtradas = await p.locator('.serie').count();
  ok(filtradas === 1, 'y hay un filtro «las que estoy releyendo» (' + filtradas + ' serie)');
  await p.evaluate(() => { V.filtros.seguimiento = ''; App.render(); });

  // Terminarla suma una vuelta.
  await p.evaluate(id => App.abrirSerie(id), cand.id);
  await p.waitForSelector('.relectura');
  await p.click('[data-accion="relectura-terminar"]');
  await p.waitForTimeout(400);
  const fin = await p.evaluate(id => {
    const s = D.serie(id);
    return { r: s.relectura, leidos: s.tomos.filter(t => t.leido).length, relee: D.relee(s) };
  }, cand.id);
  console.log('  Tras terminar: ' + JSON.stringify(fin.r));
  ok(!fin.relee && fin.r.vueltas === 1, 'al terminarla deja de estar activa y suma una vuelta');
  ok(fin.leidos === leidosAntes.length, 'y los tomos leídos siguen intactos');
  const texto = (await p.locator('.detalle').textContent()).replace(/\s+/g, ' ');
  ok(/La has releído 1 vez/.test(texto), 'la ficha recuerda cuántas veces la has releído');
  ok(await p.locator('[data-accion="relectura-empezar"]').count() === 1, 'y se puede volver a empezar');

  // Una segunda vuelta se numera bien.
  await p.click('[data-accion="relectura-empezar"]');
  await p.waitForSelector('.relectura');
  ok(/3ª lectura/.test(await p.locator('.relectura__cabecera').textContent()), 'la siguiente es la 3ª lectura');
  await p.click('[data-accion="relectura-cancelar"]');
  await p.waitForTimeout(300);
  const trasCancelar = await p.evaluate(id => D.serie(id).relectura, cand.id);
  ok(!trasCancelar.activa && trasCancelar.vueltas === 1, 'dejarlo a medias no suma vuelta: ' + JSON.stringify(trasCancelar));

  // Series a medias no ofrecen releer.
  const aMedias = await p.evaluate(() => {
    const s = D.coleccion.series.find(x => { const st = D.statsSerie(x); return st.total > 3 && st.leidosTotal > 0 && st.leidosTotal < st.total; });
    return s ? { id: s.id, t: s.titulo } : null;
  });
  if (aMedias) {
    await p.evaluate(id => App.abrirSerie(id), aMedias.id);
    await p.waitForSelector('.tomos');
    ok(await p.locator('[data-accion="relectura-empezar"]').count() === 0,
       '«' + aMedias.t + '», que está a medias, no ofrece releer (para eso está la cuadrícula)');
  }

  await p.setViewportSize({ width: 390, height: 850 });
  await p.evaluate(id => App.abrirSerie(id), cand.id);
  await p.waitForSelector('.tomos');
  await p.click('[data-accion="relectura-empezar"]');
  await p.waitForSelector('.relectura');
  await p.waitForTimeout(300);
  const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
  ok(ancho <= 390, 'en móvil no se desborda (' + ancho + 'px)');
  await p.screenshot({ path: SHOT + '-movil.png' });

  if (errs.length) { console.log('ERRORES:'); errs.forEach(e => console.log('  ! ' + e)); }
  console.log(fallos + errs.length ? `\nFALLOS: ${fallos + errs.length}` : '\nTODO OK');
  await b.close();
  process.exit(fallos + errs.length ? 1 : 0);
})();
