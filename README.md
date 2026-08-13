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
Ajustes → *Guardar directamente en GitHub* → pega un token y **elige una contraseña**.
A partir de ahí, el botón **Publicar** te pide esa contraseña y escribe el JSON por ti.

Para el token: GitHub → *Settings* → *Developer settings* → *Personal access tokens* →
**Fine-grained tokens** → *Generate new token*, con:

- **Repository access**: solo `ColeccionMangas`
- **Permissions → Repository permissions → Contents**: `Read and write`

Nada más. El token nunca se sube al repositorio.

#### La contraseña de publicación

El token se guarda **cifrado con una contraseña que eliges tú**, y solo en tu navegador:

- Cifrado **AES-256-GCM** con clave derivada por **PBKDF2-SHA256** (250.000 iteraciones,
  sal aleatoria por token). En `localStorage` solo queda el blob cifrado.
- La contraseña **no se guarda en ninguna parte**, ni en el repo ni en el navegador. Se
  pide al publicar y el token descifrado vive en memoria hasta que cierras la pestaña.
- Si la olvidas no hay forma de recuperar el token: se genera otro y listo.

Esto sí protege de verdad, a diferencia de una comprobación tipo «¿la contraseña es X?»:
como el código de un sitio estático es público, esa comprobación se leería en el fuente y
se saltaría desde la consola. Aquí, sin la contraseña no hay token, y sin token no se
puede escribir en el repositorio.

En Ajustes tienes *Bloquear ahora*, que olvida el token descifrado sin borrarlo, y
*Olvidar token*, que borra el cifrado de este navegador.

---

## Qué puedes hacer en la web

- **Resumen** — cuántas series y tomos tienes, cuánto has invertido, qué te queda por
  leer, qué sale este mes y qué series tienes a medias.
- **Biblioteca** — todas tus series con portada y progreso. Filtros por texto (título,
  autor, editorial, etiqueta), **comprados o solo leídos**, estado, demografía y editorial,
  con varios criterios de orden.
- **Pendientes** — todos los tomos que tienes en casa y no has leído, agrupados por serie.
- **Próximas** — en **lista** (agrupada por mes, con precio cuando se conoce) o en
  **calendario** de tres meses, donde los días con salidas se marcan y al pulsarlos sale
  qué se publica ese día. Más un apartado de *«ya está a la venta y aún no lo tienes»*.
- **Detalle de serie** — cuadrícula de tomos donde cada clic cicla el estado:

  > no lo tengo → **lo tengo** → **leído** → **leído sin tenerlo** → no lo tengo

  Además: huecos de la colección, gasto acumulado, fechas de salida y notas.
- **Añadir serie** — eliges tu edición española y se rellenan solos portada, autor,
  sinopsis, editorial, número de tomos, estado, fechas y precios. También puedes
  escribirlo todo a mano.
- **Modo claro y oscuro**, y diseño adaptado a móvil.

### Precios y gasto

El gasto **no hay que teclearlo tomo a tomo**: se calcula con el PVP que publica
ListadoManga aplicando tu **descuento habitual**, que configuras en Ajustes (5 % por
defecto). El descuento se guarda en `coleccion.json`, no en el navegador, para que el
total salga igual para quien visite la web.

Cuando pagaste otra cosa —segunda mano, oferta, un pack— lo escribes tú: en el detalle de
la serie, botón **💶 Precios**, con una fila por tomo. Ahí ves el estimado y su PVP al
lado, y puedes anotar también la fecha de compra. **Un precio escrito manda tal cual y no
lleva descuento**: es lo que pagaste.

Bajo la cuadrícula, el detalle desglosa cuántos tomos van estimados y cuántos a precio
tuyo, y las cifras aproximadas se marcan como tales.

**El total invertido va oculto por defecto**, porque la web es pública: en el resumen sale
`••••• €`. Se enseña de dos maneras: pulsando la tarjeta *Tomos en casa* para un vistazo
puntual, que no se recuerda al recargar, o dejándolo visible con el interruptor de
Ajustes.

### Lo que has leído sin tenerlo

Prestado, en digital, en la biblioteca… se lleva igual que el resto, con un cuarto estado
en la misma cuadrícula: la portada se ve algo apagada y el borde es verde discontinuo, para
distinguirlo de un tomo tuyo (borde continuo) y de uno que te falta (gris del todo).

Cuenta como leído pero **no como tomo en propiedad**: no suma al gasto, no aparece en
*Pendientes de leer* y sigue contando como hueco de la colección si algún día lo compras.

Para no ir uno por uno hay dos atajos:

- Al añadir o editar una serie, el campo **«He leído hasta el tomo…»**, hermano de «Ya
  tengo hasta el tomo…». Puedes usar los dos a la vez: tienes hasta el 5 y has leído
  hasta el 20.
