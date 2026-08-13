#!/usr/bin/env python3
"""
Genera data/listadomanga-indice.json: el catálogo completo de colecciones
de ListadoManga (id + nombre), para poder elegir la edición desde la web.

Una misma obra tiene varias ediciones españolas —Bleach está en Panini,
EDT/Glénat, Maximum, Bestseller, y en castellano y català— y cada una es
una colección distinta con sus propias fechas y precios. Con este índice
descargado, el selector de la web busca sin salir a Internet, que es lo
único que permite hacer GitHub Pages (ListadoManga no envía CORS).

Uso:
    python3 scripts/actualizar_indice.py [--dry-run]

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
import urllib.request

BASE = 'https://www.listadomanga.es'
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, 'data', 'listadomanga-indice.json')

AGENTE = ('ColeccionMangas/1.0 (+https://github.com/Aitor1393/ColeccionMangas; '
          'uso personal, una ejecución semanal)')
PAUSA = 1.5
TIEMPO_MAX = 45

# lista.php sin parámetros trae el grueso (manga en castellano); el resto de
# secciones —català, manhwa, manhua, novelas, guías…— van por ?genero=N.
GENEROS = [None] + list(range(2, 16))


def log(mensaje):
    print(mensaje, flush=True)


def descargar(url):
    peticion = urllib.request.Request(url, headers={
        'User-Agent': AGENTE,
        'Accept-Language': 'es-ES,es;q=0.9',
    })
    with urllib.request.urlopen(peticion, timeout=TIEMPO_MAX) as respuesta:
        return respuesta.read().decode('utf-8', errors='replace')


def limpiar(nombre):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', nombre))).strip()


def main():
    parser = argparse.ArgumentParser(description='Descarga el catálogo de ListadoManga.')
    parser.add_argument('--dry-run', action='store_true', help='no escribe el fichero')
    args = parser.parse_args()

    colecciones = {}
    fallos = 0

    for genero in GENEROS:
        url = BASE + '/lista.php' + ('' if genero is None else '?genero=%d' % genero)
        try:
            pagina = descargar(url)
        except (urllib.error.URLError, OSError) as e:
            log('  genero=%-4s ERROR: %s' % (genero, e))
            fallos += 1
            time.sleep(PAUSA)
            continue

        encontrados = re.findall(r'<a href="coleccion\.php\?id=(\d+)">(.*?)</a>', pagina, re.S)
        nuevos = 0
        for idlm, nombre in encontrados:
            if idlm not in colecciones:
                colecciones[idlm] = limpiar(nombre)
                nuevos += 1
        log('  genero=%-4s %5d entradas, %5d nuevas' % (genero, len(encontrados), nuevos))
        time.sleep(PAUSA)

    if not colecciones:
        log('No se pudo descargar nada: se deja el índice anterior como está.')
        return 1

    salida = {
        'actualizado': time.strftime('%Y-%m-%d'),
        'fuente': BASE + '/lista.php',
        # Formato compacto [id, nombre]: 6.600 entradas ocupan bastante menos
        # que un objeto con claves repetidas.
        'colecciones': [[k, v] for k, v in sorted(colecciones.items(), key=lambda x: int(x[0]))],
    }

    if args.dry_run:
        log('\n--dry-run: %d colecciones, no se escribe nada.' % len(colecciones))
        return 0

    with open(SALIDA, 'w', encoding='utf-8') as f:
        json.dump(salida, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')

    tam = os.path.getsize(SALIDA) / 1024.0
    log('\nEscrito %s: %d colecciones, %.0f KB, %d fallos.'
        % (os.path.relpath(SALIDA, RAIZ), len(colecciones), tam, fallos))
    return 0


if __name__ == '__main__':
    sys.exit(main())
