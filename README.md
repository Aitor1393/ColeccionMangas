# 📚 Mi Colección de Mangas

Web personal, al estilo de Whakoom, para llevar el control de:

- **qué mangas tengo** y qué tomos concretos de cada serie,
- **qué está pendiente de leer**,
- **cuándo salen los próximos tomos**.

Es un sitio **estático**: HTML, CSS y JavaScript sin dependencias ni compilación.
Se publica gratis en GitHub Pages y **cualquiera puede consultarlo desde cualquier
dispositivo** con solo abrir la URL.

---

## Cómo funciona

La colección vive en un único fichero: **`data/coleccion.json`**, versionado en el repo.

| | |
|---|---|
| **Quien visita la web** | Ve siempre lo que hay publicado en `data/coleccion.json`. |
| **Cuando tú editas** | Los cambios se guardan primero en el navegador (`localStorage`). Aparece un aviso naranja: *«Tienes N cambios sin publicar»*. |
| **Cuando publicas** | El JSON se escribe en el repositorio y GitHub Pages regenera la web en un minuto. A partir de ahí lo ve todo el mundo. |

Así, un visitante que trastee con los botones solo altera su propia copia local:
no puede tocar tu colección.

---

## Puesta en marcha

### 1. Activar GitHub Pages

En el repositorio: **Settings → Pages → Build and deployment → Source: _GitHub Actions_**.

El workflow `.github/workflows/pages.yml` valida el JSON y despliega en cada push a `main`.
La web queda en:

```
https://aitor1393.github.io/ColeccionMangas/
```

### 2. Vaciar los datos de ejemplo

`data/coleccion.json` trae tres series de muestra (Berserk, Monster, Chainsaw Man).
Bórralas desde la web o deja el fichero así:

```json
{ "version": 1, "actualizado": null, "series": [] }
```

### 3. Publicar tus cambios

Dos maneras, elige la que te resulte cómoda:

**a) Descargar y subir** (sin configurar nada)
Ajustes → *Descargar JSON* → sustituye `data/coleccion.json` en el repo y haz commit.

**b) Publicar con un clic** (recomendado si vas a editar a menudo, sobre todo desde el móvil)
Ajustes → *Guardar directamente en GitHub* → pega un token y listo. A partir de ahí,
el botón **Publicar** escribe el JSON en el repositorio por ti.

Para el token: GitHub → *Settings* → *Developer settings* → *Personal access tokens* →
**Fine-grained tokens** → *Generate new token*, con:

- **Repository access**: solo `ColeccionMangas`
- **Permissions → Repository permissions → Contents**: `Read and write`

Nada más. El token se guarda **solo en el `localStorage` de tu navegador**, nunca en el repo.
Si usas un ordenador compartido, usa la opción *Olvidar token* al terminar.

---

## Qué puedes hacer en la web

- **Resumen** — cuántas series y tomos tienes, cuánto has invertido, qué te queda por
  leer, qué sale este mes y qué series tienes a medias.
- **Biblioteca** — todas tus series con portada y progreso. Filtros por texto (título,
  autor, editorial, etiqueta), estado, demografía y editorial, con varios criterios de orden.
- **Pendientes** — todos los tomos que tienes en casa y no has leído, agrupados por serie.
- **Próximas** — calendario de salidas agrupado por mes (con precio cuando se conoce),
  más un apartado de *«ya está a la venta y aún no lo tienes»*.
- **Detalle de serie** — cuadrícula de tomos donde cada clic cicla el estado:

  > no lo tengo → **lo tengo** → **leído** → no lo tengo

  Además: huecos de la colección, gasto acumulado, fechas de salida y notas.
- **Añadir serie** — eliges tu edición española y se rellenan solos portada, autor,
  sinopsis, editorial, número de tomos, estado, fechas y precios. También puedes
  escribirlo todo a mano.
- **Modo claro y oscuro**, y diseño adaptado a móvil.

### Fechas de publicación: automáticas desde ListadoManga

Las fechas vienen de dos sitios y se mezclan en la vista *Próximas*:

1. **ListadoManga**, automáticamente, para las series que enlaces.
2. **A mano**, desde el detalle de la serie → *+ Fecha de salida*. Lo que apuntas tú
   tiene prioridad sobre lo que diga ListadoManga para ese mismo tomo.

En ambos casos, los tomos que ya tienes no aparecen: al marcar *«Ya lo tengo»*, la fecha
desaparece del calendario y el tomo pasa a tu colección (con su precio, si se conoce).

#### Elegir la edición

Un mismo manga tiene varias ediciones españolas y **cada una es una colección distinta**,
con sus propios tomos, fechas y precios. Bleach, por ejemplo, tiene siete:

```
Bleach (Bestseller)                Bleach (Panini) (Castellano)
Bleach (EDT/Glénat) (Castellano)   Bleach (Panini) (Català)
Bleach (EDT/Glénat) (Català)       Bleach: El Alma de la Espada
Bleach (Maximum)
```

Al añadir o editar una serie, el campo *Edición española (ListadoManga)* busca sobre el
catálogo completo —6.600 colecciones— y las lista todas para que elijas la tuya. Al
seleccionarla se rellenan el ID y el título.

