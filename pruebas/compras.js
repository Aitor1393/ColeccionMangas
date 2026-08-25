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
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE, { waitUntil: 'networkidle' });

  await paso('hay una pestaña «Compras» que lleva a la sección', async () => {
    await p.click('a[data-vista="compras"]');
    await p.waitForSelector('.fila--compra');
    const h1 = (await p.locator('#app h1').textContent()).trim();
    if (h1 !== 'Próximas compras') throw new Error(h1);
  });

  await paso('solo salen tomos que ya están a la venta y no tienes', async () => {
    const r = await p.evaluate(() => {
      const hoy = U.isoHoy();
      const l = D.pendientesDeCompra();
      return {
        total: l.length,
        futuros: l.filter(x => x.fecha > hoy).length,
        sinFecha: l.filter(x => !x.fecha).length,
        yaTengo: l.filter(x => { const t = D.tomo(x.serie, x.numero, false); return t && t.tengo; }).length,
        muestra: l.slice(0, 4).map(x => x.serie.titulo + ' ' + x.numero + ' (' + x.fecha + ')')
      };
    });
    console.log('      → ' + r.total + ' tomos · ' + r.muestra.join(', '));
    if (r.futuros) throw new Error(r.futuros + ' aún no han salido');
    if (r.sinFecha) throw new Error(r.sinFecha + ' sin fecha');
    if (r.yaTengo) throw new Error(r.yaTengo + ' ya los tienes');
  });

  await paso('los «números no editados» de ListadoManga NO cuentan', async () => {
    // ¡Zatch Bell! 9-16 están en LM sin fecha: anunciados, no publicados.
    const r = await p.evaluate(() => {
      const s = D.coleccion.series.find(x => x.titulo === '¡Zatch Bell!');
      const enLM = D.numerosLM(s).filter(n => !n.fecha).map(n => n.numero);
      const enCompras = D.pendientesDeCompra().filter(x => x.serie.id === s.id).map(x => x.numero);
      return { sinFechaEnLM: enLM, enCompras: enCompras };
    });
    console.log('      → sin fecha en LM: ' + r.sinFechaEnLM.join(',') + ' · en compras: ' + (r.enCompras.join(',') || 'ninguno'));
    if (!r.sinFechaEnLM.length) throw new Error('el caso de prueba ya no aplica');
    if (r.enCompras.length) throw new Error('se han colado: ' + r.enCompras.join(','));
  });

  await paso('no se limita a los 3 meses próximos', async () => {
    const r = await p.evaluate(() => {
      const l = D.pendientesDeCompra();
      const dias = l.map(x => Math.abs(U.diasHasta(x.fecha)));
      return { max: Math.max.apply(null, dias), min: Math.min.apply(null, dias) };
    });
    console.log('      → el más antiguo salió hace ' + r.max + ' días');
    if (r.max < 400) throw new Error('no hay nada antiguo, la prueba no vale');
  });

  await paso('modo «Por serie»: una fila por manga con sus tomos', async () => {
    const filas = await p.locator('.fila--compra').count();
    const chips = await p.locator('.tomo-chip').count();
    const tomos = await p.evaluate(() => D.pendientesDeCompra().length);
    console.log('      → ' + filas + ' series · ' + chips + ' pastillas de tomo (' + tomos + ' tomos)');
    if (chips !== tomos) throw new Error('faltan pastillas');
  });

  await paso('modo «Tomo a tomo»: una fila por tomo suelto', async () => {
    await p.locator('.conmutador button', { hasText: 'Tomo a tomo' }).click();
    await p.waitForTimeout(400);
    const filas = await p.locator('.fila--compra').count();
    const tomos = await p.evaluate(() => D.pendientesDeCompra().length);
    console.log('      → ' + filas + ' filas / ' + tomos + ' tomos');
    if (filas !== tomos) throw new Error(filas + ' ≠ ' + tomos);
  });

  await paso('el modo elegido se recuerda', async () => {
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('.conmutador');
    const activo = (await p.locator('.conmutador button.activo').textContent()).trim();
    if (activo !== 'Tomo a tomo') throw new Error(activo);
  });

  await paso('las flechas cambian el orden de compra', async () => {
    const antes = await p.locator('.fila--compra .fila__titulo').allTextContents();
    // Subimos el tercero hasta el primer puesto.
    await p.locator('.fila--compra').nth(2).locator('[data-dir="-1"]').click();
    await p.waitForTimeout(300);
    await p.locator('.fila--compra').nth(1).locator('[data-dir="-1"]').click();
    await p.waitForTimeout(300);
    const despues = await p.locator('.fila--compra .fila__titulo').allTextContents();
    const lim = t => t.replace(/\s+/g, ' ').trim();
    console.log('      → antes:   ' + antes.slice(0, 3).map(lim).join(' | '));
    console.log('      → después: ' + despues.slice(0, 3).map(lim).join(' | '));
    if (lim(despues[0]) !== lim(antes[2])) throw new Error('el tercero no ha subido al primero');
  });

  await paso('el orden aguanta la recarga', async () => {
    const antes = await p.locator('.fila--compra .fila__titulo').first().textContent();
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('.fila--compra');
    const despues = await p.locator('.fila--compra .fila__titulo').first().textContent();
    if (antes.trim() !== despues.trim()) throw new Error('«' + despues.trim() + '» ≠ «' + antes.trim() + '»');
  });

  await paso('la primera flecha arriba y la última abajo están apagadas', async () => {
    const n = await p.locator('.fila--compra').count();
    const arriba = await p.locator('.fila--compra').first().locator('[data-dir="-1"]').isDisabled();
    const abajo = await p.locator('.fila--compra').nth(n - 1).locator('[data-dir="1"]').isDisabled();
    if (!arriba || !abajo) throw new Error('arriba=' + arriba + ' abajo=' + abajo);
  });

  await paso('«Comprado» quita el tomo de la sección', async () => {
    const antes = await p.locator('.fila--compra').count();
    const fila = p.locator('.fila--compra').first();
    const titulo = (await fila.locator('.fila__titulo').textContent()).replace(/\s+/g, ' ').trim();
    await fila.locator('[data-accion="comprado"]').click();
    await p.waitForTimeout(500);
    const despues = await p.locator('.fila--compra').count();
    const nuevoPrimero = (await p.locator('.fila--compra').first().locator('.fila__titulo').textContent()).replace(/\s+/g, ' ').trim();
    console.log('      → comprado «' + titulo + '» · ' + antes + ' → ' + despues + ' filas');
    if (despues !== antes - 1) throw new Error(antes + ' → ' + despues);
    if (nuevoPrimero === titulo) throw new Error('sigue ahí');
  });

  await paso('y queda marcado como que lo tienes', async () => {
    const r = await p.evaluate(() => {
      const s = D.coleccion.series.find(x => x.tomos.some(t => t.tengo && t.fechaCompra === U.isoHoy()));
      const t = s.tomos.find(t => t.tengo && t.fechaCompra === U.isoHoy());
      return { serie: s.titulo, numero: t.numero, tengo: t.tengo, fecha: t.fechaCompra };
    });
    console.log('      → ' + JSON.stringify(r));
    if (!r.tengo) throw new Error('no consta como comprado');
  });

  await paso('en modo por serie, pulsar la pastilla también lo compra', async () => {
    await p.locator('.conmutador button', { hasText: 'Por serie' }).click();
    await p.waitForTimeout(400);
    const antes = await p.locator('.tomo-chip').count();
    const num = await p.locator('.tomo-chip').first().textContent();
    await p.locator('.tomo-chip').first().click();
    await p.waitForTimeout(500);
    const despues = await p.locator('.tomo-chip').count();
    console.log('      → pastilla ' + num + ' · ' + antes + ' → ' + despues + ' pastillas');
    if (despues !== antes - 1) throw new Error(antes + ' → ' + despues);
  });

  await paso('«Volver al orden automático» borra tu orden', async () => {
    await p.locator('.conmutador button', { hasText: 'Tomo a tomo' }).click();
    await p.waitForTimeout(400);
    const hayBoton = await p.locator('[data-accion="orden-automatico"]').count();
    if (!hayBoton) throw new Error('no sale el botón teniendo orden manual');
    await p.click('[data-accion="orden-automatico"]');
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => D.coleccion.compras.tomos.length);
    if (r !== 0) throw new Error('quedan ' + r + ' claves');
    if (await p.locator('[data-accion="orden-automatico"]').count()) throw new Error('el botón sigue ahí');
  });

  await paso('lo que leíste sin comprarlo no sale', async () => {
    const r = await p.evaluate(() => {
      const l = D.pendientesDeCompra();
      const fuera = D.leidosSinComprar();
      return {
        coladas: l.filter(x => { const t = D.tomo(x.serie, x.numero, false); return t && t.leido; }).length,
        fuera: fuera.length,
        muestra: fuera.slice(0, 4).map(x => x.serie.titulo + ' ' + x.numero)
      };
    });
    console.log('      → ' + r.fuera + ' fuera: ' + r.muestra.join(', '));
    if (!r.fuera) throw new Error('no hay ninguno leído sin comprar, la prueba no vale');
    if (r.coladas) throw new Error(r.coladas + ' leídos se han colado');
    const aviso = await p.locator('.ayuda', { hasText: 'leíste sin comprarlo' }).count();
    if (!aviso) throw new Error('no se avisa de que quedan fuera');
  });

  await p.screenshot({ path: CAPTURAS + '29-compras-tomos.png', fullPage: true });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(400);
  const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
  console.log('\nmóvil: ancho ' + ancho + 'px' + (ancho > 400 ? ' ❌ desborda' : ' ✓'));
  await p.screenshot({ path: CAPTURAS + '30-compras-movil.png', fullPage: true });

  await paso('reordenar ofrece publicar', async () => {
    // El aviso de «cambios sin publicar» solo miraba las series, así que el
    // orden de compra se guardaba en el navegador y no había forma de subirlo.
    // Se parte de limpio: las pruebas anteriores ya han tocado la colección, y
    // un goto que solo cambia el hash no recarga ni vacía D.coleccion.
    await p.evaluate(() => localStorage.clear());
    await p.goto(BASE + '#/compras', { waitUntil: 'networkidle' });
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('.fila--compra');
    const oculto = () => p.evaluate(() => document.getElementById('avisoCambios').classList.contains('oculto'));
    if (!await oculto()) throw new Error('el aviso ya salía sin tocar nada');
    await p.locator('.fila--compra').nth(2).locator('[data-dir="-1"]').click();
    await p.waitForTimeout(600);
    const texto = (await p.locator('#avisoTexto').textContent()).trim();
    console.log('      → ' + texto);
    if (await oculto()) throw new Error('no ofrece publicar');
    if (!/1 cambio /.test(texto)) throw new Error('mal la concordancia: ' + texto);
    if (await p.evaluate(() => D.numCambios()) !== 1) throw new Error('no lo cuenta');
  });

  await paso('y los ajustes también', async () => {
    await p.goto(BASE + '#/ajustes', { waitUntil: 'networkidle' });
    await p.waitForSelector('#ajDescuento');
    await p.fill('#ajDescuento', '6');
    await p.click('[data-accion="guardar-precios-ajustes"]');
    await p.waitForTimeout(600);
    const n = await p.evaluate(() => D.numCambios());
    console.log('      → ' + n + ' cambios: el orden y los ajustes');
    if (n !== 2) throw new Error('cuenta ' + n);
  });

  console.log(errores.length ? '❌ ' + errores.join('\n') : '✅ Próximas compras correcta');
  await b.close();
  process.exit(errores.length ? 1 : 0);
})();
