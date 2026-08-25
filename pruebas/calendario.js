const { chromium } = require('playwright');
const { CHROMIUM, CAPTURAS } = require('./entorno.js');

const BASE = 'http://localhost:8777/';
(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCIÓN: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|CONNECTION_RESET/.test(m.text())) errores.push('CONSOLA: ' + m.text()); });
  await p.route('https://encrypted-tbn0.gstatic.com/**', r => r.abort());
  const paso = async (n, fn) => { try { await fn(); console.log('✓ ' + n); } catch (e) { console.log('✗ ' + n + ' → ' + e.message); errores.push(n); } };

  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForSelector('.stat');

  await paso('la tarjeta no menciona el dinero cuando está oculto', async () => {
    const t = await p.locator('.stat', { hasText: 'Tomos en casa' }).textContent();
    console.log('      → ' + t.replace(/\s+/g, ' ').trim());
    if (/€|invertid|•/.test(t)) throw new Error('habla del dinero: ' + t);
    if (!/serie/.test(t)) throw new Error('no dice nada útil en su lugar: ' + t);
  });

  await paso('no hay nada que pulsar para destapar el importe', async () => {
    const tarjeta = p.locator('.stat', { hasText: 'Tomos en casa' });
    if (await p.locator('.stat--pulsable').count()) throw new Error('sigue habiendo tarjetas pulsables');
    if (await tarjeta.locator('[data-accion]').count()) throw new Error('la tarjeta lleva una acción');
    await tarjeta.click();
    await p.waitForTimeout(400);
    const t = await tarjeta.textContent();
    if (/€|invertid/.test(t)) throw new Error('el clic destapa el importe: ' + t);
  });

  await paso('el interruptor de Ajustes lo hace permanente', async () => {
    await p.goto(BASE + '#/ajustes', { waitUntil: 'networkidle' });
    await p.waitForSelector('#ajMostrarGasto');
    await p.check('#ajMostrarGasto');
    await p.click('[data-accion="guardar-precios-ajustes"]');
    await p.waitForTimeout(500);
    await p.goto(BASE + '#/resumen', { waitUntil: 'networkidle' });
    await p.waitForSelector('.stat');
    const t = await p.locator('.stat', { hasText: 'Tomos en casa' }).textContent();
    if (!/€ invertidos/.test(t)) throw new Error('sigue oculto: ' + t);
    console.log('      → ' + t.replace(/\s+/g, ' ').trim());
    // lo dejamos oculto otra vez
    await p.goto(BASE + '#/ajustes', { waitUntil: 'networkidle' });
    await p.uncheck('#ajMostrarGasto');
    await p.click('[data-accion="guardar-precios-ajustes"]');
    await p.waitForTimeout(400);
  });

  await paso('Próximas arranca en modo lista', async () => {
    await p.goto(BASE + '#/calendario', { waitUntil: 'networkidle' });
    await p.waitForSelector('.conmutador');
    const activo = await p.locator('.conmutador button.activo').textContent();
    if (activo.trim() !== 'Lista') throw new Error('activo: ' + activo);
    if (!await p.locator('.mes .fila').count()) throw new Error('no hay filas');
  });

  await paso('el modo calendario pinta tres meses', async () => {
    await p.locator('.conmutador button', { hasText: 'Calendario' }).click();
    await p.waitForSelector('.mes-rejilla');
    const meses = await p.locator('.mes-rejilla__titulo').allTextContents();
    const dias = await p.locator('.dia--conSalidas').count();
    console.log('      → ' + meses.join(' | ') + ' · ' + dias + ' días con salidas');
    if (meses.length !== 3) throw new Error('meses: ' + meses.length);
    if (!dias) throw new Error('ningún día marcado');
  });

  await paso('la primera casilla cae en el día de la semana correcto', async () => {
    const r = await p.evaluate(() => {
      const rejilla = document.querySelector('.mes-rejilla .dias');
      const vacios = [...rejilla.children].findIndex(c => !c.classList.contains('dia--vacio'));
      const primerNumero = rejilla.querySelector('.dia:not(.dia--vacio) .dia__numero').textContent;
      const hoy = new Date();
      const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      return { huecos: vacios, primerNumero, diaSemanaReal: (primero.getDay() + 6) % 7 };
    });
    console.log('      → ' + JSON.stringify(r));
    if (r.huecos !== r.diaSemanaReal) throw new Error('el mes no empieza donde debe');
    if (r.primerNumero !== '1') throw new Error('la primera casilla no es el día 1');
  });

  await paso('pulsar un día abre lo que sale ese día', async () => {
    const dia = p.locator('.dia--conSalidas').first();
    const fecha = await dia.getAttribute('data-fecha');
    const marca = await dia.locator('.dia__marca').textContent();
    await dia.click();
    await p.waitForSelector('.modal__caja .fila');
    const titulo = await p.locator('.modal__caja h2').textContent();
    const filas = await p.locator('.modal__caja .fila').count();
    const sub = await p.locator('.modal__caja .ayuda').first().textContent();
    console.log('      → ' + fecha + ' · "' + titulo.trim() + '" · ' + filas + ' filas · ' + sub.replace(/\s+/g,' ').trim());
    if (filas !== Number(marca)) throw new Error('la marca decía ' + marca + ' y hay ' + filas);
  });

  await paso('el modo elegido se recuerda', async () => {
    await p.keyboard.press('Escape');
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('.conmutador');
    const activo = await p.locator('.conmutador button.activo').textContent();
    if (activo.trim() !== 'Calendario') throw new Error('activo: ' + activo);
  });

  await p.screenshot({ path: CAPTURAS + '23-calendario.png', fullPage: true });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(400);
  const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
  console.log('\nmóvil: ancho de página ' + ancho + 'px' + (ancho > 400 ? ' ❌ desborda' : ' ✓'));
  await p.screenshot({ path: CAPTURAS + '24-cal-movil.png', fullPage: true });

  console.log(errores.length ? '❌ ' + errores.join('\n') : '✅ Gasto oculto y calendario correctos');
  await b.close();
  process.exit(errores.length ? 1 : 0);
})();
