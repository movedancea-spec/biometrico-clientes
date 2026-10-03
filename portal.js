// =====================================================================
// BIOMÉTRICO — Portal de Alumnos (papás)
// =====================================================================
// IMPORTANTE: cambia esta URL por la de TU Worker una vez publicado en
// Cloudflare — debe ser la MISMA URL que pusiste en academia.js y
// dueno.js. Sin "/" al final.
const API_URL = "https://biometrico-saas.movedancea.workers.dev";

// Se actualiza solo, en automático, cada vez que se sube una versión
// nueva de los archivos — ver verificarActualizacion() al final de
// este archivo. NO cambiar este valor a mano: lo actualiza el script
// actualizar-versiones.mjs cada vez que algo cambia.
const VERSION_APP = "74da08c454b1";

const el = (id) => document.getElementById(id);

// Cada alumno agregado en ESTE dispositivo se guarda aquí (localStorage)
// con SU propio token de sesión (portalLoginCodigo) — así un mismo
// teléfono puede tener varios hermanos a la vez, cada uno con su
// sesión. La contraseña/PIN ya NO se guarda: "clave" solo existe en
// alumnos agregados antes de los tokens, mientras se migran (ver
// migrarSesionesViejas).
let alumnasGuardadas = [];   // [{alumnaId, token, expiraEn, nombre, codigo, fotoKey, fotoUrl, fotoUrlEn, clasesPorMes, academiaId, academiaNombre, colorMarca, logoKey, tipoCliente}]
let alumnaActivaId = null;   // cuál de las de arriba se está viendo ahora
let academiaIdLogin = null;  // academia de la pantalla de login (viene del link ?academia=ID o de un hermano)

function alumnaActiva() {
  return alumnaActivaId ? alumnasGuardadas.find((a) => a.alumnaId === alumnaActivaId) : null;
}

// "entrada" es el alumno cuya sesión se usa — por defecto el que se
// está viendo. Se pasa explícito al cerrar sesión de todos los hermanos.
async function llamar(accion, datos, entrada = alumnaActiva()) {
  const headers = { "Content-Type": "application/json" };
  if (entrada?.token) headers.Authorization = `Bearer ${entrada.token}`;
  const extra = !entrada?.token && entrada?.clave ? { alumnaId: entrada.alumnaId, clave: entrada.clave } : {};
  const resp = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ accion, ...extra, ...datos }),
  });
  const r = await resp.json();
  if (resp.status === 401 && entrada && accion !== "cerrarSesion") sesionTerminada(entrada);
  if (resp.status === 429) r.error = textoBloqueo(r.reintentarEnSegundos);
  return r;
}

// ---------------------------------------------------------------
// DEMASIADOS INTENTOS (429) — el Worker dice cuántos segundos faltan
// (reintentarEnSegundos). En el login se deja el botón apagado con una
// cuenta regresiva para que se vea cuánto falta.
// ---------------------------------------------------------------
function textoEspera(segundos) {
  const s = Math.max(0, Math.ceil(Number(segundos) || 0));
  const m = Math.floor(s / 60);
  return m ? `${m} min ${String(s % 60).padStart(2, "0")} s` : `${s} s`;
}

function textoBloqueo(segundos) {
  return `Demasiados intentos fallidos. Podrás intentar de nuevo en ${textoEspera(segundos)}.`;
}

let intervaloBloqueoLogin = null;
function mostrarBloqueoLogin(segundos) {
  clearInterval(intervaloBloqueoLogin);
  const hasta = Date.now() + (Number(segundos) || 60) * 1000;
  const pintar = () => {
    const faltan = (hasta - Date.now()) / 1000;
    if (faltan <= 0) {
      clearInterval(intervaloBloqueoLogin);
      el("mensajeErrorEntrarPortal").textContent = "Ya puedes volver a intentarlo.";
      el("btnEntrarPortal").disabled = false;
      return;
    }
    el("mensajeErrorEntrarPortal").textContent = textoBloqueo(faltan);
    el("btnEntrarPortal").disabled = true;
  };
  pintar();
  intervaloBloqueoLogin = setInterval(pintar, 1000);
}

function escaparHtml(t) {
  const d = document.createElement("div");
  d.textContent = t == null ? "" : String(t);
  return d.innerHTML;
}

// Solo para el logo (que sigue siendo público) y para el respaldo de
// urlFotoAlumna(). La foto del alumno viene ya firmada (fotoUrl).
function urlFoto(fotoKey) {
  return fotoKey ? `${API_URL}/foto?key=${encodeURIComponent(fotoKey)}` : "";
}

// Las URLs firmadas duran 1 hora. La que quedó guardada en el teléfono
// solo se usa si es reciente; si no, se espera a la nueva que manda
// portalConsultarAlumna al abrir el panel.
const MS_URL_FOTO_VIGENTE = 45 * 60 * 1000;

function urlFotoAlumna(entrada) {
  if (!entrada.fotoKey) return "";
  // Respaldo sin firma si el Worker no manda fotoUrl — quitar en Fase 1c.
  if (!entrada.fotoUrl) return urlFoto(entrada.fotoKey);
  return Date.now() - (entrada.fotoUrlEn || 0) < MS_URL_FOTO_VIGENTE ? entrada.fotoUrl : "";
}

