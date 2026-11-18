# Fieldnote

Tablero personal para seguir parlays NFL con estadísticas de ESPN. Incluye edición de parlays, resumen de selecciones, respaldos, tipografía Tomorrow y animaciones de cambios de datos y estados.

**Sitio publicado:** https://fieldnote-89i.pages.dev/

**Repositorio privado:** https://github.com/jhmore273/fieldnote

## Trabajar desde otra computadora

Instala Git y Node.js 22 o posterior e inicia sesión en tu cuenta de GitHub para acceder al repositorio privado.

```sh
git clone https://github.com/jhmore273/fieldnote.git
cd fieldnote
npm ci
npm run dev
```

Abre http://127.0.0.1:5173. El proyecto no necesita claves ni dependencias externas de npm.

Los archivos de la aplicación están en `public/`. El servidor recarga los archivos al actualizar la página del navegador.

## Guardar y compartir cambios

Antes de comenzar a trabajar, descarga los cambios más recientes:

```sh
git pull --ff-only
```

Después de editar:

```sh
npm test
npm run build
git add public scripts tests package.json package-lock.json README.md
git commit -m "Describe el cambio realizado"
git push
```

La rama principal es `main`. Si hay cambios locales sin guardar, guárdalos antes de descargar los de otra computadora.

## Publicación automática en Cloudflare Pages

El proyecto de Pages `fieldnote` ya está conectado a este repositorio y publica la rama `main` en https://fieldnote-89i.pages.dev/. Para reconstruir esa conexión en otra cuenta, utiliza estos pasos:

1. En Cloudflare, abre Workers & Pages y crea una aplicación de **Pages** usando un repositorio de GitHub.
2. Conecta la cuenta `jhmore273` y autoriza el acceso al repositorio privado `fieldnote`.
3. Selecciona el repositorio y utiliza esta configuración:

| Campo | Valor |
| --- | --- |
| Rama de producción | `main` |
| Framework | None / Ninguno |
| Directorio raíz | Raíz del repositorio, sin subcarpeta |
| Comando de compilación | `npm run build` |
| Directorio de salida | `dist` |

4. Guarda y despliega. Cloudflare asignará al proyecto nuevo su propia dirección `pages.dev`.
5. Los siguientes cambios publicados en `main` se desplegarán automáticamente.

No se necesitan variables de entorno para esta versión. El sitio anterior `fieldn0te.pages.dev` es un proyecto distinto y puede conservarse mientras se verifica el nuevo.

