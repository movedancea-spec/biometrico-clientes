# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este repo

Frontend del **Biométrico SaaS** (control de asistencia multi-cliente: academias y empresas). Este repo es la **única versión** del SaaS: se publica con GitHub Pages en `https://movedancea-spec.github.io/biometrico-clientes/`.

- Sitio estático, sin build ni tests. Se edita el HTML/CSS/JS directamente.
- Todo habla con el Worker `https://biometrico-saas.movedancea.workers.dev` (código en `~/biometrico-saas`, base D1 propia). **No comparte Airtable ni Worker con el Portal de Alumnas de MOVE.**
- `academias.tipo_cliente` (`"academia"` o `"empresa"`) cambia textos y funciones (alumnos/empleados, clases del mes, entrada/salida). El Worker lo devuelve como `tipoCliente`.

## Páginas

- `dueno.html`/`.js` — panel del dueño del SaaS (Ana): alta y gestión de clientes.
- `academia.html`/`.js` — panel de cada cliente: personas, fotos, asistencias.
- `biometrico.html`/`.js` — kiosko de entrada para dejar fijo en una tablet.
- `portal.html`/`.js` + `portal-sw.js` — Portal de Alumnos para papás/empleados: historial de asistencia y avisos push de llegada.
- `biometrico-style.css` — estilos compartidos por todas.
- `bio-modulos-panel.js` / `bio-modulos-portal.js` — módulos de academia (Fase 2: clases, asistencias del mes, avisos) en el panel y en el portal. Se cargan antes de `academia.js` / `portal.js` y usan sus funciones. Solo se muestran si el dueño activó el módulo para esa academia (y el Worker los rechaza si está apagado). El prefijo `bio-` es para no chocar con archivos del Portal de MOVE.

## Actualización automática

Cada JS tiene `VERSION_APP` y revisa `version.txt` para recargarse solo cuando se sube algo nuevo. Al cambiar cualquier JS, pon el mismo valor nuevo en `VERSION_APP` de los 4 JS **y** en `version.txt`, y sube el `?v=` de los archivos tocados en el HTML (los `bio-modulos-*.js` no tienen `VERSION_APP` propio: llevan en su `?v=` el mismo valor). Si cambia `biometrico-style.css`, sube su `?v=` en los 4 HTML.

## Regla: nunca compartir nombres de archivo con el Portal de MOVE

El Portal de Alumnas de MOVE vive en otro repo (`movedancea-spec/portalpapasMOVE`, `academiamovedance.com`) y también tiene un `portal.js`. El 22 de agosto de 2026, una copia vieja de este SaaS que vivía en ese repo quedó rota porque un "Update portal.js" subido desde la web de GitHub pisó el `portal.js` del SaaS con el de MOVE.

- Nunca copies archivos de este repo a `portalpapasMOVE` ni al revés.
- Si alguna vez algo tiene que convivir en el mismo sitio, usa nombres que no existan en el otro producto.

En `academiamovedance.com`, `portal.html`, `biometrico.html`, `academia.html` y `dueno.html` son solo redirecciones a este sitio, para que los links viejos sigan funcionando.