function formatearFechaHora(fechaSql) {
  try {
    const fecha = new Date(String(fechaSql).replace(" ", "T") + "Z");
    return fecha.toLocaleString("es-GT", {
      timeZone: "America/Guatemala",
      day: "numeric", month: "short", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  } catch (e) {
    return fechaSql;
  }
}

const NOMBRES_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function formatearMes(mesTexto) {
  const [anio, mes] = String(mesTexto).split("-").map(Number);
  return `${NOMBRES_MES[mes - 1] || mesTexto} ${anio}`;
}

// El "mes en curso" de los 2 historiales de abajo (asistencias y
// entradas) siempre se calcula con la hora de Guatemala (UTC-6), igual
// que el corte de mes del lado del servidor — así lo que el papá ve
// como "este mes" siempre coincide con lo que cuenta worker.js, sin
// importar en qué zona horaria esté el teléfono/computadora.
function mesGuatemalaActualCliente() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guatemala", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  const anio = partes.find((p) => p.type === "year").value;
  const mes = partes.find((p) => p.type === "month").value;
  return `${anio}-${mes}`;
}
function mesGuatemalaDeFecha(fechaSql) {
  const fecha = new Date(String(fechaSql).replace(" ", "T") + "Z");
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guatemala", year: "numeric", month: "2-digit",
  }).formatToParts(fecha);
  const anio = partes.find((p) => p.type === "year").value;
  const mes = partes.find((p) => p.type === "month").value;
  return `${anio}-${mes}`;
}

// ---------------------------------------------------------------
// Colores de marca — igual que en academia.js/biometrico.js, así el
// portal se ve "vestido" con el color y el logo de CADA academia.
// ---------------------------------------------------------------
function hexARgb(hex) {
  const limpio = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(limpio.substr(i, 2), 16));
}
function rgbAHex(rgb) {
  return "#" + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("");
}
function mezclarConBlanco(hex, porcentaje) {
  return rgbAHex(hexARgb(hex).map((c) => c + (255 - c) * porcentaje));
}
function oscurecer(hex, porcentaje) {
  return rgbAHex(hexARgb(hex).map((c) => c * (1 - porcentaje)));
}
// El icono que queda en la pantalla de inicio del celular cuando
// "instalan" el portal (Agregar a pantalla de inicio) — por defecto
// el navegador pone una "P" gris genérica (de "Portal"). Esto lo
// cambia por un cuadrito del color de marca de la academia, para que
// se vea igual de personalizado que el resto del portal. El dibujo
// en sí lo genera el Worker (ver /icono-color.png en worker.js) —
// aquí solo se apunta el <link> a esa URL con el color que toque.
function aplicarIconoInstalacion(colorMarca) {
  const esValido = colorMarca && /^#[0-9a-fA-F]{6}$/.test(colorMarca);
  const color = esValido ? colorMarca.replace("#", "") : "9c7b4f"; // bronce por defecto, igual que el resto del portal
  // "&v=VERSION_APP" es lo que hace que el navegador SÍ vuelva a pedir
  // el ícono cuando de verdad cambia (por ejemplo, cuando le agregamos
  // la letra "P" encima del color): como este archivo se cachea 30
  // días para que cargue rápido, sin este número de versión en la URL
  // el navegador se hubiera quedado usando para siempre la primera
  // imagen que pidió, aunque el dibujo del ícono cambiara después.
  const urlIcono = `${API_URL}/icono-color.png?color=${color}&v=${VERSION_APP}`;

  let iconoApple = document.querySelector('link[rel="apple-touch-icon"]');
  if (!iconoApple) {
    iconoApple = document.createElement("link");
    iconoApple.rel = "apple-touch-icon";
    document.head.appendChild(iconoApple);
  }
  iconoApple.href = urlIcono;

  let iconoNormal = document.querySelector('link[rel="icon"]');
  if (!iconoNormal) {
    iconoNormal = document.createElement("link");
    iconoNormal.rel = "icon";
    document.head.appendChild(iconoNormal);
  }
  iconoNormal.href = urlIcono;

  let temaColor = document.querySelector('meta[name="theme-color"]');
  if (!temaColor) {
    temaColor = document.createElement("meta");
    temaColor.name = "theme-color";
    document.head.appendChild(temaColor);
  }
  temaColor.content = esValido ? colorMarca : "#9c7b4f";
}

