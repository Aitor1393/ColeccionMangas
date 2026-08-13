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
- **Próximas** — calendario de salidas agrupado por mes, más un apartado de *«ya está a
  la venta y aún no lo tienes»*.
- **Detalle de serie** — cuadrícula de tomos donde cada clic cicla el estado:

  > no lo tengo → **lo tengo** → **leído** → no lo tengo

  Además: huecos de la colección, gasto acumulado, fechas de salida y notas.
- **Añadir serie** — buscador contra la API pública de [MangaDex](https://api.mangadex.org/docs/)
  que rellena título, autor, portada, sinopsis, estado y número de tomos. También puedes
  escribirlo todo a mano.
- **Modo claro y oscuro**, y diseño adaptado a móvil.

### Sobre las fechas de publicación

Las fechas de salida se introducen **a mano** (detalle de la serie → *+ Fecha de salida*).
No hay ninguna API pública que cubra de forma fiable el calendario de las ediciones
españolas —Planeta, Norma, Ivrea, Panini…—, así que la alternativa sería inventarse los
datos. Cuando marcas un tomo como *«Ya lo tengo»*, la fecha desaparece del calendario y
el tomo pasa a tu colección automáticamente.

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
assets/js/mangadex.js      Búsqueda de metadatos en MangaDex
assets/js/github.js        Publicación vía API de contenidos de GitHub
assets/js/vistas.js        Render de cada pantalla
assets/js/formularios.js   Altas, ediciones y diálogos
assets/js/app.js           Rutas, eventos y arranque
data/coleccion.json        Tu colección
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
