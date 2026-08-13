/* ============================================================
   mangadex.js — búsqueda de metadatos en la API pública de MangaDex
   ------------------------------------------------------------
   API gratuita y sin clave: https://api.mangadex.org/docs/
   Se usa solo para rellenar título, autor, portada, sinopsis y
   número de tomos al dar de alta una serie. Si falla, siempre
   se puede rellenar el formulario a mano.
   ============================================================ */
(function (global) {
  'use strict';

  var MD = {};
  var API = 'https://api.mangadex.org';
  var CDN = 'https://uploads.mangadex.org/covers';

  var ESTADO_MD = {
    ongoing: 'en-publicacion',
    completed: 'finalizada',
    hiatus: 'pausada',
    cancelled: 'cancelada'
  };

  /** Elige el primer idioma disponible de una lista, priorizando español. */
  function preferido(mapa, alternativos) {
    if (!mapa) return '';
    var orden = ['es-la', 'es', 'en', 'ja-ro', 'ja'];
    for (var i = 0; i < orden.length; i++) {
      if (mapa[orden[i]]) return mapa[orden[i]];
    }
    if (Array.isArray(alternativos)) {
      for (var j = 0; j < alternativos.length; j++) {
        for (var k = 0; k < orden.length; k++) {
          if (alternativos[j][orden[k]]) return alternativos[j][orden[k]];
        }
      }
    }
    var claves = Object.keys(mapa);
    return claves.length ? mapa[claves[0]] : '';
  }

  function relacion(manga, tipo) {
    return (manga.relationships || []).filter(function (r) { return r.type === tipo; })[0] || null;
  }

  /** Traduce la respuesta de MangaDex a nuestro modelo de serie. */
  MD.aSerie = function (manga) {
    var a = manga.attributes || {};
    var portadaRel = relacion(manga, 'cover_art');
    var autorRel = relacion(manga, 'author') || relacion(manga, 'artist');
    var nombreArchivo = portadaRel && portadaRel.attributes ? portadaRel.attributes.fileName : null;

    return {
      titulo: preferido(a.title, a.altTitles),
      tituloAlt: (a.altTitles || []).map(function (t) { return preferido(t); })[0] || '',
      autor: autorRel && autorRel.attributes ? autorRel.attributes.name : '',
      sinopsis: preferido(a.description),
      estado: ESTADO_MD[a.status] || 'en-publicacion',
      demografia: a.publicationDemographic || 'otro',
      tomosTotales: Number(a.lastVolume) || 0,
      portada: nombreArchivo ? CDN + '/' + manga.id + '/' + nombreArchivo + '.512.jpg' : '',
      portadaMini: nombreArchivo ? CDN + '/' + manga.id + '/' + nombreArchivo + '.256.jpg' : '',
      etiquetas: (a.tags || []).map(function (t) { return preferido(t.attributes.name); }).slice(0, 6),
      mangadexId: manga.id,
      anio: a.year || null
    };
  };

  /** Busca series por título. Devuelve una promesa con un array de series. */
  MD.buscar = function (texto) {
    var params = new URLSearchParams();
    params.set('title', texto);
    params.set('limit', '12');
    params.set('order[relevance]', 'desc');
    ['cover_art', 'author', 'artist'].forEach(function (v) { params.append('includes[]', v); });
    ['safe', 'suggestive', 'erotica'].forEach(function (v) { params.append('contentRating[]', v); });

    return fetch(API + '/manga?' + params.toString(), { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('MangaDex respondió ' + r.status);
        return r.json();
      })
      .then(function (json) {
        return (json.data || []).map(MD.aSerie);
      });
  };

  global.MD = MD;
})(window);