function aplicarMarca(colorMarca) {
  const raiz = document.documentElement.style;
  ["--color-marca", "--color-marca-oscuro", "--color-marca-suave", "--color-marca-suave2",
    "--color-marca-suave3", "--color-marca-fondo", "--color-marca-fondo2", "--color-marca-fondo3",
    "--color-marca-texto-suave", "--color-marca-texto-suave2"].forEach((v) => raiz.removeProperty(v));

  aplicarIconoInstalacion(colorMarca);

  if (!colorMarca || !/^#[0-9a-fA-F]{6}$/.test(colorMarca)) return;

  raiz.setProperty("--color-marca", colorMarca);
  raiz.setProperty("--color-marca-oscuro", oscurecer(colorMarca, 0.15));
  raiz.setProperty("--color-marca-suave", mezclarConBlanco(colorMarca, 0.88));
  raiz.setProperty("--color-marca-suave2", mezclarConBlanco(colorMarca, 0.82));
  raiz.setProperty("--color-marca-suave3", mezclarConBlanco(colorMarca, 0.75));
  raiz.setProperty("--color-marca-fondo", mezclarConBlanco(colorMarca, 0.96));
  raiz.setProperty("--color-marca-fondo2", mezclarConBlanco(colorMarca, 0.94));
  raiz.setProperty("--color-marca-fondo3", mezclarConBlanco(colorMarca, 0.92));
  raiz.setProperty("--color-marca-texto-suave", oscurecer(colorMarca, 0.25));
}
function aplicarLogoEnHeader(logoKey) {
  const img = el("logoPortalAcademia");
  if (logoKey) { img.src = urlFoto(logoKey); img.hidden = false; }
  else { img.hidden = true; }
}

// ---------------------------------------------------------------
// Guardar / cargar los alumnos de este dispositivo
// ---------------------------------------------------------------
function guardarAlumnasEnDisco() {
  localStorage.setItem("biometrico_portal_alumnas", JSON.stringify(alumnasGuardadas));
  localStorage.setItem("biometrico_portal_alumna_activa", alumnaActivaId || "");
}
function cargarAlumnasDeDisco() {
  try {
    alumnasGuardadas = JSON.parse(localStorage.getItem("biometrico_portal_alumnas") || "[]");
  } catch (e) {
    alumnasGuardadas = [];
  }
  // localStorage lo devuelve como texto y los alumnaId son números.
  alumnaActivaId = Number(localStorage.getItem("biometrico_portal_alumna_activa")) || null;
  if (!alumnasGuardadas.some((a) => a.alumnaId === alumnaActivaId)) {
    alumnaActivaId = alumnasGuardadas[0]?.alumnaId || null;
  }
}
function alumnasConNotificacionesActivas() {
  try {
    return new Set(JSON.parse(localStorage.getItem("biometrico_portal_push_activas") || "[]"));
  } catch (e) {
    return new Set();
  }
}
function guardarAlumnasConNotificacionesActivas(set) {
  localStorage.setItem("biometrico_portal_push_activas", JSON.stringify([...set]));
}

// ---------------------------------------------------------------
// PANTALLAS DE ENTRADA
// ---------------------------------------------------------------
// Se entra con el código del alumno + su PIN del portal, dentro de la
// academia que viene en el link "portal.html?academia=ID" (el que cada
// academia comparte con sus papás desde su panel). Ya no hay lista de
// nombres ni buscador de academias: sin ese link no se sabe a qué
// academia pertenece el código, así que se pide abrir el link.
const MENSAJE_SESION_VENCIDA = "La sesión terminó. Vuelve a entrar con el código y el PIN.";

function ocultarPantallas() {
  el("pantallaSinEnlace").hidden = true;
  el("pantallaLoginPortal").hidden = true;
  el("pantallaRestablecerPortal").hidden = true;
  el("pantallaPortalPanel").hidden = true;
}

function mostrarPantallaSinEnlace() {
  ocultarPantallas();
  aplicarMarca(null);
  aplicarLogoEnHeader(null);
  el("pantallaSinEnlace").hidden = false;
}

function mostrarLogin(academiaId, mensaje) {
  if (!academiaId) { mostrarPantallaSinEnlace(); return; }
  academiaIdLogin = Number(academiaId);

  // Si en este dispositivo ya hay un hermano de esa misma academia, la
  // pantalla sale de una vez con su color y su logo; si no, con los de
  // por defecto (no hay forma pública de pedirlos sin iniciar sesión —
  // pendiente para la Fase 1c).
  const hermano = alumnasGuardadas.find((a) => Number(a.academiaId) === academiaIdLogin);
  aplicarMarca(hermano?.colorMarca || null);
  aplicarLogoEnHeader(hermano?.logoKey || null);
  const esEmpresa = hermano?.tipoCliente === "empresa";
  el("subtituloLoginPortal").textContent = hermano?.academiaNombre
    ? `Escribe el código ${esEmpresa ? "del empleado" : "de tu hijo"} en ${hermano.academiaNombre} y su PIN del portal.`
    : "Escribe el código del alumno y su PIN del portal.";

  el("inputPortalCodigo").value = "";
  el("inputPortalClave").value = "";
  el("textoOlvidePin").hidden = true;
  el("mensajeErrorEntrarPortal").textContent = mensaje || "";
  el("btnVolverPanelPortal").hidden = !alumnasGuardadas.length;

  ocultarPantallas();
  el("pantallaLoginPortal").hidden = false;
}

// Datos que se guardan de cada alumno a partir de la respuesta de
// portalLoginCodigo (o de portalLogin, al migrar una sesión vieja).
function entradaDesdeLogin(r) {
  return {
    alumnaId: r.alumnaId, token: r.token, expiraEn: r.expiraEn,
    nombre: r.nombre, codigo: r.codigo, fotoKey: r.fotoKey,
    fotoUrl: r.fotoUrl || null, fotoUrlEn: Date.now(),
    clasesPorMes: r.clasesPorMes, academiaId: r.academiaId, academiaNombre: r.academiaNombre,
    colorMarca: r.colorMarca, logoKey: r.logoKey,
    tipoCliente: r.tipoCliente || "academia",
  };
}

async function entrarPortal() {
  const codigo = Number(el("inputPortalCodigo").value.trim());
  const clave = el("inputPortalClave").value.trim();
  el("mensajeErrorEntrarPortal").textContent = "";
  if (!codigo) { el("mensajeErrorEntrarPortal").textContent = "Escribe el código del alumno."; return; }
  if (!clave) { el("mensajeErrorEntrarPortal").textContent = "Escribe el PIN."; return; }

  el("btnEntrarPortal").disabled = true;
  let bloqueado = false;
  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "portalLoginCodigo", academiaId: academiaIdLogin, codigo, clave }),
    });
    const r = await resp.json();

    if (resp.status === 429) {
      bloqueado = true;
      mostrarBloqueoLogin(r.reintentarEnSegundos);
      return;
    }
    if (!r.success) {
      el("mensajeErrorEntrarPortal").textContent = r.error || "No se pudo entrar.";
      return;
    }

    const entrada = entradaDesdeLogin(r);
    alumnasGuardadas = alumnasGuardadas.filter((a) => a.alumnaId !== entrada.alumnaId);
    alumnasGuardadas.push(entrada);
    alumnaActivaId = entrada.alumnaId;
    guardarAlumnasEnDisco();
    el("inputPortalClave").value = "";
    ajustarInterfazPortalSegunTipo();

    mostrarPanel();
  } catch (e) {
    el("mensajeErrorEntrarPortal").textContent = "No se pudo conectar. Revisa tu conexión.";
  } finally {
    el("btnEntrarPortal").disabled = bloqueado;
  }
}

