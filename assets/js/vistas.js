/* ============================================================
   vistas.js — render de cada pantalla
   ============================================================ */
(function (global) {
  'use strict';

  var V = {};

  /* ---------- Piezas reutilizables ---------- */

  function chipEstado(serie) {
    var e = D.ESTADOS[serie.estado];
    return '<span class="chip ' + e.clase + '">' + e.etiqueta + '</span>';
  }

  /** La portada propia manda; si no hay, la de la edición en ListadoManga. */
  function urlPortada(serie) {
    if (serie.portada) return serie.portada;
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

  V.tarjetaSerie = function (serie) {
    var st = D.statsSerie(serie);
    var insignia = '';
    if (st.pendientes > 0) {
      insignia = '<span class="serie__insignia serie__insignia--pendiente">' + st.pendientes + ' sin leer</span>';
    } else if (st.completa) {
      insignia = '<span class="serie__insignia serie__insignia--completa">✓ completa</span>';
    } else if (serie.tomosTotales) {
      insignia = '<span class="serie__insignia">' + st.tengo + '/' + serie.tomosTotales + '</span>';
    }

    return '' +
      '<article class="serie" data-serie="' + U.esc(serie.id) + '" tabindex="0" role="button">' +
        '<div class="serie__portada">' +
          portadaHTML(serie, '') + insignia +
          '<div class="serie__barra"><span style="width:' + Math.min(100, st.progresoTengo) + '%"></span></div>' +
        '</div>' +
        '<div>' +
          '<div class="serie__titulo">' + U.esc(serie.titulo) + '</div>' +
          '<div class="serie__meta">' +
            '<span>' + U.plural(st.tengo, 'tomo') + (serie.tomosTotales ? ' de ' + serie.tomosTotales : '') + '</span>' +
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
      { valor: g.tomos, etiqueta: 'Tomos en casa', extra: U.euros(g.gasto) + ' invertidos', icono: '📦' },
      { valor: g.leidos, etiqueta: 'Tomos leídos', extra: U.porcentaje(g.leidos, g.tomos) + '% de lo que tengo', icono: '✅' },
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
      html += '<section class="seccion">' +
        '<div class="seccion__titulo"><h2>Próximas publicaciones</h2>' +
        '<span class="contador">siguientes 90 días</span>' +
        '<a href="#/calendario" class="btn btn--pequeno btn--fantasma" style="margin-left:auto">Ver todas</a></div>' +
        '<div class="lista">' + proximas.map(filaSalida).join('') + '</div>' +
      '</section>';
    }

    // Salidas ya publicadas que aún no tienes
    var pasadas = D.publicacionesPasadas().slice(0, 5);
    if (pasadas.length) {
      html += '<section class="seccion">' +
        '<div class="seccion__titulo"><h2>Ya a la venta y aún no lo tienes</h2>' +
        '<span class="contador">' + pasadas.length + '</span></div>' +
        '<div class="lista">' + pasadas.map(filaSalida).join('') + '</div>' +
      '</section>';
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

  function filaSalida(item) {
    var pasada = item.dias < 0;
    var s = item.salida;

    var detalles = [item.serie.editorial || 'Editorial sin indicar'];
    if (s.precio) detalles.push(U.euros(s.precio));
    if (s.nota) detalles.push(U.esc(s.nota));
    if (item.origen === 'listadomanga') detalles.push('vía ListadoManga');

    return '<div class="fila" data-serie="' + U.esc(item.serie.id) + '">' +
      miniPortada(item.serie) +
      '<div class="fila__cuerpo">' +
        '<div class="fila__titulo">' + U.esc(item.serie.titulo) + ' <span class="chip">Tomo ' + s.numero + '</span></div>' +
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
  V.filtros = { texto: '', estado: '', demografia: '', editorial: '', orden: 'titulo', soloPendientes: false };

  V.biblioteca = function () {
    var f = V.filtros;

    var opciones = function (valores, sel, mapa) {
      return valores.map(function (v) {
        var etiqueta = mapa ? (mapa[v] && mapa[v].etiqueta ? mapa[v].etiqueta : (mapa[v] || v)) : v;
        return '<option value="' + U.esc(v) + '"' + (sel === v ? ' selected' : '') + '>' + U.esc(etiqueta) + '</option>';
      }).join('');
    };

    var barra = '<div class="filtros">' +
      '<div class="buscador"><input type="text" id="fTexto" placeholder="Buscar por título, autor, editorial o etiqueta…" value="' + U.esc(f.texto) + '"></div>' +
      '<select id="fEstado"><option value="">Cualquier estado</option>' + opciones(Object.keys(D.ESTADOS), f.estado, D.ESTADOS) + '</select>' +
      '<select id="fDemografia"><option value="">Cualquier demografía</option>' + opciones(Object.keys(D.DEMOGRAFIAS), f.demografia, D.DEMOGRAFIAS) + '</select>' +
      '<select id="fEditorial"><option value="">Cualquier editorial</option>' + opciones(D.valoresDe('editorial'), f.editorial) + '</select>' +
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

    var series = V.filtrar(D.coleccion.series);

    return '<div class="vista__cabecera"><div class="crece">' +
        '<h1>Biblioteca</h1>' +
        '<p>' + U.plural(series.length, 'serie') + ' de ' + D.coleccion.series.length + '</p>' +
      '</div></div>' + barra +
      rejilla(series, '<h3>Ningún resultado</h3><p>Prueba a aflojar los filtros.</p>');
  };

  V.filtrar = function (series) {
    var f = V.filtros;
    var texto = U.normalizar(f.texto);

    var lista = series.filter(function (s) {
      if (f.estado && s.estado !== f.estado) return false;
      if (f.demografia && s.demografia !== f.demografia) return false;
      if (f.editorial && s.editorial !== f.editorial) return false;
      if (f.soloPendientes && D.statsSerie(s).pendientes === 0) return false;
      if (texto) {
        var heno = U.normalizar([s.titulo, s.tituloAlt, s.autor, s.editorial, s.etiquetas.join(' ')].join(' '));
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
          '<div class="fila__titulo">' + U.esc(g.serie.titulo) + '</div>' +
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
     Vista: Calendario de próximas publicaciones
     ============================================================ */
  V.calendario = function () {
    var proximas = D.proximasPublicaciones();
    var pasadas = D.publicacionesPasadas();

    var html = '<div class="vista__cabecera"><div class="crece">' +
      '<h1>Próximas publicaciones</h1>' +
      '<p>Fechas de ListadoManga para las series enlazadas, más las que apuntes tú a mano. ' +
      'Los tomos que ya tienes no aparecen.' +
      (D.calendario.actualizado ? ' Última descarga: ' + U.fechaLarga(D.calendario.actualizado) + '.' : '') +
      '</p>' +
    '</div></div>';

    if (pasadas.length) {
      html += '<section class="seccion">' +
        '<div class="seccion__titulo"><h2>Ya a la venta</h2><span class="contador">' + pasadas.length + '</span></div>' +
        '<div class="lista">' + pasadas.map(filaSalida).join('') + '</div>' +
      '</section>';
    }

    if (!proximas.length) {
      html += '<div class="vacio"><h3>No hay fechas apuntadas</h3>' +
        '<p>Abre una serie y usa «Añadir fecha de salida» para llevar el control de los próximos tomos.</p></div>';
      return html;
    }

    // Agrupamos por mes
    var meses = [];
    var indice = {};
    proximas.forEach(function (item) {
      var clave = U.mesLargo(item.salida.fecha);
      if (!indice[clave]) { indice[clave] = []; meses.push({ nombre: clave, items: indice[clave] }); }
      indice[clave].push(item);
    });

    html += meses.map(function (m) {
      return '<div class="mes">' +
        '<div class="mes__titulo">' + U.esc(m.nombre) + ' · ' + U.plural(m.items.length, 'tomo') + '</div>' +
        '<div class="lista">' + m.items.map(filaSalida).join('') + '</div>' +
      '</div>';
    }).join('');

    return html;
  };

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
        '<p>Opcional. Con un token de acceso personal, el botón «Publicar» escribe el JSON en el repositorio y la web se actualiza sola en un minuto. ' +
        'El token se queda solo en este navegador: no se sube a ningún sitio.</p>' +
        '<div class="campos">' +
          '<div><label for="ghOwner">Usuario u organización</label><input type="text" id="ghOwner" value="' + U.esc(cfg.owner) + '"></div>' +
          '<div><label for="ghRepo">Repositorio</label><input type="text" id="ghRepo" value="' + U.esc(cfg.repo) + '"></div>' +
          '<div><label for="ghRama">Rama</label><input type="text" id="ghRama" value="' + U.esc(cfg.rama) + '"></div>' +
          '<div class="campo--ancho">' +
            '<label for="ghToken">Token (fine-grained, permiso «Contents: Read and write» solo en este repo)</label>' +
            '<input type="password" id="ghToken" placeholder="' + (cfg.token ? '•••••••• (guardado)' : 'github_pat_…') + '" autocomplete="off">' +
            '<div class="ayuda">Créalo en github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens.</div>' +
          '</div>' +
        '</div>' +
        '<div class="tarjeta__acciones">' +
          '<button class="btn btn--primario" data-accion="guardar-gh">Guardar y probar</button>' +
          (cfg.token ? '<button class="btn btn--peligro" data-accion="olvidar-gh">Olvidar token</button>' : '') +
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
    var hasta = Math.max(st.maxTomo, st.total, 1);
    var celdas = '';
    for (var i = 1; i <= hasta; i++) {
      var t = D.tomo(serie, i, false);
      var clase = 'tomo';
      var titulo = 'Tomo ' + i + ': no lo tienes';
      if (t && t.leido) { clase += ' tomo--leido'; titulo = 'Tomo ' + i + ': leído'; }
      else if (t && t.tengo) { clase += ' tomo--tengo'; titulo = 'Tomo ' + i + ': lo tienes, sin leer'; }
      celdas += '<button class="' + clase + '" data-accion="ciclar-tomo" data-serie-id="' + U.esc(serie.id) + '" ' +
        'data-tomo="' + i + '" title="' + U.esc(titulo) + ' (clic para cambiar)">' + i + '</button>';
    }

    /* --- Bloque de ListadoManga --- */
    var ficha = D.fichaLM(serie);
    var bloqueLM;

    // Lo tuyo manda; lo que no hayas rellenado, lo pone la edición española.
    var sinopsis = serie.sinopsis || (ficha && ficha.sinopsis) || '';
    var autor = serie.autor || (ficha && ficha.autor) || '';
    var editorial = serie.editorial || (ficha && ficha.editorial) || '';

    if (ficha) {
      var futuros = D.numerosLM(serie).filter(function (n) {
        var d = U.diasHasta(n.fecha);
        var t = D.tomo(serie, n.numero, false);
        return n.fecha && d !== null && d >= 0 && !(t && t.tengo);
      });
      // ¿Difieren los datos de la ficha de los que tienes guardados?
      var discrepa = (ficha.editorial && ficha.editorial !== serie.editorial) ||
        (ficha.totalNumeros && ficha.totalNumeros !== serie.tomosTotales) ||
        (ficha.estado && ficha.estado !== serie.estado);

      bloqueLM =
        '<p class="ayuda">Enlazada con <a href="' + U.esc(ficha.url) + '" target="_blank" rel="noopener">' +
          U.esc(ficha.titulo) + '</a>' +
          (ficha.editorial ? ' · ' + U.esc(ficha.editorial) : '') +
          (ficha.totalNumeros ? ' · ' + ficha.totalNumeros + ' tomos' : '') +
          (D.calendario.actualizado ? ' · datos del ' + U.fechaLarga(D.calendario.actualizado) : '') + '.</p>' +
        (discrepa
          ? '<p class="ayuda"><button class="btn btn--pequeno" data-accion="adoptar-lm" ' +
            'data-serie-id="' + U.esc(serie.id) + '">Usar editorial, total de tomos y estado de esta edición</button></p>'
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
        '<button class="btn btn--bloque btn--peligro" data-accion="borrar-serie" data-serie-id="' + U.esc(serie.id) + '">Eliminar</button>' +
      '</div>' +

      '<div>' +
        '<h2>' + U.esc(serie.titulo) + '</h2>' +
        '<div class="detalle__meta">' +
          chipEstado(serie) +
          (serie.demografia && serie.demografia !== 'otro' ? '<span class="chip">' + U.esc(D.DEMOGRAFIAS[serie.demografia] || serie.demografia) + '</span>' : '') +
          (autor ? '<span class="chip">✍ ' + U.esc(autor) + '</span>' : '') +
          (editorial ? '<span class="chip">🏢 ' + U.esc(editorial) + '</span>' : '') +
          (st.gasto ? '<span class="chip">💶 ' + U.euros(st.gasto) + '</span>' : '') +
        '</div>' +

        (sinopsis ? '<div class="detalle__sinopsis">' + U.esc(sinopsis) + '</div>' : '') +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px">' +
          '<div>' +
            '<label>Tengo ' + st.tengo + (st.total ? ' de ' + st.total : '') + ' tomos</label>' +
            '<div class="progreso"><span style="width:' + Math.min(100, U.porcentaje(st.tengo, total)) + '%"></span></div>' +
          '</div>' +
          '<div>' +
            '<label>Leídos ' + st.leidos + ' de ' + st.tengo + '</label>' +
            '<div class="progreso progreso--verde"><span style="width:' + st.progresoLeido + '%"></span></div>' +
          '</div>' +
        '</div>' +

        '<h3>Tomos</h3>' +
        '<p class="ayuda">Clic en un número para pasar de «no lo tengo» → «lo tengo» → «leído».</p>' +
        '<div class="tomos">' + celdas + '</div>' +
        '<div class="leyenda">' +
          '<span><i style="background:var(--panel-2)"></i>No lo tengo</span>' +
          '<span><i style="background:color-mix(in srgb,var(--ambar) 45%,transparent)"></i>Lo tengo, sin leer</span>' +
          '<span><i style="background:color-mix(in srgb,var(--verde) 45%,transparent)"></i>Leído</span>' +
        '</div>' +
        huecos +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
          (puedeAmpliar ? '<button class="btn btn--pequeno" data-accion="anadir-tomo" data-serie-id="' + U.esc(serie.id) + '">+ Tomo ' + siguiente + '</button>' : '') +
          '<button class="btn btn--pequeno" data-accion="marcar-todo-leido" data-serie-id="' + U.esc(serie.id) + '">Marcar todo como leído</button>' +
        '</div>' +

        '<h3 style="margin-top:26px">Fechas de ListadoManga</h3>' + bloqueLM +

        '<h3 style="margin-top:26px">Fechas apuntadas a mano</h3>' + salidas +

        (serie.notas ? '<h3 style="margin-top:26px">Notas</h3><p class="ayuda">' + U.esc(serie.notas) + '</p>' : '') +
      '</div>' +
    '</div>';
  };

  global.V = V;
})(window);
