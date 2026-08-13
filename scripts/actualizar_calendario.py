#!/usr/bin/env python3
"""
Actualiza data/calendario.json con las fechas de publicación de ListadoManga.

ListadoManga (https://www.listadomanga.es/) es la referencia para las ediciones
españolas, pero no ofrece API pública ni cabeceras CORS, así que el navegador no
puede consultarlo desde GitHub Pages. Este script se ejecuta desde una GitHub
Action programada: descarga la ficha de cada serie que tenga "listadomangaId",
extrae los números con su fecha y precio, y deja el resultado en un JSON que la
web sí puede leer.

Uso:
    python3 scripts/actualizar_calendario.py [--dry-run] [--limite N] [--verbose]

Sin dependencias externas: solo biblioteca estándar.
"""

import argparse
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = 'https://www.listadomanga.es'
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COLECCION = os.path.join(RAIZ, 'data', 'coleccion.json')
SALIDA = os.path.join(RAIZ, 'data', 'calendario.json')

# Identificarse y no machacar el servidor: es un sitio pequeño mantenido por aficionados.
AGENTE = ('ColeccionMangas/1.0 (+https://github.com/Aitor1393/ColeccionMangas; '
          'uso personal, una ejecución semanal)')
PAUSA = 1.5          # segundos entre peticiones
TIEMPO_MAX = 30      # timeout por petición
REINTENTOS = 3


def log(mensaje):
    print(mensaje, flush=True)


def descargar(url, intentos=REINTENTOS):
    """Descarga una URL con reintentos y espera creciente."""
    peticion = urllib.request.Request(url, headers={
        'User-Agent': AGENTE,
        'Accept-Language': 'es-ES,es;q=0.9',
    })
    ultimo_error = None
    for intento in range(1, intentos + 1):
        try:
            with urllib.request.urlopen(peticion, timeout=TIEMPO_MAX) as respuesta:
                return respuesta.read().decode('utf-8', errors='replace')
        except (urllib.error.URLError, urllib.error.HTTPError, OSError) as e:
            ultimo_error = e
            if intento < intentos:
                espera = PAUSA * (2 ** intento)
                log('    reintento %d/%d en %.0fs (%s)' % (intento, intentos - 1, espera, e))
                time.sleep(espera)
    raise RuntimeError('no se pudo descargar %s: %s' % (url, ultimo_error))


def extraer_numeros(pagina):
    """
    Devuelve [{numero, fecha, precio, aproximada}] a partir de una ficha de colección.

    Cada número aparece en un bloque como:
        <td class="cen"><img class="portada" alt="Centuria nº7"/>…
        9,00 €<br/>4 <a href="novedades.php?mes=6&ano=2026">Junio 2026</a></td>

    El número se busca en el texto del bloque, no en el alt de la imagen: cuando
    la portada está censurada el alt es «Portada censurada» y no lleva el número.

    La ficha repite números en la sección de portadas alternativas, así que nos
    quedamos con la primera aparición que traiga fecha.
    """
    porNumero = {}
    for bruto in re.findall(r'(?is)<td class="cen">(.*?)</td>', pagina):
        bloque = html.unescape(bruto)
        texto = re.sub(r'<[^>]+>', ' ', bloque)

        coincidencia = re.search(r'nº\s*(\d+)', texto)
        if not coincidencia:
            continue
        numero = int(coincidencia.group(1))

        precio = re.search(r'(\d+,\d{2})\s*€', bloque)
        fecha_enlace = re.search(
            r'(?:(\d{1,2})\s*)?<a href="novedades\.php\?mes=(\d+)&(?:amp;)?ano=(\d+)"', bloque)

        fecha, aproximada = None, False
        if fecha_enlace:
            dia, mes, anio = fecha_enlace.group(1), int(fecha_enlace.group(2)), int(fecha_enlace.group(3))
            if dia:
                fecha = '%04d-%02d-%02d' % (anio, mes, int(dia))
            else:
                # Solo mes: se ancla al día 1 y se marca como aproximada.
                fecha = '%04d-%02d-01' % (anio, mes)
                aproximada = True

        registro = {'numero': numero, 'fecha': fecha,
                    'precio': float(precio.group(1).replace(',', '.')) if precio else None,
                    'aproximada': aproximada}

        previo = porNumero.get(numero)
        if previo is None or (previo['fecha'] is None and fecha is not None):
            porNumero[numero] = registro

    return sorted(porNumero.values(), key=lambda v: v['numero'])


ESTADOS = {'abierta': 'en-publicacion', 'completa': 'finalizada',
           'cancelada': 'cancelada', 'suspendida': 'pausada'}


def metadatos(pagina):
    """
    Datos de cabecera de la ficha, que van como <b>Etiqueta:</b> valor<br/>:
    editorial española, formato, autor y número de tomos en castellano.
    """
    cabecera = pagina.split('Números editados')[0].split('N&uacute;meros editados')[0]
    campos = {}
    for etiqueta, valor in re.findall(r'(?is)<b>(.*?):</b>(.*?)(?:<br\s*/?>|</td>)', cabecera):
        clave = html.unescape(re.sub(r'<[^>]+>', '', etiqueta)).strip().lower()
        texto = html.unescape(re.sub(r'<[^>]+>', ' ', valor))
        campos[clave] = re.sub(r'\s+', ' ', texto).strip()

    numeros_es = campos.get('números en castellano', '') or campos.get('números en catalán', '')
    total = re.search(r'(\d+)', numeros_es)
    estado = None
    for palabra, valor in ESTADOS.items():
        if palabra in numeros_es.lower():
            estado = valor
            break

    return {
        'editorial': campos.get('editorial española', ''),
        'formato': campos.get('formato', ''),
        'autor': campos.get('guion', '') or campos.get('dibujo', ''),
        'totalNumeros': int(total.group(1)) if total else 0,
        'estado': estado or '',
    }


