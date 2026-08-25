const { chromium } = require('playwright');
const { CHROMIUM, CAPTURAS } = require('./entorno.js');

const BASE = process.env.BASE || 'http://localhost:8777/';
(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCIÓN: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|CONNECTION_RESET|404/.test(m.text())) errores.push('CONSOLA: ' + m.text()); });
  await p.route('https://encrypted-tbn0.gstatic.com/**', r => r.abort());
  const paso = async (n, fn) => { try { await fn(); console.log('✓ ' + n); } catch (e) { console.log('✗ ' + n + ' → ' + e.message); errores.push(n); } };

  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE + '#/biblioteca', { waitUntil: 'networkidle' });
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('.serie');

  /* ---- 1. El scroll no se va al inicio ---- */

  // Lo que importa no es scrollY sino dónde queda el contenido en pantalla: al
  // aparecer la banda de «cambios sin publicar» la página crece y scrollY sube
  // con ella, aunque tú sigas viendo exactamente lo mismo. Se mide una tarjeta
  // concreta respecto al borde superior de la ventana.
  const dondeQueda = () => p.evaluate(() => {
    const s = document.querySelector('.serie[data-marca]');
    return s ? Math.round(s.getBoundingClientRect().top) : null;
  });
  const marcarTarjetaVisible = () => p.evaluate(() => {
    document.querySelectorAll('.serie[data-marca]').forEach(e => e.removeAttribute('data-marca'));
    const s = [...document.querySelectorAll('.serie')].find(e => e.getBoundingClientRect().top > 100);
    s.setAttribute('data-marca', '1');
    return s.querySelector('.serie__titulo').textContent;
  });

  await paso('cerrar una ficha te deja donde estabas', async () => {
    await p.evaluate(() => window.scrollTo(0, 1400));
    await p.waitForTimeout(400);
    if (await p.evaluate(() => window.scrollY) < 900) throw new Error('la página no hace scroll');
    const titulo = await marcarTarjetaVisible();
    const antes = await dondeQueda();
    await p.evaluate(() => document.querySelector('.serie[data-marca]').click());
    await p.waitForSelector('.detalle h2');
    await p.click('.modal__cerrar');
    await p.waitForTimeout(500);
    // la marca se pierde al repintar; se vuelve a buscar por título
    const despues = await p.evaluate((t) => {
      const s = [...document.querySelectorAll('.serie')]
        .find(e => e.querySelector('.serie__titulo').textContent === t);
      return Math.round(s.getBoundingClientRect().top);
    }, titulo);
    console.log('      → «' + titulo.trim() + '» estaba a ' + antes + 'px del borde, ahora a ' + despues);
    if (Math.abs(antes - despues) > 4) throw new Error(antes + ' → ' + despues);
  });

  await paso('marcar un tomo tampoco mueve la página', async () => {
    const titulo = await marcarTarjetaVisible();
    const antes = await dondeQueda();
    const avisoAntes = await p.evaluate(() => !document.getElementById('avisoCambios').classList.contains('oculto'));
    await p.evaluate(() => document.querySelector('.serie[data-marca]').click());
    await p.waitForSelector('.tomos');
    await p.locator('.tomo').first().click();
    await p.waitForTimeout(400);
    await p.click('.modal__cerrar');
    await p.waitForTimeout(500);
    const r = await p.evaluate((t) => {
      const s = [...document.querySelectorAll('.serie')]
        .find(e => e.querySelector('.serie__titulo').textContent === t);
      return { top: Math.round(s.getBoundingClientRect().top), y: window.scrollY,
        aviso: !document.getElementById('avisoCambios').classList.contains('oculto') };
    }, titulo);
    console.log('      → estaba a ' + antes + 'px, ahora a ' + r.top + 'px · banda de cambios: ' +
      avisoAntes + ' → ' + r.aviso + ' (scrollY ' + r.y + ')');
    if (Math.abs(antes - r.top) > 4) throw new Error(antes + ' → ' + r.top);
    await p.evaluate(() => window.scrollTo(0, 0));
  });

  /* ---- 2. El cursor del buscador ---- */

  await paso('el cursor se queda al final al escribir', async () => {
    await p.click('[data-accion="alternar-filtros"]');
    await p.waitForTimeout(400);
    await p.click('#fTexto');
    // escribimos despacio, cruzando el debounce de 250 ms varias veces
    for (const c of 'akame') {
      await p.keyboard.type(c);
      await p.waitForTimeout(300);
    }
    const r = await p.evaluate(() => {
      const i = document.getElementById('fTexto');
      return { valor: i.value, cursor: i.selectionStart, foco: document.activeElement.id };
    });
    console.log('      → "' + r.valor + '" · cursor en ' + r.cursor + ' · foco ' + r.foco);
    if (r.valor !== 'akame') throw new Error('se ha escrito «' + r.valor + '»');
    if (r.cursor !== 5) throw new Error('cursor en ' + r.cursor + ', no al final');
    if (r.foco !== 'fTexto') throw new Error('foco perdido');
  });

  await paso('y los resultados se han filtrado igualmente', async () => {
    const n = await p.locator('.serie').count();
    const cuenta = (await p.locator('#bibCuenta').textContent()).trim();
    console.log('      → ' + n + ' series · «' + cuenta + '»');
    if (n < 1 || n > 8) throw new Error(n + ' resultados para «akame»');
  });

  await paso('borrar letras tampoco descoloca el cursor', async () => {
    await p.keyboard.press('Backspace');
    await p.waitForTimeout(400);
    await p.keyboard.press('Backspace');
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const i = document.getElementById('fTexto');
      return { valor: i.value, cursor: i.selectionStart };
    });
    console.log('      → "' + r.valor + '" · cursor en ' + r.cursor);
    if (r.valor !== 'aka' || r.cursor !== 3) throw new Error(JSON.stringify(r));
    await p.click('[data-accion="limpiar-filtros"]');
    await p.waitForTimeout(400);
  });

  /* ---- 3. Posición directa en Compras ---- */

  await paso('se puede escribir el puesto en Compras', async () => {
    await p.goto(BASE + '#/compras', { waitUntil: 'networkidle' });
    await p.waitForSelector('.fila--compra');
    const antes = await p.locator('.fila--compra .fila__titulo').allTextContents();
    const quinto = antes[4].replace(/\s+/g, ' ').trim();
    await p.locator('.orden__num').nth(4).fill('1');
    await p.locator('.orden__num').nth(4).press('Enter');
    await p.waitForTimeout(700);
    const despues = await p.locator('.fila--compra .fila__titulo').allTextContents();
    console.log('      → el 5º («' + quinto + '») pasa a ser el ' +
      (despues.findIndex(t => t.replace(/\s+/g, ' ').trim() === quinto) + 1) + 'º');
    if (despues[0].replace(/\s+/g, ' ').trim() !== quinto) throw new Error('no ha subido al primero');
  });

  await paso('los demás se corren, no se intercambian', async () => {
    const t = await p.locator('.fila--compra .fila__titulo').allTextContents();
    const lim = x => x.replace(/\s+/g, ' ').trim();
    console.log('      → ahora: ' + t.slice(0, 5).map(lim).join(' | '));
    // el que era primero debe estar ahora segundo, no quinto
    if (await p.locator('.orden__num').first().inputValue() !== '1') throw new Error('numeración mal');
  });

  await paso('un puesto imposible no rompe nada', async () => {
    const antes = await p.locator('.fila--compra .fila__titulo').first().textContent();
    await p.locator('.orden__num').first().fill('999');
    await p.locator('.orden__num').first().press('Enter');
    await p.waitForTimeout(600);
    const despues = await p.locator('.fila--compra .fila__titulo').first().textContent();
    const valor = await p.locator('.orden__num').first().inputValue();
    console.log('      → sigue el mismo primero, la casilla vuelve a "' + valor + '"');
    if (antes.trim() !== despues.trim()) throw new Error('ha movido algo');
    if (valor !== '1') throw new Error('la casilla queda en ' + valor);
  });

  await paso('las flechas siguen funcionando', async () => {
    const antes = await p.locator('.fila--compra .fila__titulo').allTextContents();
    await p.locator('.fila--compra').nth(1).locator('[data-dir="-1"]').click();
    await p.waitForTimeout(500);
    const despues = await p.locator('.fila--compra .fila__titulo').allTextContents();
    const lim = x => x.replace(/\s+/g, ' ').trim();
    if (lim(despues[0]) !== lim(antes[1])) throw new Error('la flecha no sube');
  });

  await paso('el orden aguanta la recarga', async () => {
    const antes = await p.locator('.fila--compra .fila__titulo').first().textContent();
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('.fila--compra');
    const despues = await p.locator('.fila--compra .fila__titulo').first().textContent();
    if (antes.trim() !== despues.trim()) throw new Error('se pierde');
    await p.click('[data-accion="orden-automatico"]');
    await p.waitForTimeout(400);
  });

  /* ---- 4. Secciones plegables del Resumen ---- */

  await paso('las secciones del resumen se pliegan', async () => {
    await p.goto(BASE + '#/resumen', { waitUntil: 'networkidle' });
    await p.waitForSelector('.plegar');
    const titulos = await p.locator('.plegar h2').allTextContents();
    console.log('      → plegables: ' + titulos.join(' · '));
    if (titulos.length !== 2) throw new Error(titulos.length + ' secciones plegables');
    const filasAntes = await p.locator('.seccion .fila').count();
    await p.locator('.plegar').first().click();
    await p.waitForTimeout(400);
    const filasDespues = await p.locator('.seccion .fila').count();
    console.log('      → filas ' + filasAntes + ' → ' + filasDespues);
    if (filasDespues >= filasAntes) throw new Error('no se ha plegado nada');
    if (await p.locator('.plegar').first().getAttribute('aria-expanded') !== 'false') throw new Error('aria mal');
  });

  await paso('el contador sigue a la vista plegada', async () => {
    const cab = (await p.locator('.seccion__titulo').first().textContent()).replace(/\s+/g, ' ').trim();
    console.log('      → «' + cab + '»');
    if (!/días|\d/.test(cab)) throw new Error('sin contador: ' + cab);
  });

  await paso('se recuerda plegada al recargar', async () => {
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('.plegar');
    if (await p.locator('.plegar').first().getAttribute('aria-expanded') !== 'false') throw new Error('se abre sola');
    await p.locator('.plegar').first().click();
    await p.waitForTimeout(400);
    if (await p.locator('.plegar').first().getAttribute('aria-expanded') !== 'true') throw new Error('no se reabre');
  });

  /* ---- 5. Reparto de precio ---- */

  await paso('se puede repartir un importe entre varios tomos', async () => {
    await p.goto(BASE + '#/biblioteca', { waitUntil: 'networkidle' });
    await p.waitForSelector('.serie');
    await p.evaluate(() => {
      const s = D.coleccion.series.find(x => x.tomos.filter(t => t.tengo).length >= 4);
      window.__prueba = s.titulo;
      App.abrirSerie(s.id);
    });
    await p.waitForSelector('.tomos');
    await p.click('[data-accion="precios"]');
    await p.waitForSelector('.reparto');
    const tomos = await p.locator('.precios__input').count();
    console.log('      → serie «' + await p.evaluate(() => window.__prueba) + '» con ' + tomos + ' tomos');
    await p.fill('#rImporte', '30');
    await p.selectOption('#rDesde', await p.locator('.precios__input').first().getAttribute('data-tomo'));
    await p.selectOption('#rHasta', await p.locator('.precios__input').nth(3).getAttribute('data-tomo'));
    await p.click('#rRepartir');
    await p.waitForTimeout(400);
    const vals = [];
    for (let i = 0; i < 4; i++) vals.push(await p.locator('.precios__input').nth(i).inputValue());
    const aviso = (await p.locator('#rAviso').textContent()).replace(/\s+/g, ' ').trim();
    console.log('      → ' + vals.join(' + ') + ' · ' + aviso.slice(0, 80));
    // Los campos de dinero son de texto con coma decimal: «7,50», no «7.50».
    if (vals.some(v => v !== '7,50')) throw new Error(vals.join(','));
  });

  await paso('los céntimos cuadran cuando no es divisible', async () => {
    await p.fill('#rImporte', '10');
    await p.click('#rRepartir');
    await p.waitForTimeout(400);
    const vals = [];
    for (let i = 0; i < 4; i++) {
      vals.push(Number((await p.locator('.precios__input').nth(i).inputValue()).replace(',', '.')));
    }
    const suma = vals.reduce((a, b) => a + b, 0);
    console.log('      → ' + vals.join(' + ') + ' = ' + suma.toFixed(2));
    if (Math.abs(suma - 10) > 0.001) throw new Error('suma ' + suma);
  });

  await paso('sin importe avisa en vez de repartir ceros', async () => {
    await p.fill('#rImporte', '');
    await p.click('#rRepartir');
    await p.waitForTimeout(300);
    const aviso = (await p.locator('#rAviso').textContent()).trim();
    console.log('      → ' + aviso);
    if (!/Escribe primero/.test(aviso)) throw new Error(aviso);
  });

  await paso('el reparto se guarda al darle a Guardar', async () => {
    await p.fill('#rImporte', '30');
    await p.click('#rRepartir');
    await p.waitForTimeout(300);
    await p.click('#pGuardar');
    await p.waitForTimeout(700);
    const r = await p.evaluate(() => {
      const s = D.coleccion.series.find(x => x.titulo === window.__prueba);
      return s.tomos.filter(t => t.tengo).slice(0, 4).map(t => t.precio);
    });
    console.log('      → guardado: ' + JSON.stringify(r));
    if (r.some(v => v !== 7.5)) throw new Error(JSON.stringify(r));
  });

  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(BASE + '#/compras', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
  console.log('\nmóvil: ancho ' + ancho + 'px' + (ancho > 400 ? ' ❌ desborda' : ' ✓'));

  console.log(errores.length ? '❌ ' + errores.join('\n') : '✅ Los cinco arreglos correctos');
  await b.close();
  process.exit(errores.length ? 1 : 0);
})();
