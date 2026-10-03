# Pendientes para la Fase 1c

**Estado (2 de octubre de 2026):** los puntos 1 a 4 se hicieron en la
**parte 1** (backend `2fe67d0`; frontend en el commit siguiente a
`1ef7ab2`). Siguen pendientes el 5, los recordatorios del final y el 6
(parte 2).

Cambios de backend (`~/biometrico-saas`) que quedaron pendientes al pasar el
frontend a tokens en la Fase 1b, y lo que hay que ajustar aquí cuando estén.

## 1. Endpoint de marca para el kiosko (con token) — ✅ hecho (parte 1)

- **Hoy:** la tablet ya no refresca sola su color y su logo. Antes llamaba
  `academiaLogin` con la clave guardada cada 3 minutos; con token no hay ningún
  endpoint que una sesión de `kiosko` pueda usar para leerlos. Los cambios de
  marca se ven al volver a iniciar sesión en la tablet.
- **Backend:** una acción (por ejemplo `kioskoConsultarMarca`) que acepte la
  sesión de kiosko (`permitirKiosko: true`) y devuelva `colorMarca`, `logoKey`,
  `nombre` y `tipoCliente`.
- **Frontend:** en `biometrico.js`, volver a refrescar la marca en silencio
  cada pocos minutos con esa acción (ver el comentario en `mostrarTeclado`).

## 2. Recuperación del portal con academiaId + código — ✅ hecho (parte 1)

- **Hoy:** `portalSolicitarRecuperacion` pide `alumnaId`, que el portal ya no
  conoce porque no usa la lista de nombres. Por eso se escondió "Olvidé mi
  contraseña" y se muestra "Pídele a tu academia que te genere un PIN nuevo".
  La pantalla `?recuperar=` sigue funcionando.
- **Backend:** que `portalSolicitarRecuperacion` acepte `academiaId` + `codigo`
  + `email`, con la misma respuesta genérica y el mismo límite de intentos.
- **Frontend:** en `portal.js`/`portal.html`, volver a poner el paso 1 de
  recuperación en la pantalla de login (ver `btnOlvidePin`).

## 3. Endpoint público de marca para la pantalla de login — ✅ hecho (parte 1)

- **Hoy:** la pantalla de login del portal sale con los colores por defecto,
  salvo que en ese dispositivo ya haya un hermano de esa academia. Antes el
  color y el logo venían de `portalListarAlumnas`.
- **Backend:** una acción pública (por ejemplo `portalMarcaAcademia`) que, con
  `academiaId`, devuelva **solo** `nombre`, `colorMarca`, `logoKey` y
  `tipoCliente`. Sin lista de alumnos.
- **Frontend:** llamarla en `mostrarLogin` de `portal.js`.

## 4. Que academiaActualizarMarca devuelva el logoKey nuevo — ✅ hecho (parte 1)

- **Hoy:** después de subir un logo, el panel muestra la vista previa y avisa
  que el logo se verá en el panel y en la tablet la próxima vez que inicien
  sesión. Antes se hacía login otra vez con la clave para conocer la key.
- **Backend:** que `academiaActualizarMarca` responda `{ success, colorMarca, logoKey }`.
- **Frontend:** en `academia.js` (`btnGuardarMarca`), guardar `sesion.logoKey`
  con lo que responda y quitar el aviso.

## 5. Quitar el respaldo de fotos sin firma

- **Hoy:** si el Worker manda `fotoUrl`/`fotoVerificacionUrl`/`comprobanteUrl`
  en `null` (por ejemplo, si falta el secret `FIRMA_URLS`), el frontend arma la
  URL sin firma con la key, como antes.
- **Backend:** encender `FOTO_REQUIERE_FIRMA = "true"` y confirmar que
  `FIRMA_URLS` está configurado en producción.
- **Frontend:** buscar `quitar en Fase 1c` en los JS y dejar solo la URL
  firmada (`academia.js`, `biometrico.js`, `portal.js`, `dueno.js`).

## 6. Parte 2: código público de academia para el link del portal

- **Hoy:** el link del portal es `portal.html?academia=<id>` con el id
  numérico. Cualquiera puede probar 1, 2, 3… y ver el nombre, color y logo
  de cada academia (`portalMarcaAcademia`) y probar códigos de alumno en
  `portalLoginCodigo` contra cada una.
- **Backend:**
  - Columna nueva en `academias` (migración), por ejemplo `codigo_publico`:
    aleatoria, no adivinable (por ejemplo 12+ caracteres base62 de
    `crypto.getRandomValues`), `UNIQUE`. Llenarla para las academias que ya
    existen y generarla en `duenoCrearAcademia`.
  - `portalMarcaAcademia` y `portalLoginCodigo` aceptan ese código (además
    de `academiaId`). `portalSolicitarRecuperacion` también, para que el
    portal nunca necesite el id numérico.
  - El login del portal y `academiaLogin` devuelven el código para que el
    frontend arme el link.
  - Los links viejos con `?academia=<id>` **siguen funcionando** hasta que
    Ana decida apagarlos (no se quitan en la parte 2).
- **Frontend:**
  - `portal.js` lee `?a=<codigo>` (y sigue aceptando `?academia=<id>`).
  - El panel de academia muestra el link nuevo (`?a=<codigo>`) para
    compartir, en lugar del de `?academia=<id>`.

## Recordatorios de la 1c que ya estaban en el backend

- Quitar `portalListarAlumnas` (ya no lo usa el frontend).
- Quitar el camino viejo (contraseña en cada petición). Antes de hacerlo,
  confirmar en la tabla `sesiones` que cada dispositivo activo ya tiene token,
  sobre todo la tablet del kiosko. La migración usa los logins
  (`duenoLogin`, `academiaLogin`, `portalLoginCodigo`), que siguen existiendo
  en la 1c. Aun así, un dispositivo que se abra por primera vez después de
  quitar el camino viejo puede recibir un 401 en su primera llamada, antes de
  que termine la migración, y volver al login.
- `portalLogin` (por `alumnaId`) solo se usa para migrar alumnos guardados sin
  `academiaId`. Si se quita, esos alumnos tendrán que volver a entrar.