Documentación oficial: [Integración con GitHub](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/) y [proyectos creados por subida directa](https://developers.cloudflare.com/pages/get-started/direct-upload/).

## Datos personales

GitHub almacena el código y su historial. Los parlays se guardan en el almacenamiento del navegador; no se sincronizan entre computadoras.

Para llevarlos a la nueva dirección o a otro dispositivo, utiliza **Configuración → Exportar respaldo** en el sitio original e **Importar respaldo** en el destino. No subas esos archivos personales al repositorio.

## Comprobaciones

```sh
npm test
npm run build
```

Las pruebas verifican estados y resúmenes de selecciones, edición sin duplicados, conservación de datos al fallar el guardado, actualización de estadísticas y decisiones de animación.

El diseño funciona sin descargar fuentes externas: Tomorrow y su licencia OFL están en `public/fonts/`. Los datos deportivos requieren conexión con ESPN. La fuente de datos puede tener retrasos o no estar disponible; las condiciones de seguimiento son provisionales.

### Notificaciones PWA

El sitio registra `public/sw.js` sin caché de páginas para recibir Web Push. En Configuración puedes activar, probar (10 segundos) y borrar la suscripción. En iPhone se requiere abrir desde la pantalla de inicio y aceptar el permiso.

El Worker `fieldnote-push` se publica aparte con `npx wrangler deploy`. Usa Durable Objects SQLite por dispositivo y alarmas; no requiere mantener una pestaña abierta. Los secretos `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` están en Cloudflare, nunca en Git. Conserva las claves: rotarlas requiere volver a suscribir los dispositivos. Los despliegues de Pages continúan desde GitHub; cambios al Worker se publican con Wrangler.

Se sincronizan identificadores de partidos (hasta 40 por dispositivo), suscripción, selecciones numéricas de jugadores (hasta 100: identificador, nombre, mercado, lado y línea) y estados para evitar avisos duplicados. Se eliminan al desactivar; la suscripción expira tras 90 días sin sincronizar. El servicio consulta ESPN cada minuto durante partidos y cada cinco minutos en espera: avisa dentro de los 15 minutos anteriores al comienzo y al terminar. También avisa una sola vez cuando un jugador supera estrictamente una línea over de yardas, recepciones, pases completos, intentos de carrera, pases de touchdown o intercepciones. No interpreta un empate con la línea como acierto, ni envía avisos de under, Money Line o pago anticipado. Se marca provisional por posibles correcciones. Abrir de nuevo la PWA sincroniza las selecciones de suscripciones existentes. No se envían importes. Retrasos de ESPN, conexión o ajustes del teléfono pueden retrasar la entrega. Las alarmas y almacenamiento están sujetos al plan de Cloudflare.

Los parlays siguen guardados en el navegador. La suscripción no sincroniza parlays entre dispositivos. Si tienes datos en otro dominio, expórtalos e impórtalos en el dominio actual antes de activar.

### Reglas de notificación por pick

Se sincronizan hasta 100 selecciones de los 15 mercados y hasta 40 parlays completos. Se usa el mismo evaluador del tablero (generado desde app.js al compilar). Money Line: +17 si está habilitado o victoria final; spread: cobertura final; totales: cruce over o límite under rebasado, con under favorable confirmado al final; yardas, pases completos, intentos, recepciones y goles de campo: hitos 25/50/75 y cruce estricto para overs. En unders, los hitos representan consumo del límite, no aciertos. Pases de TD, intercepciones y TD anytime: aumentos. Primer anotador: primer touchdown confirmado, sí/no; un gol de campo no decide este mercado.

Por consulta se agrupan los aumentos simultáneos y se envía solo el hito más alto. Los avisos aceptados se deduplican incluso después de correcciones. Se reintentan fallos de envío. La finalización genérica por partido se sustituye por un cierre por parlay, solo tras completar todos sus encuentros. Si hay empates se indica push; si faltan estadísticas, se espera. No se notifican retrospectivamente parlays que ya estaban terminados al sincronizarse. Los porcentajes locales no se publican como parte de este cambio.

### Pruebas por pick en Configuración

El selector usa `public/notification-test-cases.json`, compartido por cliente y Worker. Contiene ejemplos para los 15 mercados y variantes de progreso, under, primer anotador y cierre de parlay. Se programa un solo aviso a los 10 segundos, con límite de una prueba cada 30 segundos por dispositivo. El servidor solo admite identificadores del catálogo; no acepta mensajes arbitrarios. Todos los avisos están marcados `[PRUEBA]` y no escriben en los estados de progreso, resultados o deduplicación de picks reales. El estado de entrega de pruebas se registra por separado para que un aviso real concurrente no dé una falsa confirmación.

### Retraso para evitar spoilers

Todos los avisos reales pasan por una cola persistente del dispositivo con vencimiento mínimo de 60 segundos desde que se detectan. Incluye avances, anotaciones, Money Line, spread, inicio de partido y resultado del parlay. El retraso se suma al intervalo de consulta de ESPN y a los tiempos de entrega del sistema. Las pruebas simuladas mantienen los 10 segundos. La alarma toma el vencimiento más cercano entre cola, pruebas y próxima consulta. Los fallos se reintentan a los 30 segundos sin crear otro aviso; eliminar o editar el pick, eliminar el parlay o desactivar notificaciones invalida los avisos pendientes correspondientes.
