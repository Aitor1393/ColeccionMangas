# Guía del proyecto

Léeme antes de tocar nada. El `README.md` explica **cómo se usa** la web; esto
explica **cómo está hecha** y, sobre todo, las cosas que ya han costado un
disgusto una vez.

Todo lo que se escribe aquí —código, comentarios, mensajes de commit y respuestas
al usuario— va **en español**.

---

## Qué es

Web personal estilo Whakoom para llevar una colección de manga. Sitio
**estático**: HTML, CSS y JavaScript a pelo. **Sin dependencias, sin
compilación, sin framework.** Se abre `index.html` y funciona.

Que no haya build es una decisión, no una carencia: cualquiera puede editar un
archivo y ver el resultado recargando. No metas un empaquetador ni una librería
sin que el usuario lo pida.

---

## Estructura

```
index.html                  una sola página; todas las vistas se pintan por JS
assets/css/estilos.css      tema oscuro por defecto, claro con [data-tema="claro"]
assets/js/                  ver orden de carga más abajo
data/coleccion.json         LA colección. Fuente de verdad.
data/calendario.json        fichas de ListadoManga: fechas, precios, sinopsis
data/listadomanga-indice.json  catálogo de ~6.600 ediciones, solo para el buscador
data/portadas-editorial.json   índice de portadas de serie
data/portadas/<lmId>/N.jpg  portada de cada tomo (de ListadoManga, 106x150)
data/portadas-serie/<lmId>.jpg  portada de la serie (de su editorial, 400px)
scripts/*.py                los tres scrapers, solo se ejecutan en la Action
workers/listadomanga-proxy.js  Cloudflare Worker para saltar el CORS de ListadoManga
```

### Orden de carga de los módulos

El orden en `index.html` **importa**: no hay imports, cada archivo cuelga su
objeto de `window` y los siguientes lo usan.

| Archivo | Global | Qué hace |
|---|---|---|
| `util.js` | `U` | fechas, números, DOM, modal, localStorage. Sin dependencias. |
| `datos.js` | `D` | el modelo: cargar, normalizar, calcular, guardar. **Aquí van las reglas.** |
| `cripto.js` | `C` | cifra el token de GitHub con la contraseña |
| `ficha.js` | `FI` | lee una ficha de ListadoManga en directo (necesita el proxy) |
| `wikipedia.js` | `WK` | saca de Wikipedia los capítulos de cada tomo |
| `github.js` | `GH` | publica `coleccion.json` con la API de GitHub |
| `vistas.js` | `V` | genera HTML. No toca datos. |
| `formularios.js` | `F` | los modales |
| `app.js` | `App` | rutas, delegación de eventos, arranque |

**Dónde poner cada cosa.** Una regla de negocio va en `datos.js`, aunque solo la
use una vista: así se puede probar sin navegador y no se duplica. `vistas.js`
pinta y no decide. Si te ves calculando algo dentro de un `V.` o un `F.`, casi
seguro va en `D.`.

---

## El modelo

`data/coleccion.json`:

```jsonc
{
  "version": 1,
  "actualizado": "2026-08-25",
  "ajustes": { "descuento": 5, "mostrarGasto": false, "proxy": "…" },
  "compras": { "series": ["id", …], "tomos": ["idSerie#numero", …] },
  "series": [ … ]
}
```

Una serie:

```jsonc
{
  "id": "uuid", "titulo": "Bleach", "tituloAlt": "",
  "edicion": "Maximum",          // fuera del título, a propósito
  "autor": "", "editorial": "", "demografia": "shounen",
  "estado": "finalizada",        // '' = lo que diga la edición
  "abandonada": false,           // cosa tuya, no de la edición
  "deseada": false,              // la quieres y no la has empezado
  "tomosTotales": 37,            // 0 = no se sabe
  "portada": "",                 // manual; MANDA sobre la de editorial
  "sinopsis": "", "etiquetas": [], "notas": "",
  "anadida": "2026-08-21",       // para ordenar por «añadidas hace poco»
  "listadomangaId": "3000",      // clave para calendario y portadas
  "mangadexId": "",              // vestigio: no se usa en ningún sitio
  "capitulos": null,             // { inicio, porTomo, tabla, leidoHasta, fuente }
  "valoracion": null,            // { criterios, disfrute, desempate, duelos, notas, fecha }
  "relectura": null,             // { activa, tomo, desde, vueltas }
  "tomos": [ { "numero": 1, "tengo": true, "leido": true,
               "fechaCompra": "", "precio": null, "notas": "" } ],
  "proximas": [ { "numero": 1, "fecha": "", "nota": "" } ]
}
```

**`D.normalizarSerie` es el contrato.** Todo campo nuevo se añade ahí con su
valor por defecto; así una colección vieja sigue cargando. Nada más en el código
debe suponer que un campo existe.

### Precedencias que hay que respetar

