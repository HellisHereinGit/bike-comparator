# Comparador de Bicicletas (Vadebicis) — ficha comparativa multi-bici

Userscript de Tampermonkey, **hermano** de [bike-spec-extractor](https://github.com/HellisHereinGit/bike-spec-extractor), que permite seleccionar hasta 4 bicicletas navegando por trekbikes.com (con adaptadores preparados para Orbea y Mondraker) y genera una única ficha **comparativa** en PDF y Word: foto y precio de cada modelo en la portada, sus especificaciones lado a lado en tablas comparativas, y una sección de garantías que aparece una sola vez (no repetida por bici). No depende de ningún servicio externo ni de IA en tiempo de ejecución: todo el procesamiento ocurre en el propio navegador.

## Qué hace

En cualquier ficha de producto soportada aparece un botón flotante **"🔀 Comparador (n/4)"** (esquina inferior izquierda, para no solaparse con el botón de bike-spec-extractor, que vive en la derecha). Al pulsarlo:

- Abre un panel donde indicas el nombre del cliente (se recuerda mientras dure la comparativa) y ves la lista de bicis ya añadidas.
- "Añadir esta página" extrae los datos de la bici actual (igual que bike-spec-extractor) y te pide el % de descuento aplicado a esa bici en concreto.
- El estado (cliente, bicis, descuentos) se guarda con `GM_setValue`, así que **sobrevive a navegar por la web en la misma pestaña** para ir a por la siguiente bici — no hace falta abrir pestañas nuevas ni volver a empezar.
- Con 1 a 4 bicis añadidas, "Generar comparativa" abre un menú para elegir qué incluir (galería de fotos por bici, tabla de SKUs, garantías del fabricante) y descarga PDF y/o Word.

## Qué contiene el documento generado

- **Portada:** cliente, fecha, y una tarjeta por bici con su foto, SKU, talla/color, PVP, % de descuento y precio final.
- **Comparativa de especificaciones:** una tabla por categoría (Cuadro, Transmisión, Frenos...), con una columna por bici — así se ve de un vistazo qué modelo tiene qué, en vez de tener que comparar fichas sueltas.
- **Galería de fotos** (opcional, activable/desactivable): hasta 6 fotos por bici, agrupadas bajo su propio título.
- **Tabla de SKUs** (opcional): tallas, colores y códigos UPC/EAN de todas las bicis, combinados en una sola tabla con una columna "Modelo".
- **Garantías** (opcional, física o jurídica): aparece **una sola vez** al final del documento, no repetida por cada bici.

## Por qué existe

bike-spec-extractor genera la ficha de **una** bici a la vez — para eso sigue siendo la herramienta más rápida y directa. Este proyecto cubre el otro caso de uso: cuando hay que presentar a un cliente **varios modelos a comparar** con sus descuentos ya aplicados, en un único documento. Son dos herramientas independientes que pueden estar instaladas y activas a la vez sin interferir entre sí (namespace, prefijo de IDs/CSS y almacenamiento propios: `bcb-` / `bcb_state_v1`, frente a `bse-` / los del otro proyecto).

## Arquitectura (por qué es fácil de mantener)

Reutiliza, adaptado a este archivo, el mismo motor que ya está probado en bike-spec-extractor: extractor genérico (JSON-LD, Open Graph, heurísticas de tablas/galerías), adaptadores por marca (Trek con su PVP recomendado y tabla de tallas/SKU; Orbea y Mondraker sobre el motor genérico), descarga y proceso de imágenes, y el mismo texto fijo de garantías. Lo nuevo de este proyecto es la capa de comparación: estado persistente entre navegaciones, fusión de especificaciones de varias bicis en una tabla común, y la maquetación de portada/comparativa en PDF (jsPDF + jspdf-autotable) y Word (html-docx-js).

## Estado

Construido a partir del motor de bike-spec-extractor v1.6.1. No probado aún en vivo contra la web B2B de Trek con varias bicis reales — se recomienda una prueba con 2 bicis antes de usarlo para una oferta real a un cliente.

## Distribución y actualizaciones

El script se autoactualiza apuntando a la **última release** publicada en este repositorio (no a la rama `main`): consulta `INSTALACION.md` para el detalle. En cada versión nueva, sube el asset con el nombre fijo `bike-comparator.user.js` (sin el número de versión en el nombre del archivo) para que la autoactualización siga funcionando.
