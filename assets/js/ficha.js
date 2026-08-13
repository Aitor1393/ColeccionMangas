/* ============================================================
   ficha.js — lee una ficha de ListadoManga desde el navegador
   ------------------------------------------------------------
   Hace lo mismo que scripts/actualizar_calendario.py, pero en
   directo y sobre el DOM, para poder rellenar el formulario en
   cuanto eliges la edición, sin esperar a publicar.

   Necesita un proxy que añada las cabeceras CORS que ListadoManga
   no envía (ver workers/listadomanga-proxy.js). Sin proxy
   configurado, todo sigue funcionando como antes: los datos llegan
   con la actualización automática.

   Ambas implementaciones deben devolver la misma estructura. Si
   tocas una, revisa la otra.
   ============================================================ */
(function (global) {
  'use strict';

  var FI = {};
  var CLAVE_PROXY = 'cm:proxy';
  var CLAVE_CACHE = 'cm:fichas';

  /* ---------- Configuración del proxy ---------- */

  FI.proxy = function () { return U.leerLocal(CLAVE_PROXY, '') || ''; };
  FI.guardarProxy = function (url) {
    if (url) U.guardarLocal(CLAVE_PROXY, url); else U.borrarLocal(CLAVE_PROXY);
  };
  FI.hayProxy = function () { return !!FI.proxy(); };

  /** Sustituye {id} en la plantilla, o lo añade como parámetro. */
  function urlDe(idlm) {
    var plantilla = FI.proxy();
    if (plantilla.indexOf('{id}') !== -1) return plantilla.replace('{id}', encodeURIComponent(idlm));
    return plantilla + (plantilla.indexOf('?') === -1 ? '?' : '&') + 'id=' + encodeURIComponent(idlm);
  }

  /* ---------- Caché local de fichas ---------- */

  /**
   * Las fichas que traes en directo se guardan aquí y se superponen a
   * data/calendario.json, para que sus fechas y precios se vean ya. Cuando el
   * Action las publique, quedarán también para quien visite la web.
   */
  FI.cacheLocal = function () { return U.leerLocal(CLAVE_CACHE, {}) || {}; };

  FI.guardarEnCache = function (idlm, ficha) {
    var cache = FI.cacheLocal();
    cache[idlm] = ficha;
    U.guardarLocal(CLAVE_CACHE, cache);
  };

  FI.limpiarCache = function () { U.borrarLocal(CLAVE_CACHE); };

  /* ---------- Análisis de la ficha ---------- */

  var ESTADOS = {
    abierta: 'en-publicacion', completa: 'finalizada',
    cancelada: 'cancelada', suspendida: 'pausada'
  };

  var DEMOGRAFIAS = [
    [['shonen', 'shounen'], 'shounen'],
    [['shojo', 'shoujo'], 'shoujo'],
    [['seinen'], 'seinen'],
    [['josei'], 'josei'],
    [['kodomo', 'infantil'], 'kodomo']
  ];

  /** El campo «Colección» es la línea editorial y a veces lleva la demografía. */
  function demografiaDe(coleccion) {
    var texto = U.normalizar(coleccion);
    for (var i = 0; i < DEMOGRAFIAS.length; i++) {
      for (var j = 0; j < DEMOGRAFIAS[i][0].length; j++) {
        if (new RegExp('\\b' + DEMOGRAFIAS[i][0][j] + '\\b').test(texto)) return DEMOGRAFIAS[i][1];
      }
    }
    return '';
  }

  var MESES = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
  };

  /** Campos de cabecera, que van como <b>Etiqueta:</b> valor<br>. */
  function metadatos(doc) {
    var campos = {};
    U.$$('b', doc).forEach(function (b) {
      var etiqueta = U.normalizar(b.textContent).replace(':', '').trim();
      if (!etiqueta) return;
      var valor = '';
      var nodo = b.nextSibling;
      while (nodo && !(nodo.nodeType === 1 && nodo.tagName === 'BR')) {
        valor += nodo.textContent || '';
        nodo = nodo.nextSibling;
      }
      if (!campos[etiqueta]) campos[etiqueta] = valor.replace(/\s+/g, ' ').trim();
    });
    return campos;
  }

  /** Números con su fecha y precio, del mismo modo que el script de Python. */
  function numeros(doc) {
    var porNumero = {};

    U.$$('td.cen', doc).forEach(function (celda) {
      // Los <br> hay que convertirlos en espacio antes de leer el texto: sin
      // esto, «nº1<br>384 páginas» se lee como «nº1384» y el número sale mal.
      var copia = celda.cloneNode(true);
      U.$$('br', copia).forEach(function (br) {
        br.parentNode.replaceChild(copia.ownerDocument.createTextNode(' '), br);
      });
      var texto = copia.textContent || '';

      var m = texto.match(/nº\s*(\d+)/);
      if (!m) return;
      var numero = Number(m[1]);

      var precio = texto.match(/(\d+),(\d{2})\s*€/);
      var enlace = celda.querySelector('a[href*="novedades.php?mes="]');

      var fecha = null, aproximada = false;
      if (enlace) {
        var partes = enlace.getAttribute('href').match(/mes=(\d+)&(?:amp;)?ano=(\d+)/);
        var nombreMes = U.normalizar(enlace.textContent).trim().split(' ')[0];
        var mes = partes ? Number(partes[1]) : MESES[nombreMes];
        var anio = partes ? Number(partes[2]) : 0;

        // El día va suelto justo antes del enlace: «4 <a>Junio 2026</a>»
        var previo = (enlace.previousSibling && enlace.previousSibling.textContent) || '';
        var dia = previo.match(/(\d{1,2})\s*$/);

        if (mes && anio) {
          if (dia) {
            fecha = anio + '-' + U.pad(mes) + '-' + U.pad(Number(dia[1]));
          } else {
            fecha = anio + '-' + U.pad(mes) + '-01';
            aproximada = true;
          }
        }
      }

      var registro = {
        numero: numero,
        fecha: fecha,
        precio: precio ? Number(precio[1] + '.' + precio[2]) : null,
        aproximada: aproximada,
        // En directo se apunta a la imagen de ListadoManga; cuando el Action
        // la publique, pasará a ser la copia de data/portadas/.
        portada: urlDeImagen(celda.querySelector('img.portada'))
      };

      // La ficha repite números en «portadas alternativas»: nos quedamos con
      // la primera aparición que traiga fecha.
      var previoReg = porNumero[numero];
      if (!previoReg || (!previoReg.fecha && fecha)) porNumero[numero] = registro;
    });

    return Object.keys(porNumero)
      .map(function (k) { return porNumero[k]; })
      .sort(function (a, b) { return a.numero - b.numero; });
  }

  function sinopsis(doc) {
    var titulo = U.$$('h2', doc).filter(function (h) {
      return /sinopsis de/i.test(h.textContent);
    })[0];
    if (!titulo) return '';
    var celda = titulo.closest('td');
    if (!celda) return '';
    var copia = celda.cloneNode(true);
    U.$$('h2, hr', copia).forEach(function (n) { n.remove(); });
    return copia.textContent.replace(/\n{3,}/g, '\n\n').trim();
  }

  /** URL real de una imagen: si está censurada, va en data-portada. */
  function urlDeImagen(img) {
    if (!img) return '';
    var real = img.getAttribute('data-portada');
    if (real) return 'https://static.listadomanga.com/' + real;
    return img.getAttribute('src') || '';
  }

  function portada(doc) {
    return urlDeImagen(doc.querySelector('img.portada'));
  }

  /** Convierte el HTML de una ficha en la misma estructura que calendario.json. */
  FI.analizar = function (htmlTexto, idlm) {
    var doc = new DOMParser().parseFromString(htmlTexto, 'text/html');
    var campos = metadatos(doc);

    var numerosEs = campos['numeros en castellano'] || campos['numeros en catalan'] || '';
    var total = numerosEs.match(/(\d+)/);

    var estado = '';
    Object.keys(ESTADOS).forEach(function (palabra) {
      if (!estado && U.normalizar(numerosEs).indexOf(palabra) !== -1) estado = ESTADOS[palabra];
    });

    var coleccion = campos['coleccion'] || '';
    var titulo = (doc.querySelector('title') || {}).textContent || '';

    return {
      titulo: titulo.split('·').pop().trim(),
      url: 'https://www.listadomanga.es/coleccion.php?id=' + idlm,
      editorial: campos['editorial espanola'] || '',
      coleccion: coleccion,
      demografia: demografiaDe(coleccion),
      formato: campos['formato'] || '',
      autor: campos['guion'] || campos['dibujo'] || '',
      totalNumeros: total ? Number(total[1]) : 0,
      estado: estado,
      descargado: U.isoHoy(),
      sinopsis: sinopsis(doc),
      portada: portada(doc),
      numeros: numeros(doc)
    };
  };

  /**
   * Descarga y analiza la ficha de una colección a través del proxy.
   * Los errores intentan decir qué revisar, porque las causas posibles
   * (URL mal escrita, CORS, Worker sin desplegar) dan síntomas parecidos.
   */
  FI.traer = function (idlm) {
    if (!FI.hayProxy()) return Promise.reject(new Error('No hay proxy configurado.'));

    var url = urlDe(idlm);

    return fetch(url, { headers: { Accept: 'text/html' } })
      .catch(function () {
        // fetch solo rechaza por red o por CORS; nunca por un código de error.
        throw new Error(
          'no se pudo conectar con ' + url + '. Comprueba que la URL es correcta y que ' +
          'el Worker está desplegado. Si al abrirla en el navegador sí funciona, entonces ' +
          'es el CORS: revisa que ORIGENES incluya ' + location.origin + '.');
      })
      .then(function (r) {
        if (r.status === 400) {
          throw new Error('el proxy dice que falta el id. ¿Has puesto {id} en la URL?');
        }
        if (!r.ok) throw new Error('el proxy respondió ' + r.status + ' ' + r.statusText);
        return r.text();
      })
      .then(function (texto) {
        var ficha = FI.analizar(texto, idlm);
        if (!ficha.numeros.length && !ficha.editorial) {
          var pista = /hello world/i.test(texto)
            ? 'el Worker sigue con el código de ejemplo: falta pegar listadomanga-proxy.js y volver a desplegar'
            : 'la respuesta no parece una ficha de ListadoManga (empieza por «' +
              texto.slice(0, 40).replace(/\s+/g, ' ') + '…»)';
          throw new Error(pista);
        }
        FI.guardarEnCache(idlm, ficha);
        D.calendario.colecciones[idlm] = ficha;
        return ficha;
      });
  };

  global.FI = FI;
})(window);
