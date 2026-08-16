#!/usr/bin/env python3
"""
Descarga la portada de cada serie desde la web de su editorial española.

ListadoManga solo publica imágenes de unos 106x150 px y no tiene versión mayor,
así que la rejilla de la biblioteca las amplía y se ven borrosas. Las editoriales
sí publican la portada de su propia edición mucho más grande.

Solo hace falta UNA imagen por serie: la rejilla enseña la portada de la serie,
no la de cada tomo. Las de los tomos se ven a 52 px dentro de la ficha, donde las
de ListadoManga ya sobran.

Fuentes, elegidas por lo que cuestan y lo que cubren:

  - Planeta Cómic: sus sitemaps de imágenes. Su robots.txt prohíbe el buscador,
    pero publica sitemaps precisamente para esto. Dos peticiones traen las 66.000
    entradas del catálogo, con título y portada original de 2000 px.
  - Ivrea: su página de catálogo, que lista las 482 series de una vez.
  - Norma: su índice de series, 6 páginas que traen nombre y portada. Ojo: esa
    portada es la del ÚLTIMO tomo publicado, así que de cada serie que haga falta
    se visita además su página, donde están todos los álbumes numerados y se
    puede coger el primero.
  - Panini: el sitemap de imágenes que anuncia su propio robots.txt —que en
    cambio prohíbe el buscador—. Una petición trae los 10.000 productos con su
    portada, así que no hay que visitar ninguna ficha.

Planeta y Panini van por sitemap, que es un estándar y no cambia de forma. Las
otras dos dependen del HTML de su web, así que si la rediseñan dejarían de
encontrar nada. Por eso, si una fuente devuelve cero series, el script termina
con error: más vale que la Action salga en rojo a seguir publicando portadas
viejas en silencio.

Una portada de manga siempre es más alta que ancha, y esa comprobación descarta
los «IMAGE COMING SOON» que algunas tiendas sirven con el nombre de archivo del
producto, indistinguibles por la URL.

Uso:
    python3 scripts/actualizar_portadas.py [--forzar] [--verbose] [--dry-run]

Pillow es opcional: si está, las imágenes se reducen a ANCHO px (una portada de
Planeta pasa de ~800 KB a ~40 KB). Si no está, se guardan tal cual y se avisa.
"""

import argparse
import difflib
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COLECCION = os.path.join(RAIZ, 'data', 'coleccion.json')
CALENDARIO = os.path.join(RAIZ, 'data', 'calendario.json')
SALIDA = os.path.join(RAIZ, 'data', 'portadas-editorial.json')
DIR_IMG = os.path.join(RAIZ, 'data', 'portadas-serie')

AGENTE = ('ColeccionMangas/1.0 (+https://github.com/Aitor1393/ColeccionMangas; '
          'uso personal, una ejecución semanal)')
PAUSA_PAGINA = 1.5     # entre peticiones a una web
PAUSA_IMAGEN = 0.4     # entre descargas de imagen (van a CDN)
TIEMPO_MAX = 120       # los sitemaps de Planeta pesan 20 MB y el de Panini 7
ANCHO = 400            # suficiente para la rejilla en pantallas retina

SITEMAPS_PLANETA = [
    'https://www.planetadelibros.com/sitemap/sitemap-imagenes-catalogo-libros-1.xml',
    'https://www.planetadelibros.com/sitemap/sitemap-imagenes-catalogo-libros-2.xml',
]
CATALOGO_IVREA = 'https://www.editorialivrea.com/ESP/catalogo/'
INDICE_NORMA = 'https://www.normaeditorial.com/catalogo/manga/series'
# Lo anuncia su propio robots.txt, que en cambio prohíbe el buscador.
SITEMAP_PANINI = 'https://www.panini.es/media/shp_esp_es/comics-imagenes-sitemap.xml'
PAGINAS_NORMA = 8      # ahora son 6; el margen evita quedarse corto si crecen


def log(msg):
    print(msg, flush=True)


