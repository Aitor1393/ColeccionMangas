# Pruebas

Abren la web en un Chromium de verdad y comprueban lo que se ve, no lo que
debería verse. Cada una es un archivo suelto que se puede ejecutar solo.

## Ejecutarlas

Hace falta el sitio servido por HTTP (con `file://` el navegador no lee el JSON):

```bash
python3 -m http.server 8777          # desde la raíz del repo, en otra terminal
node pruebas/ejecutar.js             # las 19
node pruebas/ejecutar.js ranking     # solo las que contengan «ranking»
```

Tarda unos **3 minutos**. Termina con código 0 si pasan todas, 1 si falla
alguna y 2 si no encuentra el servidor.

Playwright solo hace falta para esto, no para la web:

```bash
cd pruebas && npm install
```

En los entornos de Claude Code, Chromium ya viene instalado en
`/opt/pw-browsers` y `entorno.js` lo encuentra solo. En otra máquina, si
Playwright no da con él: `CHROMIUM=/ruta/a/chrome node pruebas/ejecutar.js`.

## Comprobar lo que está publicado

Más de una vez el árbol local estaba bien y lo publicado no. Para probar contra
el sitio de verdad, se descargan sus archivos a una carpeta, se sirven en otro
puerto y se apunta ahí:

```bash
BASE=http://localhost:8778/ node pruebas/ejecutar.js
```

## Qué prueba cada una

| | |
|---|---|
| `humo` | que las cinco vistas pintan algo y no hay excepciones |
| `tomocero` | las series que empiezan por el tomo 0 |
| `lectura` | el filtro de leídas enteras / a medias / sin empezar |
| `filtros` | el buscador plegable de la biblioteca |
| `abandonadas` | marcarlas y filtrarlas |
| `titulos` | título y edición separados, y que se sigue pudiendo buscar por edición |
| `resumenorden` | que el resumen respeta la prioridad de Compras |
| `compras` | qué entra en Próximas compras y su orden manual |
| `precios` | estimados con descuento, precios a mano y el desglose |
| `coma` | la coma decimal en todos los campos de dinero |
| `arreglos` | el reparto de un importe entre varios tomos |
| `calendario` | próximas publicaciones y el gasto oculto |
| `picker` | el buscador de ediciones de ListadoManga |
| `clave` | la contraseña de publicación, de punta a punta |
| `frescura` | el aviso de datos de ListadoManga sin actualizar |
| `portadas` | que cada serie usa la portada de SU edición |
| `ranking` | rúbrica, orden, duelos y alineación de las notas |
| `relectura` | releer sin perder lo ya leído |
| `capitulos` | capítulos por tomo y ediciones que juntan varios |

## Al escribir una nueva

Dos cosas que ya han provocado rojos falsos:

**No fijes números que dependan de la colección.** «Espera 2 ediciones Maximum»
caduca en cuanto se añade la tercera. Comprueba la propiedad —que el orden no
suba, que los tres grupos sumen el total— y saca las cifras del propio modelo.

**El navegador del entorno no sale a internet.** Para probar algo que pide datos
fuera, intercepta la petición con `page.route` y sírvela desde Node, que sí sale.
`puente-wikipedia.js` hace justo eso, y además guarda las respuestas en disco
porque Wikipedia corta el paso si le preguntas mucho de golpe.

Y el ruido de red externo —`gstatic`, `panini`, `listadomanga`— es del entorno,
no un fallo de la web: fíltralo.
