# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este repo

Frontend del **Biométrico SaaS** (control de asistencia multi-cliente: academias y empresas). Este repo es la **única versión** del SaaS: se publica con GitHub Pages en `https://movedancea-spec.github.io/biometrico-clientes/`.

- Sitio estático, sin build ni tests. Se edita el HTML/CSS/JS directamente.
- Todo habla con el Worker `https://biometrico-saas.movedancea.workers.dev` (código en `~/biometrico-saas`, base D1 propia). **No comparte Airtable ni Worker con el Portal de Alumnas de MOVE.**
- `academias.tipo_cliente` (`"academia"` o `"empresa"`) cambia textos (ver `bio-textos.js`) y funciones (clases del mes, entrada/salida). El Worker lo devuelve como `tipoCliente`.

## Páginas

- `dueno.html`/`.js` — panel del dueño del SaaS (Ana): alta y gestión de clientes.
- `academia.html`/`.js` — panel de cada cliente: personas, fotos, asistencias.
- `biometrico.html`/`.js` — kiosko de entrada para dejar fijo en una tablet.
- `portal.html`/`.js` + `portal-sw.js` — Portal de Alumnos para papás/empleados: historial de asistencia y avisos push de llegada.
- `biometrico-style.css` — estilos compartidos por todas.
- `bio-textos.js` — diccionario de los textos que cambian según `tipoCliente` (academia: alumno, Portal de Alumnos, papás…; empresa: colaborador, Portal de Colaboradores). Para una empresa ningún texto visible puede decir alumno, academia, papá, familia, clase ni empleado. Los textos fijos del HTML se marcan con `data-texto` / `data-texto-html` / `data-texto-placeholder` y se llenan con `bioTextos.aplicar`. Lo prueba `pruebas/textos.sh` en el backend.
- `bio-modulos-panel.js` / `bio-modulos-portal.js` — módulos de academia (Fase 2: clases, asistencias del mes, avisos) en el panel y en el portal. `bio-modulos-panel.js` también arranca los de la Fase 3: `bio-modulos-show.js`, `bio-modulos-trajes.js` y `bio-modulos-mensualidades.js`; en el portal van en `bio-modulos-portal-cuentas.js`. El módulo pagos (Fase 4) va en `bio-modulos-pagos.js` (panel) y `bio-modulos-portal-pagos.js` (portal). `bio-modulos-comun.js` tiene lo compartido (dinero en centavos, meses, fechas de Guatemala, CSV, responsable, modal). Se cargan antes de `academia.js` / `portal.js` y usan sus funciones. Solo se muestran si el dueño activó el módulo para esa academia (y el Worker los rechaza si está apagado). El prefijo `bio-` es para no chocar con archivos del Portal de MOVE.

## Arquitectura actual (resumen; el detalle del backend está en ~/biometrico-saas/CLAUDE.md)

- **Reglas:** solo se trabaja aquí y en `~/biometrico-saas`. Nunca tocar `portalpapasMOVE` ni `academiamovedance.com`. Nunca hacer `git push` de este repo ni deploy: lo hace Ana (aquí solo commit). No tocar el cobro del SaaS (panel "💳 Mensualidad" del cliente) salvo lo pedido.
- **Sesiones:** cada página guarda su token en `localStorage` (no contraseñas). Las fotos vienen con URL firmada del Worker.
- **Portal:** se entra con el link `portal.html?a=<código público>` (los viejos `?academia=<id>` siguen sirviendo) + código del alumno + PIN.
- **Módulos de academia** (`bio-modulos-*.js`): clases y asistencias del mes, avisos, show, trajes (catálogo y vínculos), mensualidades por alumno y pagos. Solo para `tipoCliente = "academia"` y solo si el dueño los activó.
- **Pagos de las familias:** dos opciones no excluyentes, tarjeta (Paggo, monto exacto) y transferencia o depósito con comprobante. Si están las dos, "Pagar" deja elegir.
- **Textos por tipo:** todo texto que cambia entre academia y empresa va en `bio-textos.js` (para empresas: colaborador, empresa; nunca alumno, academia, papá, familia, clase ni empleado).
- **Período de prueba:** el panel del cliente muestra los días que le quedan (aviso destacado en la última semana) y el dueño ve "En prueba (N días)" con un filtro.

## Actualización automática

Cada JS tiene `VERSION_APP` y revisa `version.txt` para recargarse solo cuando se sube algo nuevo. Al cambiar cualquier JS, pon el mismo valor nuevo en `VERSION_APP` de los 4 JS **y** en `version.txt`, y sube el `?v=` de los archivos tocados en el HTML (los `bio-modulos-*.js` no tienen `VERSION_APP` propio: llevan en su `?v=` el mismo valor). Si cambia `biometrico-style.css`, sube su `?v=` en los 4 HTML.

## Regla: nunca compartir nombres de archivo con el Portal de MOVE

El Portal de Alumnas de MOVE vive en otro repo (`movedancea-spec/portalpapasMOVE`, `academiamovedance.com`) y también tiene un `portal.js`. El 22 de agosto de 2026, una copia vieja de este SaaS que vivía en ese repo quedó rota porque un "Update portal.js" subido desde la web de GitHub pisó el `portal.js` del SaaS con el de MOVE.

- Nunca copies archivos de este repo a `portalpapasMOVE` ni al revés.
- Si alguna vez algo tiene que convivir en el mismo sitio, usa nombres que no existan en el otro producto.

En `academiamovedance.com`, `portal.html`, `biometrico.html`, `academia.html` y `dueno.html` son solo redirecciones a este sitio, para que los links viejos sigan funcionando.
