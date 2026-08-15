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
  var LIMITE_TROZOS = 8;

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

    return WK.resumir(tomos, inicio);
  };

  /** Cierra un conjunto de tomos: totales y si la lista está entera. */
  WK.resumir = function (tomos, inicio) {
    var numeros = Object.keys(tomos).map(Number).sort(function (a, b) { return a - b; });
    return {
      tomos: tomos,
      inicio: inicio === null || inicio === undefined ? 1 : inicio,
      total: numeros.length,
      primerTomo: numeros.length ? numeros[0] : 0,
      // Una lista partida en varios artículos deja fragmentos sueltos —los
      // tomos 49 al 74 de Bleach, por ejemplo—. Si no empieza en 1 o le faltan
      // números por medio, no vale para calcular nada.
      completa: !!numeros.length && numeros[0] === 1 &&
        numeros[numeros.length - 1] === numeros.length,
      capitulos: numeros.reduce(function (n, k) { return n + tomos[k]; }, 0)
    };
  };

  /**
   * Otras páginas en las que puede continuar una lista larga.
   *
   * Las series largas no caben en un artículo y Wikipedia las parte en
   * «List of Bleach chapters (1–187)» y compañía. Unas veces el artículo madre
   * las transcluye —{{:Página}}— y otras solo las enlaza; se recogen las dos.
   */
  function subpaginas(pagina, wikitexto) {
    var base = String(pagina).replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
    var vistas = {};
    var fuera = [];

    // Transcluidas: son contenido de este mismo artículo, se siguen sin más.
    // El nombre puede no parecerse en nada al de la página —«List of Bleach
    // volumes» transcluye «List of Bleach chapters (1–187)»—, así que aquí no
    // vale filtrar por parecido.
    // Enlazadas: esas sí hay que acotarlas al mismo artículo con un tramo
    // entre paréntesis, o acabaríamos leyendo media Wikipedia.
    [
      { re: /\{\{:([^|{}\n]+)\}\}/g, propias: true },
      { re: /\[\[([^\]|#\n]+)(?:\||\]\])/g, propias: false }
    ].forEach(function (patron) {
      var m;
      while ((m = patron.re.exec(wikitexto))) {
        var nombre = m[1].trim();
        var k = nombre.toLowerCase();
        if (k === base || vistas[k]) continue;
        if (!patron.propias && k.indexOf(base + ' (') !== 0) continue;
        vistas[k] = true;
        fuera.push(nombre);
      }
    });
    return fuera.slice(0, LIMITE_TROZOS);
  }

  /* ---------- Búsqueda ---------- */

  /** Para comparar títulos: sin acentos, sin signos, en minúsculas. */
  function clave(texto) {
    return String(texto || '').toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
  }

  /**
   * El nombre de la obra dentro del título de una página de lista:
   * «List of Bleach volumes» → «bleach».
   */
  function nucleo(pagina) {
    return clave(String(pagina)
      .replace(/^Anexo:\s*/i, '')
      .replace(/^Lista de cap[íi]tulos de\s+/i, '')
      .replace(/^Lists? of\s+/i, '')
      .replace(/\s*\([^)]*\)\s*$/, '')
      .replace(/\s+(chapters|volumes|cap[íi]tulos|tomos)$/i, ''));
  }

  /** ¿La página es un trozo de una lista, «… (1–198)»? */
  function esTrozo(pagina) {
    return /\([^)]*\d[^)]*\)\s*$/.test(pagina);
  }

  /**
   * ¿Esta página habla de ESTA serie?
   *
   * No basta con que el nombre aparezca dentro: «List of Fairy Tail: 100 Years
   * Quest chapters» contiene «Fairy Tail» y es la secuela. Tiene que ser el
   * mismo nombre, o el principio del tuyo, que en español suelen llevar
   * subtítulo pegado —«Tomodachi Game, Los juegos de la amistad»—.
   */
  function esDeLaSerie(pagina, titulo) {
    var n = nucleo(pagina), k = clave(titulo);
    return !!n && (n === k || k.indexOf(n) === 0);
  }

  /**
   * Páginas candidatas para una serie, en los dos idiomas.
   *
   * El buscador de Wikipedia devuelve lo que le suena, y lo que le suena a
   * «Solo Leveling chapters» incluye «List of Hunter × Hunter chapters». Más
   * vale no encontrar nada que rellenar una serie con los capítulos de otra.
   */
  function candidatas(titulo) {
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
    // Wikipedia bautiza estas páginas siempre igual, así que se prueban por su
    // nombre además de buscarlas: el buscador no siempre las saca —para Fairy
    // Tail devolvía antes la serie de televisión y la secuela—, y probar un
    // nombre que quizá no exista no cuesta ninguna búsqueda.
    var directas = [
      { wiki: 'en', pagina: 'List of ' + titulo + ' chapters' },
      { wiki: 'en', pagina: 'List of ' + titulo + ' volumes' },
      { wiki: 'es', pagina: 'Anexo:Lista de capítulos de ' + titulo }
    ];

    return Promise.all(busquedas).then(function (listas) {
      var todas = directas.concat([].concat.apply([], listas)).filter(function (p) {
        return esDeLaSerie(p.pagina, titulo);
      });
      var vistas = {};
      todas = todas.filter(function (p) {
        var k = p.wiki + ':' + p.pagina.toLowerCase();
        if (vistas[k]) return false;
        vistas[k] = true;
        return true;
      });
      return todas.sort(function (a, b) {
        return prioridad(b.pagina) - prioridad(a.pagina);
      }).slice(0, LIMITE_CANDIDATAS);
    });
  }

  /**
   * Primero las que se llamen «lista de capítulos», que son las que traen el
   * dato; y de esas, antes el artículo madre que uno de sus trozos: la lista de
   * InuYasha empieza por «(1–198)», que son 20 tomos de los 56 que tiene.
   */
  function prioridad(pagina) {
    return (/lista de cap[íi]tulos|list of .*(chapters|volumes)/i.test(pagina) ? 2 : 0) +
      (esTrozo(pagina) ? -1 : 0);
  }

  /* ---------- API pública ---------- */

  function wikitexto(wiki, pagina) {
    return api(wiki, { action: 'parse', page: pagina, prop: 'wikitext', redirects: 1 })
      .then(function (d) {
        return { titulo: (d.parse && d.parse.title) || pagina, texto: (d.parse && d.parse.wikitext) || '' };
      });
  }

  /**
   * Lee una página candidata, siguiéndole los trozos si está partida.
   *
   * @returns {Promise<Object|null>} null si no trae capítulos.
   */
  function leerPagina(p) {
    return wikitexto(p.wiki, p.pagina).then(function (d) {
      var leido = WK.leerTomos(d.texto);

      // Si el artículo apunta a sus trozos, se leen todos y se juntan, tenga o
      // no tomos por sí mismo. No vale conformarse con lo que traiga la madre:
      // la de InuYasha lista los tomos 1 al 18 y parece entera, pero los otros
      // 38 están en los artículos que transcluye.
      var trozos = subpaginas(d.titulo, d.texto);
      if (!trozos.length) return leido.total ? armar(p.wiki, d.titulo, leido) : null;

      return trozos.reduce(function (cadena, sub) {
        return cadena.then(function (acc) {
          return wikitexto(p.wiki, sub)
            .then(function (t) { return juntar(acc, WK.leerTomos(t.texto)); })
            .catch(function () { return acc; });
        });
      }, Promise.resolve(leido)).then(function (todo) {
        return todo.total ? armar(p.wiki, d.titulo, todo) : null;
      });
    }).catch(function () { return null; });
  }

  /** Suma un trozo al conjunto: los tomos no se solapan entre artículos. */
  function juntar(acc, trozo) {
    var tomos = {};
    Object.keys(acc.tomos).forEach(function (k) { tomos[k] = acc.tomos[k]; });
    Object.keys(trozo.tomos).forEach(function (k) { tomos[k] = trozo.tomos[k]; });
    // El capítulo de partida lo dice quien tenga el tomo más bajo.
    var inicio = (!acc.total || (trozo.total && trozo.primerTomo < acc.primerTomo))
      ? trozo.inicio : acc.inicio;
    return WK.resumir(tomos, inicio);
  }

  function armar(wiki, pagina, leido) {
    return {
      wiki: wiki, pagina: pagina,
      total: leido.total, capitulos: leido.capitulos, inicio: leido.inicio,
      tomos: leido.tomos, completa: leido.completa, primerTomo: leido.primerTomo
    };
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
        return cadena.then(function (mejor) {
          // Solo se para en seco ante una lista entera que venga del artículo
          // madre. Un trozo puede parecer completo —los tomos 1 al 20, seguidos
          // y sin huecos— y no serlo, así que ahí se sigue mirando y se queda
          // la que más tomos traiga.
          if (mejor && mejor.completa && !esTrozo(mejor.pagina)) return mejor;
          return leerPagina(p).then(function (r) {
            if (!r) return mejor;
            return (!mejor || r.total > mejor.total) ? r : mejor;
          });
        });
      }, Promise.resolve(null));
    });
  };

  /**
   * Junta los tomos de la edición original de n en n.
   *
   * Un «3 en 1» trae los tomos 1, 2 y 3 originales dentro de su tomo 1, así que
   * sus capítulos son la suma de los tres. Sale exacto, no una media: cada tomo
   * tuyo acaba justo donde acaba el último original que lleva dentro.
   *
   * El último puede quedar corto —37 originales de tres en tres son doce tomos
   * y una cola de uno— y así es como salen las ediciones de verdad.
   */
  WK.agrupar = function (tomos, n) {
    if (!(n > 1)) return tomos;
    var nums = Object.keys(tomos).map(Number).sort(function (a, b) { return a - b; });
    var out = {};
    nums.forEach(function (num, i) {
      var destino = Math.floor(i / n) + 1;
      out[destino] = (out[destino] || 0) + tomos[num];
    });
    return out;
  };

  /**
   * Deduce de cuántos en cuántos agrupa tu edición, y comprueba que cuadre.
   *
   * Primero se cree lo que diga el nombre —«3 en 1» es difícil de discutir— y
   * si no dice nada, prueba con la proporción entre los dos totales. Sea cual
   * sea, solo vale si al agrupar salen exactamente los tomos que tú tienes:
   * las kanzenban rebarajan los capítulos y no hay factor que las describa.
   *
   * @returns {{factor: number, cuadra: boolean, declarado: boolean}}
   */
  WK.deducirFactor = function (totalOriginal, totalTuyo, declarado) {
    var factor = declarado || (totalTuyo ? Math.round(totalOriginal / totalTuyo) : 1);
    if (!(factor > 1)) factor = 1;
    return {
      factor: factor,
      declarado: !!declarado,
      cuadra: !!totalTuyo && Math.ceil(totalOriginal / factor) === totalTuyo
    };
  };

  WK.url = function (r) {
    return 'https://' + r.wiki + '.wikipedia.org/wiki/' + encodeURIComponent(r.pagina.replace(/ /g, '_'));
  };

  global.WK = WK;
})(window);
