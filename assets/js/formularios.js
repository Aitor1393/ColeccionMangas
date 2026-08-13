/* ============================================================
   formularios.js — altas, ediciones y diálogos del modal
   ============================================================ */
(function (global) {
  'use strict';

  var F = {};

  function opcionesEstado(sel) {
    return '<option value=""' + (sel ? '' : ' selected') + '>Según la edición</option>' +
      Object.keys(D.ESTADOS).map(function (k) {
        return '<option value="' + k + '"' + (sel === k ? ' selected' : '') + '>' + D.ESTADOS[k].etiqueta + '</option>';
      }).join('');
  }

  function opcionesDemografia(sel) {
    return Object.keys(D.DEMOGRAFIAS).map(function (k) {
      return '<option value="' + k + '"' + (sel === k ? ' selected' : '') + '>' + D.DEMOGRAFIAS[k] + '</option>';
    }).join('');
  }

  /** Texto de ayuda bajo el selector: qué edición hay enlazada ahora mismo. */
  function textoEdicion(serie) {
    var ficha = serie && serie.listadomangaId ? D.calendario.colecciones[serie.listadomangaId] : null;
    if (ficha) {
      return '✓ Enlazada con <strong>' + U.esc(ficha.titulo) + '</strong>' +
        (ficha.editorial ? ' · ' + U.esc(ficha.editorial) : '') +
        (ficha.totalNumeros ? ' · ' + ficha.totalNumeros + ' tomos' : '');
    }
    if (serie && serie.listadomangaId) {
      return 'Enlazada con la colección ' + U.esc(serie.listadomangaId) + '.';
    }
    return 'Cada edición (Panini, Glénat, Maximum, Català…) es una colección distinta, ' +
      'con sus propias fechas y precios. Busca y elige la tuya.';
  }

  /* ============================================================
     Alta / edición de serie
     ============================================================ */
  F.serie = function (serie) {
    var edicion = !!serie;
    var s = serie || {
      titulo: '', autor: '', editorial: '', demografia: 'otro', estado: '',
      tomosTotales: 0, portada: '', sinopsis: '', notas: '', etiquetas: []
    };

    var html =
      '<h2>' + (edicion ? 'Editar serie' : 'Añadir serie') + '</h2>' +
      '<form id="formSerie">' +
        '<div class="campos">' +
          '<div class="campo--ancho"><label for="cTitulo">Título *</label>' +
            '<input type="text" id="cTitulo" required value="' + U.esc(s.titulo) + '"></div>' +
          '<div><label for="cAutor">Autor</label><input type="text" id="cAutor" value="' + U.esc(s.autor) + '"></div>' +
          '<div><label for="cEditorial">Editorial</label><input type="text" id="cEditorial" value="' + U.esc(s.editorial) + '" placeholder="Planeta, Norma, Ivrea…"></div>' +
          '<div><label for="cDemografia">Demografía</label><select id="cDemografia">' + opcionesDemografia(s.demografia) + '</select></div>' +
          '<div><label for="cEstado">Estado</label><select id="cEstado">' + opcionesEstado(s.estado) + '</select></div>' +
          '<div><label for="cTotales">Tomos totales</label>' +
            '<input type="number" id="cTotales" min="0" step="1" value="' + (s.tomosTotales || '') + '" placeholder="0 = desconocido"></div>' +
          '<div><label for="cTengo">Ya tengo hasta el tomo…</label>' +
            '<input type="number" id="cTengo" min="0" step="1" placeholder="' + (edicion ? 'dejar vacío' : 'opcional') + '"></div>' +
          '<div class="campo--ancho">' +
            '<label for="lmBuscar">Edición española (ListadoManga)</label>' +
            '<div style="display:flex;gap:8px">' +
              '<input type="text" id="lmBuscar" placeholder="Ej. Bleach — y eliges Panini, Maximum, Glénat…">' +
              '<input type="text" id="cListadoManga" inputmode="numeric" style="width:110px;flex:none" ' +
                'value="' + U.esc(s.listadomangaId || '') + '" placeholder="ID" title="ID de la colección">' +
            '</div>' +
            '<div class="ayuda" id="lmElegida">' + textoEdicion(s) + '</div>' +
            '<div class="resultados" id="lmResultados"></div>' +
          '</div>' +
          '<div class="campo--ancho"><label for="cPortada">URL de la portada</label>' +
            '<input type="url" id="cPortada" value="' + U.esc(s.portada) + '" placeholder="https://…"></div>' +
          '<div class="campo--ancho"><label for="cSinopsis">Sinopsis</label>' +
            '<textarea id="cSinopsis">' + U.esc(s.sinopsis) + '</textarea></div>' +
          '<div class="campo--ancho"><label for="cNotas">Notas personales</label>' +
            '<textarea id="cNotas" placeholder="Edición, tomos dobles, dónde la compras…">' + U.esc(s.notas) + '</textarea></div>' +
        '</div>' +
        '<div class="form__acciones">' +
          '<button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancelar</button>' +
          '<button type="submit" class="btn btn--primario">' + (edicion ? 'Guardar cambios' : 'Añadir a la colección') + '</button>' +
        '</div>' +
      '</form>';

    U.abrirModal(html);

    conectarSelectorEdicion(s);

    U.$('#formSerie').addEventListener('submit', function (e) {
      e.preventDefault();
      var datos = {
        titulo: U.$('#cTitulo').value.trim(),
        autor: U.$('#cAutor').value.trim(),
        editorial: U.$('#cEditorial').value.trim(),
        demografia: U.$('#cDemografia').value,
        estado: U.$('#cEstado').value,
        tomosTotales: Number(U.$('#cTotales').value) || 0,
        portada: U.$('#cPortada').value.trim(),
        listadomangaId: U.$('#cListadoManga').value.trim().replace(/\D/g, ''),
        sinopsis: U.$('#cSinopsis').value.trim(),
        notas: U.$('#cNotas').value.trim()
      };
      if (!datos.titulo) return;

      var hasta = Number(U.$('#cTengo').value) || 0;

      if (edicion) {
        if (hasta > 0) rellenarHasta(serie, hasta);
        D.actualizarSerie(serie.id, datos);
        U.aviso('Serie actualizada', 'ok');
        App.abrirSerie(serie.id);
      } else {
        datos.tomos = [];
        for (var i = 1; i <= hasta; i++) {
          datos.tomos.push({ numero: i, tengo: true, leido: false });
        }
        var nueva = D.anadirSerie(datos);
        U.aviso('«' + nueva.titulo + '» añadida', 'ok');
        App.abrirSerie(nueva.id);
      }
    });
  };

  /**
   * Buscador de ediciones sobre el catálogo local de ListadoManga.
   * El catálogo se descarga la primera vez que escribes algo, no al abrir el
   * formulario, para no traer 256 KB si no vas a usarlo.
   */
  function conectarSelectorEdicion(serie) {
    var caja = U.$('#lmBuscar');
    var resultados = U.$('#lmResultados');
    var campoId = U.$('#cListadoManga');
    var elegida = U.$('#lmElegida');
    var ultimos = [];

    function pintar(lista, aguja) {
      ultimos = lista;
      if (!lista.length) {
        resultados.innerHTML = '<div class="ayuda">Sin ediciones que coincidan con «' + U.esc(aguja) + '».</div>';
        return;
      }
      resultados.innerHTML = lista.map(function (c, i) {
        return '<button type="button" class="resultado" data-idx="' + i + '">' +
          '<div class="resultado__cuerpo">' +
            '<div class="resultado__titulo">' + U.esc(c.nombre) + '</div>' +
            '<div class="resultado__meta">Colección ' + U.esc(c.id) + '</div>' +
          '</div>' +
        '</button>';
      }).join('');
    }

    var buscar = U.debounce(function () {
      var texto = caja.value.trim();
      if (texto.length < 2) { resultados.innerHTML = ''; return; }
      resultados.innerHTML = '<div class="ayuda">Buscando…</div>';
      D.cargarIndice()
        .then(function () { pintar(D.buscarEdiciones(texto, 30), texto); })
        .catch(function (e) {
          resultados.innerHTML = '<div class="ayuda">' + U.esc(e.message) +
            '. Puedes escribir el ID a mano: está en la URL de la ficha, en <code>coleccion.php?id=…</code>.</div>';
        });
    }, 220);

    caja.addEventListener('input', buscar);
    caja.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); buscar(); }
    });

    resultados.addEventListener('click', function (e) {
      var nodo = e.target.closest('.resultado');
      if (!nodo) return;
      var c = ultimos[Number(nodo.dataset.idx)];
      if (!c) return;

      campoId.value = c.id;
      resultados.innerHTML = '';
      caja.value = '';

      // Si aún no has puesto título, el de la edición es un buen punto de partida.
      var titulo = U.$('#cTitulo');
      if (!titulo.value.trim()) titulo.value = c.nombre;

      var rellenados = precargarDesdeFicha(c.id);

      // Sin ficha guardada, se intenta traerla al momento si hay proxy.
      if (rellenados === null && FI.hayProxy()) {
        elegida.innerHTML = 'Trayendo los datos de <strong>' + U.esc(c.nombre) + '</strong>…';
        FI.traer(c.id)
          .then(function () {
            var traidos = precargarDesdeFicha(c.id) || [];
            elegida.innerHTML = '✓ <strong>' + U.esc(c.nombre) + '</strong> · traído de ListadoManga' +
              (traidos.length ? ': ' + U.esc(traidos.join(', ')) : '') + '.';
          })
          .catch(function (e) {
            elegida.innerHTML = '✓ Se enlazará con <strong>' + U.esc(c.nombre) + '</strong>. ' +
              'No se ha podido leer la ficha ahora (' + U.esc(e.message) + '); ' +
              'los datos llegarán al publicar.';
          });
        return;
      }

      if (rellenados === null) {
        elegida.innerHTML = '✓ Se enlazará con <strong>' + U.esc(c.nombre) + '</strong>. ' +
          'Aún no tenemos su ficha descargada: los datos y las fechas llegarán en la ' +
          'próxima actualización automática.';
      } else if (rellenados.length) {
        elegida.innerHTML = '✓ <strong>' + U.esc(c.nombre) + '</strong> · rellenados desde la ficha: ' +
          U.esc(rellenados.join(', ')) + '. Cámbialos si no cuadran con tu ejemplar.';
      } else {
        elegida.innerHTML = '✓ Enlazada con <strong>' + U.esc(c.nombre) + '</strong>. ' +
          'No se ha tocado nada de lo que ya habías escrito.';
      }
    });

    // Al editar, arrancamos con el título de la serie ya escrito en el buscador.
    if (serie && !serie.listadomangaId && serie.titulo) caja.value = serie.titulo;
  }

  /**
   * Vuelca los datos de la ficha en el formulario al elegir una edición.
   *
   * Solo rellena lo que esté vacío o en su valor por defecto: si no, al
   * guardar se escribían esos valores por defecto encima de lo que dice la
   * ficha —una serie terminada se guardaba como «en publicación»—.
   *
   * @returns {string[]|null} campos rellenados, o null si no hay ficha aún.
   */
  function precargarDesdeFicha(idlm) {
    var ficha = D.calendario.colecciones[idlm];
    if (!ficha) return null;

    var rellenados = [];

    function texto(selector, valor, etiqueta) {
      var campo = U.$(selector);
      if (!valor || !campo || campo.value.trim()) return;
      campo.value = valor;
      rellenados.push(etiqueta);
    }

    texto('#cAutor', ficha.autor, 'autor');
    texto('#cEditorial', ficha.editorial, 'editorial');
    texto('#cSinopsis', ficha.sinopsis, 'sinopsis');

    var totales = U.$('#cTotales');
    if (ficha.totalNumeros && totales && !Number(totales.value)) {
      totales.value = ficha.totalNumeros;
      rellenados.push('tomos totales');
    }

    // En los desplegables, «por defecto» es el primer valor, no el vacío.
    var demografia = U.$('#cDemografia');
    if (ficha.demografia && demografia && demografia.value === 'otro') {
      demografia.value = ficha.demografia;
      rellenados.push('demografía');
    }

    var estado = U.$('#cEstado');
    if (ficha.estado && estado && !estado.value) {
      estado.value = ficha.estado;
      rellenados.push('estado');
    }

    return rellenados;
  }

  function rellenarHasta(serie, hasta) {
    for (var i = 1; i <= hasta; i++) {
      var t = D.tomo(serie, i, true);
      t.tengo = true;
    }
  }

  /* ============================================================
     Fecha de próxima salida
     ============================================================ */
  F.salida = function (serie) {
    var st = D.statsSerie(serie);
    var sugerido = st.maxTomo + 1;
    serie.proximas.forEach(function (p) { if (p.numero >= sugerido) sugerido = p.numero + 1; });

    U.abrirModal(
      '<h2>Fecha de salida</h2>' +
      '<p class="ayuda">Apunta cuándo sale el próximo tomo de «' + U.esc(serie.titulo) + '». Aparecerá en Próximas publicaciones.</p>' +
      '<form id="formSalida" style="margin-top:16px">' +
        '<div class="campos">' +
          '<div><label for="sNumero">Nº de tomo</label><input type="number" id="sNumero" min="1" step="1" required value="' + sugerido + '"></div>' +
          '<div><label for="sFecha">Fecha de publicación</label><input type="date" id="sFecha" required></div>' +
          '<div class="campo--ancho"><label for="sNota">Nota</label>' +
            '<input type="text" id="sNota" placeholder="Edición especial, reservado en…"></div>' +
        '</div>' +
        '<div class="form__acciones">' +
          '<button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancelar</button>' +
          '<button type="submit" class="btn btn--primario">Añadir fecha</button>' +
        '</div>' +
      '</form>'
    );

    U.$('#formSalida').addEventListener('submit', function (e) {
      e.preventDefault();
      var numero = Number(U.$('#sNumero').value);
      var fecha = U.$('#sFecha').value;
      if (!numero || !fecha) return;

      var otras = serie.proximas.filter(function (p) { return p.numero !== numero; });
      otras.push({ numero: numero, fecha: fecha, nota: U.$('#sNota').value.trim() });
      D.actualizarSerie(serie.id, { proximas: otras });
      U.aviso('Tomo ' + numero + ' apuntado para el ' + U.fechaCorta(fecha), 'ok');
      App.abrirSerie(serie.id);
    });
  };

  /* ============================================================
     Publicar
     ============================================================ */
  F.publicar = function () {
    var n = D.numCambios();
    var conGitHub = GH.configurado();
    var cfg = GH.config();

    U.abrirModal(
      '<h2>Publicar la colección</h2>' +
      '<p class="ayuda">' + (n ? U.plural(n, 'serie') + ' con cambios' : 'Sin cambios respecto a lo publicado') + '.</p>' +
      (conGitHub
        ? '<div class="tarjeta" style="margin-top:16px">' +
            '<h3>Guardar en GitHub</h3>' +
            '<p>Se escribirá <code>' + U.esc(cfg.ruta) + '</code> en <code>' + U.esc(cfg.owner + '/' + cfg.repo) + '</code> (rama <code>' + U.esc(cfg.rama) + '</code>).</p>' +
            (GH.bloqueado()
              ? '<label for="pClave">🔒 Contraseña</label>' +
                '<input type="password" id="pClave" autocomplete="current-password" placeholder="la contraseña con la que cifraste el token">'
              : '<p class="ayuda">🔓 Token desbloqueado en esta pestaña.</p>') +
            '<label for="pMensaje" style="margin-top:10px">Mensaje del commit</label>' +
            '<input type="text" id="pMensaje" value="Actualizar colección de mangas">' +
            '<div class="tarjeta__acciones">' +
              '<button class="btn btn--primario" id="btnCommit">Publicar en GitHub</button>' +
            '</div>' +
          '</div>'
        : '<div class="tarjeta" style="margin-top:16px">' +
            '<h3>Sin token configurado</h3>' +
            '<p>Descarga el JSON y súbelo al repositorio sustituyendo <code>' + U.esc(D.RUTA_JSON) + '</code>. ' +
            'O configura un token en Ajustes para publicar con un clic.</p>' +
            '<div class="tarjeta__acciones">' +
              '<button class="btn btn--primario" data-accion="exportar">Descargar JSON</button>' +
              '<a class="btn" href="#/ajustes" data-cerrar-modal>Ir a Ajustes</a>' +
            '</div>' +
          '</div>') +
      '<div id="pResultado"></div>'
    );

    if (!conGitHub) return;

    U.$('#btnCommit').addEventListener('click', function () {
      var boton = this;
      var campoClave = U.$('#pClave');

      if (GH.bloqueado() && (!campoClave || !campoClave.value)) {
        U.aviso('Escribe la contraseña', 'error');
        if (campoClave) campoClave.focus();
        return;
      }

      boton.disabled = true;
      boton.textContent = GH.bloqueado() ? 'Descifrando…' : 'Publicando…';

      var desbloqueo = GH.bloqueado()
        ? GH.desbloquear(campoClave.value)
        : Promise.resolve();

      desbloqueo
        .then(function () {
          boton.textContent = 'Publicando…';
          return GH.publicar(D.exportar(), U.$('#pMensaje').value.trim());
        })
        .then(function (urlCommit) {
          D.marcarPublicada();
          U.$('#pResultado').innerHTML = '<div class="tarjeta"><h3>✓ Publicado</h3>' +
            '<p>La web pública se actualizará en un minuto aproximadamente.' +
            (urlCommit ? ' <a href="' + U.esc(urlCommit) + '" target="_blank" rel="noopener">Ver el commit</a>.' : '') + '</p></div>';
          boton.textContent = 'Publicado';
          U.aviso('Colección publicada', 'ok');
        })
        .catch(function (e) {
          boton.disabled = false;
          boton.textContent = 'Reintentar';
          U.$('#pResultado').innerHTML = '<div class="tarjeta"><h3>No se pudo publicar</h3><p>' + U.esc(e.message) + '</p></div>';
        });
    });
  };

  /* ============================================================
     Importar desde fichero
     ============================================================ */
  F.importar = function (modo) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', function () {
      var fichero = input.files && input.files[0];
      if (!fichero) return;
      var lector = new FileReader();
      lector.onload = function () {
        try {
          var json = JSON.parse(lector.result);
          if (modo === 'reemplazar' && !confirm('Esto sustituirá toda la colección actual por la del fichero. ¿Continuar?')) return;
          var n = D.importar(json, modo === 'reemplazar' ? 'reemplazar' : 'fusionar');
          U.aviso('Importado: ' + U.plural(n, 'serie') + ' en la colección', 'ok');
          App.render();
        } catch (e) {
          U.aviso('El fichero no es un JSON válido', 'error');
        }
      };
      lector.readAsText(fichero);
    });
    input.click();
  };

  global.F = F;
})(window);