el("btnEntrarPortal").addEventListener("click", entrarPortal);
el("inputPortalClave").addEventListener("keydown", (e) => { if (e.key === "Enter") entrarPortal(); });

// "Olvidé mi PIN": por ahora la recuperación por correo necesita el id
// interno del alumno, que ya no se conoce sin la lista de nombres
// (pendiente para la Fase 1c) — mientras tanto, la academia le genera
// un PIN nuevo desde su panel.
el("btnOlvidePin").addEventListener("click", () => {
  el("textoOlvidePin").hidden = !el("textoOlvidePin").hidden;
});

el("btnVolverPanelPortal").addEventListener("click", () => {
  if (alumnasGuardadas.length) mostrarPanel();
});

el("btnAgregarOtraAlumna").addEventListener("click", () => {
  // Casi siempre es para agregar a un hermano de la MISMA academia que
  // ya está usando este dispositivo — se abre directo el login de esa
  // academia. Si es de otra academia, tienen que abrir el link de esa.
  const referencia = alumnaActiva() || alumnasGuardadas[0];
  mostrarLogin(referencia?.academiaId);
});

// ---------------------------------------------------------------
// Sesión que terminó (401) — se quita SOLO a ese alumno de este
// dispositivo (los hermanos siguen igual) y se manda al login de su
// academia con un aviso.
// ---------------------------------------------------------------
function sesionTerminada(entrada) {
  if (!alumnasGuardadas.some((a) => a.alumnaId === entrada.alumnaId)) return; // ya se atendió
  quitarDeLaLista(entrada.alumnaId);
  mostrarLogin(entrada.academiaId, `La sesión de ${entrada.nombre} terminó. Vuelve a entrar con su código y su PIN.`);
}

// ---------------------------------------------------------------
// Migración de alumnos guardados antes de los tokens (con la clave en
// el teléfono): se cambia la clave de cada uno por un token UNA vez y
// se borra — sin pedirle nada a los papás. Si no se puede ahora (sin
// internet, demasiados intentos...), se sigue usando la clave por el
// camino viejo y se reintenta más tarde.
// ---------------------------------------------------------------
async function migrarSesionesViejas() {
  for (const entrada of alumnasGuardadas.filter((a) => a.clave && !a.token)) {
    try {
      // Con academia + código se usa el login nuevo; los alumnos que se
      // guardaron antes de que existiera academiaId usan el viejo.
      const datos = entrada.academiaId && entrada.codigo
        ? { accion: "portalLoginCodigo", academiaId: Number(entrada.academiaId), codigo: Number(entrada.codigo), clave: entrada.clave }
        : { accion: "portalLogin", alumnaId: entrada.alumnaId, clave: entrada.clave };
      const resp = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
      });
      const r = await resp.json();
      if (!r.success || !r.token) continue;
      // Puede que mientras tanto la hayan quitado de este dispositivo.
      const actual = alumnasGuardadas.find((a) => a.alumnaId === entrada.alumnaId);
      if (!actual || actual.token) continue;
      Object.assign(actual, entradaDesdeLogin(r));
      delete actual.clave;
      guardarAlumnasEnDisco();
    } catch (e) {
      // Se reintenta en el siguiente ciclo.
    }
  }
}

// ---------------------------------------------------------------
// "Olvidé mi contraseña" del portal — paso 2 (llega del correo,
// portal.html?recuperar=TOKEN). El paso 1 se quitó (ver btnOlvidePin).
// ---------------------------------------------------------------
el("btnRestablecerPortalClave").addEventListener("click", async () => {
  const params = new URLSearchParams(location.search);
  const token = params.get("recuperar");
  const claveNueva = el("inputRestablecerPortalClave").value.trim();
  const claveConfirmar = el("inputRestablecerPortalClaveConfirmar").value.trim();

  el("mensajeErrorRestablecerPortal").textContent = "";
  el("mensajeExitoRestablecerPortal").textContent = "";

  if (claveNueva.length < 4) { el("mensajeErrorRestablecerPortal").textContent = "La contraseña debe tener al menos 4 caracteres."; return; }
  if (claveNueva !== claveConfirmar) { el("mensajeErrorRestablecerPortal").textContent = "Las contraseñas no coinciden."; return; }

  el("btnRestablecerPortalClave").disabled = true;
  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "portalRestablecerClave", token, claveNueva }),
    });
    const r = await resp.json();
    if (resp.status === 429) r.error = textoBloqueo(r.reintentarEnSegundos);

    if (!r.success) { el("mensajeErrorRestablecerPortal").textContent = r.error || "No se pudo actualizar."; return; }
    el("mensajeExitoRestablecerPortal").textContent = "¡Listo! Ya puedes iniciar sesión con tu contraseña nueva.";
    history.replaceState(null, "", location.pathname);
    setTimeout(() => {
      cargarAlumnasDeDisco();
      // El servidor cerró las sesiones de ese alumno al cambiar la
      // contraseña; si estaba guardado aquí, el 401 lo manda al login.
      if (alumnasGuardadas.length) mostrarPanel();
      else mostrarPantallaSinEnlace();
    }, 1800);
  } catch (e) {
    el("mensajeErrorRestablecerPortal").textContent = "No se pudo conectar. Revisa tu conexión.";
  } finally {
    el("btnRestablecerPortalClave").disabled = false;
  }
});

// ---------------------------------------------------------------
// PANEL PRINCIPAL
// ---------------------------------------------------------------
function pintarSelectorAlumnas() {
  const cont = el("selectorAlumnasPortal");
  if (alumnasGuardadas.length <= 1) { cont.innerHTML = ""; return; }
  cont.innerHTML = alumnasGuardadas.map((a) => `
    <button type="button" class="chip-alumna ${a.alumnaId === alumnaActivaId ? "activo" : ""}" data-id="${a.alumnaId}">${escaparHtml(a.nombre)}</button>
  `).join("");
  cont.querySelectorAll(".chip-alumna").forEach((btn) => {
    btn.addEventListener("click", () => seleccionarAlumna(Number(btn.dataset.id)));
  });
}

