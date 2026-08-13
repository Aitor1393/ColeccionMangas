/* ============================================================
   app.js — arranque, rutas y delegación de eventos
   ============================================================ */
(function (global) {
  'use strict';

  var App = {};
  var VISTAS = ['resumen', 'biblioteca', 'pendientes', 'calendario', 'ajustes'];
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

  App.render = function () {
    var r = rutaActual();
    vistaActual = r.vista;

    U.$$('#nav a').forEach(function (a) {
      a.classList.toggle('activo', a.dataset.vista === vistaActual);
    });

    var contenido = '';
    switch (vistaActual) {
      case 'biblioteca': contenido = V.biblioteca(); break;
      case 'pendientes': contenido = V.pendientes(); break;
      case 'calendario': contenido = V.calendario(); break;
      case 'ajustes': contenido = V.ajustes(); break;
      default: contenido = V.resumen();
    }
    U.$('#app').innerHTML = contenido;

    if (vistaActual === 'biblioteca') conectarFiltros();
    actualizarAviso();
    actualizarPie();

    // Si había una serie abierta en el modal, la refrescamos
    if (serieAbierta && U.modalAbierto()) {
      var s = D.serie(serieAbierta);
      if (s) U.$('#modalContenido').innerHTML = V.detalle(s);
    }
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
      U.$('#avisoNum').textContent = n;
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

  function conectarFiltros() {
    var texto = U.$('#fTexto');
    if (!texto) return;

    var posicion = texto.selectionStart;
    texto.focus();
    try { texto.setSelectionRange(posicion, posicion); } catch (e) { /* ignorado */ }

    texto.addEventListener('input', U.debounce(function () {
      V.filtros.texto = texto.value;
      App.render();
    }, 250));

    [['#fEstado', 'estado'], ['#fDemografia', 'demografia'], ['#fEditorial', 'editorial'], ['#fOrden', 'orden']]
      .forEach(function (par) {
        var nodo = U.$(par[0]);
        if (nodo) nodo.addEventListener('change', function () { V.filtros[par[1]] = nodo.value; App.render(); });
      });

    var pend = U.$('#fPendientes');
    if (pend) pend.addEventListener('change', function () { V.filtros.soloPendientes = pend.checked; App.render(); });
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
      if (!confirm('¿Eliminar «' + s.titulo + '» y todos sus tomos de la colección?')) return;
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
      s.tomos.forEach(function (t) { if (t.tengo) t.leido = true; });
      D.guardar();
      refrescarModalSerie();
      U.aviso('Serie al día', 'ok');
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

      // Si ListadoManga conoce el precio, lo aprovechamos.
      var campos = { tengo: true, fechaCompra: U.isoHoy() };
      var lm = D.numeroLM(s, numero);
      var yaTiene = D.tomo(s, numero, false);
      if (lm && lm.precio && !(yaTiene && yaTiene.precio)) campos.precio = lm.precio;
      D.marcarTomo(id, numero, campos);
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
      U.aviso('Probando el proxy…');

      // Se prueba con una colección real: si devuelve una ficha, funciona.
      FI.traer('3000')
        .then(function (ficha) {
          U.aviso('Proxy correcto: ha leído «' + ficha.titulo + '»', 'ok');
          App.render();
        })
        .catch(function (e) {
          U.aviso('No funciona: ' + e.message, 'error');
        });
    },

    'quitar-proxy': function () {
      FI.guardarProxy('');
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
