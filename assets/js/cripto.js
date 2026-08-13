/* ============================================================
   cripto.js — cifrado del token de GitHub con una contraseña
   ------------------------------------------------------------
   Este sitio es estático y su código es público, así que una
   comprobación del tipo «¿la contraseña es X?» no protegería nada:
   se lee en el fuente y se salta desde la consola.

   Aquí la contraseña sí hace algo: es lo único que descifra el token
   de GitHub. Sin ella no se puede publicar, y en el navegador solo
   queda un blob cifrado en lugar del token en claro.

   Usa Web Crypto (PBKDF2-SHA256 + AES-GCM), que requiere un contexto
   seguro: funciona en https y en localhost.
   ============================================================ */
(function (global) {
  'use strict';

  var C = {};

  var ITERACIONES = 250000;   // coste de derivar la clave, contra fuerza bruta
  var BYTES_SAL = 16;
  var BYTES_IV = 12;

  C.disponible = function () {
    return !!(global.crypto && global.crypto.subtle && global.isSecureContext);
  };

  /* ---------- Conversiones ---------- */

  function aBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var binario = '';
    for (var i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i]);
    return btoa(binario);
  }

  function deBase64(texto) {
    var binario = atob(texto);
    var bytes = new Uint8Array(binario.length);
    for (var i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return bytes;
  }

  /* ---------- Derivación de clave ---------- */

  function derivarClave(contrasena, sal) {
    return global.crypto.subtle.importKey(
      'raw', new TextEncoder().encode(contrasena), 'PBKDF2', false, ['deriveKey']
    ).then(function (material) {
      return global.crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: sal, iterations: ITERACIONES, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    });
  }

  /* ---------- API ---------- */

  /** Cifra un texto con la contraseña. Devuelve {sal, iv, datos} en base64. */
  C.cifrar = function (texto, contrasena) {
    if (!C.disponible()) return Promise.reject(new Error('Este navegador no permite cifrar aquí.'));

    var sal = global.crypto.getRandomValues(new Uint8Array(BYTES_SAL));
    var iv = global.crypto.getRandomValues(new Uint8Array(BYTES_IV));

    return derivarClave(contrasena, sal).then(function (clave) {
      return global.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv }, clave, new TextEncoder().encode(texto)
      );
    }).then(function (cifrado) {
      return { sal: aBase64(sal), iv: aBase64(iv), datos: aBase64(cifrado) };
    });
  };

  /**
   * Descifra lo que devolvió cifrar(). Si la contraseña es incorrecta,
   * AES-GCM falla al comprobar la etiqueta de autenticación: no hay forma
   * de descifrar «a medias» ni de saber si vas bien sin acertarla entera.
   */
  C.descifrar = function (paquete, contrasena) {
    if (!C.disponible()) return Promise.reject(new Error('Este navegador no permite descifrar aquí.'));
    if (!paquete || !paquete.sal || !paquete.iv || !paquete.datos) {
      return Promise.reject(new Error('No hay nada cifrado guardado.'));
    }

    return derivarClave(contrasena, deBase64(paquete.sal)).then(function (clave) {
      return global.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: deBase64(paquete.iv) }, clave, deBase64(paquete.datos)
      );
    }).then(function (plano) {
      return new TextDecoder().decode(plano);
    }).catch(function () {
      throw new Error('Contraseña incorrecta.');
    });
  };

  global.C = C;
})(window);