- **Portada**: manual → de editorial (`data/portadas-serie/`) → de ListadoManga.
  Si una serie no cambia de portada al descargarla, mira si tiene manual: eso no
  es un fallo, es el diseño.
- **Datos de la serie**: lo que hayas escrito tú → lo que diga la ficha de
  ListadoManga.
- **Precio de un tomo**: el que hayas escrito → el PVP de la ficha menos tu
  descuento.

---

## Publicar

La colección se edita en el navegador y se guarda en `localStorage`; hasta que
no pulsas **Publicar** no sale del dispositivo. Publicar escribe
`data/coleccion.json` con la API de GitHub y Pages regenera el sitio.

Claves de `localStorage` (todas con prefijo `cm:`):

`coleccion` `base` `copia` `tema` `github` `proxy` `fichas` `filtrosBiblioteca`
`resumenPlegado` `vistaProximas` `vistaCompras` `vistaRanking`

**Al publicar NO se borra la copia local.** GitHub Pages tarda cerca de un
minuto en servir el JSON nuevo; si la página se recarga en esa ventana —en el
móvil basta con cambiar de app y volver— sin copia local la web cae al JSON
viejo y lo recién publicado desaparece de la pantalla. La copia se retira sola
al cargar, cuando `D.numCambios()` da 0.

**`D.numCambios()` decide si aparece el aviso de «cambios sin publicar».** Si
añades algo al JSON que no esté dentro de `series`, tienes que compararlo ahí
también, o el usuario no podrá publicarlo. Ya pasó con `ajustes` y con `compras`.

### Seguridad — sin excepciones

- La **contraseña de publicación** no puede aparecer nunca en el repo, ni en el
  código, ni en un commit, ni en un mensaje que quede publicado. Si necesitas
  referirte a ella, dices «la contraseña».
- El **token de GitHub** es de grano fino, solo para este repositorio, con
  `Contents: Read and write`. Se guarda **cifrado** en `localStorage` y no se
  commitea jamás.
- La web es **pública**: el gasto total va oculto por defecto
  (`ajustes.mostrarGasto`). No enseñes dinero donde no toca.

---

## Los tres scrapers

Se ejecutan **solo en la Action**, nunca desde el navegador. Todos son
educados: se identifican con un User-Agent con la URL del repo, pausan entre
peticiones y van una vez por semana.

| Script | Saca | De dónde |
|---|---|---|
| `actualizar_indice.py` | catálogo de ediciones para el buscador | `lista.php` de ListadoManga |
| `actualizar_calendario.py` | fechas, precios, sinopsis, portada de cada tomo | ficha `coleccion.php?id=N` |
| `actualizar_portadas.py` | una portada grande por serie | web de cada editorial |

Fuentes de portadas, y lo que cuesta cada una:

- **Planeta**: dos sitemaps de imágenes. 2 peticiones.
- **Panini**: un sitemap de imágenes con 10.000 productos. **1 petición.**
- **Ivrea**: su página de catálogo entera. 1 petición.
- **Norma**: 6 páginas de índice **+ una petición por serie**, porque su índice
  enseña la portada del último tomo y hace falta la del primero.

Si una fuente devuelve **cero** series, el script sale con error: es señal de que
han rediseñado su web. Más vale que la Action salga en rojo a publicar datos
viejos en silencio.

---

## Las dos Actions

- **`pages.yml`** — valida el JSON y despliega. En cada push a `main`.
- **`calendario.yml`** — los tres scrapers. Lunes 06:15 UTC, al publicar
  `coleccion.json`, y a mano.

**Regla que costó cinco días de datos:** cada paso que sale a internet lleva
`continue-on-error: true` y un `id`, y al final —**después** de publicar— hay un
paso que mira los resultados y termina en rojo si alguno falló. Las dos mitades
hacen falta:

- sin `continue-on-error`, un scraper roto **corta los siguientes** (en agosto de
  2026 un cambio de nada en ListadoManga dejó cinco días sin fechas ni portadas);
- con `continue-on-error` **a secas, el run sale VERDE** y no te enteras de nada.

El pie de la web dice cuándo se trajeron los datos de ListadoManga y avisa en
ámbar si pasan de 10 días. Es el chivato de que la Action lleva dos semanas sin
salir bien.

---

### Series marcadas, y de qué las excluye cada marca

Dos banderas cambian dónde aparece una serie. Si añades una vista o un cálculo,
mira si tienes que respetarlas:

| | `abandonada` | `deseada` |
|---|---|---|
| Biblioteca | sale, marcada | **fuera** salvo que la filtres |
| Compras y Próximas publicaciones | **fuera** | **fuera** |
| Estadísticas del resumen | cuenta | **no cuenta** |
| Ranking | entra: valorarla es cómo recuerdas por qué la dejaste | no entra (no la has leído) |

`deseada` fuera de Compras es lo que más importa: una serie deseada de 72 tomos
metería sus 72 en Próximas compras. Están publicados y no los tienes, sí, pero
no has decidido comprarla.