async function mostrarPanel() {
  ocultarPantallas();
  el("pantallaPortalPanel").hidden = false;
  await seleccionarAlumna(alumnaActivaId);
}

async function seleccionarAlumna(alumnaId) {
  const entrada = alumnasGuardadas.find((a) => a.alumnaId === alumnaId);
  if (!entrada) { mostrarPantallaSinEnlace(); return; }

  alumnaActivaId = alumnaId;
  guardarAlumnasEnDisco();
  pintarSelectorAlumnas();

  aplicarMarca(entrada.colorMarca);
  aplicarLogoEnHeader(entrada.logoKey);
  el("tituloPortalAcademia").textContent = `👨‍👩‍👧 ${entrada.academiaNombre}`;
  el("nombreAlumnaPortal").textContent = entrada.nombre;
  el("codigoAlumnaPortal").textContent = `#${entrada.codigo}`;
  pintarFotoAlumna(urlFotoAlumna(entrada));
  el("statClasesEsteMes").textContent = "—";
  el("inputEmailFamiliaPortal").value = "";
  el("mensajeErrorPush").textContent = "";

  actualizarBotonPush();

  try {
    const r = await llamar("portalConsultarAlumna", {}, entrada);
    // Un 401 (sesión terminada) ya lo quitó de este dispositivo y mandó
    // al login desde llamar(); cualquier otro error deja lo que ya había.
    if (!r.success) {
      if (!alumnasGuardadas.includes(entrada)) return;
      throw new Error(r.error);
    }
    entrada.nombre = r.nombre; entrada.codigo = r.codigo; entrada.fotoKey = r.fotoKey;
    entrada.fotoUrl = r.fotoUrl || null; entrada.fotoUrlEn = Date.now();
    entrada.clasesPorMes = r.clasesPorMes; entrada.colorMarca = r.academia.colorMarca; entrada.logoKey = r.academia.logoKey;
    entrada.academiaNombre = r.academia.nombre;
    entrada.tipoCliente = r.academia.tipoCliente || "academia";
    guardarAlumnasEnDisco();
    ajustarInterfazPortalSegunTipo();

    aplicarMarca(entrada.colorMarca);
    aplicarLogoEnHeader(entrada.logoKey);
    el("tituloPortalAcademia").textContent = `👨‍👩‍👧 ${entrada.academiaNombre}`;
    el("nombreAlumnaPortal").textContent = entrada.nombre;
    el("codigoAlumnaPortal").textContent = `#${entrada.codigo}`;
    pintarFotoAlumna(urlFotoAlumna(entrada));
    el("statClasesEsteMes").textContent = `${r.clasesEsteMes} / ${r.clasesPorMes}`;
    el("inputEmailFamiliaPortal").value = r.emailFamilia || "";
  } catch (e) {
    // Sin conexión — se deja lo que ya había en caché en vez de tronar.
  }

  cargarHistorialMeses();
  cargarHistorialEntradas();
}

function ajustarInterfazPortalSegunTipo() {
  const alumna = alumnasGuardadas.find((a) => a.alumnaId === alumnaActivaId);
  const esEmpresa = alumna?.tipoCliente === "empresa";
  const bloqueClases = el("bloqueClasesEsteMes");
  if (bloqueClases) bloqueClases.hidden = esEmpresa;
  const panelHistorial = el("panelHistorialMeses");
  if (panelHistorial) panelHistorial.hidden = esEmpresa;
  const etiquetaHistorialEntradas = el("etiquetaHistorialEntradas");
  if (etiquetaHistorialEntradas) etiquetaHistorialEntradas.textContent = esEmpresa ? "" : "a la academia";
  const etiquetaQuitar = el("etiquetaQuitarAlumno");
  if (etiquetaQuitar) etiquetaQuitar.textContent = esEmpresa ? "este empleado" : "este alumno";
  const btnAgregar = el("btnAgregarOtraAlumna");
  if (btnAgregar) btnAgregar.textContent = esEmpresa ? "+ Agregar otro empleado" : "+ Agregar otro alumno";
}

function pintarFotoAlumna(url) {
  const img = el("fotoAlumnaPortal");
  const vacia = el("fotoAlumnaPortalVacia");
  if (url) { img.src = url; img.hidden = false; vacia.hidden = true; }
  else { img.hidden = true; vacia.hidden = false; }
}

function tarjetaMes(mesTexto, cantidad, clasesPorMes, destacada) {
  return `
    <div class="tarjeta-item${destacada ? " tarjeta-mes-actual" : ""}">
      <div class="info-principal">
        <div class="nombre-item">${escaparHtml(formatearMes(mesTexto))}${destacada ? " · mes en curso" : ""}</div>
        <div class="detalle-item">${cantidad} / ${clasesPorMes} clases</div>
      </div>
    </div>
  `;
}

