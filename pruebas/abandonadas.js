const { chromium } = require('playwright');
const { CHROMIUM, CAPTURAS } = require('./entorno.js');

const BASE = 'http://localhost:8777/';
(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await b.newPage({ viewport: { width: 1280, height: 1100 } });
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
  await p.waitForSelector('.serie');

  const partida = await p.evaluate(() => D.abandonadas().length);

  await paso('las abandonadas se marcan en la biblioteca', async () => {
    const n = await p.locator('.serie--abandonada').count();
    const t = await p.locator('.serie--abandonada .serie__titulo').allTextContents();
    console.log('      → ' + n + ': ' + t.join(', '));
    const esperadas = await p.evaluate(() => D.abandonadas().length);
    if (!esperadas) throw new Error('no hay ninguna abandonada, la prueba no vale');
    if (n !== esperadas) throw new Error('esperaba ' + esperadas + ', hay ' + n);
    const ins = await p.locator('.serie--abandonada .serie__insignia--abandonada').count();
    if (ins !== esperadas) throw new Error('insignias: ' + ins);
  });

  await paso('el filtro «Solo las que sigo» las esconde', async () => {
    const todas = await p.locator('.serie').count();
    await p.selectOption('#fSeguimiento', 'sigo');
    await p.waitForTimeout(400);
    const sigo = await p.locator('.serie').count();
    const ab = await p.evaluate(() => D.abandonadas().length);
    console.log('      → ' + todas + ' → ' + sigo + ' (' + ab + ' abandonadas)');
    if (sigo !== todas - ab) throw new Error(todas + ' → ' + sigo);
    if (await p.locator('.serie--abandonada').count()) throw new Error('se cuela alguna');
  });

  await paso('el filtro «Solo abandonadas» deja solo esas', async () => {
    await p.selectOption('#fSeguimiento', 'abandonadas');
    await p.waitForTimeout(400);
    const n = await p.locator('.serie').count();
    const ab = await p.locator('.serie--abandonada').count();
    const esperadas = await p.evaluate(() => D.abandonadas().length);
    if (n !== esperadas || ab !== esperadas) throw new Error(n + ' series, ' + ab + ' abandonadas');
  });

  await paso('se combina con el buscador', async () => {
    // La aguja sale de la propia colección: cuáles están abandonadas cambia
    // según lo que vaya marcando el usuario.
    const aguja = await p.evaluate(() => D.abandonadas()[0].titulo.split(/[\s:]/)[0]);
    try {
      await p.fill('#fTexto', aguja);
      await p.waitForTimeout(500);
      const t = await p.locator('.serie__titulo').allTextContents();
      console.log('      → «' + aguja + '» + abandonadas: ' + t.join(', '));
      if (!t.length) throw new Error('ningún resultado para «' + aguja + '»');
      const todas = await p.evaluate(() => D.abandonadas().length);
      if (t.length >= todas) throw new Error('el texto no recorta nada');
    } finally {
      // Se limpia pase lo que pase: si no, el texto se arrastra a las
      // pruebas siguientes y las hace fallar por rebote.
      await p.fill('#fTexto', '');
      await p.selectOption('#fSeguimiento', '');
      await p.waitForTimeout(400);
    }
  });

  await paso('no aparecen en Próximas compras', async () => {
    const r = await p.evaluate(() => {
      const ab = D.abandonadas().map(s => s.id);
      const l = D.pendientesDeCompra();
      return { total: l.length, coladas: l.filter(x => ab.indexOf(x.serie.id) !== -1).length, abandonadas: ab.length };
    });
    console.log('      → ' + r.total + ' tomos pendientes · ' + r.abandonadas + ' series abandonadas · ' + r.coladas + ' coladas');
    if (r.coladas) throw new Error(r.coladas + ' tomos de series abandonadas');
  });

  await paso('tampoco en Próximas publicaciones', async () => {
    const r = await p.evaluate(() => {
      const ab = D.abandonadas().map(s => s.id);
      return D.proximasPublicaciones().filter(x => ab.indexOf(x.serie.id) !== -1).length;
    });
    if (r) throw new Error(r + ' salidas de series abandonadas');
  });

  await paso('Compras avisa de que las deja fuera y el enlace filtra', async () => {
    await p.goto(BASE + '#/compras', { waitUntil: 'networkidle' });
    await p.waitForSelector('.resumen-compras');
    const aviso = await p.locator('[data-accion="ver-abandonadas"]').first();
    const texto = (await p.locator('.ayuda', { has: p.locator('[data-accion="ver-abandonadas"]') }).first().textContent()).replace(/\s+/g, ' ').trim();
    console.log('      → ' + texto);
    const ab = await p.evaluate(() => D.abandonadas().length);
    if (texto.indexOf(ab + ' series abandonadas') === -1) throw new Error(texto);
    await aviso.click();
    await p.waitForTimeout(600);
    const n = await p.locator('.serie').count();
    if (n !== ab) throw new Error('el enlace no filtra: ' + n + ' series');
  });

  await paso('se puede abandonar desde el detalle y vuelve atrás', async () => {
    await p.goto(BASE + '#/biblioteca', { waitUntil: 'networkidle' });
    await p.selectOption('#fSeguimiento', '');
    await p.waitForTimeout(300);
    await p.fill('#fTexto', 'Vinland');
    await p.waitForTimeout(500);
    await p.locator('.serie').first().click();
    await p.waitForSelector('.detalle h2');
    if (await p.locator('.chip--rojo', { hasText: 'La dejaste' }).count()) throw new Error('ya estaba marcada');
    await p.click('[data-accion="abandonar"]');
    await p.waitForTimeout(500);
    const chip = await p.locator('.chip--rojo', { hasText: 'La dejaste' }).count();
    const boton = (await p.locator('[data-accion="abandonar"]').textContent()).trim();
    console.log('      → chip: ' + chip + ' · botón ahora dice "' + boton + '"');
    if (!chip) throw new Error('no sale el chip');
    if (!/Volver a coleccionarla/.test(boton)) throw new Error(boton);
    await p.click('[data-accion="abandonar"]');
    await p.waitForTimeout(500);
    if (await p.locator('.chip--rojo', { hasText: 'La dejaste' }).count()) throw new Error('no se ha retomado');
  });

  await paso('el formulario guarda la casilla', async () => {
    await p.click('[data-accion="editar-serie"]');
    await p.waitForSelector('#cAbandonada');
    if (await p.isChecked('#cAbandonada')) throw new Error('llega marcada');
    await p.check('#cAbandonada');
    await p.click('#formSerie button[type="submit"]');
    await p.waitForTimeout(700);
    const r = await p.evaluate(() => {
      const s = D.coleccion.series.find(x => x.titulo === 'Vinland Saga');
      return s.abandonada;
    });
    if (!r) throw new Error('no se ha guardado');
    console.log('      → Vinland Saga queda abandonada desde el formulario');
  });

  await paso('aguanta la recarga', async () => {
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForTimeout(600);
    const r = await p.evaluate(() => D.abandonadas().length);
    console.log('      → ' + r + ' abandonadas tras recargar (una más que al empezar)');
    if (r !== partida + 1) throw new Error('esperaba ' + (partida + 1) + ', hay ' + r);
  });

  await p.goto(BASE + '#/biblioteca', { waitUntil: 'networkidle' });
  await p.waitForSelector('.serie');
  await p.waitForTimeout(800);
  await p.screenshot({ path: CAPTURAS + '35-abandonadas.png' });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(400);
  const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
  console.log('\nmóvil: ancho ' + ancho + 'px' + (ancho > 400 ? ' ❌ desborda' : ' ✓'));

  console.log(errores.length ? '❌ ' + errores.join('\n') : '✅ Series abandonadas correcto');
  await b.close();
  process.exit(errores.length ? 1 : 0);
})();