Puedes tener **varias ediciones del mismo manga** en la colección: son series
independientes, cada una con sus tomos y su calendario.

Una vez enlazada, la serie hereda de la ficha oficial la **portada, el autor y la
sinopsis en castellano**, y el detalle ofrece *«Usar editorial, total de tomos y estado de
esta edición»* para copiar también esos campos. Lo que rellenes tú siempre manda.

Las portadas se **descargan una vez** a `data/portadas/` y se sirven desde tu propio repo,
para no cargar el ancho de banda de ListadoManga en cada visita. Vienen a 105×150 px, que
es el tamaño que publican; si quieres una mejor, pega una URL en *URL de la portada*.

> No se usa MangaDex: su API solo envía cabeceras CORS a su propio dominio, así que un
> sitio estático como este nunca puede consultarla desde el navegador.

Si prefieres, también puedes pegar el ID a mano: es el número de la URL de la ficha, en
`coleccion.php?id=2688`. Y para las series **sin enlazar**, el script busca candidatos por
título y los deja como sugerencias, que aparecen en el detalle como botones de un clic.

#### Cómo funciona por dentro

ListadoManga no tiene API pública ni envía cabeceras CORS, así que **el navegador no puede
consultarlo** desde GitHub Pages. Lo hace un workflow programado:

```
.github/workflows/calendario.yml   →  lunes a las 06:15 UTC (y a mano si quieres)
scripts/actualizar_indice.py       →  catálogo de ediciones  →  data/listadomanga-indice.json
scripts/actualizar_calendario.py   →  fechas y precios       →  data/calendario.json
```

El catálogo (256 KB) **no se descarga al abrir la web**: solo cuando escribes en el
selector de edición.

El script solo usa la biblioteca estándar de Python, se identifica con un `User-Agent`
propio, espera 1,5 s entre peticiones y solo descarga la ficha de las series que tengas
enlazadas —una petición por serie y semana—. Si una descarga falla, conserva los datos
de la ejecución anterior en lugar de borrarlos. Puedes probarlo en local:

```bash
python3 scripts/actualizar_calendario.py --dry-run --verbose
```

Ten en cuenta que ListadoManga es un proyecto pequeño mantenido por aficionados: no bajes
la pausa entre peticiones ni subas la frecuencia del cron. Las editoriales anuncian con
meses de antelación, así que una vez por semana sobra.

---

## Desarrollo local

Necesitas servir los ficheros por HTTP (abrir `index.html` directamente no permite
leer el JSON):

```bash
python3 -m http.server 8000
# http://localhost:8000
```

### Estructura

```
index.html                 Estructura y navegación
assets/css/estilos.css     Estilos (tema claro/oscuro con variables CSS)
assets/js/util.js          Utilidades: fechas en español, escapado, modal, avisos
assets/js/datos.js         Modelo, cálculos y persistencia
assets/js/github.js        Publicación vía API de contenidos de GitHub
assets/js/vistas.js        Render de cada pantalla
assets/js/formularios.js   Altas, ediciones y diálogos
assets/js/app.js           Rutas, eventos y arranque
data/coleccion.json        Tu colección
data/calendario.json       Fechas de ListadoManga (lo genera la Action, no lo edites)
data/listadomanga-indice.json      Catálogo de ediciones (ídem)
data/portadas/             Portadas descargadas una vez por el Action
scripts/actualizar_calendario.py   Descarga de fechas, precios y datos de la edición
scripts/actualizar_indice.py       Descarga del catálogo de ediciones
```

### Formato de los datos

```jsonc
{
  "version": 1,
  "actualizado": "2026-08-13",
  "series": [
    {
      "id": "identificador-unico",
      "titulo": "Berserk",
      "autor": "Kentaro Miura",
      "editorial": "Panini",
      "demografia": "seinen",          // shounen | shoujo | seinen | josei | kodomo | otro
      "estado": "en-publicacion",      // en-publicacion | finalizada | pausada | cancelada
      "tomosTotales": 42,              // 0 = desconocido
      "portada": "https://…",
      "sinopsis": "…",
      "etiquetas": ["acción"],
      "notas": "Edición Deluxe",
      "listadomangaId": "2688",       // enlaza con listadomanga.es para las fechas
      "tomos": [
        { "numero": 1, "tengo": true, "leido": true, "precio": 9.95, "fechaCompra": "2026-01-10" }
      ],
      "proximas": [
        { "numero": 6, "fecha": "2026-09-24", "nota": "Reservado" }
      ]
    }
  ]
}
```

Todos los campos son opcionales salvo `titulo`: lo que falte se rellena con valores por
defecto al cargar, así que puedes editar el JSON a mano sin miedo.

## Copias de seguridad

Ajustes → *Exportar JSON* descarga la colección entera. Para restaurarla, *Importar*:

- **fusionar** — actualiza las series que coincidan por título y añade las nuevas;
- **reemplazar** — sustituye toda la colección.

Además, como el JSON está en Git, tienes el historial completo de cambios.