// Solo se muestra el mes en curso de una vez — el resto de meses queda
// oculto detrás de un botón, para no llenar la pantalla principal con
// todo el historial. El corte de "mes en curso" es con hora de
// Guatemala (mesGuatemalaActualCliente), igual que en el servidor.
async function cargarHistorialMeses() {
  const cont = el("listaHistorialMeses");
  cont.innerHTML = '<p class="lista-vacia">Cargando...</p>';
  try {
    const r = await llamar("portalHistorialAsistenciasPorMes", {});
    if (!r.success) {
      cont.innerHTML = '<p class="lista-vacia">No se pudo cargar. Revisa tu conexión.</p>';
      return;
    }
    const mesActual = mesGuatemalaActualCliente();
    const actual = (r.historial || []).find((h) => h.mes === mesActual);
    const anteriores = (r.historial || []).filter((h) => h.mes !== mesActual);

    let html = tarjetaMes(mesActual, actual ? actual.cantidad : 0, r.clasesPorMes, true);

    if (anteriores.length) {
      html += `
        <button type="button" class="btn secundario chico" id="btnVerMesesAnteriores" style="margin-top:10px;">Ver meses anteriores ▾</button>
        <div id="listaMesesAnteriores" hidden style="margin-top:10px;">
          ${anteriores.map((h) => tarjetaMes(h.mes, h.cantidad, r.clasesPorMes, false)).join("")}
        </div>
      `;
    }

    cont.innerHTML = html;

    const btn = el("btnVerMesesAnteriores");
    if (btn) {
      btn.addEventListener("click", () => {
        const lista = el("listaMesesAnteriores");
        lista.hidden = !lista.hidden;
        btn.textContent = lista.hidden ? "Ver meses anteriores ▾" : "Ocultar meses anteriores ▴";
      });
    }
  } catch (e) {
    cont.innerHTML = '<p class="lista-vacia">No se pudo cargar. Revisa tu conexión.</p>';
  }
}

function tarjetaEntrada(entrada) {
  return `
    <div class="tarjeta-item">
      <div class="info-principal">
        <div class="nombre-item">${escaparHtml(formatearFechaHora(entrada.fecha))}</div>
        <div class="detalle-item">${entrada.metodo === "Huella" ? "👆 Huella" : "🔢 Código"}</div>
      </div>
    </div>
  `;
}

// Igual que arriba: solo las entradas del mes en curso se ven de
// entrada, el resto (agrupado por mes) queda detrás de un botón.
async function cargarHistorialEntradas() {
  const cont = el("listaHistorialEntradas");
  cont.innerHTML = '<p class="lista-vacia">Cargando...</p>';
  try {
    const r = await llamar("portalHistorialEntradas", {});
    if (!r.success) {
      cont.innerHTML = '<p class="lista-vacia">No se pudo cargar. Revisa tu conexión.</p>';
      return;
    }
    const entradas = r.entradas || [];
    const mesActual = mesGuatemalaActualCliente();
    const deEsteMes = entradas.filter((e) => mesGuatemalaDeFecha(e.fecha) === mesActual);
    const deOtrosMeses = entradas.filter((e) => mesGuatemalaDeFecha(e.fecha) !== mesActual);

    let html = deEsteMes.length
      ? deEsteMes.map(tarjetaEntrada).join("")
      : '<p class="lista-vacia">Todavía no hay ninguna entrada este mes.</p>';

    if (deOtrosMeses.length) {
      // Agrupadas por mes, con un encabezado por cada una, en el mismo
      // orden (más reciente primero) en que ya vienen del servidor.
      const porMes = new Map();
      for (const e of deOtrosMeses) {
        const mes = mesGuatemalaDeFecha(e.fecha);
        if (!porMes.has(mes)) porMes.set(mes, []);
        porMes.get(mes).push(e);
      }
      const gruposHtml = [...porMes.entries()].map(([mes, lista]) => `
        <div class="subtitulo-historial" style="margin:14px 0 6px 0; font-weight:700;">${escaparHtml(formatearMes(mes))}</div>
        ${lista.map(tarjetaEntrada).join("")}
      `).join("");

      html += `
        <button type="button" class="btn secundario chico" id="btnVerEntradasAnteriores" style="margin-top:10px;">Ver meses anteriores ▾</button>
        <div id="listaEntradasAnteriores" hidden style="margin-top:10px;">${gruposHtml}</div>
      `;
    }

    cont.innerHTML = html;

    const btn = el("btnVerEntradasAnteriores");
    if (btn) {
      btn.addEventListener("click", () => {
        const lista = el("listaEntradasAnteriores");
        lista.hidden = !lista.hidden;
        btn.textContent = lista.hidden ? "Ver meses anteriores ▾" : "Ocultar meses anteriores ▴";
      });
    }
  } catch (e) {
    cont.innerHTML = '<p class="lista-vacia">No se pudo cargar. Revisa tu conexión.</p>';
  }
}

