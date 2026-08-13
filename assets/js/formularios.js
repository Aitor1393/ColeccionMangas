/* ============================================================
   formularios.js — altas, ediciones y diálogos del modal
   ============================================================ */
(function (global) {
  'use strict';

  var F = {};

  function opcionesEstado(sel) {
    return Object.keys(D.ESTADOS).map(function (k) {
      return '<option value="' + k + '"' + (sel === k ? ' selected' : '') + '>' + D.ESTADOS[k].etiqueta + '</option>';
    }).join('');
  }

  function opcionesDemografia(sel) {
    return Object.keys(D.DEMOGRAFIAS).map(function (k) {
      return '<option value="' + k + '"' + (sel === k ? ' selected' : '') + '>' + D.DEMOGRAFIAS[k] + '</option>';
    }).join('');
  }

  /* ============================================================
     Alta / edición de serie
     ============================================================ */
  F.serie = function (serie) {
    var edicion = !!serie;
    var s = serie || {
      titulo: '', autor: '', editorial: '', demografia: 'otro', estado: 'en-publicacion',
      tomosTotales: 0, portada: '', sinopsis: '', notas: '', etiquetas: []
    };

    var buscador = edicion ? '' :
      '<div style="margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid var(--borde)">' +
        '<label for="mdBuscar">Buscar en MangaDex y rellenar automáticamente</label>' +
        '<div style="display:flex;gap:8px">' +
          '<input type="text" id="mdBuscar" placeholder="Ej. Berserk, Chainsaw Man, Monster…">' +
          '<button class="btn" id="mdBtn" type="button">Buscar</button>' +
        '</div>' +
        '<div class="ayuda">Opcional: rellena título, autor, portada, sinopsis y nº de tomos. Siempre puedes escribirlo a mano.</div>' +
        '<div class="resultados" id="mdResultados"></div>' +
      '</div>';

    var html =
      '<h2>' + (edicion ? 'Editar serie' : 'Añadir serie') + '</h2>' +
      buscador +
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

    var datosMD = {};   // metadatos extra de la búsqueda (etiquetas, id…)

    if (!edicion) {
      var input = U.$('#mdBuscar');
      var boton = U.$('#mdBtn');
      var caja = U.$('#mdResultados');
      var ultimos = [];

      var buscar = function () {
        var texto = input.value.trim();
        if (texto.length < 2) return;
        caja.innerHTML = '<div class="ayuda">Buscando…</div>';
        MD.buscar(texto).then(function (series) {
          ultimos = series;
          if (!series.length) { caja.innerHTML = '<div class="ayuda">Sin resultados. Rellena el formulario a mano.</div>'; return; }
          caja.innerHTML = series.map(function (r, i) {
            return '<button type="button" class="resultado" data-idx="' + i + '">' +
              (r.portadaMini ? '<img src="' + U.esc(r.portadaMini) + '" alt="" referrerpolicy="no-referrer">' : '<div class="fila__portada" style="width:44px;height:64px"></div>') +
              '<div class="resultado__cuerpo">' +
                '<div class="resultado__titulo">' + U.esc(r.titulo) + '</div>' +
                '<div class="resultado__meta">' + U.esc(r.autor || 'Autor desconocido') +
                  (r.anio ? ' · ' + r.anio : '') +
                  ' · ' + U.esc(D.ESTADOS[r.estado].etiqueta) +
                  (r.tomosTotales ? ' · ' + r.tomosTotales + ' tomos' : '') + '</div>' +
              '</div>' +
            '</button>';
          }).join('');
        }).catch(function (e) {
          caja.innerHTML = '<div class="ayuda">No se pudo consultar MangaDex (' + U.esc(e.message) + '). Rellena el formulario a mano.</div>';
        });
      };

      boton.addEventListener('click', buscar);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); buscar(); }
      });

      caja.addEventListener('click', function (e) {
        var nodo = e.target.closest('.resultado');
        if (!nodo) return;
        var r = ultimos[Number(nodo.dataset.idx)];
        if (!r) return;
        U.$('#cTitulo').value = r.titulo;
        U.$('#cAutor').value = r.autor;
        U.$('#cSinopsis').value = r.sinopsis;
        U.$('#cPortada').value = r.portada;
        U.$('#cEstado').value = r.estado;
        U.$('#cDemografia').value = D.DEMOGRAFIAS[r.demografia] ? r.demografia : 'otro';
        if (r.tomosTotales) U.$('#cTotales').value = r.tomosTotales;
        datosMD = { etiquetas: r.etiquetas, mangadexId: r.mangadexId, tituloAlt: r.tituloAlt };
        caja.innerHTML = '<div class="ayuda">✓ Datos de «' + U.esc(r.titulo) + '» cargados. Revísalos y ajusta lo que quieras.</div>';
      });
    }

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
        datos.etiquetas = datosMD.etiquetas || [];
        datos.mangadexId = datosMD.mangadexId || '';
        datos.tituloAlt = datosMD.tituloAlt || '';
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
            '<label for="pMensaje">Mensaje del commit</label>' +
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
      boton.disabled = true;
      boton.textContent = 'Publicando…';
      GH.publicar(D.exportar(), U.$('#pMensaje').value.trim())
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