def pedir(url, binario=False, reintentos=3):
    peticion = urllib.request.Request(url, headers={
        'User-Agent': AGENTE,
        'Accept-Encoding': 'gzip, deflate',
    })
    for intento in range(reintentos):
        try:
            with urllib.request.urlopen(peticion, timeout=TIEMPO_MAX) as r:
                datos = r.read()
                if r.headers.get('Content-Encoding') == 'gzip':
                    import gzip
                    datos = gzip.decompress(datos)
                return datos if binario else datos.decode('utf-8', 'replace')
        except Exception as e:
            if intento == reintentos - 1:
                raise
            time.sleep(2 * (intento + 1))


def normalizar(texto):
    """Para comparar títulos: sin acentos, sin signos y en minúsculas."""
    t = ''.join(c for c in unicodedata.normalize('NFD', str(texto).lower())
                if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', ' ', t).strip()


# Marcas de edición que no distinguen una edición de otra: el idioma, y el
# nombre de la editorial cuando lo usamos para desambiguar («Shaman King»
# edición «Ivrea»). No cambian la portada.
MARCAS_NEUTRAS = (
    'castellano', 'catala', 'catalan', 'espanol', 'es',
    'ivrea', 'planeta', 'planeta comic', 'norma', 'panini', 'distrito', 'ecc',
)


def claves_de(serie):
    """
    Cómo puede llamarse la serie en la web de la editorial, de más precisa a
    menos.

    La clave con edición va primero: Ivrea llama «Yu Yu Hakusho Edición
    Kanzenban» a lo que aquí es «Yu Yu Hakusho» + edición «Edición Kanzenban».

    Y cuando la edición dice algo de verdad —«Nueva Edición 3 en 1», «Legend»,
    «Kanzenban»— el título a secas NO vale como respaldo: en Planeta «One Piece»
    a secas es la edición normal, y traer esa portada para tu 3 en 1 sería poner
    la de otro libro. Solo se admite el respaldo cuando la edición se limita al
    idioma, que no cambia la imagen.
    """
    titulo = normalizar(serie.get('titulo', ''))
    edicion = serie.get('edicion') or ''
    # «Nueva Edición 3 en 1 · Castellano» → quitando el idioma queda algo; en
    # «Castellano» a secas no queda nada.
    resto = [p for p in re.split(r'[·,/]', edicion)
             if p.strip() and normalizar(p) not in MARCAS_NEUTRAS]

    claves = []
    if edicion:
        claves.append(normalizar(serie['titulo'] + ' ' + edicion))
        if resto:
            claves.append(normalizar(serie['titulo'] + ' ' + ' '.join(resto)))
    claves.append(titulo)
    # Las ediciones españolas cuelgan el subtítulo detrás de un punto —«Super
    # String. El viaje de Marco Polo al multiverso», «Magic: The Gathering.
    # Destruye a toda la humanidad»— y en el catálogo la serie se llama solo por
    # la primera parte. Va la última, cuando ya no ha casado nada mejor.
    corto = normalizar(serie.get('titulo', '').split('.')[0])
    if corto and corto != titulo and len(corto) >= 6:
        claves.append(corto)
    # el bool dice si esa clave es el título pelado, que necesita comprobación
    return [(c, c == titulo and bool(resto)) for c in dict.fromkeys(claves) if c]


def buscar(indice, serie, total_lm=None, umbral=0.88):
    """
    Busca la serie en el índice de una editorial, de la clave más precisa a la
    menos, y exacto antes que aproximado.

    Cuando solo casa el título pelado y la serie tiene una edición de verdad, se
    exige que cuadre el número de tomos. Sin esa comprobación, «One Piece» de tu
    3 en 1 (39 tomos) se llevaría la portada de la edición normal, que en el
    catálogo va sin total porque sigue abierta.
    """
    def valida(clave, entrada, generico):
        if not generico:
            return True
        total = entrada.get('total')
        if total and total_lm and total == total_lm:
            return True
        return False

    for pasada in ('exacto', 'aprox'):
        for clave, generico in claves_de(serie):
            if pasada == 'exacto':
                encontrada = clave if clave in indice else None
            else:
                cerca = difflib.get_close_matches(clave, list(indice), n=1, cutoff=umbral)
                encontrada = cerca[0] if cerca else None
            if not encontrada:
                continue
            entrada = indice[encontrada]
            if not valida(clave, entrada, generico):
                continue
            como = pasada if pasada == 'exacto' else 'aprox (%s)' % encontrada[:40]
            if generico:
                como += ' · %d tomos, cuadra' % entrada['total']
            return entrada['url'], como, entrada
    return None, None, None


# ---------------------------------------------------------------- Planeta

def indice_planeta():
    """{título normalizado: url de la portada del primer tomo}."""
    indice = {}
    for url in SITEMAPS_PLANETA:
        log('  · descargando %s' % url.rsplit('/', 1)[-1])
        xml = pedir(url)
        entradas = re.findall(
            r'image:loc><!\[CDATA\[([^\]]+)\]\].*?image:caption><!\[CDATA\[([^\]]*)\]\]',
            xml, re.S)
        for imagen, titulo in entradas:
            # «Frieren nº 01/13» → («Frieren», tomo 1, 13 en total)
            m = re.match(r'^(.*?)\s+n[ºo]\s*(\d+)\s*(?:/(\d+))?\s*$', titulo.strip(), re.I)
            if not m:
                continue
            clave, numero = normalizar(m.group(1)), int(m.group(2))
            total = int(m.group(3)) if m.group(3) else None
            # Nos quedamos con el tomo más bajo: es la portada que representa la
            # serie, y la misma que usa ListadoManga.
            previo = indice.get(clave)
            if previo is None or numero < previo['numero']:
                indice[clave] = {'numero': numero, 'url': imagen, 'total': total}
            elif total and not previo.get('total'):
                previo['total'] = total
        time.sleep(PAUSA_PAGINA)
    return indice


# ---------------------------------------------------------------- Ivrea

def indice_ivrea():
    """{título normalizado: url de la portada}."""
    log('  · descargando el catálogo de Ivrea')
    pagina = pedir(CATALOGO_IVREA)
    indice = {}
    for slug, titulo, resto in re.findall(
            r'href="https://www\.editorialivrea\.com/ESP/titulo/([^"/]+)/"\s+title="([^"]*)"(.{0,900}?)</a>',
            pagina, re.S):
        m = re.search(r'data-src="([^"]+\.jpg)"', resto)
        if not m:
            continue
        # El srcset da miniaturas; quitando el sufijo -175x238 sale la original.
        original = re.sub(r'-\d+x\d+(\.jpg)$', r'\1', m.group(1))
        # Ivrea no publica el total de tomos en el catálogo.
        indice.setdefault(normalizar(html.unescape(titulo)), {'url': original, 'total': None})
    return indice


# ---------------------------------------------------------------- Norma

def indice_norma():
    """{título normalizado: portada y número de álbumes}."""
    indice = {}
    for pagina in range(1, PAGINAS_NORMA + 1):
        url = INDICE_NORMA + ('' if pagina == 1 else '?p=%d' % pagina)
        log('  · índice de Norma, página %d' % pagina)
        s = pedir(url)
        # El menú desplegable repite enlaces a series; solo vale el listado.
        lista = s[s.find('<div id="list"'):] or s
        encontradas = 0
        # Primero se parte en tarjetas y luego se lee cada una por dentro. Con un
        # solo regex sobre la página entera, el «.*?» del medio se salta las
        # tarjetas que no encajan y empareja la imagen de una con el título de
        # otra: en la página 6 llegaba a perder dos de cada tres.
        for tarjeta in lista.split('<div class="item">')[1:]:
            img = re.search(r'data-src="(/upload/[^"]+)"', tarjeta)
            cap = re.search(r'<a href="(/catalogo/manga/[^"]+)" class="caption"><h2>(.*?)</h2>',
                            tarjeta, re.S)
            if not (img and cap):
                continue
            ruta, nombre = img.group(1), html.unescape(cap.group(2)).strip()
            # La miniatura del índice es «_medium» (326 px); «_big» da 650.
            grande = 'https://www.normaeditorial.com' + re.sub(r'_medium\.', '_big.', ruta)
            # OJO: esta es la portada del ÚLTIMO tomo publicado, que es lo que
            # enseña el índice. La del primero hay que ir a buscarla a la página
            # de la serie; esta queda como respaldo por si eso falla.
            # Sin total a propósito: Norma cuenta «álbumes», que incluye artbooks
            # y guías, así que no sirve para saber si es la misma edición. Sin
            # total, el título pelado nunca vale de respaldo, que es lo prudente.
            indice.setdefault(normalizar(nombre), {
                'url': grande, 'total': None,
                # La página de la serie llega de dos formas: «/manga/serie/x» y,
                # cuando pertenece a una franquicia, «/manga/akame-ga-kill/x».
                # Las dos valen; lo que no vale es la portada de la franquicia
                # («/manga/pokemon»), que no lleva álbumes.
                'serie': ('https://www.normaeditorial.com' + cap.group(1)
                          if len(cap.group(1).split('/catalogo/manga/')[-1].split('/')) >= 2
                          else None),
            })
            encontradas += 1
        if not encontradas:
            break          # se acabaron las páginas
        time.sleep(PAUSA_PAGINA)
    return indice


def portada_norma_tomo1(url_serie):
    """
    La portada del PRIMER tomo, desde la página de la serie.

    El índice de series de Norma enseña la portada del último publicado —de
    Frieren salía el 15—, y para representar una serie vale más la del primero,
    que además es la que usa ListadoManga.

    En la página de la serie están todos los álbumes con su nombre, así que basta
    con quedarse con el número más bajo. Se descartan las ediciones especiales,
    los fanbooks y los artbooks: llevan el nombre de la serie pero no son el
    tomo 1.

    Devuelve None si no se puede leer, y quien llama se queda con lo que tenía.
    """
    pagina = pedir(url_serie)
    mejor = None
    for imagen, _, titulo in re.findall(
            r'src="([^"]*thumb_\d+_albumes_\w+\.jpe?g)"(.*?)<h2>(.*?)</h2>', pagina, re.S):
        nombre = html.unescape(titulo).strip()
        if re.search(r'especial|fanbook|art\s*works|gu[ií]a|artbook', nombre, re.I):
            continue
        m = re.search(r'\b(\d{1,3})\s*$', nombre)
        if not m:
            continue
        numero = int(m.group(1))
        if mejor is None or numero < mejor[0]:
            mejor = (numero, imagen)
    if not mejor:
        return None
    ruta = re.sub(r'_medium\.', '_big.', mejor[1])
    return 'https://www.normaeditorial.com' + ruta if ruta.startswith('/') else ruta


# ---------------------------------------------------------------- Panini

# Panini antepone el nombre de la línea al de la obra —«Maximum Bleach»— y aquí
# la edición va detrás. Con estas marcas se registra también el orden de casa.
LINEAS_PANINI = ('maximum', 'ultimate', 'kanzenban', 'integral', 'deluxe',
                 'omnibus', 'definitive', 'definitiva')


def indice_panini():
    """
    {título normalizado: portada del primer tomo y cuántos tomos hay}.

    Su sitemap de imágenes trae los 10.000 productos con su portada en una sola
    petición, así que no hay que visitar ninguna ficha.

    Las series se agrupan por el SKU —«spbma001», «spbma002»…—, que es el código
    de producto de Panini: las mismas letras son la misma serie y los dígitos el
    número de tomo. Por el texto del slug no se puede, porque lo abrevian a su
    aire: «rurouni-kenshin-restauracion-1» y «rurouni-kenshin-rest-2» son la
    misma colección.
    """
    log('  · descargando el sitemap de cómics de Panini')
    xml = pedir(SITEMAP_PANINI)
    sku_re = re.compile(r'-([a-z]{3,6})(\d{3})[a-z]*-es\d+$', re.I)

    series = {}
    for bloque in xml.split('<url>')[1:]:
        loc = re.search(r'<loc>(.*?)</loc>', bloque)
        imagenes = re.findall(r'<image:loc>(.*?)</image:loc>', bloque)
        if not (loc and imagenes):
            continue
        slug = loc.group(1).rsplit('/', 1)[-1].replace('.html', '')
        m = sku_re.search(slug)
        if not m:
            continue
        # La portada limpia acaba en _0.jpg; las _0_1, _0_2… son contracubiertas
        # y páginas de muestra.
        imagen = next((i for i in imagenes if re.search(r'_0\.jpe?g$', i, re.I)), imagenes[0])
        sku, numero = m.group(1).lower(), int(m.group(2))
        # Del slug, quitando el SKU y el número de tomo del final, queda el título.
        titulo = re.sub(r'-\d+$', '', slug[:m.start()]).replace('-', ' ')
        previo = series.get(sku)
        if previo is None or numero < previo['numero']:
            series[sku] = {'numero': numero, 'url': imagen, 'titulo': titulo,
                           'total': max(numero, (previo or {}).get('total', 0))}
        else:
            previo['total'] = max(previo['total'], numero)

    indice = {}
    for datos in series.values():
        clave = normalizar(datos['titulo'])
        if not clave:
            continue
        entrada = {'url': datos['url'], 'total': datos['total']}
        indice.setdefault(clave, entrada)
        # «maximum bleach» también como «bleach maximum», que es como lo llamas tú.
        partes = clave.split()
        if len(partes) > 1 and partes[0] in LINEAS_PANINI:
            indice.setdefault(' '.join(partes[1:] + [partes[0]]), entrada)
    return indice


# ---------------------------------------------------------------- Imágenes

def es_portada(datos):
    """
    ¿Esto es una portada de verdad o el «IMAGE COMING SOON» de la tienda?

    Panini sirve un cuadrado blanco con ese cartel para lo que aún no tiene
    foto, y con el nombre de archivo del propio producto, así que por la URL no
    se distingue. Lo que sí se distingue es la forma: una portada de manga
    siempre es más alta que ancha, y el cartel es cuadrado.

    Sin Pillow no se puede mirar, y entonces se deja pasar: más vale una portada
    fea que ninguna.
    """
    try:
        from PIL import Image
    except ImportError:
        return True, ''
    import io
    img = Image.open(io.BytesIO(datos))
    if img.height < img.width * 1.2:
        return False, 'no es una portada (%dx%d, no es vertical)' % (img.width, img.height)
    return True, ''


def reducir(datos, ancho=ANCHO):
    """Reduce la imagen si Pillow está disponible; si no, la deja como está."""
    try:
        from PIL import Image
    except ImportError:
        return datos, False
    import io
    img = Image.open(io.BytesIO(datos))
    if img.width <= ancho:
        return datos, False
    alto = round(img.height * ancho / img.width)
    img = img.convert('RGB').resize((ancho, alto), Image.LANCZOS)
    salida = io.BytesIO()
    img.save(salida, 'JPEG', quality=86, optimize=True)
    return salida.getvalue(), True


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--forzar', action='store_true',
                   help='vuelve a descargar aunque ya haya portada guardada')
    p.add_argument('--verbose', action='store_true')
    p.add_argument('--dry-run', action='store_true', help='no escribe nada')
    args = p.parse_args()

    with open(COLECCION, encoding='utf-8') as f:
        coleccion = json.load(f)
    calendario = {}
    if os.path.exists(CALENDARIO):
        with open(CALENDARIO, encoding='utf-8') as f:
            calendario = json.load(f).get('colecciones', {})

    previo = {}
    if os.path.exists(SALIDA):
        with open(SALIDA, encoding='utf-8') as f:
            previo = json.load(f).get('portadas', {})

    def editorial_de(s):
        ficha = calendario.get(str(s.get('listadomangaId') or ''), {})
        return s.get('editorial') or ficha.get('editorial') or ''

    pendientes = {'Planeta': [], 'Ivrea': [], 'Norma': [], 'Panini': []}
    for s in coleccion.get('series', []):
        idlm = str(s.get('listadomangaId') or '')
        if not idlm:
            continue          # sin id no hay dónde guardarla de forma estable
        ed = editorial_de(s)
        cual = next((k for k in pendientes if k in ed), None)
        if not cual:
            continue
        ruta = os.path.join(DIR_IMG, idlm + '.jpg')
        if not args.forzar and idlm in previo and os.path.exists(ruta):
            continue          # ya la tenemos
        pendientes[cual].append(s)

    total = sum(len(v) for v in pendientes.values())
    if not total:
        log('Todas las portadas de editorial están al día.')
        return 0

    log('Portadas por descargar: ' +
        ' · '.join('%s %d' % (k, len(v)) for k, v in pendientes.items() if v))

    constructores = {'Planeta': indice_planeta, 'Ivrea': indice_ivrea,
                     'Norma': indice_norma, 'Panini': indice_panini}
    indices = {}
    fuentes_rotas = []
    for cual, series in pendientes.items():
        if not series:
            continue
        indices[cual] = constructores[cual]()
        log('  índice de %s: %d series' % (cual, len(indices[cual])))
        if not indices[cual]:
            # Si la web cambia de estructura no encontraremos nada, y callarlo
            # dejaría las portadas viejas para siempre sin que se note.
            fuentes_rotas.append(cual)

    if not args.dry_run:
        os.makedirs(DIR_IMG, exist_ok=True)

    portadas = dict(previo)
    bajadas = fallos = 0
    avisado_pillow = False

    for cual, series in pendientes.items():
        for s in series:
            idlm = str(s['listadomangaId'])
            ficha = calendario.get(idlm, {})
            url, como, entrada = buscar(indices[cual], s, ficha.get('totalNumeros'))
            if url and cual == 'Norma' and entrada.get('serie'):
                # El índice trae la portada del último tomo; la del primero está
                # en la página de la serie, a una petición de distancia.
                try:
                    primera = portada_norma_tomo1(entrada['serie'])
                    if primera:
                        url, como = primera, como + ' · tomo 1'
                    elif args.verbose:
                        log('  ! %-38s no se ve el tomo 1, va el último' % s['titulo'][:38])
                except Exception as e:
                    log('  ! %-38s error leyendo la serie: %s' % (s['titulo'][:38], str(e)[:40]))
                time.sleep(PAUSA_PAGINA)
            if not url:
                if args.verbose:
                    log('  ✗ %-40s no está en el catálogo de %s' % (s['titulo'][:40], cual))
                fallos += 1
                continue
            try:
                datos = pedir(url, binario=True)
                if not datos.startswith(b'\xff\xd8'):
                    raise ValueError('no es un JPEG')
                vale, motivo = es_portada(datos)
                if not vale:
                    raise ValueError(motivo)
                datos, reducida = reducir(datos)
                if not reducida and not avisado_pillow:
                    try:
                        import PIL  # noqa: F401
                    except ImportError:
                        log('  ! Pillow no está instalado: las imágenes se guardan sin reducir')
                        avisado_pillow = True
                ruta_rel = 'data/portadas-serie/%s.jpg' % idlm
                if not args.dry_run:
                    with open(os.path.join(RAIZ, ruta_rel), 'wb') as f:
                        f.write(datos)
                portadas[idlm] = {
                    'ruta': ruta_rel,
                    'fuente': cual,
                    'origen': url,
                    'bytes': len(datos),
                }
                bajadas += 1
                if args.verbose:
                    log('  ✓ %-40s %s · %d KB · %s' %
                        (s['titulo'][:40], cual, len(datos) // 1024, como))
            except Exception as e:
                fallos += 1
                log('  ✗ %-40s error: %s' % (s['titulo'][:40], str(e)[:50]))
            time.sleep(PAUSA_IMAGEN)

    log('\nDescargadas %d · sin encontrar %d' % (bajadas, fallos))
    if fuentes_rotas:
        log('\n¡AVISO! Estas fuentes no han devuelto ninguna serie: %s.\n'
            'Lo normal es que hayan rediseñado su web y haya que revisar el script.'
            % ', '.join(fuentes_rotas))

    if args.dry_run:
        log('(--dry-run: no se ha escrito nada)')
        return 0

    with open(SALIDA, 'w', encoding='utf-8') as f:
        json.dump({
            'actualizado': time.strftime('%Y-%m-%d'),
            'nota': 'Portadas de serie tomadas de la web de cada editorial. '
                    'ListadoManga solo las tiene a 106x150.',
            'portadas': portadas,
        }, f, ensure_ascii=False, indent=1)
        f.write('\n')
    log('Escrito %s con %d portadas' % (os.path.relpath(SALIDA, RAIZ), len(portadas)))
    return 1 if fuentes_rotas else 0


if __name__ == '__main__':
    sys.exit(main())
