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
      titulo: '', edicion: '', autor: '', editorial: '', demografia: 'otro', estado: '',
      abandonada: false, tomosTotales: 0, portada: '', sinopsis: '', notas: '', etiquetas: []
    };

    var html =
      '<h2>' + (edicion ? 'Editar serie' : 'Añadir serie') + '</h2>' +
      '<form id="formSerie">' +
        '<div class="campos">' +
          '<div><label for="cTitulo">Título *</label>' +
            '<input type="text" id="cTitulo" required value="' + U.esc(s.titulo) + '" ' +
            'placeholder="Solo el nombre de la obra"></div>' +
          '<div><label for="cEdicion">Edición</label>' +
            '<input type="text" id="cEdicion" value="' + U.esc(s.edicion || '') + '" ' +
            'placeholder="Maximum, Kanzenban, Integral…">' +
            '<div class="ayuda">En los listados se ve solo el título; la edición sale al abrir la serie.</div></div>' +
          '<div><label for="cAutor">Autor</label><input type="text" id="cAutor" value="' + U.esc(s.autor) + '"></div>' +
          '<div><label for="cEditorial">Editorial</label><input type="text" id="cEditorial" value="' + U.esc(s.editorial) + '" placeholder="Planeta, Norma, Ivrea…"></div>' +
          '<div><label for="cDemografia">Demografía</label><select id="cDemografia">' + opcionesDemografia(s.demografia) + '</select></div>' +
          '<div><label for="cEstado">Estado</label><select id="cEstado">' + opcionesEstado(s.estado) + '</select></div>' +
          '<div><label for="cTotales">Tomos totales</label>' +
            '<input type="number" id="cTotales" min="0" step="1" value="' + (s.tomosTotales || '') + '" placeholder="0 = desconocido"></div>' +
          '<div><label for="cTengo">Ya tengo hasta el tomo…</label>' +
            '<input type="number" id="cTengo" min="0" step="1" placeholder="' + (edicion ? 'dejar vacío' : 'opcional') + '"></div>' +
          '<div><label for="cLeido">He leído hasta el tomo…</label>' +
            '<input type="number" id="cLeido" min="0" step="1" placeholder="aunque no los tengas">' +
            '<div class="ayuda">Para lo que hayas leído prestado, en digital o en la biblioteca.</div></div>' +
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
          '<div class="campo--ancho">' +
            '<label style="display:flex;align-items:center;gap:8px;margin:0">' +
              '<input type="checkbox" id="cAbandonada" style="width:auto"' +
              (s.abandonada ? ' checked' : '') + '> He dejado de coleccionarla</label>' +
            '<div class="ayuda">Sigue en tu biblioteca con los tomos que tengas, pero no ' +
              'aparecerá en Próximas compras ni en Próximas publicaciones.</div></div>' +
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
        edicion: U.$('#cEdicion').value.trim(),
        autor: U.$('#cAutor').value.trim(),
        editorial: U.$('#cEditorial').value.trim(),
        demografia: U.$('#cDemografia').value,
        estado: U.$('#cEstado').value,
        abandonada: U.$('#cAbandonada').checked,
        tomosTotales: Number(U.$('#cTotales').value) || 0,
        portada: U.$('#cPortada').value.trim(),
        listadomangaId: U.$('#cListadoManga').value.trim().replace(/\D/g, ''),
        sinopsis: U.$('#cSinopsis').value.trim(),
        notas: U.$('#cNotas').value.trim()
      };
      if (!datos.titulo) return;

      var hasta = Number(U.$('#cTengo').value) || 0;
      var leidoHasta = Number(U.$('#cLeido').value) || 0;

      if (edicion) {
        if (hasta > 0) rellenarHasta(serie, hasta);
        if (leidoHasta > 0) rellenarHasta(serie, leidoHasta, 'leido');
        D.actualizarSerie(serie.id, datos);
        U.aviso('Serie actualizada', 'ok');
        App.abrirSerie(serie.id);
      } else {
        datos.tomos = [];
        for (var i = D.primerNumeroDe(datos); i <= Math.max(hasta, leidoHasta); i++) {
          datos.tomos.push({ numero: i, tengo: i <= hasta, leido: i <= leidoHasta });
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

      // El nombre de la colección en ListadoManga trae obra y edición juntas
      // («Bleach (Maximum)»): se reparten en sus dos campos.
      var partes = U.partirTitulo(c.nombre);
      var titulo = U.$('#cTitulo');
      var campoEdicion = U.$('#cEdicion');
      if (!titulo.value.trim()) titulo.value = partes.titulo;
      if (campoEdicion && !campoEdicion.value.trim()) campoEdicion.value = partes.edicion;

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

    // Al editar, arrancamos con la serie ya escrita en el buscador. Va con la
    // edición: allí las colecciones se llaman «Bleach (Maximum)», y buscar
    // «Bleach» a secas devolvería todas las ediciones mezcladas.
    if (serie && !serie.listadomangaId && serie.titulo) caja.value = D.nombreCompleto(serie);
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

  function rellenarHasta(serie, hasta, campo) {
    // «Tengo hasta el 5» en una serie con tomo 0 son seis tomos, del 0 al 5.
    for (var i = D.primerNumeroDe(serie); i <= hasta; i++) {
      D.tomo(serie, i, true)[campo || 'tengo'] = true;
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
     Qué sale un día concreto
     ============================================================ */
  F.dia = function (fecha) {
    var items = D.proximasPublicaciones().filter(function (i) {
      return String(i.salida.fecha).slice(0, 10) === fecha;
    });

    var aproximadas = items.filter(function (i) { return i.salida.aproximada; }).length;
    var suma = items.reduce(function (t, i) { return t + (i.salida.precio || 0); }, 0);

    U.abrirModal(
      '<h2>' + U.esc(U.fechaLarga(fecha)) + '</h2>' +
      '<p class="ayuda">' + U.plural(items.length, 'tomo') + ' · ' + U.cuando(fecha) +
        (suma ? ' · ' + U.euros(suma) + ' en total' : '') + '</p>' +
      (aproximadas
        ? '<p class="ayuda">' + U.plural(aproximadas, 'tomo tiene', 'tomos tienen') +
          ' fecha aproximada: la editorial solo ha dado el mes.</p>'
        : '') +
      '<div class="lista" style="margin-top:14px">' + items.map(V.filaSalida).join('') + '</div>'
    );
  };

  /* ============================================================
     Precios de los tomos
     ============================================================ */
  F.precios = function (serie) {
    var tomos = serie.tomos.filter(function (t) { return t.tengo; })
      .sort(function (a, b) { return a.numero - b.numero; });

    var filas = tomos.map(function (t) {
      var p = D.precioDe(serie, t);
      return '<tr>' +
        '<td>' + t.numero + '</td>' +
        '<td class="precios__estimado">' +
          (p.pvp ? U.euros(p.valor) + '<small> · PVP ' + U.euros(p.pvp) + '</small>' : '—') +
        '</td>' +
        // De texto, no type="number": ese se come la coma decimal sin avisar
        // y «7,50» acababa guardándose como 750.
        '<td><input type="text" inputmode="decimal" class="precios__input" ' +
          'data-tomo="' + t.numero + '" value="' + U.esc(U.numeroTexto(t.precio)) + '" ' +
          'placeholder="' + (p.pvp ? U.euros(p.valor).replace(' €', '') : '') + '"></td>' +
        '<td><input type="date" class="precios__fecha" data-tomo="' + t.numero + '" ' +
          'value="' + U.esc(t.fechaCompra || '') + '"></td>' +
      '</tr>';
    }).join('');

    var opcionesTomo = function (sel) {
      return tomos.map(function (t) {
        return '<option value="' + t.numero + '"' + (sel === t.numero ? ' selected' : '') + '>' + t.numero + '</option>';
      }).join('');
    };

    // Reparto: lo habitual al comprar un lote o un pack es saber lo que
    // costó entero, no lo que valía cada tomo.
    var reparto = tomos.length < 2 ? '' :
      '<div class="reparto">' +
        '<div class="reparto__campos">' +
          '<label for="rImporte">Pagué en total</label>' +
          '<input type="text" inputmode="decimal" id="rImporte" placeholder="0,00">' +
          '<span>€ por los tomos</span>' +
          '<select id="rDesde">' + opcionesTomo(tomos[0].numero) + '</select>' +
          '<span>a</span>' +
          '<select id="rHasta">' + opcionesTomo(tomos[tomos.length - 1].numero) + '</select>' +
          '<label for="rFecha" class="reparto__opcional">y los compré el</label>' +
          '<input type="date" id="rFecha">' +
          '<button type="button" class="btn btn--pequeno" id="rRepartir">Repartir</button>' +
        '</div>' +
        '<div class="ayuda" id="rAviso">Divide el importe a partes iguales entre esos tomos y lo ' +
          'escribe en la tabla. Nada se guarda hasta que le des a «Guardar precios».</div>' +
      '</div>';

    U.abrirModal(
      '<h2>Precios · ' + U.esc(serie.titulo) + '</h2>' +
      '<p class="ayuda">Lo que dejes en blanco se calcula con el PVP menos tu descuento (' +
      D.descuento() + '%). Escribe el precio solo si pagaste otra cosa: de segunda mano, ' +
      'de oferta o en un pack.</p>' +
      reparto +
      '<div class="precios">' +
        '<table>' +
          '<thead><tr><th>Tomo</th><th>Estimado</th><th>Lo que pagué</th><th>Fecha</th></tr></thead>' +
          '<tbody>' + filas + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div class="form__acciones">' +
        '<span class="izquierda"><button type="button" class="btn btn--peligro btn--pequeno" id="pVaciar">Vaciar todos</button></span>' +
        '<button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancelar</button>' +
        '<button type="button" class="btn btn--primario" id="pGuardar">Guardar precios</button>' +
      '</div>'
    );

    U.$('#pVaciar').addEventListener('click', function () {
      U.$$('.precios__input').forEach(function (i) { i.value = ''; });
    });

    // Qué reparto se ha volcado ya en la tabla, para no repetirlo ni pisar lo
    // que hayas retocado a mano después.
    var repartoAplicado = '';

    function firmaReparto() {
      if (!U.$('#rImporte')) return '';
      var v = U.$('#rImporte').value.trim();
      return v ? [v, U.$('#rDesde').value, U.$('#rHasta').value, U.$('#rFecha').value].join('|') : '';
    }

    /**
     * Vuelca el importe en la tabla, a partes iguales entre el tramo elegido.
     *
     * @param {boolean} callado no protesta si no hay importe, para poder
     *   llamarlo desde «Guardar precios» sin molestar a quien no lo use.
     * @returns {boolean} si ha repartido algo
     */
    function aplicarReparto(callado) {
      var aviso = U.$('#rAviso');
      if (!aviso) return false;
      var importe = U.aNumero(U.$('#rImporte').value);
      var desde = Number(U.$('#rDesde').value);
      var hasta = Number(U.$('#rHasta').value);
      var fecha = U.$('#rFecha').value;

      if (desde > hasta) { var v = desde; desde = hasta; hasta = v; }

      if (importe === null) {
        if (!callado) {
          aviso.innerHTML = '<strong>Escribe primero cuánto pagaste.</strong>';
          U.$('#rImporte').focus();
        }
        return false;
      }
      if (!(importe > 0)) {
        aviso.innerHTML = '<strong>«' + U.esc(U.$('#rImporte').value) +
          '» no es un importe.</strong> Puedes escribirlo con coma: 50,25';
        if (!callado) U.$('#rImporte').focus();
        return false;
      }

      var elegidos = U.$$('.precios__input').filter(function (i) {
        var n = Number(i.dataset.tomo);
        return n >= desde && n <= hasta;
      });
      if (!elegidos.length) { aviso.innerHTML = '<strong>Ese tramo no tiene tomos.</strong>'; return false; }

      // En céntimos para que la suma cuadre exactamente: 10 € entre 3 son
      // 3,34 + 3,33 + 3,33, no tres veces 3,33.
      var centimos = Math.round(importe * 100);
      var base = Math.floor(centimos / elegidos.length);
      var sobran = centimos - base * elegidos.length;

      elegidos.forEach(function (input, n) {
        input.value = ((base + (n < sobran ? 1 : 0)) / 100).toFixed(2).replace('.', ',');
      });

      if (fecha) {
        U.$$('.precios__fecha').forEach(function (i) {
          var n = Number(i.dataset.tomo);
          if (n >= desde && n <= hasta) i.value = fecha;
        });
      }

      repartoAplicado = firmaReparto();
      aviso.innerHTML = '✓ ' + U.euros(importe) + ' repartidos entre ' +
        U.plural(elegidos.length, 'tomo') + ': ' + U.euros(base / 100) +
        (sobran ? ' cada uno, y ' + U.plural(sobran, 'tomo') + ' con un céntimo más para que cuadre' : ' cada uno') +
        '.';
      return true;
    }

    if (U.$('#rRepartir')) {
      U.$('#rRepartir').addEventListener('click', function () {
        if (aplicarReparto(false)) {
          U.$('#rAviso').innerHTML += ' Revísalo y dale a «Guardar precios».';
        }
      });
    }

    U.$('#pGuardar').addEventListener('click', function () {
      // Si has dejado un importe escrito arriba y no llegaste a pulsar
      // «Repartir», se reparte ahora: guardar sin hacerle caso era la forma más
      // fácil de creer que habías guardado un precio que nunca se escribió.
      if (firmaReparto() && firmaReparto() !== repartoAplicado) aplicarReparto(true);

      var fechas = {};
      U.$$('.precios__fecha').forEach(function (i) { fechas[i.dataset.tomo] = i.value; });

      var ilegibles = [];
      U.$$('.precios__input').forEach(function (i) {
        var t = D.tomo(serie, Number(i.dataset.tomo), true);
        var valor = i.value.trim();
        var n = U.aNumero(valor);
        // Vacío borra el precio; lo que no se entiende se deja como estaba y se
        // avisa, en vez de guardar un 0 a traición.
        if (valor === '') t.precio = null;
        else if (n === null) ilegibles.push(i.dataset.tomo);
        else t.precio = n;
        t.fechaCompra = fechas[i.dataset.tomo] || '';
      });
      D.guardar();
      if (ilegibles.length) {
        U.aviso('No se entienden los precios de los tomos ' + ilegibles.join(', ') +
          ': se han dejado como estaban', 'error');
      } else {
        U.aviso('Precios guardados', 'ok');
      }
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

  /* ============================================================
     Capítulos de cada tomo
     ============================================================ */

  /**
   * Qué capítulos trae cada tomo, y por cuál vas.
   *
   * Es sobre todo para lo que lees por app sin tenerlo: tú sabes que vas por
   * el capítulo 300, no por el tomo 34. Con la equivalencia puesta, la web
   * traduce lo uno en lo otro.
   */
  F.capitulos = function (serie) {
    var c = serie.capitulos || { inicio: 1, porTomo: 0, tabla: {}, leidoHasta: null, fuente: '' };
    var tabla = JSON.parse(JSON.stringify(c.tabla || {}));
    var total = D.totalDe(serie);

    U.abrirModal(
      '<h2>Capítulos · ' + U.esc(serie.titulo) + '</h2>' +
      '<p class="ayuda">Di cuántos capítulos trae cada tomo y podrás marcar por dónde vas ' +
      'con el número de capítulo, que es el que sabes cuando lees por app.</p>' +

      '<div class="campos" style="margin-top:16px">' +
        '<div><label for="kInicio">El primer tomo empieza en el capítulo</label>' +
          '<input type="number" id="kInicio" min="0" step="1" value="' + (c.inicio || 1) + '"></div>' +
        '<div><label for="kPorTomo">Capítulos por tomo (de media)</label>' +
          '<input type="number" id="kPorTomo" min="0" step="1" value="' + (c.porTomo || '') +
          '" placeholder="9"></div>' +
      '</div>' +

      '<div class="wiki">' +
        '<button type="button" class="btn btn--pequeno" id="kWiki">📖 Buscarlo en Wikipedia</button>' +
        '<span class="ayuda" id="kWikiAviso">Cuando el artículo lo tiene, trae los capítulos ' +
          'exactos de cada tomo. Muchas series no lo tienen puesto.</span>' +
        '<div class="wiki__factor oculto" id="kFactorCaja">' +
          '<label for="kFactor">Cada tomo tuyo lleva</label>' +
          '<input type="number" id="kFactor" min="1" max="20" step="1" value="1">' +
          '<span>de la edición original</span>' +
          '<span class="ayuda" id="kFactorAviso"></span>' +
        '</div>' +
      '</div>' +

      '<div id="kPreview" class="ayuda" style="margin-top:14px"></div>' +

      '<div class="campos" style="margin-top:16px">' +
        '<div><label for="kLeido">He leído hasta el capítulo</label>' +
          '<input type="number" id="kLeido" min="0" step="1" value="' +
          (c.leidoHasta === null || c.leidoHasta === undefined ? '' : c.leidoHasta) + '"></div>' +
        '<div style="display:flex;align-items:flex-end">' +
          '<label style="display:flex;gap:8px;align-items:center;cursor:pointer">' +
            '<input type="checkbox" id="kMarcar" checked>' +
            '<span>Marcar como leídos los tomos que entren enteros</span></label>' +
        '</div>' +
      '</div>' +

      '<div class="form__acciones">' +
        '<button type="button" class="btn btn--fantasma" data-cerrar-modal>Cancelar</button>' +
        '<button type="button" class="btn btn--primario" id="kGuardar">Guardar</button>' +
      '</div>'
    );

    /** Lee el formulario y devuelve la configuración que se guardaría. */
    function actual() {
      return {
        inicio: Number(U.$('#kInicio').value) || 0,
        porTomo: Number(U.$('#kPorTomo').value) || 0,
        tabla: tabla,
        leidoHasta: U.$('#kLeido').value === '' ? null : Number(U.$('#kLeido').value),
        fuente: c.fuente
      };
    }

    /** Enseña cómo quedarían los tomos sin llegar a guardar nada. */
    function pintarPreview() {
      var caja = U.$('#kPreview');
      var cfg = D.normalizarCapitulos(actual());
      // Una serie recién creada aún no sabe cuántos tomos tiene, y entonces la
      // vista previa se quedaba en el tomo 1. Cuando no hay total, se enseña lo
      // que abarque la tabla: es lo que se va a guardar.
      var cuantos = cfg ? Object.keys(cfg.tabla).length : 0;
      var mapa = D.mapaCapitulos({
        tomos: serie.tomos, listadomangaId: serie.listadomangaId,
        tomosTotales: serie.tomosTotales || cuantos, capitulos: cfg
      });
      if (!mapa) {
        caja.innerHTML = 'Pon los capítulos por tomo —o tráelos de Wikipedia— y aquí verás cómo queda.';
        return;
      }
      var nums = Object.keys(mapa).map(Number).sort(function (a, b) { return a - b; });
      var exactos = nums.filter(function (n) { return mapa[n].exacto; }).length;
      var muestra = nums.slice(0, 4).map(function (n) {
        return '<strong>Tomo ' + n + '</strong> caps ' + mapa[n].desde + '–' + mapa[n].hasta;
      });
      var ultimo = nums[nums.length - 1];
      if (nums.length > 4) muestra.push('… <strong>Tomo ' + ultimo + '</strong> caps ' +
        mapa[ultimo].desde + '–' + mapa[ultimo].hasta);
      caja.innerHTML = muestra.join(' · ') +
        '<br>' + U.plural(nums.length, 'tomo') + ' · ' +
        (exactos ? exactos + ' con el reparto exacto y el resto con la media'
                 : 'todos con la media, sin datos exactos');
    }

    ['#kInicio', '#kPorTomo', '#kLeido'].forEach(function (sel) {
      U.$(sel).addEventListener('input', pintarPreview);
    });
    pintarPreview();

    // Lo último que trajo Wikipedia, en tomos de la edición original: la tabla
    // que se guarda sale de agruparlo, y el agrupado se puede cambiar a mano.
    var wiki = null;

    /** Rehace la tabla juntando los tomos originales de `factor` en `factor`. */
    function aplicarFactor() {
      if (!wiki) return;
      var factor = Math.max(1, Number(U.$('#kFactor').value) || 1);
      var agrupado = WK.agrupar(wiki.tomos, factor);
      var salen = Object.keys(agrupado).length;

      tabla = {};
      Object.keys(agrupado).forEach(function (k) { tabla[k] = agrupado[k]; });
      U.$('#kPorTomo').value = Math.round(wiki.capitulos / salen);

      U.$('#kFactorAviso').innerHTML = !total
        ? 'salen ' + U.plural(salen, 'tomo')
        : factor === 1
          ? (salen === total ? '✓ salen tus ' + total + ' tomos'
                             : '⚠ salen ' + salen + ', y tú tienes ' + total)
          : (salen === total ? '✓ agrupando de ' + factor + ' en ' + factor +
                ' salen justo tus ' + total + ' tomos'
              : '⚠ agrupando de ' + factor + ' en ' + factor + ' salen ' + salen +
                ' tomos, y tú tienes ' + total);
      pintarPreview();
    }

    U.$('#kFactor').addEventListener('input', aplicarFactor);

    U.$('#kWiki').addEventListener('click', function () {
      var boton = U.$('#kWiki'), aviso = U.$('#kWikiAviso');
      boton.disabled = true;
      aviso.textContent = 'Buscando…';
      WK.buscarCapitulos(serie.titulo).then(function (r) {
        boton.disabled = false;
        if (!r) {
          aviso.innerHTML = 'No hay capítulos de «' + U.esc(serie.titulo) + '» en Wikipedia. ' +
            'Ponlos a mano: con la media de capítulos por tomo ya sale bien.';
          return;
        }
        wiki = r;
        c.fuente = 'wikipedia';
        U.$('#kInicio').value = r.inicio;

        // Wikipedia cuenta los tomos de la edición original. La tuya puede
        // meter dos o tres en cada uno, así que antes de nada hay que saber
        // de cuántos en cuántos van.
        var d = WK.deducirFactor(r.total, total, D.tomosPorTomo(serie));
        U.$('#kFactorCaja').classList.remove('oculto');
        U.$('#kFactor').value = d.cuadra ? d.factor : 1;

        aviso.innerHTML = 'De <a href="' + U.esc(WK.url(r)) + '" target="_blank" rel="noopener">' +
          U.esc(r.pagina) + '</a>: ' + U.plural(r.total, 'tomo') + ' de la edición original y ' +
          U.plural(r.capitulos, 'capítulo') + '.' +
          (!total
            // Serie recién creada: todavía no consta cuántos tomos tiene, así
            // que no hay con qué comparar. Se guarda el reparto entero y ya
            // encajará cuando la serie sepa su tamaño.
            ? ' Se guarda entero; los rangos saldrán en cuanto la serie tenga tomos. ' +
              'Si tu edición junta varios en uno, dilo abajo.'
            : !r.completa
            ? ' <strong>Ojo:</strong> la lista está incompleta, le faltan tomos por medio, ' +
              'así que los números no van a cuadrar.'
            : d.cuadra && d.factor > 1
              ? ' Tu edición mete ' + d.factor + ' en cada tomo' +
                (d.declarado ? ', como dice su nombre' : ', que es lo que cuadra con tus ' + total) +
                ': los capítulos se reparten ya según eso.'
              : d.cuadra ? ' Encaja con tus ' + total + ' tomos.'
                : ' <strong>Ojo:</strong> no hay forma de repartir esos ' + r.total +
                  ' tomos en tus ' + total + '. Las kanzenban y las integrales rebarajan ' +
                  'los capítulos y no siguen ninguna proporción; prueba a cambiar el ' +
                  'agrupado o quédate con la media.');

        aplicarFactor();
      }).catch(function (e) {
        boton.disabled = false;
        aviso.textContent = 'No se pudo consultar Wikipedia: ' + e.message;
      });
    });

    U.$('#kGuardar').addEventListener('click', function () {
      var cfg = D.normalizarCapitulos(actual());
      D.actualizarSerie(serie.id, { capitulos: cfg });
      var marcados = 0;
      if (cfg && cfg.leidoHasta && U.$('#kMarcar').checked) {
        marcados = D.marcarLeidosHastaCapitulo(D.serie(serie.id), cfg.leidoHasta);
      }
      U.aviso(cfg
        ? 'Capítulos guardados' + (marcados ? ' · ' + U.plural(marcados, 'tomo') + ' marcados como leídos' : '')
        : 'Capítulos borrados', 'ok');
      App.abrirSerie(serie.id);
    });
  };

  global.F = F;
})(window);
