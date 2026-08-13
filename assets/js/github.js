/* ============================================================
   github.js — publicar la colección directamente en el repo
   ------------------------------------------------------------
   Opcional. Si configuras un token, el botón "Publicar" escribe
   data/coleccion.json en GitHub mediante la API de contenidos y
   GitHub Pages se regenera solo.

   El token se guarda ÚNICAMENTE en el localStorage de tu navegador y
   CIFRADO con una contraseña (ver cripto.js); nunca se sube al repo.
   Usa un token de acceso personal de grano fino, limitado a este
   repositorio y con el permiso "Contents: Read and write" y nada más.
   ============================================================ */
(function (global) {
  'use strict';

  var GH = {};
  var CLAVE = 'cm:github';
  var API = 'https://api.github.com';

  // El token descifrado vive solo aquí, en memoria, mientras la pestaña esté
  // abierta. Al recargar hay que volver a introducir la contraseña.
  var tokenEnMemoria = '';

  GH.config = function () {
    var c = U.leerLocal(CLAVE, null) || {};
    return {
      owner: c.owner || 'Aitor1393',
      repo: c.repo || 'ColeccionMangas',
      rama: c.rama || 'main',
      ruta: c.ruta || D.RUTA_JSON,
      cifrado: c.cifrado || null
    };
  };

  /** Guarda el repositorio y el token cifrado con la contraseña. */
  GH.guardarConfig = function (cfg, token, contrasena) {
    return C.cifrar(token, contrasena).then(function (paquete) {
      U.guardarLocal(CLAVE, {
        owner: cfg.owner, repo: cfg.repo, rama: cfg.rama, ruta: cfg.ruta,
        cifrado: paquete
      });
      tokenEnMemoria = token;
      return true;
    });
  };

  /** Guarda solo los datos del repositorio, sin tocar el token. */
  GH.guardarRepo = function (cfg) {
    var actual = U.leerLocal(CLAVE, null) || {};
    actual.owner = cfg.owner;
    actual.repo = cfg.repo;
    actual.rama = cfg.rama;
    actual.ruta = cfg.ruta;
    U.guardarLocal(CLAVE, actual);
  };

  GH.olvidar = function () {
    U.borrarLocal(CLAVE);
    tokenEnMemoria = '';
  };

  /** Hay un token guardado (aunque esté bloqueado). */
  GH.configurado = function () { return !!GH.config().cifrado; };

  /** Hay token pero aún no se ha introducido la contraseña en esta sesión. */
  GH.bloqueado = function () { return GH.configurado() && !tokenEnMemoria; };

  /** Descifra el token con la contraseña y lo deja listo para publicar. */
  GH.desbloquear = function (contrasena) {
    return C.descifrar(GH.config().cifrado, contrasena).then(function (token) {
      tokenEnMemoria = token;
      return true;
    });
  };

  /** Olvida el token descifrado sin borrar lo guardado. */
  GH.bloquear = function () { tokenEnMemoria = ''; };

  function cabeceras() {
    return {
      Authorization: 'Bearer ' + tokenEnMemoria,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  function urlContenido(cfg) {
    return API + '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) +
      '/contents/' + cfg.ruta.split('/').map(encodeURIComponent).join('/');
  }

  /** Base64 de una cadena UTF-8 (btoa solo admite latin1). */
  function aBase64(texto) {
    var bytes = new TextEncoder().encode(texto);
    var binario = '';
    for (var i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i]);
    return btoa(binario);
  }

  function errorDe(respuesta, json) {
    if (respuesta.status === 401) return 'Token inválido o caducado.';
    if (respuesta.status === 403) return 'El token no tiene permiso de escritura sobre el repositorio.';
    if (respuesta.status === 404) return 'No se encuentra el repositorio o la rama (revisa usuario/repo/rama y los permisos del token).';
    if (respuesta.status === 409) return 'El fichero ha cambiado en GitHub mientras editabas. Recarga la página y vuelve a intentarlo.';
    return (json && json.message) || ('Error HTTP ' + respuesta.status);
  }

  /** Comprueba que el token funciona y puede ver el repositorio. */
  GH.probar = function () {
    var cfg = GH.config();
    if (!tokenEnMemoria) return Promise.reject(new Error('Introduce la contraseña primero.'));
    return fetch(API + '/repos/' + cfg.owner + '/' + cfg.repo, { headers: cabeceras() })
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error(errorDe(r, j));
          if (j.permissions && !j.permissions.push) throw new Error('El token puede leer pero no escribir en el repositorio.');
          return j.full_name;
        });
      });
  };

  /** Lee el SHA actual del fichero (necesario para sobrescribirlo). */
  function shaActual(cfg) {
    return fetch(urlContenido(cfg) + '?ref=' + encodeURIComponent(cfg.rama), { headers: cabeceras() })
      .then(function (r) {
        if (r.status === 404) return null;   // primera publicación
        return r.json().then(function (j) {
          if (!r.ok) throw new Error(errorDe(r, j));
          return j.sha;
        });
      });
  }

  /** Publica la colección en el repositorio. Devuelve la URL del commit. */
  GH.publicar = function (coleccion, mensaje) {
    var cfg = GH.config();
    if (!tokenEnMemoria) {
      return Promise.reject(new Error('Hace falta la contraseña para publicar.'));
    }

    var contenido = aBase64(JSON.stringify(coleccion, null, 2) + '\n');

    return shaActual(cfg).then(function (sha) {
      var cuerpo = {
        message: mensaje || 'Actualizar colección de mangas',
        content: contenido,
        branch: cfg.rama
      };
      if (sha) cuerpo.sha = sha;

      return fetch(urlContenido(cfg), {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, cabeceras()),
        body: JSON.stringify(cuerpo)
      }).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error(errorDe(r, j));
          return j.commit && j.commit.html_url;
        });
      });
    });
  };

  global.GH = GH;
})(window);
