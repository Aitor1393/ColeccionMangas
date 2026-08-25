const { chromium } = require('playwright');
const { CHROMIUM, CAPTURAS } = require('./entorno.js');

const BASE = 'http://localhost:8777/';
const CLAVE = 'unaClaveDePrueba9!';
const TOKEN = 'TOKEN-FALSO-SOLO-PARA-LAS-PRUEBAS-1234567890';
(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await b.newPage({ viewport: { width: 1280, height: 980 } });
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCIÓN: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errores.push('CONSOLA: ' + m.text()); });
  const paso = async (n, fn) => { try { await fn(); console.log('✓ ' + n); } catch (e) { console.log('✗ ' + n + ' → ' + e.message); errores.push(n); } };

  // Interceptamos GitHub: no queremos tocar la API de verdad
  await p.route('https://api.github.com/**', route => {
    const auth = route.request().headers()['authorization'] || '';
    if (auth !== 'Bearer ' + TOKEN) {
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Bad credentials' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ full_name: 'Aitor1393/ColeccionMangas', permissions: { push: true } }) });
  });

  await p.goto(BASE + '#/ajustes', { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE + '#/ajustes', { waitUntil: 'networkidle' });
  await p.waitForSelector('#ghToken');

  await paso('Web Crypto disponible', async () => {
    const ok = await p.evaluate(() => C.disponible());
    if (!ok) throw new Error('no hay contexto seguro');
  });

  await paso('exige que las contraseñas coincidan', async () => {
    await p.fill('#ghToken', TOKEN);
    await p.fill('#ghClave', CLAVE);
    await p.fill('#ghClave2', 'otraCosa123');
    await p.click('[data-accion="guardar-gh"]');
    await p.waitForTimeout(400);
    const nota = await p.locator('.nota').last().textContent();
    if (!nota.includes('no coinciden')) throw new Error('nota: ' + nota);
  });

  await paso('exige una contraseña mínimamente larga', async () => {
    await p.fill('#ghClave', 'corta');
    await p.fill('#ghClave2', 'corta');
    await p.click('[data-accion="guardar-gh"]');
    await p.waitForTimeout(400);
    const nota = await p.locator('.nota').last().textContent();
    if (!nota.includes('8 caracteres')) throw new Error('nota: ' + nota);
  });

  await paso('guarda el token cifrado y comprueba la conexión', async () => {
    await p.fill('#ghToken', TOKEN);
    await p.fill('#ghClave', CLAVE);
    await p.fill('#ghClave2', CLAVE);
    await p.click('[data-accion="guardar-gh"]');
    await p.waitForTimeout(2500);
    const notas = await p.locator('.nota').allTextContents();
    if (!notas.some(n => n.includes('Conectado'))) throw new Error('notas: ' + notas.join(' | '));
  });

  await paso('EL TOKEN NO ESTÁ EN CLARO en localStorage', async () => {
    const bruto = await p.evaluate(() => localStorage.getItem('cm:github'));
    if (bruto.includes(TOKEN) || bruto.includes('github_pat')) throw new Error('¡el token es legible!');
    const g = JSON.parse(bruto);
    console.log('      → guardado: ' + Object.keys(g).join(', '));
    console.log('      → cifrado:  sal=' + g.cifrado.sal.slice(0,12) + '… iv=' + g.cifrado.iv.slice(0,8) + '… datos=' + g.cifrado.datos.slice(0,16) + '…');
    if (!g.cifrado.sal || !g.cifrado.iv || !g.cifrado.datos) throw new Error('falta algo del paquete');
  });

  await paso('tras recargar queda bloqueado', async () => {
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForTimeout(500);
    const est = await p.evaluate(() => ({ config: GH.configurado(), bloq: GH.bloqueado() }));
    if (!est.config || !est.bloq) throw new Error(JSON.stringify(est));
  });

  await paso('publicar pide la contraseña', async () => {
    await p.evaluate(() => { D.anadirSerie({ titulo: 'Serie para publicar' }); App.render(); });
    await p.waitForTimeout(300);
    await p.click('#btnPublicarAviso');
    await p.waitForSelector('#pClave');
  });

  await paso('con contraseña incorrecta NO publica', async () => {
    await p.fill('#pClave', 'contraseñaEquivocada');
    await p.click('#btnCommit');
    await p.waitForTimeout(2500);
    const r = await p.locator('#pResultado').textContent();
    if (!r.includes('Contraseña incorrecta')) throw new Error('resultado: ' + r.slice(0, 80));
    console.log('      → ' + r.replace(/\s+/g,' ').trim().slice(0, 70));
  });

  await paso('con la contraseña correcta sí publica', async () => {
    await p.fill('#pClave', CLAVE);
    await p.click('#btnCommit');
    await p.waitForTimeout(3000);
    const r = await p.locator('#pResultado').textContent();
    if (!r.includes('Publicado')) throw new Error('resultado: ' + r.slice(0, 100));
  });

  await paso('"Bloquear ahora" vuelve a exigirla', async () => {
    await p.keyboard.press('Escape');
    await p.goto(BASE + '#/ajustes', { waitUntil: 'networkidle' });
    await p.waitForTimeout(400);
    await p.click('[data-accion="bloquear-gh"]');
    await p.waitForTimeout(400);
    const bloq = await p.evaluate(() => GH.bloqueado());
    if (!bloq) throw new Error('sigue desbloqueado');
  });

  await p.screenshot({ path: CAPTURAS + '15-clave.png', fullPage: true });
  console.log('\n' + (errores.length ? '❌ ' + errores.join('\n') : '✅ Contraseña correcta de punta a punta'));
  await b.close();
  process.exit(errores.length ? 1 : 0);
})();
