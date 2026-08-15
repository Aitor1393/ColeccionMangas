/* ============================================================
   app.js — arranque, rutas y delegación de eventos
   ============================================================ */
(function (global) {
  'use strict';

  var App = {};
  var VISTAS = ['resumen', 'biblioteca', 'pendientes', 'compras', 'ranking', 'calendario', 'ajustes'];
  var vistaActual = 'resumen';
  var serieAbierta = null;

  /* ---------- Tema ---------- */

  function aplicarTema(tema) {
    document.documentElement.setAttribute('data-tema', tema);
    U.$('#btnTema').textContent = tema === 'oscuro' ? '🌙' : '☀️';
    U.guardarLocal('cm:tema', tema);
  }

  function alternarTema() {
    aplicarTema(document.documentElement.getAttribute('data-tema') === 'oscuro' ? 'claro' : 'oscuro');
  }

  /* ---------- Rutas ---------- */

  function rutaActual() {
    var hash = (location.hash || '').replace(/^#\/?/, '');
    var partes = hash.split('/');
    return { vista: VISTAS.indexOf(partes[0]) !== -1 ? partes[0] : 'resumen', param: partes[1] || null };
  }

  function irA(vista) {
    location.hash = '#/' + vista;
  }

  /** Alto que ocupa ahora mismo la banda de cambios sin publicar (0 si no está). */
  function altoAviso() {
    var a = document.getElementById('avisoCambios');
    return a && !a.classList.contains('oculto') ? a.offsetHeight : 0;
  }

  App.render = function () {
    var r = rutaActual();
    var mismaVista = r.vista === vistaActual;
    // Repintar cambia el innerHTML entero y el navegador manda la página
    // arriba. Si sigues en la misma vista —cerrar una ficha, marcar un tomo—
    // hay que devolverte donde estabas; al cambiar de vista, el hashchange
    // sube a propósito.
    var alturaScroll = window.scrollY;
    var avisoAntes = altoAviso();
    vistaActual = r.vista;

    U.$$('#nav a').forEach(function (a) {
      a.classList.toggle('activo', a.dataset.vista === vistaActual);
    });

    var contenido = '';
    switch (vistaActual) {
      case 'biblioteca': contenido = V.biblioteca(); break;
      case 'pendientes': contenido = V.pendientes(); break;
      case 'compras': contenido = V.compras(); break;
      case 'ranking': contenido = V.ranking(); break;
      case 'calendario': contenido = V.calendario(); break;
      case 'ajustes': contenido = V.ajustes(); break;
      default: contenido = V.resumen();
    }
    U.$('#app').innerHTML = contenido;

    if (vistaActual === 'biblioteca') conectarFiltros();
    actualizarAviso();
    actualizarPie();

    // Se restaura después del aviso: la primera vez que tocas algo aparece la
    // banda de «cambios sin publicar» y empuja la página hacia abajo, así que
    // hay que sumar lo que crece o volverías 52 px más arriba de lo que mirabas.
    if (mismaVista && alturaScroll) {
      window.scrollTo(0, Math.max(0, alturaScroll + (altoAviso() - avisoAntes)));
    }

    // Si había una serie abierta en el modal, la refrescamos
    if (serieAbierta && U.modalAbierto()) {
      var s = D.serie(serieAbierta);
      if (s) U.$('#modalContenido').innerHTML = V.detalle(s);
    }
  };

  /** Cierra el modal y repinta: lo que hacen todos los formularios al guardar. */
  App.cerrarYRefrescar = function () {
    U.cerrarModal();
    serieAbierta = null;
    App.render();
  };

  App.abrirSerie = function (id) {
    var s = D.serie(id);
    if (!s) return;
    serieAbierta = id;
    U.abrirModal(V.detalle(s));
  };

  function refrescarModalSerie() {
    if (!serieAbierta || !U.modalAbierto()) return;
    var s = D.serie(serieAbierta);
    if (s) U.$('#modalContenido').innerHTML = V.detalle(s);
  }

  /* ---------- Aviso de cambios sin publicar ---------- */

  function actualizarAviso() {
    var aviso = U.$('#avisoCambios');
    var n = D.sucia ? D.numCambios() : 0;
    if (n > 0) {
      U.$('#avisoTexto').innerHTML = 'Tienes <strong id="avisoNum">' + n + '</strong> ' +
        (n === 1 ? 'cambio' : 'cambios') + ' sin publicar. Solo ' +
        (n === 1 ? 'lo ves' : 'los ves') + ' tú en este dispositivo.';
      aviso.classList.remove('oculto');
    } else {
      aviso.classList.add('oculto');
    }
  }

  function actualizarPie() {
    var fecha = D.coleccion.actualizado;
    U.$('#pieActualizado').textContent = fecha ? 'Actualizada el ' + U.fechaLarga(fecha) : '';
  }

  /* ---------- Filtros de la biblioteca ---------- */

  /**
   * Repinta solo lo que depende de los filtros: la cuenta, los botones y la
   * rejilla. El panel se queda intacto, así que el <input> del buscador no se
   * recrea y el cursor no se mueve de donde lo tengas.
   */
  App.refrescarBiblioteca = function () {
    var cuenta = U.$('#bibCuenta');
    if (!cuenta) return App.render();
    cuenta.innerHTML = V.bibliotecaCuenta();
    U.$('#bibAcciones').innerHTML = V.bibliotecaAcciones();
    U.$('#bibResultados').innerHTML = V.bibliotecaResultados();
  };

  function conectarFiltros() {
    var texto = U.$('#fTexto');
    if (!texto) return;

    texto.addEventListener('input', U.debounce(function () {
      V.filtros.texto = texto.value;
      App.refrescarBiblioteca();
    }, 250));

    [['#fEstado', 'estado'], ['#fDemografia', 'demografia'], ['#fEditorial', 'editorial'],
     ['#fTenencia', 'tenencia'], ['#fSeguimiento', 'seguimiento'], ['#fOrden', 'orden']]
      .forEach(function (par) {
        var nodo = U.$(par[0]);
        if (nodo) nodo.addEventListener('change', function () { V.filtros[par[1]] = nodo.value; App.refrescarBiblioteca(); });
      });

    var pend = U.$('#fPendientes');
    if (pend) pend.addEventListener('change', function () { V.filtros.soloPendientes = pend.checked; App.refrescarBiblioteca(); });
  }

  /* ---------- Acciones (delegación global) ---------- */

  var acciones = {
    'nueva-serie': function () { F.serie(null); },

    'editar-serie': function (el) {
      var s = D.serie(el.dataset.serieId);
      if (s) F.serie(s);
    },

    'borrar-serie': function (el) {
      var s = D.serie(el.dataset.serieId);
      if (!s) return;
      // Con la edición delante: si tienes dos de la misma obra, que se vea cuál se borra.
      if (!confirm('¿Eliminar «' + D.nombreCompleto(s) + '» y todos sus tomos de la colección?')) return;
      D.borrarSerie(s.id);
      serieAbierta = null;
      U.cerrarModal();
      U.aviso('Serie eliminada');
      App.render();
    },

    'ciclar-tomo': function (el) {
      D.ciclarTomo(el.dataset.serieId, Number(el.dataset.tomo));
      refrescarModalSerie();
      actualizarAviso();
    },

    'anadir-tomo': function (el) {
      var s = D.serie(el.dataset.serieId);
      if (!s) return;
      var st = D.statsSerie(s);
      var siguiente = Math.max(st.maxTomo, st.ultimoQueTengo) + 1;
      D.marcarTomo(s.id, siguiente, { tengo: true });
      refrescarModalSerie();
      actualizarAviso();
    },

    'marcar-todo-leido': function (el) {
      var s = D.serie(el.dataset.serieId);
      if (!s) return;
      // Marca todos los tomos que constan, los tengas o no: si has leído la
      // serie entera prestada, no tiene sentido obligar a ir uno por uno.
      var rango = D.rangoTomos(s);
      for (var i = rango.desde; i <= rango.hasta; i++) D.tomo(s, i, true).leido = true;
      D.guardar();
      refrescarModalSerie();
      U.aviso('Serie marcada como leída', 'ok');
    },

    'leer-siguiente': function (el) {
      D.marcarTomo(el.dataset.serieId, Number(el.dataset.tomo), { leido: true, tengo: true });
      U.aviso('Tomo ' + el.dataset.tomo + ' marcado como leído', 'ok');
      App.render();
    },

    'adoptar-lm': function (el) {
      var s = D.serie(el.dataset.serieId);
      if (!s) return;
      var ficha = D.fichaLM(s);
      if (!ficha) return;

      var cambios = {};
      if (ficha.editorial) cambios.editorial = ficha.editorial;
      if (ficha.totalNumeros) cambios.tomosTotales = ficha.totalNumeros;
      if (ficha.estado) cambios.estado = ficha.estado;
      if (ficha.demografia) cambios.demografia = ficha.demografia;
      if (ficha.autor && !s.autor) cambios.autor = ficha.autor;
      if (ficha.sinopsis && !s.sinopsis) cambios.sinopsis = ficha.sinopsis;
      D.actualizarSerie(s.id, cambios);

      U.aviso('Datos actualizados desde ListadoManga', 'ok');
      refrescarModalSerie();
      App.render();
    },

    'enlazar-lm': function (el) {
      D.actualizarSerie(el.dataset.serieId, { listadomangaId: el.dataset.lm });
      U.aviso('Serie enlazada con ListadoManga. Las fechas llegarán en la próxima actualización.', 'ok');
      refrescarModalSerie();
      App.render();
    },

    'comprado': function (el) {
      var id = el.dataset.serieId;
      var numero = Number(el.dataset.tomo);
      var s = D.serie(id);
      if (!s) return;

      // El precio no se fija aquí: se deja calcular con el PVP menos tu
      // descuento, y solo lo escribes tú si pagaste otra cosa.
      D.marcarTomo(id, numero, { tengo: true, fechaCompra: U.isoHoy() });
      // La salida ya se ha materializado: la quitamos del calendario
      D.actualizarSerie(id, {
        proximas: D.serie(id).proximas.filter(function (p) { return p.numero !== numero; })
      });
      U.aviso('Tomo ' + numero + ' de «' + s.titulo + '» añadido a la colección', 'ok');
      refrescarModalSerie();
      App.render();
    },

    'borrar-salida': function (el) {
      var id = el.dataset.serieId;
      var numero = Number(el.dataset.tomo);
      var s = D.serie(id);
      if (!s) return;
      D.actualizarSerie(id, {
        proximas: s.proximas.filter(function (p) { return p.numero !== numero; })
      });
      refrescarModalSerie();
      App.render();
    },

    'modo-proximas': function (el) {
      V.modoProximas = el.dataset.modo;
      U.guardarLocal('cm:vistaProximas', V.modoProximas);
      App.render();
      window.scrollTo(0, 0);
    },

    'plegar-seccion': function (el) {
      var c = el.dataset.clave;
      V.seccionesPlegadas[c] = !V.seccionesPlegadas[c];
      U.guardarLocal('cm:resumenPlegado', V.seccionesPlegadas);
      App.render();
    },

    'alternar-filtros': function () {
      V.filtrosAbiertos = !V.filtrosAbiertos;
      U.guardarLocal('cm:filtrosBiblioteca', V.filtrosAbiertos);
      App.render();
      // Solo al abrirlo: entrar en la Biblioteca no debe robar el foco ni
      // levantar el teclado en el móvil.
      var caja = U.$('#fTexto');
      if (V.filtrosAbiertos && caja) {
        caja.focus();
        var n = caja.value.length;
        try { caja.setSelectionRange(n, n); } catch (e) { /* ignorado */ }
      }
    },

    'limpiar-filtros': function () {
      V.filtros.texto = '';
      V.filtros.tenencia = '';
      V.filtros.seguimiento = '';
      V.filtros.estado = '';
      V.filtros.demografia = '';
      V.filtros.editorial = '';
      V.filtros.soloPendientes = false;
      App.render();
    },

    'ver-abandonadas': function () {
      V.filtros.seguimiento = 'abandonadas';
      // Al llegar desde otra vista, el panel se abre para que se vea de dónde
      // sale el recorte; si no, verías 7 series de 62 sin explicación.
      V.filtrosAbiertos = true;
      U.guardarLocal('cm:filtrosBiblioteca', true);
      location.hash = '#/biblioteca';
      App.render();
    },

    'abandonar': function (el) {
      var s = D.serie(el.dataset.serieId);
      if (!s) return;
      var dejada = D.alternarAbandonada(s.id);
      U.aviso(dejada
        ? '«' + s.titulo + '» marcada como abandonada'
        : '«' + s.titulo + '» vuelve a tus colecciones', 'ok');
      refrescarModalSerie();
      App.render();
    },

    'modo-compras': function (el) {
      V.modoCompras = el.dataset.modo;
      U.guardarLocal('cm:vistaCompras', V.modoCompras);
      App.render();
      window.scrollTo(0, 0);
    },

    'mover-compra': function (el) {
      // El scroll se conserva a mano: al repintar la lista entera el navegador
      // salta arriba y perderías de vista lo que acabas de mover.
      var y = window.scrollY;
      if (D.moverCompra(V.modoCompras, el.dataset.clave, Number(el.dataset.dir))) {
        App.render();
        window.scrollTo(0, y);
      }
    },

    'orden-automatico': function (el) {
      D.limpiarOrdenCompras(el.dataset.modo);
      U.aviso('Orden automático restaurado', 'ok');
      App.render();
    },

    'ver-dia': function (el) {
      F.dia(el.dataset.fecha);
    },

    'precios': function (el) {
      var s = D.serie(el.dataset.serieId);
      if (s) F.precios(s);
    },

    'capitulos': function (el) {
      var s = D.serie(el.dataset.serieId);
      if (s) F.capitulos(s);
    },

    'abrir-serie': function (el) {
      App.abrirSerie(el.dataset.serieId);
    },

    'valorar': function (el) {
      var s = D.serie(el.dataset.serieId);
      if (s) F.valorar(s);
    },

    'duelo': function () {
      F.duelo(D.duelo());
    },

    'modo-ranking': function (el) {
      V.modoRanking = el.dataset.modo;
      U.guardarLocal('cm:vistaRanking', V.modoRanking);
      App.render();
    },

    'guardar-precios-ajustes': function () {
      D.guardarMostrarGasto(U.$('#ajMostrarGasto').checked);
      // Con U.aNumero para que «5,5» valga tanto como «5.5»; null deja el 0.
      D.guardarDescuento(U.aNumero(U.$('#ajDescuento').value) || 0);
      U.aviso('Guardado: descuento ' + D.descuento() + '%, gasto ' +
        (D.mostrarGasto() ? 'visible' : 'oculto'), 'ok');
      App.render();
    },

    'nueva-salida': function (el) {
      var s = D.serie(el.dataset.serieId);
      if (s) F.salida(s);
    },

    'publicar': function () { F.publicar(); },

    'exportar': function () {
      U.descargarJSON('coleccion.json', D.exportar());
      U.aviso('JSON descargado. Súbelo al repositorio para publicarlo.', 'ok');
    },

    'importar-fusion': function () { F.importar('fusionar'); },
    'importar-reemplazo': function () { F.importar('reemplazar'); },

    'descartar': function () {
      if (!confirm('Se perderán todos los cambios que no hayas publicado. ¿Seguro?')) return;
      D.descartarCambios();
      U.aviso('Cambios locales descartados');
      App.render();
    },

    'guardar-gh': function () {
      var cfg = GH.config();
      var datosRepo = {
        owner: U.$('#ghOwner').value.trim(),
        repo: U.$('#ghRepo').value.trim(),
        rama: U.$('#ghRama').value.trim() || 'main',
        ruta: cfg.ruta
      };
      var token = U.$('#ghToken').value.trim();
      var clave = U.$('#ghClave').value;
      var clave2 = U.$('#ghClave2').value;

      // Sin token nuevo, solo se actualizan los datos del repositorio.
      if (!token) {
        if (!GH.configurado()) { U.aviso('Falta el token', 'error'); return; }
        GH.guardarRepo(datosRepo);
        U.aviso('Repositorio actualizado', 'ok');
        App.render();
        return;
      }

      if (!C.disponible()) {
        U.aviso('Este navegador no permite cifrar aquí (hace falta https).', 'error');
        return;
      }
      if (clave.length < 8) { U.aviso('La contraseña debe tener al menos 8 caracteres', 'error'); return; }
      if (clave !== clave2) { U.aviso('Las dos contraseñas no coinciden', 'error'); return; }

      U.aviso('Cifrando y comprobando el token…');
      GH.guardarConfig(datosRepo, token, clave)
        .then(function () { return GH.probar(); })
        .then(function (nombre) {
          U.aviso('Conectado con ' + nombre + '. El token queda cifrado.', 'ok');
          App.render();
        })
        .catch(function (e) { U.aviso(e.message, 'error'); });
    },

    'olvidar-gh': function () {
      if (!confirm('Se borrará el token cifrado de este navegador. ¿Seguro?')) return;
      GH.olvidar();
      U.aviso('Token olvidado');
      App.render();
    },

    'guardar-proxy': function () {
      var url = U.$('#fiProxy').value.trim();
      if (!url) { U.aviso('Escribe la URL del proxy', 'error'); return; }

      FI.guardarProxy(url);
      // La casilla decide si además viaja con la colección. Se guarda antes de
      // probar para que quede aunque la prueba falle por un problema puntual.
      var viaja = U.$('#fiViaja') && U.$('#fiViaja').checked;
      D.guardarProxyEnColeccion(viaja ? url : '');

      var salida = U.$('#fiResultado');
      salida.innerHTML = '<p class="ayuda">Probando…</p>';

      // Se prueba con una colección real: si devuelve una ficha, funciona.
      FI.traer('3000')
        .then(function (ficha) {
          U.aviso('Proxy correcto', 'ok');
          salida.innerHTML = '<p class="ayuda">✓ Funciona: ha leído «' + U.esc(ficha.titulo) +
            '» con ' + ficha.numeros.length + ' números.</p>';
        })
        .catch(function (e) {
          U.aviso('El proxy no funciona', 'error');
          salida.innerHTML = '<div class="tarjeta" style="margin-top:14px">' +
            '<h3>No funciona</h3><p>' + U.esc(e.message) + '</p>' +
            '<p class="ayuda">Para descartar dudas, abre esta dirección en el navegador: ' +
            '<code>' + U.esc(url.replace('{id}', '3000')) + '</code>. Debe salir HTML en bruto ' +
            'de la ficha de Bleach.</p></div>';
        });
    },

    'quitar-proxy': function () {
      FI.guardarProxy('');
      D.guardarProxyEnColeccion('');
      FI.limpiarCache();
      U.aviso('Proxy quitado');
      App.render();
    },

    'bloquear-gh': function () {
      GH.bloquear();
      U.aviso('Bloqueado: se pedirá la contraseña al publicar');
      App.render();
    }
  };

  /** Cambios en campos sueltos que no son un botón con data-accion. */
  function alCambiar(e) {
    var pos = e.target.dataset && e.target.dataset.posicion;
    if (!pos) return;
    var y = window.scrollY;
    if (D.moverCompraA(V.modoCompras, pos, e.target.value)) {
      App.render();
      window.scrollTo(0, y);
    } else {
      App.render();   // valor imposible: se repinta para devolver el puesto real
    }
  }

  function alPulsar(e) {
    var cerrar = e.target.closest('[data-cerrar-modal]');
    if (cerrar) {
      U.cerrarModal();
      serieAbierta = null;
      if (cerrar.tagName === 'A' && cerrar.getAttribute('href')) return;
      e.preventDefault();
      App.render();
      return;
    }

    var accionEl = e.target.closest('[data-accion]');
    if (accionEl && acciones[accionEl.dataset.accion]) {
      e.preventDefault();
      e.stopPropagation();
      acciones[accionEl.dataset.accion](accionEl);
      return;
    }

    var serieEl = e.target.closest('[data-serie]');
    if (serieEl) {
      App.abrirSerie(serieEl.dataset.serie);
    }
  }

  /* ---------- Arranque ---------- */

  function iniciar() {
    aplicarTema(U.leerLocal('cm:tema', 'oscuro'));

    document.addEventListener('click', alPulsar);
    document.addEventListener('change', alCambiar);
    // Enter en la casilla de puesto: sin esto habría que salir del campo.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.dataset && e.target.dataset.posicion) {
        e.preventDefault();
        e.target.blur();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && U.modalAbierto()) {
        U.cerrarModal();
        serieAbierta = null;
        App.render();
      }
      // Enter/espacio sobre una tarjeta de serie enfocada
      if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.serie) {
        e.preventDefault();
        App.abrirSerie(e.target.dataset.serie);
      }
    });

    U.$('#btnTema').addEventListener('click', alternarTema);
    U.$('#btnNuevaSerie').addEventListener('click', function () { F.serie(null); });
    U.$('#btnPublicarAviso').addEventListener('click', function () { F.publicar(); });
    U.$('#btnDescartarAviso').addEventListener('click', acciones.descartar);

    window.addEventListener('hashchange', function () {
      if (U.modalAbierto()) { U.cerrarModal(); serieAbierta = null; }
      App.render();
      window.scrollTo(0, 0);
    });

    D.alCambiar(actualizarAviso);

    D.cargar().then(function (estado) {
      App.render();
      if (estado.conflicto) {
        U.aviso('La colección publicada ha cambiado. Se han conservado tus cambios locales y una copia de seguridad.', 'error');
      }
      if (estado.sinRemoto) {
        console.info('No hay ' + D.RUTA_JSON + ' todavía: se empieza con una colección vacía.');
      }
    }).catch(function (e) {
      U.$('#app').innerHTML = '<div class="vacio"><h3>No se pudo cargar la colección</h3><p>' + U.esc(e.message) + '</p></div>';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  App.irA = irA;
  global.App = App;
})(window);
