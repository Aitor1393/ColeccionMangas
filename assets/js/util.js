/* ============================================================
   util.js — utilidades comunes (sin dependencias)
   ============================================================ */
(function (global) {
  'use strict';

  var U = {};

  /* ---------- Texto ---------- */

  /** Escapa HTML para poder interpolar texto de usuario/API sin riesgo. */
  U.esc = function (valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  /** Normaliza para búsquedas: minúsculas y sin acentos. */
  U.normalizar = function (texto) {
    return String(texto || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  };

  U.plural = function (n, singular, plural) {
    return n + ' ' + (n === 1 ? singular : (plural || singular + 's'));
  };

  /* ---------- Identificadores ---------- */

  U.id = function () {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  };

  /* ---------- Fechas ---------- */

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  /** "2026-09-15" -> Date local (evita el desfase de zona horaria de new Date(str)). */
  U.aFecha = function (iso) {
    if (!iso) return null;
    var p = String(iso).slice(0, 10).split('-');
    if (p.length !== 3) return null;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return isNaN(d.getTime()) ? null : d;
  };

  U.hoy = function () {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };

  U.isoHoy = function () {
    var d = new Date();
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate());
  };

  U.pad = function (n) { return (n < 10 ? '0' : '') + n; };

  /** "15 de septiembre de 2026" */
  U.fechaLarga = function (iso) {
    var d = U.aFecha(iso);
    if (!d) return '—';
    return d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear();
  };

  /** "15 sep 2026" */
  U.fechaCorta = function (iso) {
    var d = U.aFecha(iso);
    if (!d) return '—';
    return d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear();
  };

  /** "septiembre 2026" — clave para agrupar por mes. */
  U.mesLargo = function (iso) {
    var d = U.aFecha(iso);
    if (!d) return 'Sin fecha';
    return MESES[d.getMonth()].charAt(0).toUpperCase() + MESES[d.getMonth()].slice(1) + ' ' + d.getFullYear();
  };

  /** Días desde hoy: negativo = pasado. */
  U.diasHasta = function (iso) {
    var d = U.aFecha(iso);
    if (!d) return null;
    return Math.round((d - U.hoy()) / 86400000);
  };

  /** "en 12 días" / "mañana" / "hace 3 días" */
  U.cuando = function (iso) {
    var dias = U.diasHasta(iso);
    if (dias === null) return 'sin fecha';
    if (dias === 0) return 'hoy';
    if (dias === 1) return 'mañana';
    if (dias === -1) return 'ayer';
    if (dias > 1) return 'en ' + dias + ' días';
    return 'hace ' + Math.abs(dias) + ' días';
  };

  /* ---------- Números ---------- */

  U.euros = function (n) {
    var num = Number(n) || 0;
    return num.toFixed(2).replace('.', ',') + ' €';
  };

  U.porcentaje = function (parte, total) {
    if (!total) return 0;
    return Math.round((parte / total) * 100);
  };

  /* ---------- DOM ---------- */

  U.$ = function (sel, raiz) { return (raiz || document).querySelector(sel); };
  U.$$ = function (sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); };

  /** Notificación efímera en la esquina. tipo: 'ok' | 'error' | '' */
  U.aviso = function (mensaje, tipo) {
    var cont = document.getElementById('notificaciones');
    if (!cont) return;
    var nodo = document.createElement('div');
    nodo.className = 'nota' + (tipo ? ' nota--' + tipo : '');
    nodo.textContent = mensaje;
    cont.appendChild(nodo);
    setTimeout(function () {
      nodo.style.transition = 'opacity .3s';
      nodo.style.opacity = '0';
      setTimeout(function () { nodo.remove(); }, 300);
    }, 3600);
  };

  /* ---------- Modal ---------- */

  U.abrirModal = function (html) {
    var modal = document.getElementById('modal');
    document.getElementById('modalContenido').innerHTML = html;
    modal.classList.remove('oculto');
    document.body.style.overflow = 'hidden';
    return modal;
  };

  U.cerrarModal = function () {
    document.getElementById('modal').classList.add('oculto');
    document.getElementById('modalContenido').innerHTML = '';
    document.body.style.overflow = '';
  };

  U.modalAbierto = function () {
    return !document.getElementById('modal').classList.contains('oculto');
  };

  /* ---------- Almacenamiento local (tolerante a fallos) ---------- */

  U.guardarLocal = function (clave, valor) {
    try {
      localStorage.setItem(clave, JSON.stringify(valor));
      return true;
    } catch (e) {
      console.warn('No se pudo guardar en localStorage:', e);
      return false;
    }
  };

  U.leerLocal = function (clave, porDefecto) {
    try {
      var bruto = localStorage.getItem(clave);
      return bruto === null ? porDefecto : JSON.parse(bruto);
    } catch (e) {
      return porDefecto;
    }
  };

  U.borrarLocal = function (clave) {
    try { localStorage.removeItem(clave); } catch (e) { /* ignorado */ }
  };

  /* ---------- Descargas ---------- */

  U.descargarJSON = function (nombre, datos) {
    var blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  U.debounce = function (fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 300);
    };
  };

  global.U = U;
})(window);
