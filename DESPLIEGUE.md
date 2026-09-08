# Desplegar en Cloudflare Pages

La web se sirve desde **Cloudflare Pages**, que además permite decidir quién
entra con **Cloudflare Access**. GitHub Pages no sabe hacer eso: publica en
abierto o no publica.

## Ajustes del proyecto

**Workers & Pages → Create → Pages → Connect to Git**, eliges este repositorio:

| Campo | Valor |
|---|---|
| Production branch | `main` |
| Framework preset | None |
| Build command | `bash scripts/preparar-sitio.sh` |
| Build output directory | `_sitio` |

Quedan fuera los scrapers de `scripts/`, las pruebas y el Worker del proxy.
El Worker se despliega aparte y no tiene nada que ver con esto.

## Quién puede entrar

**Zero Trust → Access → Applications → Add an application → Self-hosted**,
apuntando al dominio del proyecto, y ahí defines la política.

Las rutas van con almohadilla (`#/biblioteca`), y lo que va detrás de `#` no
llega al servidor: **el control de acceso es por sitio entero, no por
pantalla**.

Con Access delante, un detalle que conviene tener presente: si dejas la
colección detrás de identificación, el gasto total deja de estar expuesto por
definición, y `ajustes.mostrarGasto` pasa a ser una preferencia de la vista y
no una medida de privacidad.

## Publicar y las cachés

Publicar escribe `data/coleccion.json` en GitHub con tu token, igual que hasta
ahora, y el push dispara la compilación de Cloudflare. Las cabeceras de
`_headers` marcan los JSON como revalidables siempre, así que en cuanto la
compilación termina se ve lo nuevo. Las portadas sí se cachean un día: son
1.600 imágenes que no cambian y es lo que hace que la biblioteca abra rápido.

**La copia local sigue haciendo falta.** El hueco entre publicar y que el
despliegue termine no desaparece, solo se acorta.

## Apagar GitHub Pages

Mientras siga activo, la colección está también en
`aitor1393.github.io/ColeccionMangas/` **sin identificación alguna**, y el
control de acceso de Cloudflare no sirve de nada. Cuando Cloudflare funcione:
**Settings → Pages → Source → None**.

La Action de `calendario.yml` no se toca: los tres scrapers siguen corriendo
en GitHub como hasta ahora.