// ---------------------------------------------------------------
// Notificaciones push
// ---------------------------------------------------------------
function base64UrlAUint8Array(base64Url) {
  // .trim() por si a la variable VAPID_PUBLIC_KEY se le coló un
  // espacio o un salto de línea al pegarla en Cloudflare — eso solo
  // (sin este trim) ya hacía que atob() tronara con "The string
  // contains invalid characters", un error que no dice nada de dónde
  // viene el problema real.
  const limpio = String(base64Url).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(limpio)) {
    throw new Error(
      "La llave pública de las notificaciones (VAPID_PUBLIC_KEY) tiene caracteres raros — revisa que esté bien copiada en el Worker de Cloudflare, sin espacios ni saltos de línea de más."
    );
  }
  const relleno = "=".repeat((4 - (limpio.length % 4)) % 4);
  const base64 = (limpio + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function actualizarBotonPush() {
  const activas = alumnasConNotificacionesActivas();
  const boton = el("btnActivarPush");
  if (activas.has(alumnaActivaId)) {
    boton.textContent = "🔕 Desactivar avisos de llegada";
    el("textoEstadoPush").textContent = "Los avisos están ACTIVADOS para este alumno en este dispositivo.";
  } else {
    boton.textContent = "🔔 Activar avisos de llegada";
    el("textoEstadoPush").textContent = "Actívalos para que te avisemos apenas marque su entrada.";
  }
}

el("btnActivarPush").addEventListener("click", async () => {
  el("mensajeErrorPush").textContent = "";
  const activas = alumnasConNotificacionesActivas();
  const boton = el("btnActivarPush");
  boton.disabled = true;

  try {
    if (activas.has(alumnaActivaId)) {
      // Apagar solo para ESTE alumno (el dispositivo puede seguir
      // suscrito para otro hermano).
      const registro = await navigator.serviceWorker.getRegistration();
      const suscripcion = registro ? await registro.pushManager.getSubscription() : null;
      if (suscripcion) {
        await llamar("portalDesuscribirPush", { endpoint: suscripcion.endpoint });
      }
      activas.delete(alumnaActivaId);
      guardarAlumnasConNotificacionesActivas(activas);
      actualizarBotonPush();
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      el("mensajeErrorPush").textContent = "Este navegador no soporta notificaciones push. En iPhone, agrega este portal a tu pantalla de inicio primero (Compartir → Agregar a pantalla de inicio) y ábrelo desde ahí.";
      return;
    }

    const registro = await navigator.serviceWorker.register("portal-sw.js");
    await navigator.serviceWorker.ready;

    let suscripcion = await registro.pushManager.getSubscription();
    if (!suscripcion) {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        el("mensajeErrorPush").textContent = "No diste permiso para las notificaciones — actívalo desde los ajustes de este navegador para poder usar esta función.";
        return;
      }
      const config = await llamar("portalConfiguracionPush", {});
      if (!config.success || !config.vapidPublicKey) {
        el("mensajeErrorPush").textContent = "Las notificaciones todavía no están activadas del lado del sistema — avísale al administrador de tu cuenta.";
        return;
      }
      suscripcion = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlAUint8Array(config.vapidPublicKey),
      });
    }

    const r = await llamar("portalSuscribirPush", { suscripcion: suscripcion.toJSON() });
    if (!r.success) { el("mensajeErrorPush").textContent = r.error || "No se pudo activar."; return; }

    activas.add(alumnaActivaId);
    guardarAlumnasConNotificacionesActivas(activas);
    actualizarBotonPush();
  } catch (e) {
    el("mensajeErrorPush").textContent = "No se pudo activar: " + e.message;
  } finally {
    boton.disabled = false;
  }
});

// ---------------------------------------------------------------
// Mi cuenta: correo de recuperación, cambiar contraseña, quitar alumno
// ---------------------------------------------------------------
el("btnGuardarEmailFamilia").addEventListener("click", async () => {
  const email = el("inputEmailFamiliaPortal").value.trim();
  el("mensajeErrorEmailFamilia").textContent = "";
  el("mensajeExitoEmailFamilia").textContent = "";
  el("btnGuardarEmailFamilia").disabled = true;
  try {
    const r = await llamar("portalActualizarEmailFamilia", { email });
    if (!r.success) { el("mensajeErrorEmailFamilia").textContent = r.error || "No se pudo guardar."; return; }
    el("mensajeExitoEmailFamilia").textContent = "Correo guardado.";
  } catch (e) {
    el("mensajeErrorEmailFamilia").textContent = "No se pudo conectar.";
  } finally {
    el("btnGuardarEmailFamilia").disabled = false;
  }
});

el("btnCambiarClavePortal").addEventListener("click", async () => {
  const claveNueva = el("inputClaveNuevaPortal").value.trim();
  const claveConfirmar = el("inputClaveNuevaPortalConfirmar").value.trim();
  el("mensajeErrorClavePortal").textContent = "";
  el("mensajeExitoClavePortal").textContent = "";

  if (claveNueva.length < 4) { el("mensajeErrorClavePortal").textContent = "La contraseña debe tener al menos 4 caracteres."; return; }
  if (claveNueva !== claveConfirmar) { el("mensajeErrorClavePortal").textContent = "Las contraseñas no coinciden."; return; }

  el("btnCambiarClavePortal").disabled = true;
  try {
    const r = await llamar("portalCambiarClave", { claveNueva });
    if (!r.success) { el("mensajeErrorClavePortal").textContent = r.error || "No se pudo cambiar."; return; }

    // Con token no hay nada que actualizar: el servidor deja viva esta
    // sesión y cierra la de los demás teléfonos. Solo un alumno sin
    // migrar (que todavía usa la clave en cada llamada) necesita la nueva.
    const entrada = alumnaActiva();
    if (entrada?.clave) {
      entrada.clave = claveNueva;
      guardarAlumnasEnDisco();
      migrarSesionesViejas();
    }

    el("mensajeExitoClavePortal").textContent = "Contraseña actualizada.";
    el("inputClaveNuevaPortal").value = "";
    el("inputClaveNuevaPortalConfirmar").value = "";
  } catch (e) {
    el("mensajeErrorClavePortal").textContent = "No se pudo conectar.";
  } finally {
    el("btnCambiarClavePortal").disabled = false;
  }
});

el("btnQuitarAlumnaPortal").addEventListener("click", () => {
  const entrada = alumnasGuardadas.find((a) => a.alumnaId === alumnaActivaId);
  if (!entrada) return;
  if (!window.confirm(`¿Quitar a "${entrada.nombre}" de este dispositivo? Su historial y su cuenta NO se borran — puedes volver a agregarla cuando quieras.`)) return;
  quitarAlumnaDelDispositivo(alumnaActivaId);
});

// Apaga los avisos de ese alumno en este dispositivo y cierra su sesión
// en el servidor (mejor esfuerzo: si falla por red, igual se quita).
async function cerrarSesionDeAlumna(entrada) {
  const activas = alumnasConNotificacionesActivas();
  if (activas.has(entrada.alumnaId)) {
    try {
      const registro = await navigator.serviceWorker.getRegistration();
      const suscripcion = registro ? await registro.pushManager.getSubscription() : null;
      if (suscripcion) await llamar("portalDesuscribirPush", { endpoint: suscripcion.endpoint }, entrada);
    } catch (e) { /* mejor esfuerzo — no bloquea quitarla igual */ }
    activas.delete(entrada.alumnaId);
    guardarAlumnasConNotificacionesActivas(activas);
  }
  if (entrada.token) {
    try { await llamar("cerrarSesion", {}, entrada); } catch (e) { /* mejor esfuerzo */ }
  }
}

