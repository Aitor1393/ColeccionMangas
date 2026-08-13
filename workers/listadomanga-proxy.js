/**
 * Proxy mínimo para leer fichas de ListadoManga desde el navegador.
 *
 * ListadoManga no envía cabeceras CORS, así que una web estática no puede
 * consultarlo directamente. Este Worker hace la petición desde el servidor y
 * devuelve la página con las cabeceras que el navegador necesita.
 *
 * Desplegarlo (gratis, plan Free de Cloudflare):
 *   1. dash.cloudflare.com → Workers & Pages → Create → Worker
 *   2. Pega este fichero, cambia ORIGENES si tu web está en otra URL, y Deploy
 *   3. Copia la URL que te dan (https://algo.tu-cuenta.workers.dev) en
 *      Ajustes → «Proxy para leer fichas» de tu colección
 *
 * Solo deja pasar coleccion.php?id=<número> de listadomanga.es: no es un proxy
 * abierto que cualquiera pueda usar para otras cosas.
 */

const ORIGENES = [
  'https://aitor1393.github.io',
  'http://localhost:8000',
  'http://localhost:8777',
];

// Cachea una hora en el borde: las fichas cambian como mucho a diario, y así
// se reducen las peticiones que le llegan a ListadoManga.
const CACHE_SEGUNDOS = 3600;

const AGENTE =
  'ColeccionMangas/1.0 (+https://github.com/Aitor1393/ColeccionMangas; uso personal)';

function cors(origen) {
  return {
    'Access-Control-Allow-Origin': ORIGENES.includes(origen) ? origen : ORIGENES[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request) {
    const origen = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origen) });
    }
    if (request.method !== 'GET') {
      return new Response('Solo GET', { status: 405, headers: cors(origen) });
    }

    const id = new URL(request.url).searchParams.get('id');
    if (!/^\d{1,7}$/.test(id || '')) {
      return new Response('Falta el parámetro id (numérico)', {
        status: 400,
        headers: cors(origen),
      });
    }

    const destino = `https://www.listadomanga.es/coleccion.php?id=${id}`;

    let respuesta;
    try {
      respuesta = await fetch(destino, {
        headers: { 'User-Agent': AGENTE, 'Accept-Language': 'es-ES,es;q=0.9' },
        cf: { cacheTtl: CACHE_SEGUNDOS, cacheEverything: true },
      });
    } catch (e) {
      return new Response(`No se pudo llegar a ListadoManga: ${e.message}`, {
        status: 502,
        headers: cors(origen),
      });
    }

    if (!respuesta.ok) {
      return new Response(`ListadoManga respondió ${respuesta.status}`, {
        status: respuesta.status,
        headers: cors(origen),
      });
    }

    return new Response(await respuesta.text(), {
      headers: {
        ...cors(origen),
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_SEGUNDOS}`,
      },
    });
  },
};
