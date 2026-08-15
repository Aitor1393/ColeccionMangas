/* ============================================================
   wikipedia.js — saca de Wikipedia qué capítulos trae cada tomo
   ------------------------------------------------------------
   Ese dato no está en ListadoManga (su ficha no menciona los
   capítulos ni una vez) ni en las webs de las editoriales
   españolas. Donde sí está, cuando alguien se ha molestado en
   rellenarlo, es en las fichas de Wikipedia: la plantilla
   {{Graphic novel list}} lleva un campo ChapterList con los
   capítulos de cada tomo.

   Su API acepta CORS con origin=*, así que esto va directo desde
   el navegador y no necesita el proxy que sí hace falta para
   ListadoManga.

   Dos avisos sobre lo que devuelve:
   · Los tomos son los de la edición ORIGINAL. Si la tuya es una
     3 en 1 o una kanzenban, los números no se corresponden; por
     eso quien llama compara el total con el de tu edición antes
     de ofrecer nada.
   · El campo puede estar presente y vacío —le pasa a bastantes
     series—. Eso no es un error, es que nadie lo ha rellenado.
   ============================================================ */
(function (global) {
  'use strict';

  var WK = {};

  var WIKIS = ['es', 'en'];
  var LIMITE_CANDIDATAS = 6;

  function api(wiki, params) {
    params.format = 'json';
    params.formatversion = '2';
    params.origin = '*';
    var q = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    return fetch('https://' + wiki + '.wikipedia.org/w/api.php?' + q)
      .then(function (r) {
        if (!r.ok) throw new Error('Wikipedia respondió ' + r.status);
        return r.json();
      });
  }

  /* ---------- Lectura del wikitexto ---------- */

  /**
   * Recorta un bloque de tomo hasta donde acaba su plantilla.
   *
   * No vale cortar por el primer «}}» a principio de línea: ese suele ser el
   * cierre de la lista de capítulos, no el de la plantilla, y detrás vienen
   * más campos. El cierre bueno es el que NO va seguido de otro «| Campo =».
   */
  function bloqueDe(parte) {
    var i = 0;
    while (true) {
      var j = parte.indexOf('\n}}', i);
      if (j === -1) return parte;
      if (!/^\s*\|\s*\w+\s*=/.test(parte.slice(j + 3))) return parte.slice(0, j);
      i = j + 3;
    }
  }

  /** Cuántos capítulos hay en un campo ChapterList, y por cuál empieza. */
  function contar(cuerpo) {
    var numerada = /\{\{Numbered list\s*\|\s*start\s*=\s*([0-9]+)([\s\S]*)/.exec(cuerpo);
    if (numerada) {
      return { cuantos: (numerada[2].match(/^\s*\|/gm) || []).length, primero: Number(numerada[1]) };
    }
    // «*Battle 1: …», «*Capítulo 12. …»: viñetas, y el primer número que salga.
    var vinetas = cuerpo.match(/^\s*\*.*$/gm) || [];
    var primero = null;
    for (var v = 0; v < vinetas.length && primero === null; v++) {
      var n = /(\d+)/.exec(vinetas[v]);
      if (n) primero = Number(n[1]);
    }
    return { cuantos: vinetas.length, primero: primero };
  }

  /**
   * Saca los tomos de un wikitexto.
   *
   * Cada tomo es un bloque {{Graphic novel list}} con su VolumeNumber y sus
   * capítulos. Ojo: cuando la lista es larga el artículo la parte en columnas
   * —ChapterList y ChapterListCol2—, así que hay que sumarlas todas o se
   * pierde media lista.
   *
   * @returns {{tomos: Object, inicio: number, total: number, capitulos: number}}
   */
  WK.leerTomos = function (wikitexto) {
    var tomos = {};
    var inicio = null;
    var partes = String(wikitexto || '').split('{{Graphic novel list');

    for (var i = 1; i < partes.length; i++) {
      var bloque = bloqueDe(partes[i]);
      var vol = /\|\s*VolumeNumber\s*=\s*([0-9]+)/.exec(bloque);
      if (!vol) continue;

      var campo = /\|\s*ChapterList\w*\s*=([\s\S]*?)(?=\n\s*\|\s*\w+\s*=|$)/g;
      var cuantos = 0, m;
      while ((m = campo.exec(bloque))) {
        var r = contar(m[1]);
        cuantos += r.cuantos;
        if (inicio === null && r.primero !== null) inicio = r.primero;
      }

      if (cuantos) tomos[Number(vol[1])] = cuantos;
    }

    var numeros = Object.keys(tomos);
    return {
      tomos: tomos,
      inicio: inicio === null ? 1 : inicio,
      total: numeros.length,
      capitulos: numeros.reduce(function (n, k) { return n + tomos[k]; }, 0)
    };
  };

  /* ---------- Búsqueda ---------- */

  /** Para comparar títulos: sin acentos, sin signos, en minúsculas. */
  function clave(texto) {
    return String(texto || '').toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
  }

  /**
   * Páginas candidatas para una serie, en los dos idiomas.
   *
   * El buscador de Wikipedia devuelve lo que le suena, y lo que le suena a
   * «Solo Leveling chapters» incluye «List of Hunter × Hunter chapters». Por eso
   * solo pasa la página cuyo nombre contenga el de la serie: más vale no
   * encontrar nada que rellenar una serie con los capítulos de otra.
   */
  function candidatas(titulo) {
    var k = clave(titulo);
    var busquedas = WIKIS.map(function (wiki) {
      var q = wiki === 'es'
        ? 'Anexo lista de capítulos de ' + titulo
        : titulo + ' chapters manga';
      return api(wiki, { action: 'query', list: 'search', srsearch: q, srlimit: 4 })
        .then(function (d) {
          return ((d.query && d.query.search) || []).map(function (r) {
            return { wiki: wiki, pagina: r.title };
          });
        })
        .catch(function () { return []; });
    });
    return Promise.all(busquedas).then(function (listas) {
      var todas = [].concat.apply([], listas).filter(function (p) {
        return k && clave(p.pagina).indexOf(k) !== -1;
      });
      // Primero lo que se llame explícitamente «lista de capítulos»: si existe,
      // es la página buena, y la del artículo general suele venir vacía.
      return todas.sort(function (a, b) {
        return prioridad(b.pagina) - prioridad(a.pagina);
      }).slice(0, LIMITE_CANDIDATAS);
    });
  }

  function prioridad(pagina) {
    return /lista de cap[íi]tulos|list of .* chapters/i.test(pagina) ? 1 : 0;
  }

  /* ---------- API pública ---------- */

  /** Lee una página candidata. null si no trae capítulos. */
  function leerPagina(p) {
    return api(p.wiki, { action: 'parse', page: p.pagina, prop: 'wikitext', redirects: 1 })
      .then(function (d) {
        var leido = WK.leerTomos((d.parse && d.parse.wikitext) || '');
        if (!leido.total) return null;
        return {
          wiki: p.wiki, pagina: (d.parse && d.parse.title) || p.pagina,
          total: leido.total, capitulos: leido.capitulos,
          inicio: leido.inicio, tomos: leido.tomos
        };
      })
      .catch(function () { return null; });
  }

  /**
   * Busca dónde están los capítulos de una serie y devuelve la primera página
   * que de verdad los traiga.
   *
   * Las candidatas se prueban de una en una y se para en cuanto una sirve. Van
   * ordenadas con las «lista de capítulos de…» delante, que son las buenas, así
   * que lo normal es acertar a la primera y hacer una sola petición. Wikipedia
   * corta el paso a quien pregunta mucho de golpe, y tampoco hay motivo para
   * pedirle seis páginas cuando vale una.
   *
   * @returns {Promise<{wiki, pagina, total, capitulos, inicio, tomos}|null>}
   */
  WK.buscarCapitulos = function (titulo) {
    return candidatas(titulo).then(function (paginas) {
      return paginas.reduce(function (cadena, p) {
        return cadena.then(function (hallado) {
          return hallado || leerPagina(p);
        });
      }, Promise.resolve(null));
    });
  };

  WK.url = function (r) {
    return 'https://' + r.wiki + '.wikipedia.org/wiki/' + encodeURIComponent(r.pagina.replace(/ /g, '_'));
  };

  global.WK = WK;
})(window);
