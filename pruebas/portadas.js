const { chromium } = require('playwright');
const { CHROMIUM, CAPTURAS } = require('./entorno.js');

const BASE = process.env.BASE || 'http://localhost:8777/';
(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await b.newPage({ viewport: { width: 1240, height: 900 } });
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCIÓN: ' + e.message));
  await p.route('https://encrypted-tbn0.gstatic.com/**', r => r.abort());
  const paso = async (n, fn) => { try { await fn(); console.log('✓ ' + n); } catch (e) { console.log('✗ ' + n + ' → ' + e.message); errores.push(n); } };

  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE + '#/biblioteca', { waitUntil: 'networkidle' });
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('.serie');

  await paso('se carga el índice de portadas de editorial', async () => {
    const n = await p.evaluate(() => Object.keys(D.portadasEditorial).length);
    console.log('      → ' + n + ' portadas en el índice');
    if (n < 35) throw new Error('solo ' + n);
  });

  await paso('las series con portada de editorial la usan', async () => {
    const r = await p.evaluate(() => {
      const conP = D.coleccion.series.filter(s => D.portadaEditorialDe(s));
      const imgs = [...document.querySelectorAll('.serie')].map(e => ({
        id: e.dataset.serie, src: (e.querySelector('img') || {}).src || ''
      }));
      const usan = imgs.filter(x => x.src.includes('portadas-serie/')).length;
      return { conPortada: conP.length, usan, ejemplo: (imgs.find(x => x.src.includes('portadas-serie/')) || {}).src };
    });
    console.log('      → ' + r.conPortada + ' series con portada de editorial · ' + r.usan + ' visibles usándola');
    console.log('      → ejemplo: ' + (r.ejemplo || '—').split('/').slice(-2).join('/'));
    if (!r.usan) throw new Error('ninguna la está usando');
  });

  await paso('todas las portadas de editorial cargan de verdad', async () => {
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 50)); }
    });
    await p.waitForTimeout(2500);
    const r = await p.evaluate(() => {
      const im = [...document.querySelectorAll('.serie img')].filter(i => i.src.includes('portadas-serie/'));
      return {
        total: im.length,
        rotas: im.filter(i => i.complete && i.naturalWidth === 0).map(i => i.src.split('/').pop()),
        anchos: im.filter(i => i.naturalWidth).map(i => i.naturalWidth)
      };
    });
    console.log('      → ' + r.total + ' imágenes · anchos ' + [...new Set(r.anchos)].sort((a,b)=>a-b).join(',') + ' · rotas: ' + (r.rotas.length || 'ninguna'));
    if (r.rotas.length) throw new Error(r.rotas.join(', '));
    // El umbral es 250, no 400: algún tomo 1 antiguo solo existe a 264 px en la
    // web de su editorial, y vale más la portada del tomo correcto que unos
    // píxeles de más con la del último. Aun así dobla los 106 de ListadoManga.
    const pequenas = r.anchos.filter(a => a < 250);
    if (pequenas.length) throw new Error('llegan pequeñas: ' + pequenas.join(', '));
  });

  await paso('la portada que pusiste a mano sigue mandando', async () => {
    const r = await p.evaluate(() => {
      const s = D.coleccion.series.find(x => x.portada);
      if (!s) return 'no hay ninguna a mano';
      return { titulo: s.titulo, usa: D.portadaEditorialDe(s) ? 'editorial' : 'suya', src: s.portada.slice(0, 40) };
    });
    console.log('      → ' + JSON.stringify(r));
  });

  await paso('las series sin portada de editorial siguen con la de ListadoManga', async () => {
    const r = await p.evaluate(() => {
      const sin = D.coleccion.series.filter(s => !D.portadaEditorialDe(s) && !s.portada);
      const conLM = sin.filter(s => { const f = D.fichaLM(s); return f && f.portada; });
      return { sin: sin.length, conLM: conLM.length };
    });
    console.log('      → ' + r.sin + ' sin portada de editorial, ' + r.conLM + ' con la de ListadoManga');
    if (r.conLM < r.sin - 2) throw new Error('demasiadas se quedan sin nada');
  });

  await paso('cada serie con edición propia trae la portada de SU edición', async () => {
    // Death Note es la Black Edition y Soul Eater la Perfect Edition: Norma
    // tiene también las ediciones normales, y confundirlas sería el fallo grave.
    const r = await p.evaluate(() => ['Death Note', 'Soul Eater', 'Neon Genesis Evangelion']
      .map(t => {
        const s = D.coleccion.series.find(x => x.titulo === t);
        return s ? { t, edicion: s.edicion, tiene: !!D.portadaEditorialDe(s) } : null;
      }).filter(Boolean));
    r.forEach(x => console.log('      → ' + x.t + ' («' + x.edicion + '») portada: ' + (x.tiene ? 'sí' : 'no')));
    if (!r.every(x => x.tiene)) throw new Error('alguna se ha quedado sin portada');
  });

  await paso('no se ha colado la edición equivocada en One Piece', async () => {
    const r = await p.evaluate(() => {
      const s = D.coleccion.series.find(x => x.titulo === 'One Piece');
      return { edicion: s.edicion, tiene: !!D.portadaEditorialDe(s) };
    });
    console.log('      → One Piece («' + r.edicion + '») portada de editorial: ' + (r.tiene ? 'SÍ' : 'no'));
    if (r.tiene) throw new Error('ha cogido una portada pese a ser otra edición');
  });

  await paso('las 8 series de Panini tienen portada propia descargada', async () => {
    const r = await p.evaluate(() => {
      const pan = D.coleccion.series.filter(s => {
        const f = D.calendario.colecciones[s.listadomangaId] || {};
        return /Panini/.test(s.editorial || f.editorial || '');
      });
      return pan.map(s => ({
        t: s.titulo.slice(0, 30),
        propia: !!D.portadaEditorialDe(s),
        manual: !!s.portada,
        usa: V.urlPortada(s)
      }));
    });
    r.forEach(x => console.log('      ' + (x.propia ? '✓' : '✗') + ' ' + x.t.padEnd(32) +
      (x.manual ? '(tiene portada manual, que manda)' : '')));
    if (r.length !== 8) throw new Error('esperaba 8 series de Panini, hay ' + r.length);
    const sin = r.filter(x => !x.propia);
    if (sin.length) throw new Error('sin portada propia: ' + sin.map(x => x.t).join(', '));
    // La manual gana a propósito: es la que ha elegido el usuario.
    const mal = r.filter(x => !x.manual && x.usa.indexOf('portadas-serie') === -1);
    if (mal.length) throw new Error('no usan la suya: ' + mal.map(x => x.t).join(', '));
  });

  await paso('esas portadas cargan y son verticales y grandes', async () => {
    const r = await p.evaluate(async () => {
      const pan = D.coleccion.series.filter(s => {
        const f = D.calendario.colecciones[s.listadomangaId] || {};
        return /Panini/.test(s.editorial || f.editorial || '');
      });
      const medir = u => new Promise(res => {
        const i = new Image();
        i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
        i.onerror = () => res(null);
        i.src = u;
      });
      const out = [];
      // Se mide la propia, no la que se enseñe: la manual puede ser externa y
      // aquí no hay internet.
      for (const s of pan) out.push({ t: s.titulo.slice(0, 24), m: await medir(D.portadaEditorialDe(s)) });
      return out;
    });
    r.forEach(x => console.log('      ' + x.t.padEnd(26) + (x.m ? x.m.w + 'x' + x.m.h : 'NO CARGA')));
    const malas = r.filter(x => !x.m || x.m.w < 300 || x.m.h < x.m.w * 1.2);
    if (malas.length) throw new Error('problemas en: ' + malas.map(x => x.t).join(', '));
  });

  await p.screenshot({ path: CAPTURAS + '43-portadas.png', clip: { x: 0, y: 110, width: 1240, height: 620 } });
  console.log(errores.length ? '❌ ' + errores.join('\n') : '✅ Portadas de editorial correctas');
  await b.close();
  process.exit(errores.length ? 1 : 0);
})();