Y `normalizarSerie` garantiza el invariante: en cuanto consta un tomo que tienes
o has leído, `deseada` pasa a false. Así no puede quedarse a la vez en «Los
quiero» y en la biblioteca, venga el cambio de donde venga.

---

## Trampas conocidas

Cada una de estas ya rompió algo. No las redescubras.

**`<input type="number">` se come la coma decimal.** Escribir `50,25` acaba
valiendo `5025`, sin avisar. Todos los campos de dinero son `type="text"
inputmode="decimal"` y pasan por `U.aNumero`. No los cambies a `number`.

**Hay series con tomo 0** (Jujutsu Kaisen). ListadoManga dice «30 tomos» y luego
lista del 0 al 30, que son 31. Usa siempre `D.rangoTomos(serie)` para recorrer
tomos, nunca `for (i = 1; …)`.

**Ediciones que juntan varios tomos.** Una «3 en 1» mete tres tomos originales en
cada uno. `D.tomosPorTomo` lo saca del nombre cuando lo dice; si no, se deduce de
la proporción, y **solo se aplica si al agrupar salen exactamente los tomos que
hay**. Las kanzenban rebarajan capítulos y no siguen ninguna proporción: ahí no
cuadra nada y hay que decirlo, no inventarlo.

**`.crece` solo tiene regla flex dentro de `.vista__cabecera`.** Dentro de una
`.fila` no crece y su ancho lo manda el contenido, así que todo lo que va detrás
se mueve. En una fila usa `.fila__cuerpo`, y las columnas numéricas con `width`
fijo, no `min-width`.

**`avisoFuera()` es de Compras y Pendientes.** Dice que las abandonadas quedan
fuera de la cuenta; en el Ranking sí entran, así que ahí sería mentira.

**Parsear HTML: trocea primero.** Un solo regex con `.*?` sobre la página entera
se salta las tarjetas que no encajan y empareja la imagen de una con el título de
otra. Con el índice de Norma llegó a fallar 167 de 285 emparejamientos —o sea,
portadas de otra serie— y luego a perder dos de cada tres. Parte por la etiqueta
que delimita cada tarjeta y lee dentro.

**No te fíes de que un título contenga a otro.** «List of Fairy Tail: 100 Years
Quest chapters» contiene «Fairy Tail» y es la secuela. Más vale no encontrar nada
que rellenar una serie con los datos de otra.

**Las tiendas sirven «IMAGE COMING SOON»** con el nombre de archivo del propio
producto, indistinguible por la URL. Una portada de manga siempre es más alta que
ancha; esa comprobación las descarta.

**Wikipedia parte las listas largas** en `ChapterList` y `ChapterListCol2` —hay
que sumar las dos— y en varios artículos, unas veces transcluidos y otras solo
enlazados. Un fragmento puede parecer una lista entera (los tomos 1 al 20,
seguidos y sin huecos) sin serlo.

---

## Probar los cambios

Hay **21 pruebas en `pruebas/`** que abren la web en un Chromium de verdad. No
las rehagas: están versionadas.

```bash
python3 -m http.server 8777          # desde la raíz, en otra terminal
node pruebas/ejecutar.js             # las 21, unos 3 minutos
node pruebas/ejecutar.js ranking     # solo las que contengan «ranking»
```

Sale 0 si pasan todas, 1 si falla alguna —y entonces enseña su salida entera— y
2 si no encuentra el servidor. Detalles y qué cubre cada una:
[`pruebas/README.md`](pruebas/README.md).

**Playwright vive en `pruebas/package.json`, no en la raíz**, para que la web
siga sin dependencias. Es a propósito: no lo subas un nivel.

Antes de dar algo por hecho, pásalas. Y para lo que ya esté publicado, sírvelo
en otro puerto y `BASE=http://localhost:8778/`: más de una vez el árbol local
estaba bien y lo publicado no.

Al escribir una nueva, dos reglas que ya han provocado rojos falsos:

- **No fijes números que dependan de la colección.** «Espera 2 ediciones
  Maximum» caduca en cuanto se añade la tercera. Comprueba la propiedad —que el
  orden no suba, que los tres grupos sumen el total— y saca las cifras del propio
  modelo.
- **El navegador del entorno no sale a internet.** Intercepta con `page.route` y
  sirve desde Node, que sí sale; `pruebas/puente-wikipedia.js` hace eso y además
  cachea, porque Wikipedia corta el paso si le preguntas mucho. Los errores de
  red externos (`gstatic`, `panini`, `listadomanga`) son ruido del entorno.

---

## Al terminar algo

1. Ejecuta lo que tengas para comprobarlo, y **míralo en el navegador**.
2. Commit en español, explicando **por qué**, no solo qué.
3. `git fetch origin main` y rebase antes de empujar: el usuario publica desde la
   web a menudo y te vas a encontrar la rama movida.
4. Comprueba el resultado **contra el sitio publicado**, no solo en local.