- En el detalle, **«Marcar todo como leído»** abarca todos los tomos, los tengas o no.

Una serie que hayas leído entera sin tener ningún tomo aparece en la biblioteca con la
insignia *«✓ leída»* y su barra de progreso en verde.

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

Al elegir la edición se **precarga el formulario** con autor, editorial, sinopsis, tomos
totales, demografía y estado, y se te dice qué campos se han rellenado. Solo se toca lo
que esté vacío: lo que escribas tú nunca se pisa.

Si la ficha aún no está descargada, no pasa nada: los campos que dejes en blanco se
**heredan de la edición** en cuanto llegue, sin tener que tocar la serie. Y si quieres
tenerlos **al instante**, sin publicar, mira *Traer los datos al momento* más abajo. El estado tiene
por eso un valor *«Según la edición»*, que es el que trae por defecto.

El botón *«Usar los datos de esta edición»* solo aparece cuando un valor tuyo choca con
la ficha, para resolverlo de un clic.

**Cada tomo tiene su propia portada** en la cuadrícula del detalle: los que tienes salen a
todo color, con el borde ámbar o verde según los hayas leído, y los que te faltan en gris.

Las portadas se **descargan una vez** a `data/portadas/<colección>/<nº>.jpg` y se sirven
desde tu propio repo, para no cargar el ancho de banda de ListadoManga en cada visita.
Vienen a 105×150 px, que es el tamaño que publican; ocupan unos 10 KB cada una. Si un tomo
no tiene imagen, esa casilla se queda con el número, como antes.

Para la portada de la serie se usa la del primer tomo. Si prefieres otra, pega una URL en
*URL de la portada* y esa manda.

> No se usa MangaDex: su API solo envía cabeceras CORS a su propio dominio, así que un
> sitio estático como este nunca puede consultarla desde el navegador.

Si prefieres, también puedes pegar el ID a mano: es el número de la URL de la ficha, en
`coleccion.php?id=2688`. Y para las series **sin enlazar**, el script busca candidatos por
título y los deja como sugerencias, que aparecen en el detalle como botones de un clic.

#### Traer los datos al momento (opcional)

Por defecto los datos de una edición nueva llegan al publicar. Con un proxy configurado
se traen **al elegir la edición**, sin esperar y sin publicar nada.

Hace falta un proxy porque ListadoManga no envía cabeceras CORS. El repositorio incluye
uno listo en `workers/listadomanga-proxy.js`, para desplegar gratis en Cloudflare Workers:

1. dash.cloudflare.com → *Workers & Pages* → *Create* → *Worker*
2. Pega el fichero, ajusta `ORIGENES` si tu web está en otra URL, y *Deploy*
3. Copia la URL en Ajustes → *Traer los datos al momento*

Solo deja pasar `coleccion.php?id=<número>` de listadomanga.es —no es un proxy abierto— y
cachea una hora en el borde, así que a ListadoManga le llegan menos peticiones que antes.

Las fichas que traigas así se guardan en tu navegador y se superponen a las publicadas,
de modo que sus fechas y precios se ven ya. Al publicar, el Action las sube al repositorio
y quedan también para quien visite la web.

> El navegador y el Action analizan la ficha por separado (`assets/js/ficha.js` y
> `scripts/actualizar_calendario.py`). Si tocas uno, revisa el otro: hay una prueba que
> comprueba que los dos devuelven exactamente lo mismo.

#### Cómo funciona por dentro

ListadoManga no tiene API pública ni envía cabeceras CORS, así que **el navegador no puede
consultarlo** desde GitHub Pages. Lo hace un workflow programado:

```
.github/workflows/calendario.yml   →  lunes a las 06:15 UTC, y al publicar la colección
scripts/actualizar_indice.py       →  catálogo de ediciones  →  data/listadomanga-indice.json
scripts/actualizar_calendario.py   →  fechas y precios       →  data/calendario.json
```

El catálogo (256 KB) **no se descarga al abrir la web**: solo cuando escribes en el
selector de edición.

Al publicar una serie nueva, el workflow se dispara solo y trae su ficha en un minuto:
no hay que esperar al lunes. Para no repetir descargas, **reutiliza las fichas bajadas
hace menos de 7 días** (`--dias N` lo ajusta), así una publicación solo descarga lo nuevo.

El script solo usa la biblioteca estándar de Python, se identifica con un `User-Agent`
propio, espera 1,5 s entre peticiones y solo descarga la ficha de las series que tengas
enlazadas. Si una descarga falla, conserva los datos
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
assets/js/cripto.js        Cifrado del token con la contraseña
assets/js/ficha.js         Lectura de fichas en directo (vía proxy)
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
workers/listadomanga-proxy.js      Proxy CORS opcional para Cloudflare Workers
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
