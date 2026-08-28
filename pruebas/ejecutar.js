#!/usr/bin/env node
/* ============================================================
   ejecutar.js — corre la batería y resume
   ------------------------------------------------------------
       node pruebas/ejecutar.js              todas
       node pruebas/ejecutar.js ranking      solo las que contengan «ranking»
       BASE=http://localhost:8778/ node …    contra otro sitio

   Cada prueba se ejecuta por separado —así una que se cuelgue no se lleva a las
   demás— y de su salida solo se enseña la última línea, salvo que falle: ahí se
   enseña entera, que es cuando hace falta.
   ============================================================ */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const DIR = __dirname;
const RAIZ = path.dirname(DIR);
const BASE = process.env.BASE || 'http://localhost:8777/';
const TIEMPO_MAX = Number(process.env.TIEMPO_MAX || 300000);

// El orden importa poco, pero puestas de más rápida a más lenta se ve antes si
// algo básico se ha roto.
const ORDEN = ['humo', 'tomocero', 'lectura', 'filtros', 'abandonadas', 'titulos',
  'resumenorden', 'compras', 'precios', 'coma', 'arreglos', 'calendario', 'picker',
  'clave', 'frescura', 'portadas', 'ranking', 'relectura', 'capitulos', 'deseados', 'publicar'];

const filtro = process.argv[2];
const todas = fs.readdirSync(DIR)
  .filter(f => f.endsWith('.js') && !['ejecutar.js', 'entorno.js', 'puente-wikipedia.js'].includes(f))
  .map(f => f.replace('.js', ''));
todas.sort((a, b) => {
  const ia = ORDEN.indexOf(a), ib = ORDEN.indexOf(b);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
});
const elegidas = filtro ? todas.filter(t => t.includes(filtro)) : todas;

if (!elegidas.length) {
  console.error(`No hay ninguna prueba que contenga «${filtro}». Hay: ${todas.join(', ')}`);
  process.exit(2);
}

/** ¿Está el sitio servido? Sin esto, las 19 fallan igual y no se sabe por qué. */
function comprobarServidor() {
  return new Promise(res => {
    const p = http.get(BASE, r => { r.resume(); res(r.statusCode === 200); });
    p.on('error', () => res(false));
    p.setTimeout(3000, () => { p.destroy(); res(false); });
  });
}

(async () => {
  if (!await comprobarServidor()) {
    console.error(`\n✗ No hay nada sirviendo en ${BASE}\n`);
    console.error(`  Arráncalo desde la raíz del repo:\n      cd ${RAIZ} && python3 -m http.server 8777\n`);
    process.exit(2);
  }

  console.log(`Probando ${BASE} · ${elegidas.length} de ${todas.length} pruebas\n`);
  const fallos = [];
  const empezado = Date.now();

  for (const nombre of elegidas) {
    process.stdout.write('  ' + nombre.padEnd(16));
    const t = Date.now();
    const r = spawnSync('node', [path.join(DIR, nombre + '.js')], {
      encoding: 'utf-8', timeout: TIEMPO_MAX, env: { ...process.env, BASE },
    });
    const seg = ((Date.now() - t) / 1000).toFixed(0) + 's';
    const salida = ((r.stdout || '') + (r.stderr || '')).trimEnd();
    const ultima = salida.split('\n').filter(l => l.trim()).pop() || '(sin salida)';

    if (r.status === 0) {
      console.log(`✓ ${ultima.slice(0, 60).padEnd(62)} ${seg}`);
    } else {
      console.log(`✗ ${(r.signal === 'SIGTERM' ? 'SE HA COLGADO' : ultima.slice(0, 60)).padEnd(62)} ${seg}`);
      fallos.push({ nombre, salida });
    }
  }

  const total = ((Date.now() - empezado) / 1000 / 60).toFixed(1);
  if (fallos.length) {
    for (const f of fallos) {
      console.log(`\n${'─'.repeat(70)}\n${f.nombre}\n${'─'.repeat(70)}\n${f.salida}`);
    }
    console.log(`\n✗ ${fallos.length} ${fallos.length === 1 ? 'falla' : 'fallan'} de ${elegidas.length}: ` +
      `${fallos.map(f => f.nombre).join(', ')}  (${total} min)`);
    process.exit(1);
  }
  console.log(elegidas.length === 1
    ? `\n✓ Pasa  (${total} min)`
    : `\n✓ Las ${elegidas.length} pasan  (${total} min)`);
})();
