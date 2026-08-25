const { chromium } = require('playwright');
const { CHROMIUM, CAPTURAS } = require('./entorno.js');

const BASE = process.env.BASE || 'http://localhost:8777/';
(async () => {
  // Con locale español, que es donde el bug aparecía.
  const b = await chromium.launch({ executablePath: CHROMIUM, args: ['--lang=es-ES'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 }, locale: 'es-ES' });
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCIÓN: ' + e.message));
  await p.route('https://encrypted-tbn0.gstatic.com/**', r => r.abort());
  const paso = async (n, fn) => { try { await fn(); console.log('✓ ' + n); } catch (e) { console.log('✗ ' + n + ' → ' + e.message); errores.push(n); } };

  await p.goto(BASE + '#/biblioteca', { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE + '#/biblioteca', { waitUntil: 'networkidle' });
  await p.waitForSelector('.serie');

  await paso('U.aNumero entiende coma y punto', async () => {
    const r = await p.evaluate(() => ['7,50', '7.50', '1.234,56', '50,25', '', 'abc', '0']
      .map(v => v + '→' + JSON.stringify(U.aNumero(v))));
    console.log('      → ' + r.join('  '));
    const n = await p.evaluate(() => [U.aNumero('7,50'), U.aNumero('1.234,56'), U.aNumero(''), U.aNumero('abc'), U.aNumero('0')]);
    if (n[0] !== 7.5 || n[1] !== 1234.56 || n[2] !== null || n[3] !== null || n[4] !== 0) throw new Error(JSON.stringify(n));
  });

  const abrirPrecios = async () => {
    await p.evaluate(() => { const s = D.coleccion.series.find(x => x.titulo === 'Frieren'); App.abrirSerie(s.id); });
    await p.waitForSelector('.tomos');
    await p.click('[data-accion="precios"]');
    await p.waitForSelector('.reparto');
  };

  await paso('el importe del reparto admite coma decimal', async () => {
    await abrirPrecios();
    await p.fill('#rImporte', '50,25');
    const leido = await p.inputValue('#rImporte');
    if (leido !== '50,25') throw new Error('el campo se ha comido la coma: «' + leido + '»');
    await p.click('#rRepartir');
    await p.waitForTimeout(400);
    const aviso = (await p.locator('#rAviso').textContent()).replace(/\s+/g, ' ').trim();
    console.log('      → ' + aviso.slice(0, 76));
    if (!/50,25 €/.test(aviso)) throw new Error(aviso.slice(0, 60));
  });

  await paso('el reparto suma exactamente lo que pagaste', async () => {
    await p.click('#pGuardar');
    await p.waitForTimeout(700);
    const g = await p.evaluate(() => {
      const s = D.coleccion.series.find(x => x.titulo === 'Frieren');
      return D.statsSerie(s).gasto;
    });
    console.log('      → gasto de la serie: ' + g.toFixed(2) + ' €');
    if (Math.abs(g - 50.25) > 0.001) throw new Error(g);
  });

  await paso('un precio suelto con coma se guarda bien', async () => {
    await abrirPrecios();
    await p.locator('.precios__input').first().fill('12,34');
    await p.click('#pGuardar');
    await p.waitForTimeout(700);
    const r = await p.evaluate(() => {
      const s = D.coleccion.series.find(x => x.titulo === 'Frieren');
      return s.tomos.find(t => t.numero === 1).precio;
    });
    console.log('      → guardado: ' + r);
    if (r !== 12.34) throw new Error('guardó ' + r);
  });

  await paso('y aguanta la recarga', async () => {
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForTimeout(800);
    const r = await p.evaluate(() => {
      const s = D.coleccion.series.find(x => x.titulo === 'Frieren');
      return { uno: s.tomos.find(t => t.numero === 1).precio, gasto: D.statsSerie(s).gasto };
    });
    console.log('      → tomo 1: ' + r.uno + ' · gasto ' + r.gasto.toFixed(2) + ' €');
    if (r.uno !== 12.34) throw new Error(JSON.stringify(r));
  });

  await paso('lo que no se entiende no se guarda a traición', async () => {
    await abrirPrecios();
    await p.locator('.precios__input').first().fill('doce euros');
    await p.click('#pGuardar');
    await p.waitForTimeout(700);
    const r = await p.evaluate(() => {
      const s = D.coleccion.series.find(x => x.titulo === 'Frieren');
      return s.tomos.find(t => t.numero === 1).precio;
    });
    const nota = await p.locator('.nota--error').first().textContent().catch(() => '');
    console.log('      → sigue valiendo ' + r + ' · aviso: «' + nota.trim().slice(0, 56) + '»');
    if (r !== 12.34) throw new Error('lo ha machacado con ' + r);
    if (!/No se entienden/.test(nota)) throw new Error('no avisa');
  });

  await paso('vaciar el campo sí borra el precio', async () => {
    await abrirPrecios();
    await p.locator('.precios__input').first().fill('');
    await p.click('#pGuardar');
    await p.waitForTimeout(700);
    const r = await p.evaluate(() => {
      const s = D.coleccion.series.find(x => x.titulo === 'Frieren');
      return s.tomos.find(t => t.numero === 1).precio;
    });
    if (r !== null) throw new Error('quedó ' + r);
  });

  await paso('el descuento de Ajustes también admite coma', async () => {
    await p.keyboard.press('Escape');
    await p.goto(BASE + '#/ajustes', { waitUntil: 'networkidle' });
    await p.waitForSelector('#ajDescuento');
    await p.fill('#ajDescuento', '7,5');
    await p.click('[data-accion="guardar-precios-ajustes"]');
    await p.waitForTimeout(600);
    const d = await p.evaluate(() => D.descuento());
    console.log('      → descuento guardado: ' + d + '%');
    if (d !== 7.5) throw new Error('guardó ' + d);
    await p.fill('#ajDescuento', '5');
    await p.click('[data-accion="guardar-precios-ajustes"]');
    await p.waitForTimeout(400);
  });

  await paso('guardar aplica el reparto aunque no pulses «Repartir»', async () => {
    await abrirPrecios();
    await p.fill('#rImporte', '80,88');
    await p.selectOption('#rDesde', '1');
    await p.selectOption('#rHasta', '6');
    await p.fill('#rFecha', '2026-07-24');
    await p.click('#pGuardar');            // directo, sin pasar por «Repartir»
    await p.waitForTimeout(900);
    const r = await p.evaluate(() => {
      const s = D.coleccion.series.find(x => x.titulo === 'Frieren');
      const t = s.tomos.filter(x => x.numero <= 6 && x.tengo);
      return { suma: t.reduce((a, b) => a + (b.precio || 0), 0), fecha: t[0].fechaCompra };
    });
    console.log('      → suma ' + r.suma.toFixed(2) + ' € · fecha ' + r.fecha);
    if (Math.abs(r.suma - 80.88) > 0.001) throw new Error('suma ' + r.suma);
    if (r.fecha !== '2026-07-24') throw new Error('fecha ' + r.fecha);
  });

  await paso('pero no pisa lo que retoques a mano tras repartir', async () => {
    await abrirPrecios();
    await p.fill('#rImporte', '70');
    await p.click('#rRepartir');
    await p.waitForTimeout(400);
    await p.locator('.precios__input').first().fill('99,99');
    await p.click('#pGuardar');
    await p.waitForTimeout(900);
    const r = await p.evaluate(() => {
      const s = D.coleccion.series.find(x => x.titulo === 'Frieren');
      return s.tomos.filter(t => t.tengo).map(t => t.precio);
    });
    console.log('      → ' + r.join(' '));
    if (r[0] !== 99.99) throw new Error('ha pisado el retoque: ' + r[0]);
  });

  console.log(errores.length ? '❌ ' + errores.join('\n') : '✅ La coma decimal funciona en todos los campos de dinero');
  await b.close();
  process.exit(errores.length ? 1 : 0);
})();
