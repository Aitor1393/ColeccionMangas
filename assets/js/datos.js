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
  var RUTA_PORTADAS = 'data/portadas-editorial.json';
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

  D.coleccion = { version: 1, actualizado: null, ajustes: { descuento: 5, mostrarGasto: false }, series: [] };
  D.publicada = null;   // copia tal cual está en el repo
  D.sucia = false;      // hay cambios locales sin publicar

  // Fechas oficiales de ListadoManga, generadas por la GitHub Action semanal.
  D.calendario = { actualizado: null, colecciones: {}, sugerencias: {} };

  // Portadas de serie traídas de la web de cada editorial: las de ListadoManga
  // son de 106x150 y la rejilla las amplía. Va por id de colección.
  D.portadasEditorial = {};

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
      edicion: s.edicion || '',       // «Maximum», «Kanzenban»… fuera del título
      autor: s.autor || '',
      editorial: s.editorial || '',
      demografia: s.demografia || 'otro',
      estado: D.ESTADOS[s.estado] ? s.estado : '',   // '' = el que diga la edición
      // Cosa tuya, no de la edición: la serie puede estar en publicación y tú
      // haberla dejado. Por eso va aparte del estado.
      abandonada: !!s.abandonada,
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

  D.AJUSTES_POR_DEFECTO = { descuento: 5, mostrarGasto: false };

  D.normalizarColeccion = function (bruto) {
    bruto = bruto || {};
    var ajustes = bruto.ajustes || {};
    return {
      version: bruto.version || 1,
      actualizado: bruto.actualizado || null,
      ajustes: {
        // Descuento habitual sobre el PVP, en %. Se guarda en la colección y no
        // en el navegador para que el gasto salga igual para quien la visite.
        descuento: ajustes.descuento === undefined
          ? D.AJUSTES_POR_DEFECTO.descuento
          : Number(ajustes.descuento) || 0,
        // El total invertido va oculto por defecto: la web es pública.
        mostrarGasto: ajustes.mostrarGasto === undefined
          ? D.AJUSTES_POR_DEFECTO.mostrarGasto
          : !!ajustes.mostrarGasto
      },
      // Orden de compra que has decidido tú, uno por cada forma de mirar la
      // lista: por series enteras o tomo a tomo. Se guarda en la colección
      // porque es una decisión tuya, no una preferencia del navegador.
      compras: {
        series: Array.isArray((bruto.compras || {}).series) ? (bruto.compras || {}).series.slice() : [],
        tomos: Array.isArray((bruto.compras || {}).tomos) ? (bruto.compras || {}).tomos.slice() : []
      },
      series: (Array.isArray(bruto.series) ? bruto.series : []).map(D.normalizarSerie)
    };
  };

  D.descuento = function () {
    return (D.coleccion.ajustes && D.coleccion.ajustes.descuento) || 0;
  };

  /** ¿Se enseña el total invertido? Solo lo decide el ajuste de la colección. */
  D.mostrarGasto = function () {
    return !!(D.coleccion.ajustes && D.coleccion.ajustes.mostrarGasto);
  };

  D.guardarMostrarGasto = function (valor) {
    if (!D.coleccion.ajustes) D.coleccion.ajustes = {};
    D.coleccion.ajustes.mostrarGasto = !!valor;
    D.guardar();
  };

  D.guardarDescuento = function (porcentaje) {
    if (!D.coleccion.ajustes) D.coleccion.ajustes = {};
    D.coleccion.ajustes.descuento = Math.max(0, Math.min(100, Number(porcentaje) || 0));
    D.guardar();
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
        // Las fichas traídas en directo se superponen a las publicadas, para
        // que sus datos se vean antes de que el Action las suba al repo.
        var local = FI.cacheLocal();
        Object.keys(local).forEach(function (id) {
          if (!D.calendario.colecciones[id]) D.calendario.colecciones[id] = local[id];
        });
      })
      .then(cargarPortadas);
  }

  /** Portadas de editorial. Opcional: si falta el fichero, se sigue con las de LM. */
  function cargarPortadas() {
    return fetch(RUTA_PORTADAS, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (json) {
        if (json && json.portadas) D.portadasEditorial = json.portadas;
      });
  }

  /**
   * Portada grande de la serie, si su editorial la publica.
   * Devuelve '' cuando no la hay, para que se use la de ListadoManga.
   */
  D.portadaEditorialDe = function (serie) {
    var p = serie.listadomangaId && D.portadasEditorial[serie.listadomangaId];
    return p && p.ruta ? p.ruta : '';
  };

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

  /** Dejar de coleccionar una serie, o retomarla. Devuelve cómo queda. */
  D.alternarAbandonada = function (id) {
    var s = D.serie(id);
    if (!s) return false;
    // actualizarSerie escribe sobre el propio objeto, así que el valor nuevo
    // hay que calcularlo antes de llamarla.
    var ahora = !s.abandonada;
    D.actualizarSerie(id, { abandonada: ahora });
    return ahora;
  };

  D.abandonadas = function () {
    return D.coleccion.series.filter(function (s) { return s.abandonada; });
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
   * Ciclo de un clic sobre un tomo:
   *   nada → lo tengo → lo tengo y leído → leído sin tenerlo → nada
   *
   * El último estado es para lo que has leído prestado, en digital o en una
   * biblioteca: cuenta como leído pero no forma parte de tu colección.
   */
  D.ciclarTomo = function (idSerie, numero) {
    var s = D.serie(idSerie);
    if (!s) return;
    var t = D.tomo(s, numero, true);
    if (!t.tengo && !t.leido) { t.tengo = true; }
    else if (t.tengo && !t.leido) { t.leido = true; }
    else if (t.tengo && t.leido) { t.tengo = false; }
    else { t.leido = false; }
    D.guardar();
  };

  D.marcarTomo = function (idSerie, numero, campos) {
    var s = D.serie(idSerie);
    if (!s) return;
    var t = D.tomo(s, numero, true);
    Object.keys(campos).forEach(function (k) { t[k] = campos[k]; });
    D.guardar();
  };

  /* ---------- Estadísticas ---------- */

  D.statsSerie = function (s) {
    var totalDeclarado = D.totalDe(s);
    var tengo = 0, leidos = 0, leidosSinTener = 0, gasto = 0;
    var conPrecioManual = 0, estimados = 0, sinPrecio = 0;
    var maxTomo = totalDeclarado, ultimoQueTengo = 0;
    s.tomos.forEach(function (t) {
      if (t.numero > maxTomo) maxTomo = t.numero;
      if (t.tengo) {
        tengo++;
        if (t.numero > ultimoQueTengo) ultimoQueTengo = t.numero;
        var p = D.precioDe(s, t);
        gasto += p.valor;
        if (p.manual) conPrecioManual++;
        else if (p.valor) estimados++;
        else sinPrecio++;
        if (t.leido) leidos++;
      } else if (t.leido) {
        leidosSinTener++;
      }
    });
    var total = totalDeclarado || maxTomo;
    // Huecos = tomos que te faltan por debajo del último que tienes.
    // Los que aún no han salido no son un hueco, son futuro.
    var huecos = [];
    for (var i = 1; i < ultimoQueTengo; i++) {
      var t = D.tomo(s, i, false);
      if (!t || !t.tengo) huecos.push(i);
    }
    return {
      tengo: tengo,
      leidos: leidos,                        // leídos y en tu poder
      leidosSinTener: leidosSinTener,        // leídos prestados, digitales…
      leidosTotal: leidos + leidosSinTener,
      pendientes: tengo - leidos,
      total: total,
      maxTomo: maxTomo,
      ultimoQueTengo: ultimoQueTengo,
      gasto: gasto,
      precioManual: conPrecioManual,   // precios que has escrito tú
      precioEstimado: estimados,       // calculados desde el PVP de la ficha
      sinPrecio: sinPrecio,            // ni uno ni otro
      huecos: huecos,
      totalDeclarado: totalDeclarado,
      completa: total > 0 && tengo >= total && D.estadoDe(s) === 'finalizada',
      alDia: leidos === tengo && tengo > 0,
      progresoTengo: U.porcentaje(tengo, total),
      progresoLeido: U.porcentaje(leidos, tengo || 1)
    };
  };

  D.statsGlobales = function () {
    var g = {
      series: D.coleccion.series.length, tomos: 0, leidos: 0, leidosSinTener: 0,
      pendientes: 0, gasto: 0, precioEstimado: 0, sinPrecio: 0,
      seriesCompletas: 0, seriesAbiertas: 0, seriesAbandonadas: 0, proximas30: 0
    };
    D.coleccion.series.forEach(function (s) {
      var st = D.statsSerie(s);
      g.tomos += st.tengo;
      g.leidos += st.leidos;
      g.leidosSinTener += st.leidosSinTener;
      g.pendientes += st.pendientes;
      g.gasto += st.gasto;
      g.precioEstimado += st.precioEstimado;
      g.sinPrecio += st.sinPrecio;
      if (st.completa) g.seriesCompletas++;
      if (s.abandonada) g.seriesAbandonadas++;
      else if (D.estadoDe(s) === 'en-publicacion') g.seriesAbiertas++;
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

  /**
   * Edición efectiva: la tuya si la has escrito, si no la que se deduzca del
   * nombre que ListadoManga le da a la colección.
   */
  D.edicionDe = function (serie) {
    if (serie.edicion) return serie.edicion;
    var ficha = D.fichaLM(serie);
    return ficha && ficha.titulo ? U.partirTitulo(ficha.titulo).edicion : '';
  };

  /** Nombre completo «Bleach (Maximum)»: para avisos, exportar y buscar. */
  D.nombreCompleto = function (serie) {
    var ed = D.edicionDe(serie);
    return serie.titulo + (ed ? ' (' + ed + ')' : '');
  };

  /**
   * ¿Hay otra serie con este mismo nombre a secas?
   *
   * Los listados enseñan solo el nombre, pero si tienes dos ediciones de la
   * misma obra quedarían dos tarjetas idénticas; en ese caso —y solo en ese—
   * se añade la edición para poder distinguirlas.
   */
  D.tituloAmbiguo = function (serie) {
    var clave = U.normalizar(serie.titulo);
    return D.coleccion.series.some(function (o) {
      return o.id !== serie.id && U.normalizar(o.titulo) === clave;
    });
  };

  /** Estado efectivo: el tuyo si lo has puesto, si no el de la edición. */
  D.estadoDe = function (serie) {
    if (serie.estado) return serie.estado;
    var ficha = D.fichaLM(serie);
    return (ficha && ficha.estado) || 'en-publicacion';
  };

  /** Editorial efectiva: la tuya si la has puesto, si no la de la edición. */
  D.editorialDe = function (serie) {
    if (serie.editorial) return serie.editorial;
    var ficha = D.fichaLM(serie);
    return (ficha && ficha.editorial) || '';
  };

  /** Editoriales presentes en la colección, contando las heredadas. */
  D.editoriales = function () {
    var vistas = {};
    D.coleccion.series.forEach(function (s) {
      var e = D.editorialDe(s);
      if (e) vistas[e] = true;
    });
    return Object.keys(vistas).sort(function (a, b) { return a.localeCompare(b, 'es'); });
  };

  /** Tomos totales efectivos: 0 si nadie lo sabe. */
  D.totalDe = function (serie) {
    if (serie.tomosTotales) return serie.tomosTotales;
    var ficha = D.fichaLM(serie);
    return (ficha && ficha.totalNumeros) || 0;
  };

  /**
   * Precio de un tomo. Si lo has escrito tú, manda tal cual —es lo que pagaste,
   * de segunda mano o donde sea—. Si no, se estima a partir del PVP de la ficha
   * aplicando el descuento habitual.
   */
  D.precioDe = function (serie, tomo) {
    if (tomo && tomo.precio !== null && tomo.precio !== undefined && tomo.precio !== '') {
      return { valor: Number(tomo.precio) || 0, manual: true, pvp: null };
    }
    var lm = tomo ? D.numeroLM(serie, tomo.numero) : null;
    if (lm && lm.precio) {
      return { valor: lm.precio * (1 - D.descuento() / 100), manual: false, pvp: lm.precio };
    }
    return { valor: 0, manual: false, pvp: null };
  };

  /** Demografía efectiva: la tuya si la has puesto, si no la de la edición. */
  D.demografiaDe = function (serie) {
    if (serie.demografia && serie.demografia !== 'otro') return serie.demografia;
    var ficha = D.fichaLM(serie);
    return (ficha && ficha.demografia) || 'otro';
  };

  D.numeroLM = function (serie, numero) {
    return D.numerosLM(serie).filter(function (n) { return n.numero === numero; })[0] || null;
  };

  /**
   * Catálogo completo de ListadoManga (~6.600 colecciones, 256 KB).
   * Se descarga solo cuando hace falta —al abrir el selector de edición— y se
   * queda en memoria: no penaliza la carga normal de la web.
   */
  var indice = null;
  var promesaIndice = null;

  D.cargarIndice = function () {
    if (indice) return Promise.resolve(indice);
    if (promesaIndice) return promesaIndice;

    promesaIndice = fetch('data/listadomanga-indice.json', { cache: 'force-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (json) {
        indice = (json.colecciones || []).map(function (fila) {
          return { id: String(fila[0]), nombre: fila[1], busqueda: U.normalizar(fila[1]) };
        });
        indice.actualizado = json.actualizado || null;
        return indice;
      })
      .catch(function (e) {
        promesaIndice = null;      // permite reintentar
        throw new Error('No se pudo cargar el catálogo de ListadoManga (' + e.message + ')');
      });

    return promesaIndice;
  };

  /**
   * Busca ediciones en el catálogo.
   *
   * Se buscan todas las palabras por separado, no la cadena entera: los
   * nombres llevan la edición entre paréntesis —«Bleach (Maximum)»— y una
   * búsqueda literal de «bleach maximum» no encontraría nada.
   *
   * Prioriza las que empiezan por la primera palabra, para que «bleach» no
   * entierre las ediciones de Bleach entre títulos que solo lo mencionan.
   */
  D.buscarEdiciones = function (texto, limite) {
    if (!indice) return [];
    var aguja = U.normalizar(texto).trim();
    if (aguja.length < 2) return [];

    var palabras = aguja.split(/\s+/).filter(function (p) { return p; });

    var empiezan = [], contienen = [];
    for (var i = 0; i < indice.length; i++) {
      var nombre = indice[i].busqueda;

      var todas = true;
      for (var j = 0; j < palabras.length; j++) {
        if (nombre.indexOf(palabras[j]) === -1) { todas = false; break; }
      }
      if (!todas) continue;

      if (nombre.indexOf(palabras[0]) === 0) empiezan.push(indice[i]);
      else contienen.push(indice[i]);
    }

    // Alfabético dentro de cada grupo: así las ediciones de una misma obra
    // salen juntas y en un orden estable.
    function porNombre(a, b) { return a.nombre.localeCompare(b.nombre, 'es'); }
    empiezan.sort(porNombre);
    contienen.sort(porNombre);

    return empiezan.concat(contienen).slice(0, limite || 30);
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
      if (s.abandonada) return;          // la dejaste: sus salidas no te interesan
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

  /* ---------- Próximas compras ---------- */

  /**
   * Tomos que ya están a la venta y todavía no tienes, sin límite de fecha.
   *
   * «Ya ha salido» es tener fecha y que esa fecha haya pasado. Los tomos sin
   * fecha NO cuentan: en ListadoManga viven bajo «Números no editados», o sea
   * anunciados pero aún sin publicar, y meterlos aquí llenaría la lista de
   * cosas que no se pueden comprar.
   *
   * En cuanto marcas un tomo como que lo tienes, deja de aparecer.
   */
  /**
   * Recorre los tomos ya publicados que no tienes, serie por serie.
   *
   * «Ya ha salido» es tener fecha y que esa fecha haya pasado. Los tomos sin
   * fecha NO cuentan: en ListadoManga viven bajo «Números no editados», o sea
   * anunciados pero aún sin publicar.
   *
   * Las series abandonadas quedan fuera enteras: no vas a comprar más de ellas.
   */
  function recorrerPublicadosQueFaltan(cb) {
    var hoy = U.isoHoy();

    D.coleccion.series.forEach(function (s) {
      if (s.abandonada) return;
      var vistos = {};

      function mirar(numero, fecha, origen) {
        if (!fecha || fecha > hoy || vistos[numero]) return;
        var t = D.tomo(s, numero, false);
        if (t && t.tengo) return;                  // ya lo tienes
        vistos[numero] = true;
        cb(s, numero, fecha, origen, t);
      }

      // Lo que apuntes a mano manda sobre la ficha.
      s.proximas.forEach(function (p) { mirar(p.numero, p.fecha, 'manual'); });
      D.numerosLM(s).forEach(function (n) { mirar(n.numero, n.fecha, 'listadomanga'); });
    });
  }

  /**
   * Tomos a la venta que todavía te faltan, sin límite de fecha.
   *
   * En cuanto marcas un tomo como que lo tienes, deja de aparecer. Lo que
   * leíste sin comprarlo tampoco cuenta: ya lo has disfrutado, no es una
   * compra pendiente.
   */
  D.pendientesDeCompra = function () {
    var lista = [];

    recorrerPublicadosQueFaltan(function (s, numero, fecha, origen, t) {
      if (t && t.leido) return;                    // leído sin tenerlo
      // El precio sale de la misma regla que el resto de la web: el que
      // hayas escrito tú, y si no el PVP menos tu descuento habitual.
      var p = D.precioDe(s, t || { numero: numero, precio: null });
      lista.push({
        serie: s, numero: numero, fecha: fecha, origen: origen,
        precio: p.valor, precioManual: p.manual, pvp: p.pvp,
        clave: s.id + '#' + numero
      });
    });

    return D.ordenarCompras(lista, 'tomos', function (a, b) {
      // Por defecto, lo que lleva más tiempo a la venta va primero.
      return String(a.fecha).localeCompare(String(b.fecha)) || a.numero - b.numero;
    });
  };

  /** Los que están a la venta, no tienes, y ya leíste: quedan fuera de compras. */
  D.leidosSinComprar = function () {
    var lista = [];
    recorrerPublicadosQueFaltan(function (s, numero, fecha, origen, t) {
      if (t && t.leido) lista.push({ serie: s, numero: numero, fecha: fecha });
    });
    return lista;
  };

  /** Los mismos tomos, agrupados por serie. */
  D.pendientesDeCompraPorSerie = function () {
    var grupos = [];
    var indice = {};

    D.pendientesDeCompra().forEach(function (item) {
      if (!indice[item.serie.id]) {
        indice[item.serie.id] = { serie: item.serie, clave: item.serie.id, tomos: [], coste: 0 };
        grupos.push(indice[item.serie.id]);
      }
      var g = indice[item.serie.id];
      g.tomos.push(item);
      g.coste += item.precio;
    });

    grupos.forEach(function (g) {
      g.tomos.sort(function (a, b) { return a.numero - b.numero; });
    });

    return D.ordenarCompras(grupos, 'series', function (a, b) {
      // Sin orden tuyo, primero la serie con el tomo más antiguo esperando.
      return String(a.tomos[0].fecha).localeCompare(String(b.tomos[0].fecha));
    });
  };

  /**
   * Aplica tu orden manual: lo que hayas colocado va primero y en tu orden;
   * lo que aún no has tocado va detrás, con el criterio por defecto.
   */
  D.ordenarCompras = function (lista, modo, porDefecto) {
    var orden = (D.coleccion.compras && D.coleccion.compras[modo]) || [];
    var puesto = {};
    orden.forEach(function (clave, i) { puesto[clave] = i; });

    return lista.slice().sort(function (a, b) {
      var pa = puesto[a.clave], pb = puesto[b.clave];
      if (pa !== undefined && pb !== undefined) return pa - pb;
      if (pa !== undefined) return -1;
      if (pb !== undefined) return 1;
      return porDefecto(a, b);
    });
  };

  /** Sube o baja un elemento un puesto en tu orden de compra. */
  D.moverCompra = function (modo, clave, direccion) {
    var visible = ordenVisible(modo);
    var i = visible.indexOf(clave);
    if (i === -1) return false;
    return colocarCompra(modo, visible, i, i + direccion);
  };

  /**
   * Lleva un elemento a la posición que le digas (1 = el primero) y corre el
   * resto para hacerle hueco, en vez de intercambiarlo con su vecino.
   */
  D.moverCompraA = function (modo, clave, posicion) {
    var visible = ordenVisible(modo);
    var i = visible.indexOf(clave);
    if (i === -1) return false;
    return colocarCompra(modo, visible, i, Number(posicion) - 1);
  };

  function ordenVisible(modo) {
    return (modo === 'series' ? D.pendientesDeCompraPorSerie() : D.pendientesDeCompra())
      .map(function (x) { return x.clave; });
  }

  /**
   * Saca el elemento de su sitio y lo mete en el nuevo, corriendo el resto.
   *
   * El orden guardado solo tiene lo que has movido, así que se fija primero la
   * lista tal y como se está viendo; si no, colocar el tercero lo pondría por
   * delante de elementos que ni siquiera estaban puestos.
   */
  function colocarCompra(modo, visible, desde, hasta) {
    if (isNaN(hasta) || hasta < 0 || hasta >= visible.length || hasta === desde) return false;

    var clave = visible[desde];
    visible.splice(desde, 1);
    visible.splice(hasta, 0, clave);

    if (!D.coleccion.compras) D.coleccion.compras = { series: [], tomos: [] };
    D.coleccion.compras[modo] = visible;
    D.guardar();
    return true;
  }

  /** Olvida el orden manual y vuelve al automático. */
  D.limpiarOrdenCompras = function (modo) {
    if (!D.coleccion.compras) return;
    D.coleccion.compras[modo] = [];
    D.guardar();
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
      // La clave lleva la edición: si tienes dos ediciones de la misma obra,
      // el nombre a secas las confundiría y una pisaría a la otra.
      var claveDe = function (s) { return U.normalizar(s.titulo + '|' + (s.edicion || '')); };
      var porTitulo = {};
      D.coleccion.series.forEach(function (s) { porTitulo[claveDe(s)] = s; });
      entrante.series.forEach(function (s) {
        var clave = claveDe(s);
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