def titulo_de(pagina):
    coincidencia = re.search(r'<title>([^<]+)</title>', pagina)
    if not coincidencia:
        return ''
    return html.unescape(coincidencia.group(1)).split('·')[-1].strip()


def buscar(texto):
    """Busca colecciones por título. Devuelve [{id, nombre}] (endpoint JSON del sitio)."""
    url = BASE + '/buscar.php?b=' + urllib.parse.quote(texto)
    try:
        datos = json.loads(descargar(url, intentos=2))
    except (ValueError, RuntimeError) as e:
        log('    no se pudo buscar «%s»: %s' % (texto, e))
        return []
    return [{'id': c['id'], 'nombre': c['nombre']} for c in datos.get('colecciones', [])][:5]


def cargar_json(ruta, por_defecto):
    try:
        with open(ruta, encoding='utf-8') as f:
            return json.load(f)
    except (IOError, ValueError):
        return por_defecto


def main():
    parser = argparse.ArgumentParser(description='Actualiza las fechas desde ListadoManga.')
    parser.add_argument('--dry-run', action='store_true', help='no escribe el fichero de salida')
    parser.add_argument('--limite', type=int, default=0, help='procesa como mucho N series')
    parser.add_argument('--verbose', action='store_true', help='muestra cada número encontrado')
    args = parser.parse_args()

    coleccion = cargar_json(COLECCION, {'series': []})
    series = coleccion.get('series', [])
    if not series:
        log('La colección está vacía: nada que actualizar.')
        return 0

    previo = cargar_json(SALIDA, {})
    colecciones = {}
    sugerencias = {}
    fallos = 0

    conId = [s for s in series if s.get('listadomangaId')]
    sinId = [s for s in series if not s.get('listadomangaId')]
    if args.limite:
        conId, sinId = conId[:args.limite], sinId[:args.limite]

    log('%d series con ID de ListadoManga, %d sin ID.' % (len(conId), len(sinId)))

    # 1) Series enlazadas: descargamos su ficha y sacamos las fechas.
    for serie in conId:
        idlm = str(serie['listadomangaId'])
        url = '%s/coleccion.php?id=%s' % (BASE, idlm)
        log('· %s (id %s)' % (serie.get('titulo', '?'), idlm))
        try:
            pagina = descargar(url)
        except RuntimeError as e:
            log('    ERROR: %s' % e)
            fallos += 1
            # Conservamos lo que ya teníamos para no perder fechas por un fallo puntual.
            anterior = previo.get('colecciones', {}).get(idlm)
            if anterior:
                colecciones[idlm] = anterior
                log('    se conservan los datos de la ejecución anterior')
            time.sleep(PAUSA)
            continue

        numeros = extraer_numeros(pagina)
        conFecha = [n for n in numeros if n['fecha']]
        ficha = {'titulo': titulo_de(pagina), 'url': url, 'numeros': numeros}
        ficha.update(metadatos(pagina))
        colecciones[idlm] = ficha
        log('    %d números (%d con fecha) · %s · %s' % (
            len(numeros), len(conFecha), ficha['editorial'] or 'editorial ?',
            ('%d tomos' % ficha['totalNumeros']) if ficha['totalNumeros'] else 'total ?'))
        if args.verbose:
            for n in numeros:
                log('      nº%-4d %-12s %s' % (n['numero'], n['fecha'] or '—',
                                               ('%.2f €' % n['precio']) if n['precio'] else ''))
        time.sleep(PAUSA)

    # 2) Series sin enlazar: proponemos candidatos para que sea fácil rellenar el ID.
    for serie in sinId:
        titulo = serie.get('titulo', '').strip()
        if not titulo:
            continue
        candidatos = buscar(titulo)
        if candidatos:
            sugerencias[serie['id']] = candidatos
            log('· %s → sugerencias: %s' % (titulo, ', '.join(
                '%s (id %s)' % (c['nombre'], c['id']) for c in candidatos)))
        time.sleep(PAUSA)

    salida = {
        'actualizado': time.strftime('%Y-%m-%d'),
        'fuente': BASE + '/',
        'colecciones': colecciones,
        'sugerencias': sugerencias,
    }

    if args.dry_run:
        log('\n--dry-run: no se escribe nada. Resumen:')
        log(json.dumps({k: len(v) for k, v in
                        [('colecciones', colecciones), ('sugerencias', sugerencias)]}, indent=2))
        return 1 if fallos and not colecciones else 0

    with open(SALIDA, 'w', encoding='utf-8') as f:
        json.dump(salida, f, ensure_ascii=False, indent=2)
        f.write('\n')
    log('\nEscrito %s (%d colecciones, %d sugerencias, %d fallos).'
        % (os.path.relpath(SALIDA, RAIZ), len(colecciones), len(sugerencias), fallos))

    # Solo es un error si no se pudo traer absolutamente nada.
    return 1 if fallos and not colecciones else 0


if __name__ == '__main__':
    sys.exit(main())