function quitarDeLaLista(alumnaId) {
  alumnasGuardadas = alumnasGuardadas.filter((a) => a.alumnaId !== alumnaId);
  if (alumnaActivaId === alumnaId) alumnaActivaId = alumnasGuardadas[0]?.alumnaId || null;
  guardarAlumnasEnDisco();
}

async function quitarAlumnaDelDispositivo(alumnaId) {
  const entrada = alumnasGuardadas.find((a) => a.alumnaId === alumnaId);
  if (!entrada) return;
  await cerrarSesionDeAlumna(entrada);
  quitarDeLaLista(alumnaId);

  if (alumnasGuardadas.length) mostrarPanel();
  else mostrarLogin(entrada.academiaId);
}

// Cerrar sesión: se cierran TODOS los alumnos guardados en este
// dispositivo (para un teléfono prestado o que se va a cambiar).
el("btnCerrarSesionPortal").addEventListener("click", async () => {
  const texto = alumnasGuardadas.length > 1
    ? "¿Cerrar sesión en este dispositivo? Se quitan todos los alumnos guardados aquí; para volver a verlos vas a necesitar su código y su PIN."
    : "¿Cerrar sesión en este dispositivo? Para volver a entrar vas a necesitar el código y el PIN.";
  if (!window.confirm(texto)) return;

  el("btnCerrarSesionPortal").disabled = true;
  const academiaId = (alumnaActiva() || alumnasGuardadas[0])?.academiaId;
  for (const entrada of [...alumnasGuardadas]) await cerrarSesionDeAlumna(entrada);
  alumnasGuardadas = [];
  alumnaActivaId = null;
  guardarAlumnasEnDisco();
  el("btnCerrarSesionPortal").disabled = false;
  mostrarLogin(academiaId);
});

// ---------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------
(function iniciar() {
  const params = new URLSearchParams(location.search);
  if (params.get("recuperar")) {
    ocultarPantallas();
    el("pantallaRestablecerPortal").hidden = false;
    return;
  }

  cargarAlumnasDeDisco();

  // Alumnos cuya sesión ya venció (por fecha) se quitan de una vez.
  const vencidas = alumnasGuardadas.filter((a) => a.expiraEn && new Date(a.expiraEn).getTime() <= Date.now());
  vencidas.forEach((a) => quitarDeLaLista(a.alumnaId));

  // "?academia=ID" es el link que cada academia comparte con sus papás
  // desde su panel — lleva directo al login de ESA academia. Si en este
  // dispositivo ya hay un alumno guardado de esa misma academia, se
  // muestra el panel normal (no tiene caso volver a pedir el PIN).
  const academiaDelLink = Number(params.get("academia")) || null;
  const yaTieneAlumnaDeEsaAcademia = academiaDelLink
    && alumnasGuardadas.some((a) => Number(a.academiaId) === academiaDelLink);

  if (academiaDelLink && !yaTieneAlumnaDeEsaAcademia) {
    mostrarLogin(academiaDelLink);
  } else if (alumnasGuardadas.length) {
    mostrarPanel();
  } else if (vencidas.length) {
    mostrarLogin(vencidas[0].academiaId, MENSAJE_SESION_VENCIDA);
  } else {
    mostrarPantallaSinEnlace();
  }

  migrarSesionesViejas();
  setInterval(migrarSesionesViejas, 5 * 60 * 1000);
})();

// ---------------------------------------------------------------
// AUTO-ACTUALIZACIÓN
// ---------------------------------------------------------------
// Antes, cuando se subía un arreglo, el papá tenía que borrar el
// portal de la pantalla de inicio de su celular y volver a agregarlo
// (o hacer varios refresh) para que le llegara — porque el teléfono
// (sobre todo iPhone, con el portal agregado a la pantalla de inicio)
// se queda con una copia guardada de la página y no siempre revisa
// si hay una nueva.
//
// Con esto ya no hace falta: cada vez que se abre el portal, cada vez
// que vuelve a primer plano (lo abren de nuevo desde el ícono), y
// cada 5 minutos mientras está abierto, se revisa un archivito
// (version.txt) que dice cuál es la versión más reciente subida. Si
// no coincide con la versión que tiene cargada este teléfono en este
// momento, se recarga sola — así el arreglo llega automático, sin que
// nadie tenga que hacer nada.
async function verificarActualizacion() {
  try {
    const resp = await fetch(`version.txt?_=${Date.now()}`, { cache: "no-store" });
    if (!resp.ok) return;
    const versionServidor = (await resp.text()).trim();
    if (!versionServidor || versionServidor === VERSION_APP) return;

    // No interrumpir si en este momento están escribiendo algo (por
    // ejemplo, poniendo su contraseña) — se vuelve a intentar en el
    // siguiente chequeo, unos minutos después.
    const activo = document.activeElement;
    const escribiendo = activo && (activo.tagName === "INPUT" || activo.tagName === "TEXTAREA") && activo.value;
    if (escribiendo) return;

    const url = new URL(location.href);
    url.searchParams.set("_actualizado", Date.now());
    location.href = url.href;
  } catch (e) {
    // Sin internet en este momento, o falló la revisión — no pasa
    // nada, se sigue usando la versión ya cargada y se reintenta solo
    // más tarde.
  }
}

verificarActualizacion();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") verificarActualizacion();
});
setInterval(verificarActualizacion, 5 * 60 * 1000);
