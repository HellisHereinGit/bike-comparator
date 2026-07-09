# Comparador de Bicicletas — instalación y uso

Herramienta independiente (no depende de Claude) que se instala una vez en Chrome y funciona en cualquier equipo. Es un proyecto **hermano** de bike-spec-extractor: pueden estar instalados los dos a la vez sin que se pisen.

## 0. Publicar el script en GitHub (una sola vez)

Este script se autoactualiza usando la **última release** de un repositorio público de GitHub como fuente (no la rama `main`). Puedes usar el mismo repositorio que ya tienes para bike-spec-extractor, subiendo estos archivos como contenido nuevo, o uno aparte — como prefieras.

1. Entra en [github.com](https://github.com) e inicia sesión.
2. Si usas un repositorio nuevo, créalo → **público** → por ejemplo `bike-comparator`.
3. Sube estos tres archivos al repositorio (rama `main`, para tener el código a la vista; no es lo que consulta Tampermonkey pero conviene tenerlo ahí como referencia):
- `bike-comparator.user.js`
- `INSTALACION.md`
- `README.md`
4. Edita `bike-comparator.user.js` y sustituye, en las líneas `@updateURL` y `@downloadURL` de la cabecera, `<TU-USUARIO-GITHUB>` y `<TU-REPO>` por tus valores reales. Deben quedar así (con tus datos):
```
// @updateURL   https://github.com/TU-USUARIO/TU-REPO/releases/latest/download/bike-comparator.user.js
// @downloadURL https://github.com/TU-USUARIO/TU-REPO/releases/latest/download/bike-comparator.user.js
```
5. Ve a **Releases → Draft a new release**, crea un tag (por ejemplo `v1.0.0`, coincidiendo con el `@version` del script) y sube `bike-comparator.user.js` como asset **con ese nombre exacto** (sin la versión en el nombre del archivo). Publica la release.

A partir de aquí, cada vez que quieras publicar una mejora: sube el `@version` dentro del script, crea una release nueva con un tag nuevo, y sube el archivo actualizado como asset **siempre con el mismo nombre** `bike-comparator.user.js`. Tampermonkey detectará la versión más reciente solo, en todos los equipos donde esté instalado.

## 1. Instalar en un equipo (Tampermonkey)

**Opción A — recomendada, con autoactualización:**

1. Instala la extensión **Tampermonkey** desde la Chrome Web Store (gratuita) si no la tienes ya (la necesitarás también para bike-spec-extractor).
2. Abre en el navegador la URL de la release del paso 5 anterior, la que termina en `bike-comparator.user.js`.
3. Tampermonkey detecta que es un userscript y muestra su pantalla de instalación → pulsa **"Instalar"**.
4. Listo. Este equipo comprobará automáticamente si hay versiones nuevas publicadas y las instalará (o avisará, según la configuración de Tampermonkey).

**Opción B — manual, sin repositorio:**

1. Instala **Tampermonkey**.
2. Abre el icono de Tampermonkey → **Crear un script nuevo**.
3. Borra el contenido de ejemplo y pega todo el contenido del archivo `bike-comparator.user.js`.
4. Guarda con `Ctrl+S`.

Con la opción B, cada actualización futura hay que volver a copiar/pegar el script a mano en cada equipo.

### Importante: tras editar o actualizar el script

Igual que con bike-spec-extractor, Trek es una SPA (Vue) y un simple F5 sobre una pestaña ya abierta puede seguir ejecutando la versión anterior en memoria. Tras actualizar:

1. **Cierra del todo** la pestaña de Trek (no solo refrescar) y ábrela de nuevo.
2. Comprueba el build activo pasando el ratón por encima del botón "🔀 Comparador" (tooltip): debe coincidir con el `@version` que acabas de publicar.

## 2. Uso

1. Entra en `trekbikes.com` y navega hasta la ficha de la primera bici que quieras comparar.
2. Abajo a la **izquierda** aparece el botón "🔀 Comparador (0/4)". Púlsalo.
3. Escribe el nombre del cliente (opcional, pero se recuerda para el resto de la comparativa) y pulsa **"➕ Añadir esta página"**.
4. Se extraen los datos de la bici; indica el % de descuento que le corresponde a ese modelo en concreto y confirma.
5. **Navega con normalidad por la web de Trek, en la misma pestaña**, hasta la siguiente bici que quieras comparar (usa el menú de Trek, el buscador, o el botón "atrás" del navegador — el progreso no se pierde). Repite el paso 2-4 para cada bici, hasta un máximo de 4.
6. Cuando tengas todas las que quieras (mínimo recomendado: 2, para que tenga sentido de comparativa), abre el panel del comparador y pulsa **"📄 Generar comparativa"**.
7. Elige qué apartados incluir (galería de fotos, tabla de SKUs, garantías) y pulsa **"Descargar PDF"** y/o **"Descargar Word"**.
8. Si quieres empezar una comparativa nueva desde cero, usa **"Vaciar todo"** en el panel.

Puedes quitar una bici ya añadida en cualquier momento desde el panel (botón "Quitar" en su fila), antes de generar el documento final.

## 3. Relación con bike-spec-extractor

Son dos scripts independientes, pensados para casos distintos:

- **bike-spec-extractor**: ficha de una sola bici, rápida, con toda la información de esa bici (incluida su propia sección de garantías).
- **bike-comparator** (este proyecto): comparativa de 2 a 4 bicis para un mismo cliente, con descuentos individuales y specs en columnas paralelas.

Puedes tener los dos instalados y activos a la vez: usan prefijos de almacenamiento e interfaz distintos (`bse-` / `bcb-`) y aparecen como dos botones flotantes separados, uno a cada lado de la pantalla, así que no interfieren entre sí. Actualizar o modificar uno no afecta al otro.

## 4. Añadir otra marca o afinar un adaptador

Igual que en bike-spec-extractor: el bloque `ADAPTERS` (dentro del archivo) tiene una entrada por marca. Orbea y Mondraker están de momento sobre el motor genérico; si al probar contra esas webs reales el resultado se queda corto, se afina ahí mismo, siguiendo el mismo patrón que el adaptador de Trek. Para una marca nueva, añade su `// @match` en la cabecera y una entrada nueva en `ADAPTERS`.

## 5. Solución de problemas

**El botón del comparador no aparece:** comprueba que Tampermonkey tiene el script activado (no solo instalado) y que la URL de la página coincide con alguno de los `@match` de la cabecera.

**Al generar el documento, alguna bici sale con datos vacíos:** ocurre si esa página cambió de estructura y el extractor no encontró el dato — es la misma limitación que en bike-spec-extractor. Revisa el documento antes de enviarlo; puedes quitar esa bici y volver a añadirla tras recargar la página.

**Se me olvida qué bicis llevo añadidas:** el badge "🔀 Comparador (n/4)" siempre muestra el recuento; ábrelo en cualquier momento para ver la lista completa sin perder el progreso.

**Tras actualizar el script sigo viendo el comportamiento antiguo:** cierra del todo la pestaña de Trek y ábrela de nuevo (ver sección "Importante" más arriba).
