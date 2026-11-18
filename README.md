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
