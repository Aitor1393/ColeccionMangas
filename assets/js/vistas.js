/* ============================================================
   vistas.js — render de cada pantalla
   ============================================================ */
(function (global) {
  'use strict';

  var V = {};

  /* ---------- Piezas reutilizables ---------- */

  function chipEstado(serie) {
    var e = D.ESTADOS[D.estadoDe(serie)];
    return '<span class="chip ' + e.clase + '">' + e.etiqueta + '</span>';
  }

  /**
   * Por orden: la que hayas puesto tú, la grande de la editorial y, si no hay
   * ninguna, la de ListadoManga.
   */
  function urlPortada(serie) {
    if (serie.portada) return serie.portada;
    var editorial = D.portadaEditorialDe(serie);
    if (editorial) return editorial;
    var ficha = D.fichaLM(serie);
    return ficha && ficha.portada ? ficha.portada : '';
  }

  function portadaHTML(serie, clase) {
    var url = urlPortada(serie);
    if (url) {
      return '<img class="' + clase + '" src="' + U.esc(url) + '" alt="Portada de ' +
        U.esc(serie.titulo) + '" loading="lazy">';
    }
    return '<div class="' + clase + ' serie__portada--sin">' + U.esc(serie.titulo) + '</div>';
  }

  function miniPortada(serie) {
    var url = urlPortada(serie);
    if (url) {
      return '<img class="fila__portada" src="' + U.esc(url) + '" alt="" loading="lazy">';
    }
    return '<div class="fila__portada"></div>';
  }

  /**
   * Cómo se llama una serie en los listados: solo el nombre de la obra.
   * La edición únicamente se añade si hay otra serie con el mismo nombre y
   * sin ella no habría forma de saber cuál es cuál.
   */
  function nombreListado(serie) {
    var ed = D.edicionDe(serie);
    return serie.titulo + (ed && D.tituloAmbiguo(serie) ? ' (' + ed + ')' : '');
  }
  V.nombreListado = nombreListado;

  /**
   * Antepone «Edición» salvo que el propio nombre ya lo diga: así sale
   * «Edición Maximum» pero también «Edición Grimorio» o «La edición
   * definitiva», sin repetir la palabra.
   */
  function etiquetaEdicion(valor) {
    return /edici[oó]n|edition/i.test(valor) ? valor : 'Edición ' + valor;
  }

  V.tarjetaSerie = function (serie) {
    var st = D.statsSerie(serie);
    var insignia = '';
    if (st.pendientes > 0) {
      insignia = '<span class="serie__insignia serie__insignia--pendiente">' + st.pendientes + ' sin leer</span>';
    } else if (!st.tengo && st.leidosTotal) {
      insignia = '<span class="serie__insignia serie__insignia--leida">✓ leída</span>';
    } else if (st.completa) {
      insignia = '<span class="serie__insignia serie__insignia--completa">✓ completa</span>';
    } else if (st.totalDeclarado) {
      insignia = '<span class="serie__insignia">' + st.tengo + '/' + st.totalDeclarado + '</span>';
    }
    // La marca de abandonada manda sobre las demás: es lo que quieres ver.
    if (serie.abandonada) {
      insignia = '<span class="serie__insignia serie__insignia--abandonada">abandonada</span>';
    }
    // Y si la estás releyendo ahora mismo, eso manda sobre todo lo demás.
    if (D.relee(serie)) {
      insignia = '<span class="serie__insignia serie__insignia--releyendo">🔁 tomo ' +
        serie.relectura.tomo + '</span>';
    }

    return '' +
      '<article class="serie' + (serie.abandonada ? ' serie--abandonada' : '') + '" ' +
        'data-serie="' + U.esc(serie.id) + '" tabindex="0" role="button">' +
        '<div class="serie__portada">' +
          portadaHTML(serie, '') + insignia +
          '<div class="serie__barra' + (!st.tengo && st.leidosTotal ? ' serie__barra--leida' : '') + '">' +
            '<span style="width:' + Math.min(100, !st.tengo && st.leidosTotal
              ? U.porcentaje(st.leidosTotal, st.total || st.maxTomo || 1)
              : st.progresoTengo) + '%"></span></div>' +
        '</div>' +
        '<div>' +
          '<div class="serie__titulo">' + U.esc(serie.titulo) + '</div>' +
          // La edición vive en la ficha, no en el listado; solo asoma aquí
          // cuando sin ella habría dos tarjetas con el mismo nombre.
          (D.tituloAmbiguo(serie) && D.edicionDe(serie)
            ? '<div class="serie__edicion">' + U.esc(D.edicionDe(serie)) + '</div>' : '') +
          '<div class="serie__meta">' +
            '<span>' + (st.tengo
              ? U.plural(st.tengo, 'tomo') + (st.totalDeclarado ? ' de ' + st.totalDeclarado : '')
              : U.plural(st.leidosTotal, 'tomo leído', 'tomos leídos')) + '</span>' +
          '</div>' +
        '</div>' +
      '</article>';
  };

  function rejilla(series, mensajeVacio) {
    if (!series.length) return '<div class="vacio">' + mensajeVacio + '</div>';
    return '<div class="rejilla-series">' + series.map(V.tarjetaSerie).join('') + '</div>';
  }

  /* ============================================================
     Vista: Resumen
     ============================================================ */

  // Qué secciones del resumen tienes plegadas. Es preferencia del navegador,
  // no de la colección: no tiene por qué ser igual para quien la visite.
  V.seccionesPlegadas = U.leerLocal('cm:resumenPlegado', {});

  /**
   * Sección con título pulsable que se pliega. El contador y los botones
   * siguen a la vista plegada, para saber qué hay dentro sin abrirla.
   */
  function seccionPlegable(clave, titulo, contador, extra, cuerpo) {
    var plegada = !!V.seccionesPlegadas[clave];
    return '<section class="seccion">' +
      '<div class="seccion__titulo">' +
        '<button class="plegar" data-accion="plegar-seccion" data-clave="' + U.esc(clave) + '" ' +
          'aria-expanded="' + (plegada ? 'false' : 'true') + '">' +
          '<span class="plegar__flecha' + (plegada ? ' plegar__flecha--cerrada' : '') + '">▾</span>' +
          '<h2>' + U.esc(titulo) + '</h2>' +
        '</button>' +
        '<span class="contador">' + contador + '</span>' + extra +
      '</div>' +
      (plegada ? '' : cuerpo) +
    '</section>';
  }

  V.resumen = function () {
    var g = D.statsGlobales();

    if (!D.coleccion.series.length) {
      return '' +
        '<div class="vacio">' +
          '<h3>Aún no hay nada en la colección</h3>' +
          '<p>Empieza añadiendo tu primera serie: elige tu edición española y se rellenan solos portada, autor, sinopsis, fechas y precios.</p>' +
          '<p><button class="btn btn--primario" data-accion="nueva-serie">+ Añadir mi primera serie</button></p>' +
        '</div>';
    }

    var stats = [
      { valor: g.series, etiqueta: 'Series', extra: g.seriesAbiertas + ' en publicación', icono: '📚' },
      // Con el gasto oculto no se menciona el dinero de ninguna forma: ni el
      // importe, ni un hueco tapado, ni nada en lo que pulsar.
      { valor: g.tomos, etiqueta: 'Tomos en casa',
        extra: D.mostrarGasto()
          ? U.euros(g.gasto) + ' invertidos' + (g.precioEstimado ? ' (aprox.)' : '')
          : 'en ' + U.plural(g.series, 'serie'), icono: '📦' },
      { valor: g.leidos + g.leidosSinTener, etiqueta: 'Tomos leídos',
        extra: g.leidosSinTener
          ? g.leidosSinTener + ' sin tenerlos'
          : U.porcentaje(g.leidos, g.tomos) + '% de lo que tengo', icono: '✅' },
      { valor: g.pendientes, etiqueta: 'Pendientes de leer', extra: g.pendientes ? 'te esperan en la estantería' : '¡al día!', icono: '🕒' },
      { valor: g.proximas30, etiqueta: 'Salen este mes', extra: 'próximos 30 días', icono: '📅' }
    ];

    var html = '<div class="rejilla-stats">' + stats.map(function (s) {
      return '<div class="stat">' +
        '<span class="stat__icono">' + s.icono + '</span>' +
        '<div class="stat__valor">' + s.valor + '</div>' +
        '<div class="stat__etiqueta">' + s.etiqueta + '</div>' +
        '<div class="stat__extra">' + U.esc(s.extra) + '</div>' +
      '</div>';
    }).join('') + '</div>';

    // Próximas salidas
    var proximas = D.proximasPublicaciones(90).slice(0, 6);
    if (proximas.length) {
      html += seccionPlegable('proximas', 'Próximas publicaciones', 'siguientes 90 días',
        '<a href="#/calendario" class="btn btn--pequeno btn--fantasma" style="margin-left:auto">Ver todas</a>',
        '<div class="lista">' + proximas.map(filaSalida).join('') + '</div>');
    }

    // Lo que ya está en las tiendas y todavía te falta: un avance de Compras,
    // en el orden de prioridad que le hayas dado allí.
    var pendientesCompra = D.compraOrdenada(V.modoCompras);
    if (pendientesCompra.length) {
      html += seccionPlegable('venta', 'Ya a la venta y aún no lo tienes', pendientesCompra.length,
        '<a href="#/compras" class="btn btn--pequeno btn--fantasma" style="margin-left:auto">Próximas compras</a>',
        '<div class="lista">' + pendientesCompra.slice(0, 5).map(comoSalida).map(filaSalida).join('') + '</div>');
    }

    // Continuar leyendo
    var continuar = D.continuarLeyendo().slice(0, 12);
    if (continuar.length) {
      html += '<section class="seccion">' +
        '<div class="seccion__titulo"><h2>Continuar leyendo</h2>' +
        '<span class="contador">' + continuar.length + '</span></div>' +
        '<div class="rejilla-series">' +
          continuar.map(function (c) { return V.tarjetaSerie(c.serie); }).join('') +
        '</div>' +
      '</section>';
    }

    return html;
  };

  /** Un pendiente de compra con la forma que espera filaSalida. */
  function comoSalida(t) {
    return {
      serie: t.serie, dias: U.diasHasta(t.fecha), origen: t.origen,
      salida: { numero: t.numero, fecha: t.fecha, precio: t.precio, nota: '' }
    };
  }

  function filaSalida(item) {
    var pasada = item.dias < 0;
    var s = item.salida;

    var detalles = [D.editorialDe(item.serie) || 'Editorial sin indicar'];
    if (s.precio) detalles.push(U.euros(s.precio));
    if (s.nota) detalles.push(U.esc(s.nota));
    if (item.origen === 'listadomanga') detalles.push('vía ListadoManga');

    return '<div class="fila" data-serie="' + U.esc(item.serie.id) + '">' +
      miniPortada(item.serie) +
      '<div class="fila__cuerpo">' +
        '<div class="fila__titulo">' + U.esc(nombreListado(item.serie)) + ' <span class="chip">Tomo ' + s.numero + '</span></div>' +
        '<div class="fila__sub">' + detalles.join(' · ') + '</div>' +
      '</div>' +
      '<div class="fila__fecha">' +
        '<strong>' + (s.aproximada ? U.mesLargo(s.fecha) : U.fechaCorta(s.fecha)) + '</strong>' +
        '<span>' + (s.aproximada ? 'fecha aproximada' : U.cuando(s.fecha)) + '</span>' +
      '</div>' +
      '<div class="fila__acciones">' +
        '<button class="btn btn--pequeno' + (pasada ? ' btn--primario' : '') + '" data-accion="comprado" ' +
          'data-serie-id="' + U.esc(item.serie.id) + '" data-tomo="' + s.numero + '">Ya lo tengo</button>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     Vista: Biblioteca
     ============================================================ */
  V.filtros = { texto: '', estado: '', demografia: '', editorial: '', tenencia: '', seguimiento: '', orden: 'titulo', soloPendientes: false };

  // El panel arranca cerrado: lo normal al entrar en la Biblioteca es mirar
  // las portadas, no filtrar. Se abre con el botón y se recuerda abierto.
  V.filtrosAbiertos = U.leerLocal('cm:filtrosBiblioteca', false);

  /**
   * Cuántos filtros están puestos ahora mismo.
   *
   * El orden no cuenta: cambia cómo se ven las series, no cuáles. Sirve para
   * avisar en el botón de que la lista está recortada aunque el panel esté
   * cerrado; si no, verías menos series sin saber por qué.
   */
  function filtrosPuestos() {
    var f = V.filtros;
    return ['texto', 'tenencia', 'seguimiento', 'estado', 'demografia', 'editorial']
      .filter(function (k) { return f[k]; }).length + (f.soloPendientes ? 1 : 0);
  }

  V.biblioteca = function () {
    var f = V.filtros;

    var opciones = function (valores, sel, mapa) {
      return valores.map(function (v) {
        var etiqueta = mapa ? (mapa[v] && mapa[v].etiqueta ? mapa[v].etiqueta : (mapa[v] || v)) : v;
        return '<option value="' + U.esc(v) + '"' + (sel === v ? ' selected' : '') + '>' + U.esc(etiqueta) + '</option>';
      }).join('');
    };

    var barra = '<div class="filtros" id="panelFiltros"' + (V.filtrosAbiertos ? '' : ' hidden') + '>' +
      '<div class="buscador"><input type="text" id="fTexto" placeholder="Buscar por título, edición, autor, editorial o etiqueta…" value="' + U.esc(f.texto) + '"></div>' +
      '<select id="fTenencia">' +
        '<option value=""' + (f.tenencia ? '' : ' selected') + '>Comprados y leídos</option>' +
        '<option value="comprados"' + (f.tenencia === 'comprados' ? ' selected' : '') + '>Solo comprados</option>' +
        '<option value="leidos"' + (f.tenencia === 'leidos' ? ' selected' : '') + '>Solo leídos, sin comprar</option>' +
      '</select>' +
      '<select id="fEstado"><option value="">Cualquier estado</option>' + opciones(Object.keys(D.ESTADOS), f.estado, D.ESTADOS) + '</select>' +
      '<select id="fSeguimiento">' +
        '<option value=""' + (f.seguimiento ? '' : ' selected') + '>Sigo y abandonadas</option>' +
        '<option value="sigo"' + (f.seguimiento === 'sigo' ? ' selected' : '') + '>Solo las que sigo</option>' +
        '<option value="abandonadas"' + (f.seguimiento === 'abandonadas' ? ' selected' : '') + '>Solo abandonadas</option>' +
        '<option value="releyendo"' + (f.seguimiento === 'releyendo' ? ' selected' : '') + '>Las que estoy releyendo</option>' +
      '</select>' +
      '<select id="fDemografia"><option value="">Cualquier demografía</option>' + opciones(Object.keys(D.DEMOGRAFIAS), f.demografia, D.DEMOGRAFIAS) + '</select>' +
      '<select id="fEditorial"><option value="">Cualquier editorial</option>' + opciones(D.editoriales(), f.editorial) + '</select>' +
      '<select id="fOrden">' +
        '<option value="titulo"' + (f.orden === 'titulo' ? ' selected' : '') + '>Ordenar: título</option>' +
        '<option value="pendientes"' + (f.orden === 'pendientes' ? ' selected' : '') + '>Ordenar: más pendientes</option>' +
        '<option value="tomos"' + (f.orden === 'tomos' ? ' selected' : '') + '>Ordenar: más tomos</option>' +
        '<option value="reciente"' + (f.orden === 'reciente' ? ' selected' : '') + '>Ordenar: añadidas hace poco</option>' +
      '</select>' +
      '<label style="display:flex;align-items:center;gap:6px;margin:0;font-size:.85rem;white-space:nowrap">' +
        '<input type="checkbox" id="fPendientes" style="width:auto"' + (f.soloPendientes ? ' checked' : '') + '> Solo con pendientes' +
      '</label>' +
    '</div>';

    // La cabecera y los resultados se repintan solos al filtrar, sin tocar el
    // panel: si se recreara el <input>, el cursor saltaría al principio en
    // cuanto escribieras la segunda letra.
    return '<div class="vista__cabecera"><div class="crece">' +
        '<h1>Biblioteca</h1>' +
        '<p id="bibCuenta">' + V.bibliotecaCuenta() + '</p>' +
      '</div><div class="acciones-vista" id="bibAcciones">' + V.bibliotecaAcciones() + '</div></div>' + barra +
      '<div id="bibResultados">' + V.bibliotecaResultados() + '</div>';
  };

  V.bibliotecaResultados = function () {
    return rejilla(V.filtrar(D.coleccion.series),
      '<h3>Ningún resultado</h3><p>Prueba a aflojar los filtros.</p>');
  };

  V.bibliotecaCuenta = function () {
    var n = V.filtrar(D.coleccion.series).length;
    return U.plural(n, 'serie') + ' de ' + D.coleccion.series.length +
      (filtrosPuestos() && !V.filtrosAbiertos ? ' · lista filtrada' : '');
  };

  V.bibliotecaAcciones = function () {
    var puestos = filtrosPuestos();
    return '<button class="btn' + (puestos ? ' btn--primario' : '') + '" ' +
        'data-accion="alternar-filtros" aria-expanded="' + (V.filtrosAbiertos ? 'true' : 'false') + '" ' +
        'aria-controls="panelFiltros">🔍 Buscar y filtrar' +
        (puestos ? ' <span class="contador-filtros">' + puestos + '</span>' : '') + '</button>' +
      (puestos ? '<button class="btn btn--fantasma btn--pequeno" data-accion="limpiar-filtros">Quitar filtros</button>' : '');
  };

  V.filtrar = function (series) {
    var f = V.filtros;
    var texto = U.normalizar(f.texto);

    var lista = series.filter(function (s) {
      if (f.tenencia) {
        var st = D.statsSerie(s);
        if (f.tenencia === 'comprados' && !st.tengo) return false;
        if (f.tenencia === 'leidos' && (st.tengo || !st.leidosTotal)) return false;
      }
      if (f.seguimiento === 'sigo' && s.abandonada) return false;
      if (f.seguimiento === 'abandonadas' && !s.abandonada) return false;
      if (f.seguimiento === 'releyendo' && !D.relee(s)) return false;
      if (f.estado && D.estadoDe(s) !== f.estado) return false;
      if (f.demografia && D.demografiaDe(s) !== f.demografia) return false;
      if (f.editorial && D.editorialDe(s) !== f.editorial) return false;
      if (f.soloPendientes && D.statsSerie(s).pendientes === 0) return false;
      if (texto) {
        // Se sigue pudiendo buscar «maximum» aunque ya no salga en el título.
        var heno = U.normalizar([s.titulo, s.tituloAlt, D.edicionDe(s), s.autor,
          s.editorial, s.etiquetas.join(' ')].join(' '));
        if (heno.indexOf(texto) === -1) return false;
      }
      return true;
    });

    var orden = {
      titulo: function (a, b) { return a.titulo.localeCompare(b.titulo, 'es'); },
      pendientes: function (a, b) { return D.statsSerie(b).pendientes - D.statsSerie(a).pendientes; },
      tomos: function (a, b) { return D.statsSerie(b).tengo - D.statsSerie(a).tengo; },
      reciente: function (a, b) { return String(b.anadida).localeCompare(String(a.anadida)); }
    };
    return lista.sort(orden[f.orden] || orden.titulo);
  };

  /* ============================================================
     Vista: Pendientes de leer
     ============================================================ */
  V.pendientes = function () {
    var lista = D.tomosPendientes();

    if (!lista.length) {
      return '<div class="vista__cabecera"><div class="crece"><h1>Pendientes de leer</h1></div></div>' +
        '<div class="vacio"><h3>¡No tienes nada pendiente!</h3><p>Has leído todos los tomos que tienes en casa.</p></div>';
    }

    // Agrupados por serie
    var porSerie = [];
    var indice = {};
    lista.forEach(function (item) {
      if (!indice[item.serie.id]) {
        indice[item.serie.id] = { serie: item.serie, tomos: [] };
        porSerie.push(indice[item.serie.id]);
      }
      indice[item.serie.id].tomos.push(item.tomo);
    });

    var html = '<div class="vista__cabecera"><div class="crece">' +
      '<h1>Pendientes de leer</h1>' +
      '<p>' + U.plural(lista.length, 'tomo') + ' en ' + U.plural(porSerie.length, 'serie') + ' esperando en la estantería</p>' +
    '</div></div><div class="lista">';

    html += porSerie.map(function (g) {
      var nums = g.tomos.map(function (t) { return t.numero; });
      return '<div class="fila" data-serie="' + U.esc(g.serie.id) + '">' +
        miniPortada(g.serie) +
        '<div class="fila__cuerpo">' +
          '<div class="fila__titulo">' + U.esc(nombreListado(g.serie)) + '</div>' +
          '<div class="fila__sub">Tomos ' + nums.join(', ') + '</div>' +
        '</div>' +
        '<div class="fila__acciones">' +
          '<span class="chip chip--ambar">' + nums.length + '</span>' +
          '<button class="btn btn--pequeno" data-accion="leer-siguiente" ' +
            'data-serie-id="' + U.esc(g.serie.id) + '" data-tomo="' + Math.min.apply(null, nums) + '">Leí el ' + Math.min.apply(null, nums) + '</button>' +
        '</div>' +
      '</div>';
    }).join('');

    return html + '</div>';
  };

  /* ============================================================
     Vista: Ranking
     ============================================================ */
  V.modoRanking = U.leerLocal('cm:vistaRanking', 'nota');

  V.ranking = function () {
    var porDisfrute = V.modoRanking === 'disfrute';
    var lista = D.ranking(porDisfrute);
    var pendientes = D.sinValorar();
    var duelo = D.duelo();

    var html = '<div class="vista__cabecera"><div class="crece">' +
      '<h1>Ranking</h1>' +
      '<p>Tus series puntuadas de mejor a peor. Puedes valorar todo lo que hayas ' +
      'leído, lo tengas o no.</p>' +
      notaRanking(lista.length, pendientes.length) +
    '</div>' +
    '<div class="conmutador">' +
      '<button class="' + (porDisfrute ? '' : 'activo') + '" ' +
        'data-accion="modo-ranking" data-modo="nota">Por nota</button>' +
      '<button class="' + (porDisfrute ? 'activo' : '') + '" ' +
        'data-accion="modo-ranking" data-modo="disfrute">Por disfrute</button>' +
    '</div></div>';

    if (!lista.length) {
      return html + '<div class="vacio"><h3>Aún no has valorado nada</h3>' +
        '<p>' + (pendientes.length
          ? 'Tienes ' + U.plural(pendientes.length, 'serie leída', 'series leídas') +
            ' esperando nota. Empieza por una:</p>' +
            '<button class="btn btn--primario" data-accion="valorar" data-serie-id="' +
            U.esc(pendientes[0].id) + '">Valorar «' + U.esc(pendientes[0].titulo) + '»</button>'
          : 'Marca algún tomo como leído y podrás puntuar esa serie.</p>') +
        '</div>';
    }

    // El duelo solo aparece cuando de verdad hay un empate que romper.
    if (duelo && !porDisfrute) {
      html += '<div class="duelo-aviso">' +
        '<span>⚔ <strong>' + U.esc(duelo[0].titulo) + '</strong> y <strong>' +
          U.esc(duelo[1].titulo) + '</strong> están empatadas a ' + U.esc(String(D.notaDe(duelo[0]))) +
          '. ¿Cuál es mejor?</span>' +
        '<button class="btn btn--pequeno" data-accion="duelo">Desempatar</button>' +
      '</div>';
    }

    if (pendientes.length) {
      html += '<div class="resumen-compras">' +
        '<span>' + U.plural(pendientes.length, 'serie leída sin nota', 'series leídas sin nota') + '</span>' +
        '<button class="btn btn--pequeno" style="margin-left:auto" ' +
          'data-accion="valorar" data-serie-id="' + U.esc(pendientes[0].id) + '">' +
          'Valorar «' + U.esc(pendientes[0].titulo) + '»</button>' +
      '</div>';
    }

    html += '<div class="lista">' + lista.map(function (s, i) {
      return filaRanking(s, i + 1, porDisfrute);
    }).join('') + '</div>';

    return html;
  };

  /**
   * La anotación de debajo del título: cuántas llevas y qué entra aquí.
   *
   * Aquí NO vale el aviso de «las abandonadas quedan fuera» que llevan Compras
   * y Pendientes: en el ranking entran, y de hecho valorarlas es la forma de
   * acordarte de por qué las dejaste.
   */
  function notaRanking(valoradas, pendientes) {
    var abandonadas = D.abandonadas();
    var sinNota = abandonadas.filter(function (s) { return D.notaDe(s) === null; }).length;

    return '<p class="ayuda">' +
      U.plural(valoradas, 'serie valorada', 'series valoradas') +
      (pendientes ? ' · ' + pendientes + ' sin nota' : '') +
      (abandonadas.length
        ? ' · las que dejaste también entran' +
          (sinNota ? ', y ' + sinNota + ' están sin puntuar' : '') +
          '. <a href="#/biblioteca" data-accion="ver-abandonadas">Verlas</a>'
        : '') +
    '</p>';
  }

  function filaRanking(serie, puesto, porDisfrute) {
    var v = serie.valoracion;
    var nota = D.notaDe(serie);
    var destacada = porDisfrute ? v.disfrute : nota;
    var portada = urlPortada(serie);

    var desglose = D.CRITERIOS.filter(function (c) { return v.criterios[c.id]; })
      .map(function (c) {
        return '<span class="critica"><i>' + U.esc(c.nombre) + '</i>' + v.criterios[c.id] + '</span>';
      }).join('');

    var aparte = porDisfrute
      ? (nota !== null ? 'Nota ' + nota : '')
      : (v.disfrute ? 'Disfrute ' + v.disfrute : '');

    return '<div class="fila fila--ranking" data-accion="abrir-serie" data-serie-id="' + U.esc(serie.id) + '">' +
      '<span class="puesto">' + puesto + '</span>' +
      (portada ? '<img class="fila__portada" src="' + U.esc(portada) + '" alt="" loading="lazy">' : '') +
      '<div class="crece">' +
        '<div class="fila__titulo">' + U.esc(nombreListado(serie)) + '</div>' +
        '<div class="fila__sub">' + (desglose || 'Sin desglose') +
          (aparte ? '<span class="critica critica--aparte">' + aparte + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<span class="nota">' + (destacada === null || destacada === undefined ? '—' : destacada) + '</span>' +
      '<button class="btn btn--pequeno" data-accion="valorar" data-serie-id="' + U.esc(serie.id) + '">Cambiar</button>' +
    '</div>';
  }

  /* ============================================================
     Vista: Próximas compras
     ============================================================ */
  V.modoCompras = U.leerLocal('cm:vistaCompras', 'series');

  V.compras = function () {
    var tomos = D.pendientesDeCompra();
    var grupos = D.pendientesDeCompraPorSerie();
    var coste = tomos.reduce(function (n, t) { return n + t.precio; }, 0);
    var sinPrecio = tomos.filter(function (t) { return !t.precio; }).length;

    var html = '<div class="vista__cabecera"><div class="crece">' +
      '<h1>Próximas compras</h1>' +
      '<p>Tomos que ya están a la venta y todavía no tienes, salieran cuando salieran. ' +
      'Ponlos en el orden en que quieras comprarlos; al marcar uno como comprado ' +
      'desaparece de aquí.</p>' +
    '</div>' +
    '<div class="conmutador">' +
      '<button class="' + (V.modoCompras === 'series' ? 'activo' : '') + '" ' +
        'data-accion="modo-compras" data-modo="series">Por serie</button>' +
      '<button class="' + (V.modoCompras === 'tomos' ? 'activo' : '') + '" ' +
        'data-accion="modo-compras" data-modo="tomos">Tomo a tomo</button>' +
    '</div></div>';

    if (!tomos.length) {
      return html + '<div class="vacio"><h3>No te falta nada a la venta</h3>' +
        '<p>Tienes todos los tomos que han salido ya. Lo que aún no se ha publicado ' +
        'lo verás en <a href="#/calendario">Próximas publicaciones</a>.</p></div>' +
        avisoFuera();
    }

    var modo = V.modoCompras;
    var hayOrden = ((D.coleccion.compras && D.coleccion.compras[modo]) || []).length > 0;

    html += '<div class="resumen-compras">' +
      '<span><strong>' + U.plural(tomos.length, 'tomo') + '</strong> en ' +
        U.plural(grupos.length, 'serie') + '</span>' +
      (coste ? '<span>≈ <strong>' + U.euros(coste) + '</strong> en total' +
        (sinPrecio ? ' · ' + U.plural(sinPrecio, 'tomo sin precio') : '') + '</span>' : '') +
      (hayOrden ? '<button class="btn btn--pequeno btn--fantasma" data-accion="orden-automatico" ' +
        'data-modo="' + modo + '">Volver al orden automático</button>'
        : '<span class="ayuda">Ordenados por el que lleva más tiempo esperando</span>') +
    '</div>' + avisoFuera();

    var filas = modo === 'series' ? grupos.map(filaCompraSerie) : tomos.map(filaCompraTomo);
    return html + '<div class="lista lista--ordenable">' + filas.join('') + '</div>';
  };

  /**
   * Las series abandonadas no entran ni aquí ni en Próximas publicaciones,
   * pero eso no puede ser invisible: se dice cuántas quedan fuera y se enlaza
   * al filtro que las enseña.
   */
  function avisoAbandonadas() {
    var n = D.abandonadas().length;
    if (!n) return '';
    return '<p class="ayuda" style="margin:-6px 0 16px">' +
      U.plural(n, 'serie abandonada queda', 'series abandonadas quedan') + ' fuera de esta cuenta. ' +
      '<a href="#/biblioteca" data-accion="ver-abandonadas">Verlas</a></p>';
  }

  /** Lo que queda fuera de Próximas compras, dicho en voz alta. */
  function avisoFuera() {
    var leidos = D.leidosSinComprar().length;
    return avisoAbandonadas() +
      (leidos
        ? '<p class="ayuda" style="margin:-6px 0 16px">' +
          U.plural(leidos, 'tomo que leíste sin comprarlo', 'tomos que leíste sin comprarlos') +
          ' tampoco cuenta' + (leidos === 1 ? '' : 'n') + ': ya los has disfrutado.</p>'
        : '');
  }

  /** Flechas para colocar un elemento donde quieras en la lista de compra. */
  /**
   * Flechas para mover de uno en uno y una casilla para escribir el puesto
   * directamente: con listas largas, bajar algo veinte posiciones a golpe de
   * flecha es inviable.
   */
  function flechasOrden(clave, i, total) {
    return '<div class="orden">' +
      '<button class="orden__btn" data-accion="mover-compra" data-clave="' + U.esc(clave) + '" ' +
        'data-dir="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="Comprar antes">▲</button>' +
      '<input class="orden__num" type="number" inputmode="numeric" min="1" max="' + total + '" ' +
        'value="' + (i + 1) + '" data-posicion="' + U.esc(clave) + '" ' +
        'title="Escribe el puesto que quieras y el resto se corre" ' +
        'aria-label="Puesto ' + (i + 1) + ' de ' + total + '">' +
      '<button class="orden__btn" data-accion="mover-compra" data-clave="' + U.esc(clave) + '" ' +
        'data-dir="1"' + (i === total - 1 ? ' disabled' : '') + ' aria-label="Comprar después">▼</button>' +
    '</div>';
  }

  function filaCompraSerie(g, i, todos) {
    var nums = g.tomos.map(function (t) {
      return '<button class="tomo-chip" ' +
        'data-accion="comprado" data-serie-id="' + U.esc(g.serie.id) + '" data-tomo="' + t.numero + '" ' +
        'title="Marcar el tomo ' + t.numero + ' como comprado">' + t.numero + '</button>';
    }).join('');

    return '<div class="fila fila--compra">' +
      flechasOrden(g.clave, i, todos.length) +
      miniPortada(g.serie) +
      '<div class="fila__cuerpo">' +
        '<div class="fila__titulo" data-serie="' + U.esc(g.serie.id) + '">' +
          U.esc(nombreListado(g.serie)) + '</div>' +
        '<div class="fila__sub">' + U.plural(g.tomos.length, 'tomo') + ' a la venta' +
          (g.coste ? ' · ≈ ' + U.euros(g.coste) : '') +
          ' · el más antiguo salió ' + U.cuando(g.tomos[0].fecha) + '</div>' +
        '<div class="tomo-chips">' + nums + '</div>' +
      '</div>' +
    '</div>';
  }

  function filaCompraTomo(t, i, todos) {
    return '<div class="fila fila--compra">' +
      flechasOrden(t.clave, i, todos.length) +
      miniPortada(t.serie) +
      '<div class="fila__cuerpo">' +
        '<div class="fila__titulo" data-serie="' + U.esc(t.serie.id) + '">' +
          U.esc(nombreListado(t.serie)) + ' <span class="chip">Tomo ' + t.numero + '</span></div>' +
        '<div class="fila__sub">Salió ' + U.cuando(t.fecha) + ' · ' + U.fechaCorta(t.fecha) +
          (t.precio ? ' · ≈ ' + U.euros(t.precio) : ' · sin precio') + '</div>' +
      '</div>' +
      '<div class="fila__acciones">' +
        '<button class="btn btn--pequeno" data-accion="comprado" ' +
          'data-serie-id="' + U.esc(t.serie.id) + '" data-tomo="' + t.numero + '">Comprado</button>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     Vista: Calendario de próximas publicaciones
     ============================================================ */
  V.modoProximas = U.leerLocal('cm:vistaProximas', 'lista');

  V.calendario = function () {
    var proximas = D.proximasPublicaciones();
    var pendientesCompra = D.pendientesDeCompra();

    var html = '<div class="vista__cabecera"><div class="crece">' +
      '<h1>Próximas publicaciones</h1>' +
      '<p>Fechas de ListadoManga para las series enlazadas, más las que apuntes tú a mano. ' +
      'Los tomos que ya tienes no aparecen.' +
      (D.calendario.actualizado ? ' Última descarga: ' + U.fechaLarga(D.calendario.actualizado) + '.' : '') +
      '</p>' +
    '</div>' +
    '<div class="conmutador">' +
      '<button class="' + (V.modoProximas === 'lista' ? 'activo' : '') + '" ' +
        'data-accion="modo-proximas" data-modo="lista">Lista</button>' +
      '<button class="' + (V.modoProximas === 'calendario' ? 'activo' : '') + '" ' +
        'data-accion="modo-proximas" data-modo="calendario">Calendario</button>' +
    '</div></div>';

    // Aquí solo va lo que está por salir. Lo que ya salió y te falta tiene su
    // propia sección, así que se enlaza en vez de repetir la lista entera.
    if (pendientesCompra.length) {
      html += '<div class="resumen-compras">' +
        '<span>Te faltan <strong>' + U.plural(pendientesCompra.length, 'tomo') +
          '</strong> que ya están a la venta.</span>' +
        '<a href="#/compras" class="btn btn--pequeno" style="margin-left:auto">Ver próximas compras</a>' +
      '</div>';
    }

    if (!proximas.length) {
      return html + '<div class="vacio"><h3>No hay fechas apuntadas</h3>' +
        '<p>Enlaza tus series con su edición para que lleguen solas, o usa ' +
        '«Añadir fecha de salida» en el detalle de la serie.</p></div>';
    }

    return html + avisoAbandonadas() +
      (V.modoProximas === 'calendario' ? vistaMeses(proximas) : vistaLista(proximas));
  };

  /** Modo lista: las salidas agrupadas por mes, una debajo de otra. */
  function vistaLista(proximas) {
    var meses = [];
    var indice = {};
    proximas.forEach(function (item) {
      var clave = U.mesLargo(item.salida.fecha);
      if (!indice[clave]) { indice[clave] = []; meses.push({ nombre: clave, items: indice[clave] }); }
      indice[clave].push(item);
    });

    return meses.map(function (m) {
      return '<div class="mes">' +
        '<div class="mes__titulo">' + U.esc(m.nombre) + ' · ' + U.plural(m.items.length, 'tomo') + '</div>' +
        '<div class="lista">' + m.items.map(filaSalida).join('') + '</div>' +
      '</div>';
    }).join('');
  }

  /**
   * Modo calendario: los tres meses siguientes en cuadrícula. Los días con
   * salidas se marcan y, al pulsarlos, se abre el detalle de ese día.
   */
  function vistaMeses(proximas) {
    // Agrupamos por día para saber qué casillas marcar.
    var porDia = {};
    proximas.forEach(function (item) {
      var f = String(item.salida.fecha).slice(0, 10);
      (porDia[f] = porDia[f] || []).push(item);
    });

    var hoy = U.hoy();
    var html = '<div class="meses">';
    for (var i = 0; i < 3; i++) {
      html += mesHTML(hoy.getFullYear(), hoy.getMonth() + i, porDia, hoy);
    }
    return html + '</div>' +
      '<p class="ayuda" style="margin-top:14px">Pulsa un día marcado para ver qué sale.</p>';
  }

  var DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  function mesHTML(anio, mes, porDia, hoy) {
    var primero = new Date(anio, mes, 1);
    var diasEnMes = new Date(anio, mes + 1, 0).getDate();

    // getDay() da 0 para domingo; aquí la semana empieza en lunes.
    var hueco = (primero.getDay() + 6) % 7;

    var celdas = '';
    for (var h = 0; h < hueco; h++) celdas += '<div class="dia dia--vacio"></div>';

    for (var d = 1; d <= diasEnMes; d++) {
      var fecha = primero.getFullYear() + '-' + U.pad(mes + 1) + '-' + U.pad(d);
      var items = porDia[fecha] || [];
      var esHoy = hoy.getFullYear() === primero.getFullYear() &&
        hoy.getMonth() === mes && hoy.getDate() === d;

      var clase = 'dia' + (items.length ? ' dia--conSalidas' : '') + (esHoy ? ' dia--hoy' : '');
      celdas += '<' + (items.length ? 'button' : 'div') + ' class="' + clase + '"' +
        (items.length
          ? ' data-accion="ver-dia" data-fecha="' + fecha + '"' +
            ' title="' + U.esc(U.plural(items.length, 'tomo') + ' el ' + U.fechaLarga(fecha)) + '"'
          : '') +
        '>' +
        '<span class="dia__numero">' + d + '</span>' +
        (items.length ? '<span class="dia__marca">' + items.length + '</span>' : '') +
        '</' + (items.length ? 'button' : 'div') + '>';
    }

    return '<div class="mes-rejilla">' +
      '<div class="mes-rejilla__titulo">' + U.esc(U.mesLargo(anio + '-' + U.pad(mes + 1) + '-01')) + '</div>' +
      '<div class="semana">' + DIAS.map(function (n) {
        return '<span class="semana__dia">' + n + '</span>';
      }).join('') + '</div>' +
      '<div class="dias">' + celdas + '</div>' +
    '</div>';
  }

  /* ============================================================
     Vista: Ajustes
     ============================================================ */
  V.ajustes = function () {
    var cfg = GH.config();
    var g = D.statsGlobales();

    return '' +
      '<div class="vista__cabecera"><div class="crece"><h1>Ajustes</h1>' +
      '<p>Copias de seguridad, publicación y datos de la colección.</p></div></div>' +

      '<div class="tarjeta">' +
        '<h3>Publicar en la web</h3>' +
        '<p>La web pública lee <code>' + U.esc(D.RUTA_JSON) + '</code> del repositorio. Mientras no publiques, tus cambios solo existen en este navegador.</p>' +
        '<div class="tarjeta__acciones">' +
          '<button class="btn btn--primario" data-accion="publicar">Publicar cambios</button>' +
          '<button class="btn" data-accion="exportar">Descargar JSON</button>' +
        '</div>' +
      '</div>' +

      '<div class="tarjeta">' +
        '<h3>Guardar directamente en GitHub</h3>' +
        '<p>Opcional. Con un token de acceso personal, el botón «Publicar» escribe el JSON en el repositorio y la web se actualiza sola en un minuto.</p>' +
        '<p>El token se guarda <strong>cifrado con tu contraseña</strong> y solo en este navegador. ' +
        'Sin la contraseña no se puede descifrar, así que nadie puede publicar aunque coja tu móvil ' +
        'o mire el almacenamiento del navegador.</p>' +
        (GH.configurado()
          ? '<p class="ayuda">' + (GH.bloqueado()
              ? '🔒 Hay un token guardado y bloqueado. Se te pedirá la contraseña al publicar.'
              : '🔓 Token desbloqueado en esta pestaña.') + '</p>'
          : '') +
        '<div class="campos">' +
          '<div><label for="ghOwner">Usuario u organización</label><input type="text" id="ghOwner" value="' + U.esc(cfg.owner) + '"></div>' +
          '<div><label for="ghRepo">Repositorio</label><input type="text" id="ghRepo" value="' + U.esc(cfg.repo) + '"></div>' +
          '<div><label for="ghRama">Rama</label><input type="text" id="ghRama" value="' + U.esc(cfg.rama) + '"></div>' +
          '<div class="campo--ancho">' +
            '<label for="ghToken">Token (fine-grained, permiso «Contents: Read and write» solo en este repo)</label>' +
            '<input type="password" id="ghToken" placeholder="' + (GH.configurado() ? '•••••••• (ya guardado, escribe uno nuevo para cambiarlo)' : 'github_pat_…') + '" autocomplete="off">' +
            '<div class="ayuda">Créalo en github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens.</div>' +
          '</div>' +
          '<div><label for="ghClave">Contraseña para publicar</label>' +
            '<input type="password" id="ghClave" autocomplete="new-password" placeholder="la que quieras"></div>' +
          '<div><label for="ghClave2">Repite la contraseña</label>' +
            '<input type="password" id="ghClave2" autocomplete="new-password"></div>' +
        '</div>' +
        '<div class="ayuda">Apúntala donde no se te pierda: si la olvidas, hay que generar un token nuevo. ' +
        'No se guarda en ningún sitio, ni siquiera cifrada.</div>' +
        '<div class="tarjeta__acciones">' +
          '<button class="btn btn--primario" data-accion="guardar-gh">Guardar y probar</button>' +
          (GH.configurado() ? '<button class="btn btn--peligro" data-accion="olvidar-gh">Olvidar token</button>' : '') +
          (GH.configurado() && !GH.bloqueado() ? '<button class="btn" data-accion="bloquear-gh">Bloquear ahora</button>' : '') +
        '</div>' +
      '</div>' +

      '<div class="tarjeta">' +
        '<h3>Traer los datos al momento</h3>' +
        '<p>Sin esto, los datos de una edición nueva (portada, autor, sinopsis, fechas y ' +
        'precios) llegan cuando publicas. Con un proxy configurado se traen <strong>al elegir ' +
        'la edición</strong>, sin esperar.</p>' +
        '<p class="ayuda">ListadoManga no envía cabeceras CORS, así que el navegador no puede ' +
        'consultarlo directamente. El repositorio incluye un Worker de Cloudflare listo para ' +
        'desplegar gratis en <code>workers/listadomanga-proxy.js</code>.</p>' +
        '<div class="campos">' +
          '<div class="campo--ancho"><label for="fiProxy">URL del proxy</label>' +
            '<input type="url" id="fiProxy" value="' + U.esc(FI.proxy()) + '" ' +
            'placeholder="https://mi-proxy.workers.dev/?id={id}">' +
            '<div class="ayuda">Puedes usar <code>{id}</code> donde vaya el número de la ' +
            'colección; si no lo pones, se añade como parámetro <code>id</code>.</div></div>' +
          '<div class="campo--ancho">' +
            '<label style="display:flex;align-items:center;gap:8px;margin:0">' +
              '<input type="checkbox" id="fiViaja" style="width:auto"' +
              (D.coleccion.ajustes && D.coleccion.ajustes.proxy ? ' checked' : '') + '> ' +
              'Guardarla en la colección para usarla en todos mis dispositivos</label>' +
            '<div class="ayuda">Sin marcar, la URL se queda solo en este navegador y hay que ' +
              'volver a ponerla en cada dispositivo. Marcada, viaja con la colección al ' +
              'publicar — pero el repositorio es público y quedará a la vista. El Worker solo ' +
              'deja leer fichas de ListadoManga y solo responde a tu web, así que lo único ' +
              'que arriesgas es que alguien te gaste cuota de Cloudflare.</div></div>' +
        '</div>' +
        '<div class="tarjeta__acciones">' +
          '<button class="btn btn--primario" data-accion="guardar-proxy">Guardar y probar</button>' +
          (FI.hayProxy() ? '<button class="btn btn--peligro" data-accion="quitar-proxy">Quitar proxy</button>' : '') +
        '</div>' +
        '<div id="fiResultado"></div>' +
      '</div>' +

      '<div class="tarjeta">' +
        '<h3>Precios y gasto</h3>' +
        '<p><label style="display:flex;align-items:center;gap:8px;margin:0;font-size:.92rem">' +
          '<input type="checkbox" id="ajMostrarGasto" style="width:auto"' +
          (D.coleccion.ajustes && D.coleccion.ajustes.mostrarGasto ? ' checked' : '') + '> ' +
          'Mostrar el dinero invertido en el resumen</label>' +
          '<span class="ayuda">La web es pública y cualquiera puede abrirla, así que va ' +
          'oculto por defecto: con el interruptor apagado no se menciona el dinero en ' +
          'ninguna parte del resumen.</span></p>' +
        '<p>Cuando no escribes el precio de un tomo, se calcula a partir del PVP que ' +
        'publica ListadoManga aplicando tu descuento habitual. Los precios que escribas ' +
        'tú mandan siempre y se usan tal cual, sin descuento.</p>' +
        '<div class="campos">' +
          '<div><label for="ajDescuento">Descuento habitual (%)</label>' +
            '<input type="text" id="ajDescuento" inputmode="decimal" value="' + U.numeroTexto(D.descuento()) + '"></div>' +
        '</div>' +
        '<div class="ayuda">Ahora mismo: ' + U.plural(g.precioEstimado, 'tomo estimado', 'tomos estimados') +
        (g.sinPrecio ? ' y ' + U.plural(g.sinPrecio, 'tomo sin precio conocido') : '') + '.</div>' +
        '<div class="tarjeta__acciones">' +
          '<button class="btn btn--primario" data-accion="guardar-precios-ajustes">Guardar</button>' +
        '</div>' +
      '</div>' +

      '<div class="tarjeta">' +
        '<h3>Copia de seguridad</h3>' +
        '<p>Descarga un JSON con toda la colección o restaura desde uno anterior.</p>' +
        '<div class="tarjeta__acciones">' +
          '<button class="btn" data-accion="exportar">Exportar JSON</button>' +
          '<button class="btn" data-accion="importar-fusion">Importar y fusionar</button>' +
          '<button class="btn btn--peligro" data-accion="importar-reemplazo">Importar y reemplazar</button>' +
        '</div>' +
      '</div>' +

      '<div class="tarjeta">' +
        '<h3>Estado actual</h3>' +
        '<p>' + U.plural(g.series, 'serie') + ' · ' + U.plural(g.tomos, 'tomo') + ' · ' +
        U.plural(g.leidos, 'tomo leído', 'tomos leídos') + ' · ' + U.euros(g.gasto) + ' invertidos.<br>' +
        'Última actualización publicada: <strong>' + (D.publicada && D.publicada.actualizado ? U.fechaLarga(D.publicada.actualizado) : '—') + '</strong>.</p>' +
        '<div class="tarjeta__acciones">' +
          '<button class="btn btn--peligro" data-accion="descartar">Descartar cambios locales</button>' +
        '</div>' +
      '</div>';
  };

  /* ============================================================
     Detalle de una serie (modal)
     ============================================================ */
  V.detalle = function (serie) {
    var st = D.statsSerie(serie);
    var total = Math.max(st.total, st.maxTomo, 1);

    // La cuadrícula llega hasta el mayor entre el total declarado y el tomo más
    // alto que conste: si una serie se alarga más de lo previsto, no se ocultan.
    // Y empieza en 0 cuando la serie tiene tomo 0, o no habría dónde marcarlo.
    var rango = D.rangoTomos(serie);
    var mapaCaps = D.mapaCapitulos(serie);
    var celdas = '';
    for (var i = rango.desde; i <= rango.hasta; i++) {
      var t = D.tomo(serie, i, false);
      var clase = 'tomo';
      var titulo = 'Tomo ' + i + ': no lo tienes';
      if (t && t.tengo && t.leido) { clase += ' tomo--leido'; titulo = 'Tomo ' + i + ': leído'; }
      else if (t && t.tengo) { clase += ' tomo--tengo'; titulo = 'Tomo ' + i + ': lo tienes, sin leer'; }
      else if (t && t.leido) { clase += ' tomo--soloLeido'; titulo = 'Tomo ' + i + ': leído, pero no lo tienes'; }

      // Con la equivalencia puesta, cada casilla dice también qué capítulos trae.
      var caps = mapaCaps && mapaCaps[i];
      if (caps) {
        titulo += ' · capítulos ' + caps.desde + '–' + caps.hasta +
          (caps.exacto ? '' : ' (aprox.)');
      }

      // La relectura se marca encima, sin tocar el color del tomo: lo leído
      // sigue leído y solo se señala por dónde vas esta vez.
      if (D.relee(serie) && serie.relectura.tomo === i) {
        clase += ' tomo--releyendo';
        titulo += ' · aquí vas en tu ' + D.numeroDeLectura(serie) + 'ª lectura';
      }

      var nLM = D.numeroLM(serie, i);
      var imagen = nLM && nLM.portada;
      if (imagen) clase += ' tomo--conPortada';

      celdas += '<button class="' + clase + '" data-accion="ciclar-tomo" data-serie-id="' + U.esc(serie.id) + '" ' +
        'data-tomo="' + i + '" title="' + U.esc(titulo) + ' (clic para cambiar)">' +
        (imagen ? '<img src="' + U.esc(imagen) + '" alt="" loading="lazy">' : '') +
        '<span class="tomo__numero">' + i + '</span>' +
        '</button>';
    }

    /* --- Bloque de ListadoManga --- */
    var ficha = D.fichaLM(serie);
    var bloqueLM;

    // Lo tuyo manda; lo que no hayas rellenado, lo pone la edición española.
    var sinopsis = serie.sinopsis || (ficha && ficha.sinopsis) || '';
    var autor = serie.autor || (ficha && ficha.autor) || '';
    var editorial = serie.editorial || (ficha && ficha.editorial) || '';
    var demografia = D.demografiaDe(serie);
    if (demografia === 'otro') demografia = '';

    if (ficha) {
      var futuros = D.numerosLM(serie).filter(function (n) {
        var d = U.diasHasta(n.fecha);
        var t = D.tomo(serie, n.numero, false);
        return n.fecha && d !== null && d >= 0 && !(t && t.tengo);
      });
      // ¿Difieren los datos de la ficha de los que tienes guardados?
      // El botón solo tiene sentido si has puesto un valor propio que no cuadra
      // con la ficha. Lo que dejaste en blanco ya se hereda solo, sin pulsar nada.
      function chocan(mio, suyo) { return !!(suyo && mio && mio !== suyo); }

      var discrepa = chocan(serie.editorial, ficha.editorial) ||
        chocan(serie.tomosTotales, ficha.totalNumeros) ||
        chocan(serie.estado, ficha.estado) ||
        chocan(serie.demografia === 'otro' ? '' : serie.demografia, ficha.demografia);

      bloqueLM =
        '<p class="ayuda">Enlazada con <a href="' + U.esc(ficha.url) + '" target="_blank" rel="noopener">' +
          U.esc(ficha.titulo) + '</a>' +
          (ficha.editorial ? ' · ' + U.esc(ficha.editorial) : '') +
          (ficha.totalNumeros ? ' · ' + ficha.totalNumeros + ' tomos' : '') +
          (D.calendario.actualizado ? ' · datos del ' + U.fechaLarga(D.calendario.actualizado) : '') + '.</p>' +
        (discrepa
          ? '<p class="ayuda"><button class="btn btn--pequeno" data-accion="adoptar-lm" ' +
            'data-serie-id="' + U.esc(serie.id) + '">Usar los datos de esta edición</button></p>'
          : '') +
        (futuros.length
          ? '<div class="lista" style="margin-top:10px">' + futuros.map(function (n) {
              return '<div class="fila">' +
                '<div class="fila__cuerpo">' +
                  '<div class="fila__titulo">Tomo ' + n.numero + '</div>' +
                  '<div class="fila__sub">' +
                    (n.aproximada ? U.mesLargo(n.fecha) + ' (aproximada)' : U.fechaLarga(n.fecha) + ' · ' + U.cuando(n.fecha)) +
                    (n.precio ? ' · ' + U.euros(n.precio) : '') + '</div>' +
                '</div>' +
                '<div class="fila__acciones">' +
                  '<button class="btn btn--pequeno" data-accion="comprado" data-serie-id="' + U.esc(serie.id) + '" ' +
                    'data-tomo="' + n.numero + '">Ya lo tengo</button>' +
                '</div>' +
              '</div>';
            }).join('') + '</div>'
          : '<p class="ayuda">No hay tomos anunciados pendientes.</p>');
    } else if (serie.listadomangaId) {
      bloqueLM = '<p class="ayuda">Enlazada con la colección <code>' + U.esc(serie.listadomangaId) + '</code>. ' +
        'Las fechas aparecerán tras la próxima actualización automática.</p>';
    } else {
      var sugeridas = D.sugerenciasLM(serie);
      bloqueLM = '<p class="ayuda">Sin enlazar. Si la enlazas con ListadoManga, las fechas de salida se actualizan solas cada semana.</p>' +
        (sugeridas.length
          ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' + sugeridas.map(function (c) {
              return '<button class="btn btn--pequeno" data-accion="enlazar-lm" data-serie-id="' + U.esc(serie.id) + '" ' +
                'data-lm="' + U.esc(c.id) + '">' + U.esc(c.nombre) + '</button>';
            }).join('') + '</div>'
          : '');
    }

    var salidas = serie.proximas.length
      ? '<div class="lista" style="margin-top:10px">' + serie.proximas.map(function (p) {
          return '<div class="fila">' +
            '<div class="fila__cuerpo">' +
              '<div class="fila__titulo">Tomo ' + p.numero + '</div>' +
              '<div class="fila__sub">' + U.fechaLarga(p.fecha) + ' · ' + U.cuando(p.fecha) +
                (p.nota ? ' · ' + U.esc(p.nota) : '') + '</div>' +
            '</div>' +
            '<div class="fila__acciones">' +
              '<button class="btn btn--pequeno" data-accion="comprado" data-serie-id="' + U.esc(serie.id) + '" data-tomo="' + p.numero + '">Ya lo tengo</button>' +
              '<button class="btn btn--pequeno btn--peligro" data-accion="borrar-salida" data-serie-id="' + U.esc(serie.id) + '" data-tomo="' + p.numero + '">✕</button>' +
            '</div>' +
          '</div>';
        }).join('') + '</div>'
      : '<p class="ayuda" style="margin-top:8px">Sin fechas apuntadas.</p>';

    var huecos = st.huecos.length
      ? '<p class="ayuda">Tienes huecos en los tomos <strong>' + st.huecos.join(', ') + '</strong>.</p>'
      : '';

    // Solo tiene sentido ampliar la cuadrícula si la serie sigue abierta
    var siguiente = Math.max(st.maxTomo, st.ultimoQueTengo) + 1;
    var puedeAmpliar = !serie.tomosTotales || siguiente <= serie.tomosTotales;

    return '' +
    '<div class="detalle">' +
      '<div class="detalle__lateral">' +
        portadaHTML(serie, 'detalle__portada') +
        '<button class="btn btn--bloque" data-accion="editar-serie" data-serie-id="' + U.esc(serie.id) + '">Editar serie</button>' +
        '<button class="btn btn--bloque" data-accion="nueva-salida" data-serie-id="' + U.esc(serie.id) + '">+ Fecha de salida</button>' +
        '<button class="btn btn--bloque" data-accion="abandonar" data-serie-id="' + U.esc(serie.id) + '">' +
          (serie.abandonada ? '↩ Volver a coleccionarla' : '✕ La he dejado') + '</button>' +
        '<button class="btn btn--bloque btn--peligro" data-accion="borrar-serie" data-serie-id="' + U.esc(serie.id) + '">Eliminar</button>' +
      '</div>' +

      '<div>' +
        '<h2>' + U.esc(serie.titulo) + '</h2>' +
        // Aquí es donde se dice qué edición es la que tienes.
        (D.edicionDe(serie)
          ? '<p class="detalle__edicion">' + U.esc(etiquetaEdicion(D.edicionDe(serie))) + '</p>' : '') +
        (serie.tituloAlt ? '<p class="detalle__alt">' + U.esc(serie.tituloAlt) + '</p>' : '') +
        '<div class="detalle__meta">' +
          chipEstado(serie) +
          (serie.abandonada ? '<span class="chip chip--rojo">✕ La dejaste</span>' : '') +
          (D.relee(serie) ? '<span class="chip">🔁 Releyendo</span>' : '') +
          (demografia ? '<span class="chip">' + U.esc(D.DEMOGRAFIAS[demografia] || demografia) + '</span>' : '') +
          (ficha && ficha.coleccion ? '<span class="chip">📚 ' + U.esc(ficha.coleccion) + '</span>' : '') +
          (autor ? '<span class="chip">✍ ' + U.esc(autor) + '</span>' : '') +
          (editorial ? '<span class="chip">🏢 ' + U.esc(editorial) + '</span>' : '') +
          (st.gasto ? '<span class="chip">💶 ' + U.euros(st.gasto) +
            (st.precioEstimado ? ' aprox.' : '') + '</span>' : '') +
        '</div>' +

        (sinopsis ? '<div class="detalle__sinopsis">' + U.esc(sinopsis) + '</div>' : '') +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px">' +
          '<div>' +
            '<label>Tengo ' + st.tengo + (st.total ? ' de ' + st.total : '') + ' tomos</label>' +
            '<div class="progreso"><span style="width:' + Math.min(100, U.porcentaje(st.tengo, total)) + '%"></span></div>' +
          '</div>' +
          '<div>' +
            '<label>Leídos ' + st.leidosTotal + (st.total ? ' de ' + st.total : '') +
              (st.leidosSinTener ? ' · ' + st.leidosSinTener + ' sin tenerlos' : '') + '</label>' +
            '<div class="progreso progreso--verde"><span style="width:' +
              Math.min(100, U.porcentaje(st.leidosTotal, st.total || st.maxTomo || 1)) + '%"></span></div>' +
          '</div>' +
        '</div>' +

        '<h3>Tomos</h3>' +
        '<p class="ayuda">Clic para pasar de «no lo tengo» → «lo tengo» → «leído» → «leído sin tenerlo».</p>' +
        '<div class="tomos">' + celdas + '</div>' +
        '<div class="leyenda">' +
          '<span><i style="background:var(--panel-2)"></i>No lo tengo</span>' +
          '<span><i style="background:color-mix(in srgb,var(--ambar) 45%,transparent)"></i>Lo tengo, sin leer</span>' +
          '<span><i style="background:color-mix(in srgb,var(--verde) 45%,transparent)"></i>Leído</span>' +
          '<span><i style="border:1px dashed var(--verde);background:none"></i>Leído sin tenerlo</span>' +
        '</div>' +
        huecos +
        panelRelectura(serie) +
        resumenCapitulos(serie, mapaCaps) +
        resumenValoracion(serie) +
        (st.tengo
          ? '<p class="ayuda">Gasto: <strong>' + U.euros(st.gasto) + '</strong>' +
            (st.precioEstimado
              ? ' · ' + U.plural(st.precioEstimado, 'tomo estimado', 'tomos estimados') +
                ' con el PVP menos ' + D.descuento() + '%'
              : '') +
            (st.precioManual ? ' · ' + st.precioManual + ' a precio tuyo' : '') +
            (st.sinPrecio ? ' · ' + U.plural(st.sinPrecio, 'tomo sin precio') : '') + '</p>'
          : '') +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
          (puedeAmpliar ? '<button class="btn btn--pequeno" data-accion="anadir-tomo" data-serie-id="' + U.esc(serie.id) + '">+ Tomo ' + siguiente + '</button>' : '') +
          (st.tengo ? '<button class="btn btn--pequeno" data-accion="precios" data-serie-id="' + U.esc(serie.id) + '">💶 Precios</button>' : '') +
          '<button class="btn btn--pequeno" data-accion="capitulos" data-serie-id="' + U.esc(serie.id) + '">📖 Capítulos</button>' +
          (D.esValorable(serie)
            ? '<button class="btn btn--pequeno" data-accion="valorar" data-serie-id="' + U.esc(serie.id) + '">⭐ ' +
              (D.notaDe(serie) === null ? 'Valorar' : 'Nota ' + D.notaDe(serie)) + '</button>'
            : '') +
          // Releer se ofrece cuando ya la has leído entera: para lo que dejaste
          // a medias ya está la propia cuadrícula.
          (!D.relee(serie) && st.leidosTotal >= st.total && st.total
            ? '<button class="btn btn--pequeno" data-accion="relectura-empezar" data-serie-id="' +
              U.esc(serie.id) + '">🔁 Releer</button>'
            : '') +
          '<button class="btn btn--pequeno" data-accion="marcar-todo-leido" data-serie-id="' + U.esc(serie.id) + '">Marcar todo como leído</button>' +
        '</div>' +

        '<h3 style="margin-top:26px">Fechas de ListadoManga</h3>' + bloqueLM +

        '<h3 style="margin-top:26px">Fechas apuntadas a mano</h3>' + salidas +

        (serie.notas ? '<h3 style="margin-top:26px">Notas</h3><p class="ayuda">' + U.esc(serie.notas) + '</p>' : '') +
      '</div>' +
    '</div>';
  };

  /**
   * Una línea con la equivalencia entre capítulos y tomos, cuando está puesta.
   *
   * Dice hasta dónde llega lo que se sabe y por qué tomo vas según el capítulo
   * que hayas apuntado, que es la pregunta que resuelve todo esto.
   */
  function resumenCapitulos(serie, mapa) {
    var c = serie.capitulos;
    if (!c || !mapa) return '';
    var nums = Object.keys(mapa).map(Number).sort(function (a, b) { return a - b; });
    var ultimo = nums[nums.length - 1];
    var exactos = nums.filter(function (n) { return mapa[n].exacto; }).length;

    var texto = 'Capítulos ' + mapa[nums[0]].desde + '–' + mapa[ultimo].hasta +
      ' repartidos en ' + U.plural(nums.length, 'tomo') +
      (exactos === nums.length ? '' :
        exactos ? ' · ' + exactos + ' exactos, el resto a ' + c.porTomo + ' por tomo'
                : ' · a ' + c.porTomo + ' por tomo, aproximado');

    if (c.leidoHasta) {
      var enQue = D.tomoDelCapitulo(serie, c.leidoHasta);
      texto += '<br>Vas por el capítulo <strong>' + c.leidoHasta + '</strong>' +
        (enQue ? ', que cae en el tomo <strong>' + enQue + '</strong>' : '');
    }
    return '<p class="ayuda">📖 ' + texto + '</p>';
  }

  /**
   * El panel de «la estoy releyendo».
   *
   * Solo sale cuando de verdad la estás releyendo; si no, el botón para
   * empezar va con los demás. Los tomos de la cuadrícula no se tocan: esto
   * es una marca aparte que dice por dónde vas esta vez.
   */
  function panelRelectura(serie) {
    if (!D.relee(serie)) {
      var vueltas = (serie.relectura && serie.relectura.vueltas) || 0;
      return vueltas
        ? '<p class="ayuda">🔁 La has releído ' + U.plural(vueltas, 'vez', 'veces') + '.</p>'
        : '';
    }
    var r = D.rangoTomos(serie);
    var caps = D.mapaCapitulos(serie);
    var enCurso = serie.relectura.tomo;
    var caja = caps && caps[enCurso];

    return '<div class="relectura">' +
      '<div class="relectura__cabecera">' +
        '<strong>🔁 ' + D.numeroDeLectura(serie) + 'ª lectura</strong>' +
        '<span class="ayuda">Empezada el ' + U.fechaCorta(serie.relectura.desde) + '</span>' +
      '</div>' +
      '<div class="relectura__control">' +
        '<button class="btn btn--pequeno" data-accion="relectura-mover" data-serie-id="' +
          U.esc(serie.id) + '" data-a="' + (enCurso - 1) + '"' +
          (enCurso <= r.desde ? ' disabled' : '') + '>−</button>' +
        '<span class="relectura__tomo">Tomo ' + enCurso + '<small> de ' + r.hasta + '</small></span>' +
        '<button class="btn btn--pequeno" data-accion="relectura-mover" data-serie-id="' +
          U.esc(serie.id) + '" data-a="' + (enCurso + 1) + '"' +
          (enCurso >= r.hasta ? ' disabled' : '') + '>+</button>' +
        (caja ? '<span class="ayuda">capítulos ' + caja.desde + '–' + caja.hasta + '</span>' : '') +
        '<button class="btn btn--pequeno" data-accion="relectura-terminar" data-serie-id="' +
          U.esc(serie.id) + '" style="margin-left:auto">La he terminado</button>' +
        '<button class="btn btn--pequeno btn--fantasma" data-accion="relectura-cancelar" ' +
          'data-serie-id="' + U.esc(serie.id) + '">Dejarlo</button>' +
      '</div>' +
      '<div class="progreso"><span style="width:' +
        U.porcentaje(enCurso - r.desde + 1, r.hasta - r.desde + 1) + '%"></span></div>' +
    '</div>';
  }

  /** El desglose de la nota en la ficha, con su puesto en el ranking. */
  function resumenValoracion(serie) {
    var nota = D.notaDe(serie);
    var v = serie.valoracion;
    if (nota === null && !(v && v.disfrute)) return '';

    var puesto = 0;
    D.ranking().forEach(function (s, i) { if (s.id === serie.id) puesto = i + 1; });
    var desglose = D.CRITERIOS.filter(function (c) { return v.criterios[c.id]; })
      .map(function (c) { return U.esc(c.nombre) + ' ' + v.criterios[c.id]; }).join(' · ');

    return '<p class="ayuda">⭐ ' +
      (nota === null ? '' : '<strong>' + nota + '</strong>' +
        (puesto ? ' · nº ' + puesto + ' del <a href="#/ranking">ranking</a>' : '') + '<br>') +
      (desglose || '') +
      (v.disfrute ? (desglose ? ' · ' : '') + 'Disfrute ' + v.disfrute : '') +
      (v.notas ? '<br><em>' + U.esc(v.notas) + '</em>' : '') +
    '</p>';
  }

  V.filaSalida = filaSalida;
  V.urlPortada = urlPortada;

  global.V = V;
})(window);
