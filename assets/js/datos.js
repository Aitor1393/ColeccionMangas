/* ============================================================
   datos.js — modelo de datos, cálculos y persistencia
   ------------------------------------------------------------
   La colección "publicada" vive en data/coleccion.json (repo).
   Los cambios que haces en la web se guardan primero en el
   navegador (localStorage) y solo pasan al repo cuando publicas.
   ============================================================ */
(function (global) {
  'use strict';

  var D = {};

  var RUTA_JSON = 'data/coleccion.json';
  var RUTA_CALENDARIO = 'data/calendario.json';
  var CLAVE_LOCAL = 'cm:coleccion';
  var CLAVE_BASE = 'cm:base';       // sello de la versión publicada sobre la que editas
  var CLAVE_COPIA = 'cm:copia';     // copia de seguridad si el repo se adelanta

  /* ---------- Catálogos ---------- */

  D.ESTADOS = {
    'en-publicacion': { etiqueta: 'En publicación', clase: 'chip--azul' },
    'finalizada': { etiqueta: 'Finalizada', clase: 'chip--verde' },
    'pausada': { etiqueta: 'En pausa', clase: 'chip--ambar' },
    'cancelada': { etiqueta: 'Cancelada', clase: 'chip--rojo' }
  };

  D.DEMOGRAFIAS = {
    shounen: 'Shōnen', shoujo: 'Shōjo', seinen: 'Seinen',
    josei: 'Josei', kodomo: 'Kodomo', otro: 'Otro'
  };

  /* ---------- Estado en memoria ---------- */

  D.coleccion = { version: 1, actualizado: null, series: [] };
  D.publicada = null;   // copia tal cual está en el repo
  D.sucia = false;      // hay cambios locales sin publicar

  // Fechas oficiales de ListadoManga, generadas por la GitHub Action semanal.
  D.calendario = { actualizado: null, colecciones: {}, sugerencias: {} };

  var oyentes = [];
  D.alCambiar = function (fn) { oyentes.push(fn); };
  function notificar() { oyentes.forEach(function (fn) { fn(); }); }

  /* ---------- Normalización ---------- */

  /** Rellena campos que falten para que el resto del código no tenga que comprobar. */
  D.normalizarSerie = function (s) {
    s = s || {};
    return {
      id: s.id || U.id(),
      titulo: s.titulo || 'Sin título',
      tituloAlt: s.tituloAlt || '',
      autor: s.autor || '',
      editorial: s.editorial || '',
      demografia: s.demografia || 'otro',
      estado: D.ESTADOS[s.estado] ? s.estado : 'en-publicacion',
      tomosTotales: Number(s.tomosTotales) || 0,   // 0 = desconocido / abierto
      portada: s.portada || '',
      sinopsis: s.sinopsis || '',
      etiquetas: Array.isArray(s.etiquetas) ? s.etiquetas : [],
      mangadexId: s.mangadexId || '',
      listadomangaId: s.listadomangaId ? String(s.listadomangaId) : '',
      notas: s.notas || '',
      anadida: s.anadida || U.isoHoy(),
      tomos: (Array.isArray(s.tomos) ? s.tomos : []).map(function (t) {
        return {
          numero: Number(t.numero) || 0,
          tengo: !!t.tengo,
          leido: !!t.leido,
          fechaCompra: t.fechaCompra || '',
          precio: (t.precio === '' || t.precio === null || t.precio === undefined) ? null : Number(t.precio),
          notas: t.notas || ''
        };
      }).sort(function (a, b) { return a.numero - b.numero; }),
      proximas: (Array.isArray(s.proximas) ? s.proximas : []).map(function (p) {
        return {
          numero: Number(p.numero) || 0,
          fecha: p.fecha || '',
          nota: p.nota || ''
        };
      }).sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); })
    };
  };

  D.normalizarColeccion = function (bruto) {
    bruto = bruto || {};
    return {
      version: bruto.version || 1,
      actualizado: bruto.actualizado || null,
      series: (Array.isArray(bruto.series) ? bruto.series : []).map(D.normalizarSerie)
    };
  };

  /* ---------- Carga ---------- */

  /**
   * Carga el JSON publicado y, si existe, superpone los cambios locales.
   * Devuelve una promesa con { conflicto: bool } por si el repo se ha
   * actualizado por debajo de unos cambios locales pendientes.
   */
  /** Carga el calendario de ListadoManga. Es opcional: si no existe, se ignora. */
  function cargarCalendario() {
    return fetch(RUTA_CALENDARIO, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (json) {
        if (json) {
          D.calendario = {
            actualizado: json.actualizado || null,
            colecciones: json.colecciones || {},
            sugerencias: json.sugerencias || {}
          };
        }
      });
  }

  D.cargar = function () {
    return cargarCalendario().then(function () {
      return fetch(RUTA_JSON, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .catch(function (e) {
        console.warn('No se pudo leer ' + RUTA_JSON + ':', e.message);
        return null;
      })
      .then(function (remoto) {
        D.publicada = D.normalizarColeccion(remoto || { series: [] });

        var local = U.leerLocal(CLAVE_LOCAL, null);
        var selloGuardado = U.leerLocal(CLAVE_BASE, null);
        var resultado = { conflicto: false, sinRemoto: !remoto };

        if (!local) {
          D.coleccion = D.clonar(D.publicada);
          D.sucia = false;
          notificar();
          return resultado;
        }

        // ¿Se ha publicado algo nuevo desde que empezaste a editar?
        if (selloGuardado && D.publicada.actualizado && selloGuardado !== D.publicada.actualizado) {
          U.guardarLocal(CLAVE_COPIA, local);
          resultado.conflicto = true;
        }

        D.coleccion = D.normalizarColeccion(local);
        D.sucia = true;
        notificar();
        return resultado;
      });
    });
  };

  D.clonar = function (obj) { return JSON.parse(JSON.stringify(obj)); };

  /* ---------- Guardado local ---------- */

  D.guardar = function () {
    D.coleccion.actualizado = U.isoHoy();
    D.sucia = true;
    U.guardarLocal(CLAVE_LOCAL, D.coleccion);
    if (D.publicada && D.publicada.actualizado) U.guardarLocal(CLAVE_BASE, D.publicada.actualizado);
    notificar();
  };

  /** Marca los cambios locales como ya publicados en el repo. */
  D.marcarPublicada = function () {
    D.publicada = D.clonar(D.coleccion);
    D.sucia = false;
    U.borrarLocal(CLAVE_LOCAL);
    U.borrarLocal(CLAVE_BASE);
    notificar();
  };

  D.descartarCambios = function () {
    U.borrarLocal(CLAVE_LOCAL);
    U.borrarLocal(CLAVE_BASE);
    D.coleccion = D.clonar(D.publicada || { version: 1, actualizado: null, series: [] });
    D.sucia = false;
    notificar();
  };

  /** Nº de series que difieren respecto a lo publicado (para el aviso). */
  D.numCambios = function () {
    if (!D.publicada) return 0;
    var previas = {};
    D.publicada.series.forEach(function (s) { previas[s.id] = JSON.stringify(s); });
    var n = 0;
    D.coleccion.series.forEach(function (s) {
      if (previas[s.id] !== JSON.stringify(s)) n++;
      delete previas[s.id];
    });
    return n + Object.keys(previas).length; // + las eliminadas
  };

  /* ---------- Consultas y mutaciones ---------- */

  D.serie = function (id) {
    return D.coleccion.series.filter(function (s) { return s.id === id; })[0] || null;
  };

  D.anadirSerie = function (serie) {
    var nueva = D.normalizarSerie(serie);
    D.coleccion.series.push(nueva);
    D.guardar();
    return nueva;
  };

  D.actualizarSerie = function (id, cambios) {
    var s = D.serie(id);
    if (!s) return null;
    Object.keys(cambios).forEach(function (k) { s[k] = cambios[k]; });
    var normalizada = D.normalizarSerie(s);
    var i = D.coleccion.series.indexOf(s);
    D.coleccion.series[i] = normalizada;
    D.guardar();
    return normalizada;
  };

  D.borrarSerie = function (id) {
    D.coleccion.series = D.coleccion.series.filter(function (s) { return s.id !== id; });
    D.guardar();
  };

  /** Devuelve el tomo n de una serie, creándolo si no existía. */
  D.tomo = function (serie, numero, crear) {
    var t = serie.tomos.filter(function (x) { return x.numero === numero; })[0];
    if (!t && crear) {
      t = { numero: numero, tengo: false, leido: false, fechaCompra: '', precio: null, notas: '' };
      serie.tomos.push(t);
      serie.tomos.sort(function (a, b) { return a.numero - b.numero; });
    }
    return t || null;
  };

  /**
   * Ciclo de un clic sobre un tomo: nada → lo tengo → leído → nada.
   */
  D.ciclarTomo = function (idSerie, numero) {
    var s = D.serie(idSerie);
    if (!s) return;
    var t = D.tomo(s, numero, true);
    if (!t.tengo) { t.tengo = true; t.leido = false; }
    else if (!t.leido) { t.leido = true; }
    else { t.tengo = false; t.leido = false; }
    D.guardar();
  };

  D.marcarTomo = function (idSerie, numero, campos) {
    var s = D.serie(idSerie);
    if (!s) return;
    var t = D.tomo(s, numero, true);
    Object.keys(campos).forEach(function (k) { t[k] = campos[k]; });
    if (t.leido && !t.tengo) t.tengo = true; // no puedes haber leído lo que no tienes
    D.guardar();
  };

  /* ---------- Estadísticas ---------- */

  D.statsSerie = function (s) {
    var tengo = 0, leidos = 0, gasto = 0, maxTomo = s.tomosTotales || 0, ultimoQueTengo = 0;
    s.tomos.forEach(function (t) {
      if (t.numero > maxTomo) maxTomo = t.numero;
      if (t.tengo) {
        tengo++;
        if (t.numero > ultimoQueTengo) ultimoQueTengo = t.numero;
        if (t.precio) gasto += t.precio;
        if (t.leido) leidos++;
      }
    });
    var total = s.tomosTotales || maxTomo;
    // Huecos = tomos que te faltan por debajo del último que tienes.
    // Los que aún no han salido no son un hueco, son futuro.
    var huecos = [];
    for (var i = 1; i < ultimoQueTengo; i++) {
      var t = D.tomo(s, i, false);
      if (!t || !t.tengo) huecos.push(i);
    }
    return {
      tengo: tengo,
      leidos: leidos,
      pendientes: tengo - leidos,
      total: total,
      maxTomo: maxTomo,
      ultimoQueTengo: ultimoQueTengo,
      gasto: gasto,
      huecos: huecos,
      completa: total > 0 && tengo >= total && s.estado === 'finalizada',
      alDia: leidos === tengo && tengo > 0,
      progresoTengo: U.porcentaje(tengo, total),
      progresoLeido: U.porcentaje(leidos, tengo || 1)
    };
  };

  D.statsGlobales = function () {
    var g = {
      series: D.coleccion.series.length, tomos: 0, leidos: 0, pendientes: 0,
      gasto: 0, seriesCompletas: 0, seriesAbiertas: 0, proximas30: 0
    };
    D.coleccion.series.forEach(function (s) {
      var st = D.statsSerie(s);
      g.tomos += st.tengo;
      g.leidos += st.leidos;
      g.pendientes += st.pendientes;
      g.gasto += st.gasto;
      if (st.completa) g.seriesCompletas++;
      if (s.estado === 'en-publicacion') g.seriesAbiertas++;
    });
    g.proximas30 = D.proximasPublicaciones(30).length;
    return g;
  };

  /* ---------- Vistas derivadas ---------- */

  /** Todos los tomos que tienes y no has leído, con su serie. */
  D.tomosPendientes = function () {
    var lista = [];
    D.coleccion.series.forEach(function (s) {
      s.tomos.forEach(function (t) {
        if (t.tengo && !t.leido) lista.push({ serie: s, tomo: t });
      });
    });
    return lista.sort(function (a, b) {
      var c = a.serie.titulo.localeCompare(b.serie.titulo, 'es');
      return c !== 0 ? c : a.tomo.numero - b.tomo.numero;
    });
  };

  /* ---------- ListadoManga ---------- */

  /** Números publicados/anunciados de una serie según ListadoManga. */
  D.numerosLM = function (serie) {
    if (!serie.listadomangaId) return [];
    var ficha = D.calendario.colecciones[serie.listadomangaId];
    return ficha && Array.isArray(ficha.numeros) ? ficha.numeros : [];
  };

  D.fichaLM = function (serie) {
    if (!serie.listadomangaId) return null;
    return D.calendario.colecciones[serie.listadomangaId] || null;
  };

  D.numeroLM = function (serie, numero) {
    return D.numerosLM(serie).filter(function (n) { return n.numero === numero; })[0] || null;
  };

  /** Candidatos de ListadoManga propuestos por el script para una serie sin enlazar. */
  D.sugerenciasLM = function (serie) {
    if (serie.listadomangaId) return [];
    return D.calendario.sugerencias[serie.id] || [];
  };

  /**
   * Próximas publicaciones ordenadas por fecha, fusionando dos fuentes:
   *   - las fechas que has apuntado tú a mano (mandan siempre),
   *   - las de ListadoManga para las series enlazadas.
   * Se ignoran los tomos que ya tienes.
   * @param {number} [dias] si se indica, solo las que salen en los próximos N días.
   */
  D.proximasPublicaciones = function (dias) {
    var lista = [];

    function cabe(d) {
      return d !== null && d >= 0 && (dias === undefined || d <= dias);
    }

    D.coleccion.series.forEach(function (s) {
      var manuales = {};

      s.proximas.forEach(function (p) {
        manuales[p.numero] = true;
        var d = U.diasHasta(p.fecha);
        if (!cabe(d)) return;                          // ya salió: se trata aparte
        lista.push({ serie: s, salida: p, dias: d, origen: 'manual' });
      });

      D.numerosLM(s).forEach(function (n) {
        if (manuales[n.numero] || !n.fecha) return;    // lo tuyo tiene prioridad
        var t = D.tomo(s, n.numero, false);
        if (t && t.tengo) return;                      // ya lo tienes
        var d = U.diasHasta(n.fecha);
        if (!cabe(d)) return;
        lista.push({
          serie: s, dias: d, origen: 'listadomanga',
          salida: { numero: n.numero, fecha: n.fecha, nota: '', precio: n.precio, aproximada: n.aproximada }
        });
      });
    });

    return lista.sort(function (a, b) { return a.dias - b.dias; });
  };

  /** Salidas cuya fecha ya pasó y que aún no has marcado como compradas. */
  D.publicacionesPasadas = function () {
    var lista = [];
    D.coleccion.series.forEach(function (s) {
      s.proximas.forEach(function (p) {
        var d = U.diasHasta(p.fecha);
        if (d === null || d >= 0) return;
        var t = D.tomo(s, p.numero, false);
        if (t && t.tengo) return;
        lista.push({ serie: s, salida: p, dias: d, origen: 'manual' });
      });
    });
    return lista.sort(function (a, b) { return b.dias - a.dias; });
  };

  /** Series empezadas y no terminadas de leer, para "continuar leyendo". */
  D.continuarLeyendo = function () {
    return D.coleccion.series
      .map(function (s) { return { serie: s, stats: D.statsSerie(s) }; })
      .filter(function (x) { return x.stats.leidos > 0 && x.stats.pendientes > 0; })
      .sort(function (a, b) { return b.stats.pendientes - a.stats.pendientes; });
  };

  /** Valores únicos de un campo, para rellenar los desplegables de filtros. */
  D.valoresDe = function (campo) {
    var vistos = {};
    D.coleccion.series.forEach(function (s) {
      if (s[campo]) vistos[s[campo]] = true;
    });
    return Object.keys(vistos).sort(function (a, b) { return a.localeCompare(b, 'es'); });
  };

  /* ---------- Importar / exportar ---------- */

  D.exportar = function () {
    var salida = D.clonar(D.coleccion);
    salida.actualizado = U.isoHoy();
    return salida;
  };

  D.importar = function (bruto, modo) {
    var entrante = D.normalizarColeccion(bruto);
    if (modo === 'fusionar') {
      var porTitulo = {};
      D.coleccion.series.forEach(function (s) { porTitulo[U.normalizar(s.titulo)] = s; });
      entrante.series.forEach(function (s) {
        var clave = U.normalizar(s.titulo);
        if (porTitulo[clave]) {
          var i = D.coleccion.series.indexOf(porTitulo[clave]);
          s.id = porTitulo[clave].id;
          D.coleccion.series[i] = s;
        } else {
          D.coleccion.series.push(s);
        }
      });
    } else {
      D.coleccion = entrante;
    }
    D.guardar();
    return D.coleccion.series.length;
  };

  D.RUTA_JSON = RUTA_JSON;
  global.D = D;
})(window);
