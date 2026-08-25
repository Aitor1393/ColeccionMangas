const { chromium } = require('playwright');
const { CHROMIUM, CAPTURAS } = require('./entorno.js');

const puente = require('./puente-wikipedia.js');
const BASE = process.env.BASE || 'http://localhost:8777/';
const SHOT = CAPTURAS + '48-capitulos';

(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await b.newPage({ viewport: { width: 1280, height: 1100 } });
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCIÓN: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/gstatic|listadomanga|net::ERR|404/.test(m.text())) errores.push('CONSOLA: ' + m.text()); });
  await p.route('https://encrypted-tbn0.gstatic.com/**', r => r.abort());
  await puente(p);
  let fallos = 0;
  const ok = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) fallos++; };

  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForSelector('.stat__valor');

  /* ---------- El modelo, sin tocar la UI ---------- */
  const modelo = await p.evaluate(() => {
    const s = { tomos: [], tomosTotales: 10, listadomangaId: '' };
    const conMedia = { ...s, capitulos: D.normalizarCapitulos({ inicio: 1, porTomo: 9 }) };
    const conTabla = { ...s, capitulos: D.normalizarCapitulos({ inicio: 1, porTomo: 9, tabla: { 1: 7, 2: 8 } }) };
    const m1 = D.mapaCapitulos(conMedia), m2 = D.mapaCapitulos(conTabla);
    return {
      media: [m1[1], m1[2], m1[10]],
      tabla: [m2[1], m2[2], m2[3]],
      cae: [D.tomoDelCapitulo(conMedia, 1), D.tomoDelCapitulo(conMedia, 9),
            D.tomoDelCapitulo(conMedia, 10), D.tomoDelCapitulo(conMedia, 500)],
      sinNada: D.mapaCapitulos({ ...s, capitulos: D.normalizarCapitulos({ inicio: 1 }) }),
      inicioCero: D.mapaCapitulos({ ...s, capitulos: D.normalizarCapitulos({ inicio: 0, porTomo: 5 }) })[1]
    };
  });
  console.log('Modelo:');
  ok(modelo.media[0].desde === 1 && modelo.media[0].hasta === 9, 'con media 9, el tomo 1 son los caps 1–9');
  ok(modelo.media[1].desde === 10 && modelo.media[1].hasta === 18, 'el tomo 2 sigue en el 10');
  ok(modelo.media[2].desde === 82 && modelo.media[2].hasta === 90, 'el tomo 10 llega al 90');
  ok(!modelo.media[0].exacto, 'la media no se marca como exacta');
  ok(modelo.tabla[0].hasta === 7 && modelo.tabla[0].exacto, 'la tabla manda sobre la media (tomo 1 → 7)');
  ok(modelo.tabla[1].desde === 8 && modelo.tabla[1].hasta === 15, 'y el siguiente arranca donde acabó');
  ok(modelo.tabla[2].desde === 16 && !modelo.tabla[2].exacto, 'sin dato exacto vuelve a la media, sin descuadrar');
  ok(JSON.stringify(modelo.cae) === JSON.stringify([1, 1, 2, null]), 'tomoDelCapitulo: ' + JSON.stringify(modelo.cae));
  ok(modelo.sinNada === null, 'sin media ni tabla no se inventa nada');
  ok(modelo.inicioCero.desde === 0 && modelo.inicioCero.hasta === 4, 'admite empezar en el capítulo 0');

  /* ---------- El formulario, contra Haikyû ---------- */
  await p.click('a[data-vista="biblioteca"]');
  await p.waitForSelector('.serie');
  await p.locator('.serie', { hasText: 'Haikyû' }).first().click();
  await p.waitForSelector('.tomos');
  await p.click('[data-accion="capitulos"]');
  await p.waitForSelector('#kWiki');
  console.log('Formulario:');

  await p.fill('#kPorTomo', '9');
  await p.waitForTimeout(200);
  let prev = (await p.locator('#kPreview').textContent()).replace(/\s+/g, ' ').trim();
  console.log('  Vista previa (media): ' + prev.slice(0, 90));
  ok(/Tomo 1.*caps 1–9/.test(prev), 'la vista previa reacciona a la media al escribirla');

  await p.click('#kWiki');
  await p.waitForFunction(() => !/Buscando/.test(document.querySelector('#kWikiAviso').textContent), null, { timeout: 60000 });
  const avisoWiki = (await p.locator('#kWikiAviso').textContent()).replace(/\s+/g, ' ').trim();
  console.log('  Wikipedia: ' + avisoWiki.slice(0, 150));
  ok(/45 tomos/.test(avisoWiki) && /402 cap/.test(avisoWiki), 'trae 45 tomos y 402 capítulos');
  ok(/Encaja con tus 45/.test(avisoWiki), 'y avisa de que encaja con tu edición');

  prev = (await p.locator('#kPreview').textContent()).replace(/\s+/g, ' ').trim();
  console.log('  Vista previa (Wikipedia): ' + prev.slice(0, 120));
  ok(/Tomo 1.*caps 1–7/.test(prev), 'el tomo 1 pasa a ser 1–7, el dato exacto');
  ok(/45 con el reparto exacto/.test(prev), 'los 45 vienen con reparto exacto');

  await p.fill('#kLeido', '300');
  await p.click('#kGuardar');
  await p.waitForSelector('.tomos');

  /* ---------- Lo que queda en la ficha ---------- */
  const ficha = (await p.locator('.detalle').textContent()).replace(/\s+/g, ' ');
  console.log('Ficha:');
  const linea = /📖([^💶]*)/.exec(ficha);
  console.log('  ' + (linea ? linea[1].trim().slice(0, 130) : '(no aparece)'));
  ok(/Capítulos 1–402/.test(ficha), 'la ficha resume «Capítulos 1–402»');
  ok(/capítulo 300/.test(ficha) && /tomo 34/.test(ficha), 'y dice que el capítulo 300 cae en el tomo 34');

  const marcados = await p.evaluate(() => {
    const s = D.coleccion.series.find(x => /Haikyû/.test(x.titulo));
    const m = D.mapaCapitulos(s);
    return {
      leidos: s.tomos.filter(t => t.leido).map(t => t.numero),
      hasta33: m[33].hasta, hasta34: m[34].hasta,
      guardado: s.capitulos
    };
  });
  console.log('  Tomo 33 acaba en el cap ' + marcados.hasta33 + ', el 34 en el ' + marcados.hasta34);
  ok(marcados.hasta33 <= 300 && marcados.hasta34 > 300, 'el 33 entra entero en lo leído y el 34 no');
  ok(marcados.leidos.includes(33), 'el tomo 33 se ha marcado leído');
  ok(marcados.guardado.fuente === 'wikipedia', 'queda apuntado de dónde salió el dato');

  // El corte —solo los tomos que caben enteros— sobre una serie limpia, porque
  // en Haikyû ya tenías marcado hasta el 45 y ahí no se vería.
  const corte = await p.evaluate(() => {
    const s = D.anadirSerie({ titulo: 'Prueba corte', tomosTotales: 10,
      tomos: [1,2,3,4,5,6,7,8,9,10].map(n => ({ numero: n })) });
    D.actualizarSerie(s.id, { capitulos: D.normalizarCapitulos({ inicio: 1, porTomo: 10 }) });
    const marcados = D.marcarLeidosHastaCapitulo(D.serie(s.id), 35);
    const leidos = D.serie(s.id).tomos.filter(t => t.leido).map(t => t.numero);
    const otraVez = D.marcarLeidosHastaCapitulo(D.serie(s.id), 35);
    D.borrarSerie(s.id);
    return { marcados, leidos, otraVez };
  });
  console.log('  Corte con 10 caps/tomo, leído hasta el 35 → tomos ' + JSON.stringify(corte.leidos));
  ok(JSON.stringify(corte.leidos) === '[1,2,3]', 'marca 1, 2 y 3, y deja el 4 (caps 31–40) sin marcar');
  ok(corte.marcados === 3, 'y dice cuántos ha marcado (' + corte.marcados + ')');
  ok(corte.otraVez === 0, 'repetirlo no vuelve a contar los mismos');

  const tip = await p.locator('.tomos .tomo').nth(0).getAttribute('title');
  console.log('  Chivato del tomo 1: ' + tip);
  ok(/capítulos 1–7/.test(tip), 'cada casilla dice sus capítulos');

  /* ---------- Aguanta la recarga y ofrece publicar ---------- */
  const cambios = await p.evaluate(() => D.numCambios());
  ok(cambios > 0, 'cuenta como cambio sin publicar (' + cambios + ')');
  await p.reload({ waitUntil: 'networkidle' });
  await p.click('a[data-vista="biblioteca"]');
  await p.waitForSelector('.serie');
  await p.locator('.serie', { hasText: 'Haikyû' }).first().click();
  await p.waitForSelector('.tomos');
  ok(/Capítulos 1–402/.test((await p.locator('.detalle').textContent()).replace(/\s+/g, ' ')),
     'y sigue ahí tras recargar');
  await p.screenshot({ path: SHOT + '-ficha.png' });

  /* ---------- Agrupado: ediciones 2 en 1 / 3 en 1 ---------- */
  console.log('Agrupado:');
  const agr = await p.evaluate(() => {
    const t = { 1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 10, 7: 5 };
    return {
      tres: WK.agrupar(t, 3),
      dos: WK.agrupar(t, 2),
      uno: WK.agrupar(t, 1),
      dec: WK.deducirFactor(37, 13, 3),
      ded: WK.deducirFactor(74, 37, 0),
      malo: WK.deducirFactor(38, 22, 0)
    };
  });
  ok(JSON.stringify(agr.tres) === '{"1":30,"2":30,"3":5}', 'de 3 en 3: ' + JSON.stringify(agr.tres));
  ok(agr.tres[3] === 5, 'la cola suelta se queda como está, sin inventar tomos');
  ok(Object.keys(agr.dos).length === 4, 'de 2 en 2 salen 4 tomos de 7 originales');
  ok(JSON.stringify(agr.uno) === JSON.stringify({1:10,2:10,3:10,4:10,5:10,6:10,7:5}), 'factor 1 no toca nada');
  ok(agr.dec.factor === 3 && agr.dec.cuadra && agr.dec.declarado, 'Eyeshield: el «3 en 1» del nombre cuadra');
  ok(agr.ded.factor === 2 && agr.ded.cuadra && !agr.ded.declarado, 'Bleach Maximum: deduce el 2 sin que lo diga');
  ok(!agr.malo.cuadra, 'Yu-Gi-Oh!: 38 en 22 no cuadra con ningún factor, y se dice');

  const dosEnUno = await p.evaluate(() => D.coleccion.series
    .filter(s => /en 1|kanzenban|maximum|integral/i.test(D.edicionDe(s)))
    .map(s => ({ t: s.titulo, dec: D.tomosPorTomo(s) })));
  ok(dosEnUno.some(x => /Eyeshield/.test(x.t) && x.dec === 3), 'lee el «3 en 1» del nombre de la edición');
  ok(dosEnUno.some(x => /Bleach/.test(x.t) && x.dec === 0), 'y no se inventa uno donde no lo dice (Maximum → 0)');

  /* ---------- El formulario con una edición 3 en 1 ---------- */
  await p.click('.modal__cerrar');
  await p.waitForTimeout(200);
  await p.locator('.serie', { hasText: 'Eyeshield 21' }).first().click();
  await p.waitForSelector('.tomos');
  await p.click('[data-accion="capitulos"]');
  await p.waitForSelector('#kWiki');
  await p.click('#kWiki');
  await p.waitForFunction(() => !/Buscando/.test(document.querySelector('#kWikiAviso').textContent), null, { timeout: 90000 });
  const av3 = (await p.locator('#kWikiAviso').textContent()).replace(/\s+/g, ' ').trim();
  const f3 = await p.inputValue('#kFactor');
  const avf3 = (await p.locator('#kFactorAviso').textContent()).replace(/\s+/g, ' ').trim();
  console.log('  Eyeshield: ' + av3.slice(0, 160));
  console.log('  Factor ' + f3 + ' → ' + avf3);
  ok(/37 tomos de la edición original/.test(av3), 'dice que son 37 tomos originales');
  ok(f3 === '3', 'rellena el agrupado con 3, que es lo que dice «Edición 3 en 1»');
  ok(/salen justo tus 13/.test(avf3), 'y confirma que salen tus 13 tomos');
  const prev3 = (await p.locator('#kPreview').textContent()).replace(/\s+/g, ' ');
  console.log('  Vista previa: ' + prev3.slice(0, 100));
  ok(/Tomo 1 caps 1–25/.test(prev3), 'el tomo 1 son los caps 1–25, la suma de tres originales');
  ok(/13 tomos/.test(prev3), 'y quedan 13 tomos');

  // Cambiarlo a mano rehace el reparto al vuelo.
  await p.fill('#kFactor', '1');
  await p.waitForTimeout(250);
  const avf1 = (await p.locator('#kFactorAviso').textContent()).replace(/\s+/g, ' ').trim();
  console.log('  Puesto a 1 → ' + avf1);
  ok(/salen 37/.test(avf1) && /tú tienes 13/.test(avf1), 'si lo pones a 1 avisa de que ya no cuadra');
  await p.fill('#kFactor', '3');
  await p.waitForTimeout(250);
  await p.click('#kGuardar');
  await p.waitForSelector('.tomos');
  const fichaE = (await p.locator('.detalle').textContent()).replace(/\s+/g, ' ');
  console.log('  Ficha: ' + (/📖([^💶]*)/.exec(fichaE) || [,''])[1].trim().slice(0, 110));
  ok(/Capítulos 1–333 repartidos en 13 tomos/.test(fichaE), 'la ficha dice «1–333 en 13 tomos»');
  const tipE = await p.locator('.tomos .tomo').first().getAttribute('title');
  ok(/capítulos 1–25/.test(tipE), 'y la casilla del tomo 1 dice caps 1–25: ' + tipE);
  await p.screenshot({ path: SHOT + '-3en1.png' });

  /* ---------- Una serie que Wikipedia no tiene ---------- */
  await p.click('.modal__cerrar');
  await p.waitForTimeout(200);
  await p.locator('.serie', { hasText: 'Tomodachi Game' }).first().click();
  await p.waitForSelector('.tomos');
  await p.click('[data-accion="capitulos"]');
  await p.waitForSelector('#kWiki');
  await p.click('#kWiki');
  await p.waitForFunction(() => !/Buscando/.test(document.querySelector('#kWikiAviso').textContent), null, { timeout: 60000 });
  const sinDatos = (await p.locator('#kWikiAviso').textContent()).replace(/\s+/g, ' ').trim();
  console.log('Serie sin datos:\n  ' + sinDatos.slice(0, 140));
  ok(/No hay capítulos/.test(sinDatos) && /a mano/.test(sinDatos), 'lo dice claro y sugiere ponerlo a mano');
  await p.screenshot({ path: SHOT + '-sinwiki.png' });

  if (errores.length) { console.log('ERRORES:'); errores.forEach(e => console.log('  ! ' + e)); }
  console.log(fallos + errores.length ? `\nFALLOS: ${fallos + errores.length}` : '\nTODO OK');
  await b.close();
  process.exit(fallos + errores.length ? 1 : 0);
})();
