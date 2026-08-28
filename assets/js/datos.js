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
      // Te gustaría tenerla pero aún no has comprado nada. Lo garantiza el
      // propio contrato: en cuanto consta un tomo que tienes o has leído, deja
      // de ser un deseo, venga de donde venga el cambio.
      deseada: !!s.deseada && !(Array.isArray(s.tomos) &&
        s.tomos.some(function (t) { return t.tengo || t.leido; })),
      tomosTotales: Number(s.tomosTotales) || 0,   // 0 = desconocido / abierto
      portada: s.portada || '',
      sinopsis: s.sinopsis || '',
      etiquetas: Array.isArray(s.etiquetas) ? s.etiquetas : [],
      mangadexId: s.mangadexId || '',
      listadomangaId: s.listadomangaId ? String(s.listadomangaId) : '',
      capitulos: normalizarCapitulos(s.capitulos),
      valoracion: normalizarValoracion(s.valoracion),
      relectura: normalizarRelectura(s.relectura),
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

  /**
   * Qué capítulos trae cada tomo. Sirve sobre todo para las series que lees
   * por app sin tenerlas: tú sabes por qué capítulo vas, no por qué tomo.
   *
   * `inicio` es el número del primer capítulo del primer tomo —casi siempre 1—,
   * `porTomo` cuántos trae uno de media y `tabla` los que se sepan exactos,
   * «nº de tomo» → «cuántos capítulos». Con la media sola ya salen los rangos
   * aproximados; la tabla los afina.
   *
   * null cuando no se ha configurado, que es lo normal.
   */
  function normalizarCapitulos(c) {
    if (!c) return null;
    var tabla = {};
    Object.keys(c.tabla || {}).forEach(function (k) {
      var n = Number(c.tabla[k]);
      if (n > 0) tabla[String(Number(k))] = n;
    });
    var inicio = Number(c.inicio);
    var porTomo = Number(c.porTomo) || 0;
    if (!porTomo && !Object.keys(tabla).length) return null;
    return {
      inicio: isNaN(inicio) ? 1 : inicio,
      porTomo: porTomo,
      tabla: tabla,
      leidoHasta: (c.leidoHasta === '' || c.leidoHasta === null || c.leidoHasta === undefined)
        ? null : Number(c.leidoHasta),
      fuente: c.fuente || ''
    };
  }

  /**
   * ¿Por dónde vas con una serie? 'completas' | 'empezadas' | 'sinEmpezar'.
   *
   * Cuenta lo leído tengas los tomos o no: si te la leíste prestada entera,
   * está leída. Y sin saber cuántos tomos son no se puede decir que esté
   * entera, así que esas se quedan en «empezadas».
   */
  D.encajaLectura = function (serie, modo) {
    var st = D.statsSerie(serie);
    if (modo === 'sinEmpezar') return st.leidosTotal === 0;
    if (modo === 'completas') return st.total > 0 && st.leidosTotal >= st.total;
    if (modo === 'empezadas') return st.leidosTotal > 0 && !(st.total > 0 && st.leidosTotal >= st.total);
    return true;
  };

  /* ---------- Relecturas ---------- */

  /**
   * Por dónde vas si estás releyendo una serie.
   *
   * Va aparte de los tomos a propósito: releer no puede tocar lo que ya
   * marcaste como leído. Que vayas por el tomo 5 de la segunda vuelta no
   * significa que los otros 32 hayan dejado de estar leídos.
   *
   * `vueltas` son las relecturas que has terminado, sin contar la de ahora.
   */
  function normalizarRelectura(r) {
    if (!r) return null;
    var vueltas = Number(r.vueltas) || 0;
    if (!r.activa && !vueltas) return null;
    return {
      activa: !!r.activa,
      tomo: Number(r.tomo) || 0,
      desde: r.desde || U.isoHoy(),
      vueltas: vueltas
    };
  }

  D.normalizarRelectura = normalizarRelectura;

  D.relee = function (serie) {
    return !!(serie.relectura && serie.relectura.activa);
  };

  /** Qué número de lectura es la de ahora: la primera relectura es la 2ª. */
  D.numeroDeLectura = function (serie) {
    return ((serie.relectura && serie.relectura.vueltas) || 0) + 2;
  };

  /** Empieza una relectura por el primer tomo. */
  D.empezarRelectura = function (id) {
    var s = D.serie(id);
    if (!s) return false;
    var previa = s.relectura || {};
    s.relectura = normalizarRelectura({
      activa: true, tomo: D.rangoTomos(s).desde, desde: U.isoHoy(), vueltas: previa.vueltas || 0
    });
    D.guardar();
    return true;
  };

  /** Mueve por dónde vas, sin salirse de los tomos que existen. */
  D.avanzarRelectura = function (id, tomo) {
    var s = D.serie(id);
    if (!s || !D.relee(s)) return false;
    var r = D.rangoTomos(s);
    s.relectura.tomo = Math.max(r.desde, Math.min(r.hasta, Number(tomo)));
    D.guardar();
    return true;
  };

  /** La has terminado de releer: suma una vuelta y deja de estar activa. */
  D.terminarRelectura = function (id) {
    var s = D.serie(id);
    if (!s || !D.relee(s)) return false;
    s.relectura = normalizarRelectura({ activa: false, vueltas: s.relectura.vueltas + 1 });
    D.guardar();
    return true;
  };

  /** Deja de releerla sin apuntarte la vuelta. */
  D.cancelarRelectura = function (id) {
    var s = D.serie(id);
    if (!s || !D.relee(s)) return false;
    s.relectura = normalizarRelectura({ activa: false, vueltas: s.relectura.vueltas });
    D.guardar();
    return true;
  };

  D.releyendo = function () {
    return D.coleccion.series.filter(D.relee);
  };

  /* ---------- Valoración ---------- */

  /**
   * Los criterios de la nota, con qué significa cada tramo.
   *
   * Las descripciones no son adorno: son lo único que hace que un 7 puesto hoy
   * valga lo mismo que uno puesto dentro de dos años. Sin ellas la nota deriva
   * y el ranking deja de tener sentido.
   */
  D.CRITERIOS = [
    { id: 'historia', nombre: 'Historia', ayuda: 'La trama y cómo está construida.', anclas: {
      2: 'Incoherente o sin nada que contar',
      4: 'Se sostiene a duras penas, previsible',
      6: 'Correcta, cumple sin sorprender',
      8: 'Bien construida, los giros se los gana',
      10: 'Memorable, no sabrías qué mejorarle'
    } },
    { id: 'personajes', nombre: 'Personajes', ayuda: 'Si evolucionan y si te importan.', anclas: {
      2: 'Planos e intercambiables',
      4: 'Funcionan, pero no cambian en toda la serie',
      6: 'Alguno destaca, el resto acompaña',
      8: 'Evolucionan y te llegas a preocupar por ellos',
      10: 'El reparto entero sostiene la obra'
    } },
    { id: 'dibujo', nombre: 'Dibujo', ayuda: 'El apartado gráfico y su claridad.', anclas: {
      2: 'Confuso, cuesta seguir lo que pasa',
      4: 'Irregular o pobre',
      6: 'Correcto y se lee bien',
      8: 'Muy bueno, con personalidad propia',
      10: 'Excepcional, vale la pena por sí solo'
    } },
    { id: 'ritmo', nombre: 'Ritmo', ayuda: 'Si se hace largo o va al grano.', anclas: {
      2: 'Insufrible, relleno constante',
      4: 'Se hace largo por tramos',
      6: 'Desigual pero llevadero',
      8: 'Avanza bien, sin paja',
      10: 'No sobra ni una página'
    } },
    { id: 'final', nombre: 'Final', ayuda: 'Cómo cierra. Déjalo en blanco si sigue publicándose.', anclas: {
      2: 'Arruina lo anterior',
      4: 'Flojo o precipitado',
      6: 'Cumple sin más',
      8: 'Cierra bien todo lo que abrió',
      10: 'Redondo, y hace mejor a la serie entera'
    } }
  ];

  /**
   * Lo que has puntuado de una serie.
   *
   * `disfrute` va aparte y NO entra en la nota a propósito: «qué buena es» y
   * «cuánto lo pasé bien» son preguntas distintas, y sumarlas sin darse cuenta
   * es la forma más rápida de que el ranking no signifique nada. El ranking se
   * puede ordenar por una o por otra.
   *
   * `desempate` lo mueven los duelos, y solo ordena entre notas iguales: nunca
   * toca la nota ni adelanta a nadie que esté por encima.
   */
  function normalizarValoracion(v) {
    if (!v) return null;
    var criterios = {};
    var alguno = false;
    D.CRITERIOS.forEach(function (c) {
      var n = Number((v.criterios || {})[c.id]);
      if (n >= 1 && n <= 10) { criterios[c.id] = n; alguno = true; }
    });
    var disfrute = Number(v.disfrute);
    disfrute = (disfrute >= 1 && disfrute <= 10) ? disfrute : null;
    if (!alguno && disfrute === null) return null;
    // Contra quién has ganado o perdido: { idRival: +1 | -1 }. Sin esto solo
    // había un contador, y no se podía saber si una pareja ya se había
    // enfrentado; con tres series empatadas, una sola comparación colocaba a la
    // tercera sin haberla comparado con nadie.
    var enfrentamientos = {};
    Object.keys(v.enfrentamientos || {}).forEach(function (id) {
      var r = Number(v.enfrentamientos[id]);
      if (r === 1 || r === -1) enfrentamientos[id] = r;
    });
    return {
      criterios: criterios,
      disfrute: disfrute,
      desempate: Number(v.desempate) || 0,
      duelos: Number(v.duelos) || 0,
      enfrentamientos: enfrentamientos,
      notas: v.notas || '',
      fecha: v.fecha || U.isoHoy()
    };
  }

  D.normalizarValoracion = normalizarValoracion;

  /** La nota: media de los criterios que hayas puntuado. null si no hay ninguno. */
  D.notaDe = function (serie) {
    var v = serie.valoracion;
    if (!v) return null;
    var puestos = Object.keys(v.criterios);
    if (!puestos.length) return null;
    var suma = puestos.reduce(function (n, k) { return n + v.criterios[k]; }, 0);
    return Math.round((suma / puestos.length) * 10) / 10;
  };

  /**
   * ¿Se puede valorar?
   *
   * Si has leído algo de ella, la tengas o no. Y las que dejaste también,
   * aunque no llegaras a marcar ningún tomo: para dejar una serie hay que
   * haberla probado, y ahí es donde apuntas por qué la dejaste.
   */
  D.esValorable = function (serie) {
    return serie.abandonada || serie.tomos.some(function (t) { return t.leido; });
  };

  D.valorables = function () {
    return D.coleccion.series.filter(D.esValorable);
  };

  /**
   * El ranking. `porDisfrute` ordena por lo que te hizo pasarlo bien en vez de
   * por la nota.
   *
   * Entre notas iguales mandan los duelos que hayas resuelto, y si tampoco los
   * hay, el orden alfabético, que al menos es estable.
   */
  D.ranking = function (porDisfrute) {
    var valor = function (s) {
      return porDisfrute ? (s.valoracion && s.valoracion.disfrute) : D.notaDe(s);
    };
    return D.valorables()
      .filter(function (s) { return valor(s) !== null && valor(s) !== undefined; })
      .sort(function (a, b) {
        return (valor(b) - valor(a)) ||
          (b.valoracion.desempate - a.valoracion.desempate) ||
          a.titulo.localeCompare(b.titulo);
      });
  };

  /** Las que podrías valorar y aún no has valorado. */
  D.sinValorar = function () {
    return D.valorables().filter(function (s) { return D.notaDe(s) === null; });
  };

  /**
   * Una pareja de la misma nota que todavía no se ha enfrentado.
   *
   * Todas las parejas del grupo, no una sola: con tres series empatadas, un
   * único duelo dejaría a la tercera colocada sin haberla comparado con nadie,
   * que es inventarse el orden en vez de medirlo. Son tres comparaciones, y con
   * ellas el orden sale de lo que has dicho tú, no de una deducción.
   *
   * Se prefieren las que menos duelos llevan, para repartir el trabajo y no
   * insistir con las mismas.
   *
   * @returns {Array|null} las dos series, o null si no queda nada por comparar.
   */
  D.duelo = function () {
    var porNota = {};
    D.ranking().forEach(function (s) {
      var k = String(D.notaDe(s));
      (porNota[k] = porNota[k] || []).push(s);
    });

    var mejor = null;
    Object.keys(porNota).forEach(function (k) {
      var grupo = porNota[k];
      var pares = [];
      for (var i = 0; i < grupo.length; i++) {
        for (var j = i + 1; j < grupo.length; j++) {
          if (!D.yaSeEnfrentaron(grupo[i], grupo[j])) pares.push([grupo[i], grupo[j]]);
        }
      }
      if (!pares.length) return;
      // Se termina el grupo al que le quedan menos comparaciones antes de
      // empezar otro: así un empate se resuelve del todo en vez de ir saltando
      // de un grupo a otro y dejarlos todos a medias.
      if (!mejor || pares.length < mejor.quedan) {
        mejor = { quedan: pares.length, par: pares[0] };
      }
    });
    return mejor ? mejor.par : null;
  };

  /** Cuántas comparaciones quedan por hacer, para poder decirlo. */
  D.duelosPendientes = function () {
    var porNota = {};
    D.ranking().forEach(function (s) {
      var k = String(D.notaDe(s));
      (porNota[k] = porNota[k] || []).push(s);
    });
    var n = 0;
    Object.keys(porNota).forEach(function (k) {
      var g = porNota[k];
      for (var i = 0; i < g.length; i++) {
        for (var j = i + 1; j < g.length; j++) {
          if (!D.yaSeEnfrentaron(g[i], g[j])) n++;
        }
      }
    });
    return n;
  };

  /** ¿Ya se han enfrentado estas dos? Se apunta en ambas, así que basta una. */
  D.yaSeEnfrentaron = function (a, b) {
    return (a.valoracion.enfrentamientos[b.id] !== undefined) ||
           (b.valoracion.enfrentamientos[a.id] !== undefined);
  };

  /** Apunta quién ganó un duelo. */
  D.resolverDuelo = function (idGana, idPierde) {
    var g = D.serie(idGana), p = D.serie(idPierde);
    if (!g || !p || !g.valoracion || !p.valoracion) return false;
    g.valoracion.desempate++;
    p.valoracion.desempate--;
    g.valoracion.duelos++;
    p.valoracion.duelos++;
    // En las dos: así da igual por cuál se pregunte después.
    g.valoracion.enfrentamientos[idPierde] = 1;
    p.valoracion.enfrentamientos[idGana] = -1;
    D.guardar();
    return true;
  };

  D.normalizarCapitulos = normalizarCapitulos;

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
          : !!ajustes.mostrarGasto,
        // URL del proxy que lee las fichas de ListadoManga. Guardarla aquí es
        // opcional y la decides tú: viaja a todos tus dispositivos, pero queda
        // a la vista en el repositorio, que es público.
        proxy: ajustes.proxy || ''
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

  /** Guarda la URL del proxy en la colección, para que viaje entre dispositivos. */
  D.guardarProxyEnColeccion = function (url) {
    if (!D.coleccion.ajustes) D.coleccion.ajustes = {};
    D.coleccion.ajustes.proxy = url || '';
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

        D.coleccion = D.normalizarColeccion(local);

        // Si la copia local ya no dice nada que no esté publicado, sobra: se
        // retira y se sigue limpio. Es lo que pasa cuando vuelves después de
        // publicar y el despliegue ya ha llegado.
        if (D.numCambios() === 0) {
          U.borrarLocal(CLAVE_LOCAL);
          U.borrarLocal(CLAVE_BASE);
          D.coleccion = D.clonar(D.publicada);
          D.sucia = false;
          notificar();
          return resultado;
        }

        // ¿Se ha publicado algo nuevo desde que empezaste a editar? Se guarda
        // una copia por si acaso; Ajustes ofrece restaurarla.
        if (selloGuardado && D.publicada.actualizado && selloGuardado !== D.publicada.actualizado) {
          U.guardarLocal(CLAVE_COPIA, local);
          resultado.conflicto = true;
        }

        D.sucia = true;
        notificar();
        return resultado;
      });
    });
  };

  D.clonar = function (obj) { return JSON.parse(JSON.stringify(obj)); };

  /* ---------- Copia de seguridad automática ---------- */

  /**
   * La copia que se guarda cuando el repositorio se adelanta a tus cambios.
   *
   * Existía desde el principio pero no la leía nadie: se escribía y ahí se
   * quedaba, así que no servía para lo único que sirve una copia. Ajustes la
   * ofrece cuando la hay.
   */
  D.copiaGuardada = function () {
    var bruta = U.leerLocal(CLAVE_COPIA, null);
    if (!bruta) return null;
    var c = D.normalizarColeccion(bruta);
    return {
      actualizado: c.actualizado,
      series: c.series.length,
      tomos: c.series.reduce(function (n, s) { return n + s.tomos.length; }, 0),
      valoradas: c.series.filter(function (s) { return D.notaDe(s) !== null; }).length,
      coleccion: c
    };
  };

  /** Vuelve a esa copia. Lo de ahora queda como copia, por si acaso. */
  D.restaurarCopia = function () {
    var copia = D.copiaGuardada();
    if (!copia) return false;
    U.guardarLocal(CLAVE_COPIA, D.clonar(D.coleccion));
    D.coleccion = copia.coleccion;
    D.guardar();
    return true;
  };

  D.descartarCopia = function () { U.borrarLocal(CLAVE_COPIA); };

  /* ---------- Guardado local ---------- */

  D.guardar = function () {
    D.coleccion.actualizado = U.isoHoy();
    D.sucia = true;
    U.guardarLocal(CLAVE_LOCAL, D.coleccion);
    if (D.publicada && D.publicada.actualizado) U.guardarLocal(CLAVE_BASE, D.publicada.actualizado);
    notificar();
  };

  /**
   * Marca los cambios locales como ya publicados en el repo.
   *
   * La copia local NO se borra aquí, y esto importa: GitHub Pages tarda cerca
   * de un minuto en servir el JSON nuevo, y si la página se recarga en esa
   * ventana —en el móvil basta con cambiar de aplicación y volver— no habría
   * copia local y la web caería al JSON viejo. Lo que acabas de publicar
   * desaparecería de la pantalla, y si entonces siguieras editando y volvieras
   * a publicar, se perdería de verdad.
   *
   * La copia se retira sola al cargar, en cuanto lo publicado la alcanza.
   */
  D.marcarPublicada = function () {
    D.publicada = D.clonar(D.coleccion);
    D.sucia = false;
    U.guardarLocal(CLAVE_LOCAL, D.coleccion);
    U.guardarLocal(CLAVE_BASE, D.coleccion.actualizado);
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
    n += Object.keys(previas).length;      // + las eliminadas

    // Los ajustes y el orden de compra viajan en el mismo JSON que las series.
    // Sin contarlos, cambiarlos no ofrecía publicar: se guardaban en este
    // navegador y no había manera de subirlos nunca al repositorio.
    if (JSON.stringify(D.publicada.ajustes) !== JSON.stringify(D.coleccion.ajustes)) n++;
    if (JSON.stringify(D.publicada.compras || {}) !== JSON.stringify(D.coleccion.compras || {})) n++;
    return n;
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
    dejarDeDesear(s);
    D.guardar();
  };

  D.marcarTomo = function (idSerie, numero, campos) {
    var s = D.serie(idSerie);
    if (!s) return;
    var t = D.tomo(s, numero, true);
    Object.keys(campos).forEach(function (k) { t[k] = campos[k]; });
    dejarDeDesear(s);
    D.guardar();
  };

  /**
   * En cuanto tienes o has leído algo de una serie deseada, ya no es un deseo:
   * la has empezado. Si no se hiciera solo, se quedaría a la vez en Deseados y
   * en la Biblioteca, y habría que acordarse de quitarla a mano.
   */
  function dejarDeDesear(s) {
    if (s.deseada && s.tomos.some(function (t) { return t.tengo || t.leido; })) {
      s.deseada = false;
    }
  }

  /* ---------- Estadísticas ---------- */

  D.statsSerie = function (s) {
    var totalDeclarado = D.totalDe(s);
    // Casi todas empiezan por el 1, pero unas pocas tienen un tomo 0. Ahí el
    // número del último tomo ya no coincide con cuántos son: 31 tomos del 0 al 30.
    var primerNumero = D.primerNumeroDe(s);
    var tengo = 0, leidos = 0, leidosSinTener = 0, gasto = 0;
    var conPrecioManual = 0, estimados = 0, sinPrecio = 0;
    var maxTomo = totalDeclarado ? totalDeclarado + primerNumero - 1 : 0;
    var ultimoQueTengo = 0;
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
    var total = totalDeclarado || (maxTomo ? maxTomo - primerNumero + 1 : 0);
    // Huecos = tomos que te faltan por debajo del último que tienes.
    // Los que aún no han salido no son un hueco, son futuro.
    // Los huecos se buscan desde el primer tomo que conste: con un tomo 0, no
    // tenerlo también es un hueco.
    var huecos = [];
    for (var i = primerNumero; i < ultimoQueTengo; i++) {
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
      primerNumero: primerNumero,
      totalDeclarado: totalDeclarado,
      completa: total > 0 && tengo >= total && D.estadoDe(s) === 'finalizada',
      alDia: leidos === tengo && tengo > 0,
      progresoTengo: U.porcentaje(tengo, total),
      progresoLeido: U.porcentaje(leidos, tengo || 1)
    };
  };

  D.statsGlobales = function () {
    var g = {
      series: 0, tomos: 0, leidos: 0, leidosSinTener: 0,
      pendientes: 0, gasto: 0, precioEstimado: 0, sinPrecio: 0,
      seriesCompletas: 0, seriesAbiertas: 0, seriesAbandonadas: 0, seriesDeseadas: 0,
      proximas30: 0
    };
    D.coleccion.series.forEach(function (s) {
      // Las deseadas no cuentan: no son colección, son una lista de la compra.
      if (s.deseada) { g.seriesDeseadas++; return; }
      g.series++;
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

  /* ---------- Lista de deseos ---------- */

  D.deseadas = function () {
    return D.coleccion.series.filter(function (s) { return s.deseada; });
  };

  D.alternarDeseada = function (id) {
    var s = D.serie(id);
    if (!s) return false;
    s.deseada = !s.deseada;
    // No se puede desear algo que ya estás coleccionando.
    if (s.deseada) s.abandonada = false;
    D.guardar();
    return s.deseada;
  };

  /**
   * Lo que costaría comprar entera una serie deseada.
   *
   * Sale del PVP de cada tomo publicado menos tu descuento, que es la misma
   * regla que en el resto de la web. `tomos` son los que se conocen y `todos`
   * dice si están todos: en una serie en publicación aún faltan por salir, así
   * que la cifra es un mínimo, no el total.
   */
  D.costeDeseada = function (serie) {
    var numeros = D.numerosLM(serie);
    var coste = 0, conPrecio = 0;
    numeros.forEach(function (n) {
      var p = D.precioDe(serie, { numero: n.numero, precio: null });
      if (p.valor) { coste += p.valor; conPrecio++; }
    });
    var total = D.totalDe(serie);
    return {
      coste: coste,
      tomos: numeros.length,
      conPrecio: conPrecio,
      total: total,
      // Si la serie sigue abierta o no se sabe el total, lo que sale es un suelo.
      completo: !!total && numeros.length >= total && D.estadoDe(serie) === 'finalizada'
    };
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

  /**
   * Cuántos tomos de la edición original mete tu edición en cada uno.
   *
   * Lo dice el propio nombre cuando es de las que lo dicen: «Edición 3 en 1»,
   * «Nueva Edición 3 en 1». Las kanzenban, las Maximum y las integrales suelen
   * ser de dos en dos pero no lo declaran, y además reparten los capítulos a su
   * aire, así que ahí devuelve 0 y hay que deducirlo por otro lado.
   *
   * @returns {number} el número que diga la edición, o 0.
   */
  D.tomosPorTomo = function (serie) {
    var m = /(\d+)\s*en\s*1/i.exec(D.edicionDe(serie) || '');
    return m ? Number(m[1]) : 0;
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
    var declarado = serie.tomosTotales;
    if (!declarado) {
      var ficha = D.fichaLM(serie);
      declarado = (ficha && ficha.totalNumeros) || 0;
    }
    // Hay series con un tomo 0 —Jujutsu Kaisen— y ese total no lo cuenta:
    // ListadoManga dice 30 y luego lista del 0 al 30, que son 31.
    return declarado && D.hayTomoCero(serie) ? declarado + 1 : declarado;
  };

  /** ¿La serie tiene un tomo 0, en tu colección o en la ficha? */
  D.hayTomoCero = function (serie) {
    return (serie.tomos || []).some(function (t) { return t.numero === 0; }) ||
      D.numerosLM(serie).some(function (n) { return n.numero === 0; });
  };

  /** Por qué número empieza la serie: 1 casi siempre, 0 en las que traen tomo 0. */
  D.primerNumeroDe = function (serie) { return D.hayTomoCero(serie) ? 0 : 1; };

  /**
   * Del primer tomo al último que hay que pintar.
   *
   * Casi siempre empieza en 1, pero con un tomo 0 la cuadrícula tiene que
   * llegar hasta él o no habría forma de marcarlo.
   */
  D.rangoTomos = function (serie) {
    var st = D.statsSerie(serie);
    return { desde: st.primerNumero, hasta: Math.max(st.maxTomo, 1) };
  };

  /* ---------- Capítulos por tomo ---------- */

  /**
   * De qué capítulo a qué capítulo va cada tomo.
   *
   * Se va acumulando desde el primero: el primer tomo empieza en `inicio` y
   * cada uno arranca donde acabó el anterior. Cuántos trae cada uno lo dice la
   * tabla cuando se sabe, y si no, la media.
   *
   * @returns {Object|null} { «1»: {desde, hasta, exacto}, … }, o null sin configurar.
   */
  D.mapaCapitulos = function (serie) {
    var c = serie.capitulos;
    if (!c) return null;
    var rango = D.rangoTomos(serie);
    var mapa = {};
    var cap = c.inicio;
    for (var i = rango.desde; i <= rango.hasta; i++) {
      var exacto = c.tabla[String(i)];
      var cuantos = exacto || c.porTomo;
      // Sin dato y sin media no se puede seguir: a partir de aquí no se sabe
      // dónde empieza ningún tomo, así que se corta en vez de inventar.
      if (!cuantos) break;
      mapa[i] = { desde: cap, hasta: cap + cuantos - 1, exacto: !!exacto };
      cap += cuantos;
    }
    return Object.keys(mapa).length ? mapa : null;
  };

  /** En qué tomo cae un capítulo. null si cae fuera de lo que se sabe. */
  D.tomoDelCapitulo = function (serie, capitulo) {
    var mapa = D.mapaCapitulos(serie);
    if (!mapa) return null;
    var encontrado = null;
    Object.keys(mapa).forEach(function (n) {
      if (capitulo >= mapa[n].desde && capitulo <= mapa[n].hasta) encontrado = Number(n);
    });
    return encontrado;
  };

  /**
   * Marca como leídos los tomos que caben enteros en lo que llevas leído.
   *
   * Solo los completos: si vas por el capítulo 300 y el tomo 34 acaba en el
   * 305, ese tomo aún no está leído. Y no se toca nada más: los que ya
   * estuvieran marcados siguen igual.
   *
   * @returns {number} cuántos tomos se han marcado ahora.
   */
  D.marcarLeidosHastaCapitulo = function (serie, capitulo) {
    var mapa = D.mapaCapitulos(serie);
    if (!mapa || !capitulo) return 0;
    var marcados = 0;
    Object.keys(mapa).forEach(function (n) {
      if (mapa[n].hasta > capitulo) return;
      var t = D.tomo(serie, Number(n), true);
      if (!t.leido) { t.leido = true; marcados++; }
    });
    if (marcados) D.guardar();
    return marcados;
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
      if (s.deseada) return;             // aún no la coleccionas
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
      // Sin esto, una serie deseada de 30 tomos mete sus 30 en Próximas
      // compras: técnicamente están a la venta y no los tienes, pero no has
      // decidido comprarla todavía.
      if (s.deseada) return;
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
   * Los pendientes de compra, uno a uno, en el mismo orden en que los enseña
   * la pestaña de Compras.
   *
   * Allí hay dos formas de ordenarlos y cada una guarda su lista: agrupando
   * por serie manda el orden de las series (y dentro, por número), y tomo a
   * tomo manda el de los tomos. Quien pregunta por «lo que toca comprar»
   * —el resumen, por ejemplo— tiene que ver lo mismo que la pestaña.
   */
  D.compraOrdenada = function (modo) {
    if (modo === 'tomos') return D.pendientesDeCompra();
    return D.pendientesDeCompraPorSerie().reduce(function (lista, g) {
      return lista.concat(g.tomos);
    }, []);
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
