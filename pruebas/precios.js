const { chromium } = require('playwright');
const { CHROMIUM, CAPTURAS } = require('./entorno.js');

const BASE = 'http://localhost:8777/';
(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await b.newPage({ viewport: { width: 1280, height: 1050 } });
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCIÓN: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|CONNECTION_RESET/.test(m.text())) errores.push('CONSOLA: ' + m.text()); });
  await p.route('https://encrypted-tbn0.gstatic.com/**', r => r.abort());
  let elegida = null;
  const paso = async (n, fn) => { try { await fn(); console.log('✓ ' + n); } catch (e) { console.log('✗ ' + n + ' → ' + e.message); errores.push(n); } };

  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.evaluate(() => { localStorage.clear();
    // El panel de filtros va plegado por defecto; estas pruebas lo usan.
    localStorage.setItem('cm:filtrosBiblioteca', 'true'); });
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForSelector('.stat');

  await paso('el gasto ya no sale a cero', async () => {
    const s = await p.locator('.stat', { hasText: 'Tomos en casa' }).textContent();
    console.log('      → ' + s.replace(/\s+/g, ' ').trim());
    if (/0,00 €/.test(s)) throw new Error('sigue a cero');
  });

  await paso('aplica exactamente el 5% de descuento', async () => {
    const r = await p.evaluate(() => {
      // Cualquiera con un tomo sin precio tuyo: los que fijes a mano ya no
      // llevan descuento, y fijar aquí una serie concreta caduca en cuanto
      // le pones precios.
      let s, t, lm;
      for (const c of D.coleccion.series) {
        for (const x of c.tomos) {
          const n = D.numeroLM(c, x.numero);
          if (x.tengo && (x.precio === null || x.precio === undefined) && n && n.precio) {
            s = c; t = x; lm = n; break;
          }
        }
        if (s) break;
      }
      if (!s) return { sinCaso: true };
      const p = D.precioDe(s, t);
      return { serie: s.titulo, tomo: t.numero, pvp: lm.precio, calculado: p.valor,
               manual: p.manual, descuento: D.descuento() };
    });
    console.log('      → ' + JSON.stringify(r));
    if (r.sinCaso) throw new Error('ya no queda ningún tomo estimado con el que probarlo');
    const esperado = r.pvp * (1 - r.descuento / 100);
    if (Math.abs(r.calculado - esperado) > 0.001) throw new Error('esperaba ' + esperado);
    if (r.manual) throw new Error('lo marca como manual');
  });

  await paso('un precio a mano manda y no lleva descuento', async () => {
    const r = await p.evaluate(() => {
      const s = D.coleccion.series.find(x => x.titulo === 'Frieren');
      const t = s.tomos.find(t => t.numero === 1);
      t.precio = 4.5;                       // de segunda mano
      const p = D.precioDe(s, t);
      const st = D.statsSerie(s);
      t.precio = null;
      return { valor: p.valor, manual: p.manual, manuales: st.precioManual, estimados: st.precioEstimado };
    });
    console.log('      → ' + JSON.stringify(r));
    if (r.valor !== 4.5 || !r.manual) throw new Error('no respeta el precio manual');
  });

  await paso('cambiar el descuento recalcula todo', async () => {
    await p.goto(BASE + '#/ajustes', { waitUntil: 'networkidle' });
    await p.waitForSelector('#ajDescuento');
    const antes = await p.evaluate(() => D.statsGlobales().gasto);
    // Los precios a mano no llevan descuento, así que quedan fuera de la regla de tres.
    const aMano = await p.evaluate(() => D.coleccion.series.reduce((s, serie) =>
      s + (serie.tomos || []).reduce((t, tomo) =>
        t + (tomo.tengo && tomo.precio ? Number(tomo.precio) : 0), 0), 0));
    await p.fill('#ajDescuento', '0');
    await p.click('[data-accion="guardar-precios-ajustes"]');
    await p.waitForTimeout(500);
    const despues = await p.evaluate(() => D.statsGlobales().gasto);
    console.log('      → con 5%: ' + antes.toFixed(2) + ' € | con 0%: ' + despues.toFixed(2) +
      ' € | a mano (sin descuento): ' + aMano.toFixed(2) + ' €');
    if (Math.abs((despues - aMano) * 0.95 - (antes - aMano)) > 0.05) throw new Error('no cuadra la proporción');
    await p.fill('#ajDescuento', '5');
    await p.click('[data-accion="guardar-precios-ajustes"]');
    await p.waitForTimeout(400);
  });

  await paso('el filtro «solo comprados» funciona', async () => {
    await p.goto(BASE + '#/biblioteca', { waitUntil: 'networkidle' });
    await p.waitForSelector('#fTenencia');
    const todas = await p.locator('.serie').count();
    await p.selectOption('#fTenencia', 'comprados');
    await p.waitForTimeout(400);
    const compradas = await p.locator('.serie').count();
    await p.selectOption('#fTenencia', 'leidos');
    await p.waitForTimeout(400);
    const leidas = await p.locator('.serie').count();
    // Los dos filtros no tienen por qué sumar el total: una serie recién
    // creada, sin tomos, no es ni comprada ni leída. Se comparan con lo que
    // dice el modelo, no entre ellos.
    const esperado = await p.evaluate(() => {
      const st = D.coleccion.series.map(s => D.statsSerie(s));
      return {
        compradas: st.filter(x => x.tengo).length,
        leidas: st.filter(x => !x.tengo && x.leidosTotal).length,
        ninguna: st.filter(x => !x.tengo && !x.leidosTotal).length
      };
    });
    console.log('      → todas: ' + todas + ' | compradas: ' + compradas + ' | leídas sin comprar: ' +
      leidas + ' | ni una cosa ni la otra: ' + esperado.ninguna);
    if (compradas !== esperado.compradas) throw new Error('compradas ' + compradas + ' ≠ ' + esperado.compradas);
    if (leidas !== esperado.leidas) throw new Error('leídas ' + leidas + ' ≠ ' + esperado.leidas);
    if (compradas + leidas + esperado.ninguna !== todas) throw new Error('no cuadra con el total');
  });

  await paso('el editor de precios abre y guarda', async () => {
    await p.selectOption('#fTenencia', '');
    await p.waitForTimeout(400);
    // Una que aún tenga tomos estimados, para que el desglose de después tenga
    // las dos clases de precio. Fijar una serie concreta caduca en cuanto le
    // pones precios a mano a todos sus tomos.
    elegida = await p.evaluate(() => {
      const s = D.coleccion.series.find(x => {
        const st = D.statsSerie(x);
        return st.tengo >= 2 && st.precioEstimado >= 2;
      });
      return s ? s.titulo : null;
    });
    if (!elegida) throw new Error('ninguna serie tiene ya tomos estimados');
    console.log('      → probando con «' + elegida + '»');
    await p.locator('.serie', { hasText: elegida }).first().click();
    await p.waitForSelector('.tomos');
    await p.click('[data-accion="precios"]');
    await p.waitForSelector('.precios table');
    const filas = await p.locator('.precios tbody tr').count();
    const estimado = await p.locator('.precios__estimado').first().textContent();
    console.log('      → ' + filas + ' filas | primera: ' + estimado.replace(/\s+/g, ' ').trim());
    await p.locator('.precios__input').first().fill('4.50');
    await p.locator('.precios__fecha').first().fill('2026-03-15');
    await p.click('#pGuardar');
    await p.waitForTimeout(500);
    const r = await p.evaluate(titulo => {
      const s = D.coleccion.series.find(x => x.titulo === titulo);
      const t = s.tomos.filter(x => x.tengo).sort((a, b) => a.numero - b.numero)[0];
      return { precio: t.precio, fecha: t.fechaCompra, gasto: D.statsSerie(s).gasto.toFixed(2) };
    }, elegida);
    console.log('      → ' + JSON.stringify(r));
    if (r.precio !== 4.5 || r.fecha !== '2026-03-15') throw new Error(JSON.stringify(r));
  });

  await paso('el detalle desglosa estimados y manuales', async () => {
    const t = await p.locator('.modal__caja').textContent();
    const linea = t.match(/Gasto:[^·]*(·[^·]*)*/)[0].replace(/\s+/g, ' ').trim();
    console.log('      → ' + linea.slice(0, 110));
    if (!/estimados/.test(linea) || !/precio tuyo/.test(linea)) throw new Error(linea);
  });

  await p.screenshot({ path: CAPTURAS + '22-precios.png' });
  console.log('\n' + (errores.length ? '❌ ' + errores.join('\n') : '✅ Precios y filtros correctos'));
  await b.close();
  process.exit(errores.length ? 1 : 0);
})();
