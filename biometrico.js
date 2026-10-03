// =====================================================================
// BIOMÉTRICO — Pantalla de Entrada (para dejar en una tablet)
// =====================================================================
// Esta es la pantalla que se queda fija en la entrada: el alumno
// escribe su código con el teclado en pantalla, ve su foto y un
// mensaje de bienvenida, y automáticamente regresa a esperar el
// siguiente código. No tiene NADA de administración — para eso está
// academia.html, aparte.
//
// IMPORTANTE: misma URL que en dueno.js/academia.js. Sin "/" al final.
const API_URL = "https://biometrico-saas.movedancea.workers.dev";

// Se actualiza solo, en automático, cada vez que se sube una versión
// nueva de los archivos — ver verificarActualizacion() al final de
// este archivo. NO cambiar este valor a mano: lo actualiza el script
// actualizar-versiones.mjs cada vez que algo cambia.
const VERSION_APP = "6bff86ff635c";

const el = (id) => document.getElementById(id);

// { token, expiraEn, academiaId, nombre, colorMarca, logoKey, tipoCliente }
// — la contraseña ya NO se guarda. "clave" solo existe en tablets que
// tenían sesión de antes de los tokens, mientras se migran (ver
// migrarSesionVieja): hasta que se consiga el token, la tablet sigue
// marcando con la clave por el camino viejo, sin que nadie la toque.
let sesion = null;
let codigoActual = "";
let timeoutResultado = null;

document.body.classList.add("modo-kiosko");

// Solo para el logo (que sigue siendo público) y para el respaldo de
// fotoAlumna(). Las fotos de alumnos vienen ya firmadas (fotoUrl).
function urlFoto(fotoKey) {
  return fotoKey ? `${API_URL}/foto?key=${encodeURIComponent(fotoKey)}` : "";
}

function fotoAlumna(alumna) {
  if (!alumna.fotoKey) return "";
  // Respaldo sin firma si el Worker no manda fotoUrl — quitar en Fase 1c.
  return alumna.fotoUrl || urlFoto(alumna.fotoKey);
}

// ---------------------------------------------------------------
// TOKEN DE ESTE DISPOSITIVO — identifica a ESTA tablet/navegador de
// forma única, para el control de "cuántos dispositivos a la vez"
// (ver academiaLogin en worker.js). Se genera UNA sola vez, la
// primera vez que esta tablet se usa, y se queda guardado para
// siempre en su memoria local — así, aunque se cierre sesión y se
// vuelva a entrar, el sistema la sigue reconociendo como LA MISMA
// tablet (no le vuelve a "gastar" un cupo de dispositivo). Es
// independiente de la sesión (biometrico_sesion_kiosko): no se borra
// al darle "Salir".
function obtenerOCrearTokenDispositivo() {
  let token = localStorage.getItem("biometrico_dispositivo_token");
  if (token) return token;

  token = (crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem("biometrico_dispositivo_token", token);
  return token;
}

function escaparHtml(t) {
  const d = document.createElement("div");
  d.textContent = t == null ? "" : String(t);
  return d.innerHTML;
}

// ---------------------------------------------------------------
// PERSONALIZACIÓN (color + logo) — la elige la academia desde su
// panel (academia.html); aquí solo se APLICA lo que ya está guardado.
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

function aplicarMarca(colorMarca) {
  const raiz = document.documentElement.style;

  // Siempre se limpia primero: si esta tablet/navegador ya había
  // aplicado el color de OTRA academia (por ejemplo, alguien salió e
  // inició sesión con una cuenta distinta), no debe quedarse pegado.
  ["--color-marca", "--color-marca-oscuro", "--color-marca-suave", "--color-marca-suave2",
    "--color-marca-suave3", "--color-marca-fondo", "--color-marca-fondo2", "--color-marca-fondo3",
    "--color-marca-texto-suave", "--color-marca-texto-suave2"].forEach((v) => raiz.removeProperty(v));

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
  raiz.setProperty("--color-marca-texto-suave2", oscurecer(colorMarca, 0.1));
}

function aplicarLogoKiosko(logoKey) {
  const img = el("logoKiosko");
  if (logoKey) {
    img.src = urlFoto(logoKey);
    img.hidden = false;
  } else {
    img.hidden = true;
  }
}

const MENSAJE_SESION_VENCIDA = "La sesión de esta tablet terminó. Vuelve a escribir el nombre de la cuenta y la contraseña para dejarla lista.";

async function llamar(accion, datos) {
  const headers = { "Content-Type": "application/json" };
  if (sesion?.token) headers.Authorization = `Bearer ${sesion.token}`;
  const extra = !sesion?.token && sesion?.clave ? { academiaId: sesion.academiaId, clave: sesion.clave } : {};
  const resp = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ accion, ...extra, ...datos }),
  });
  const r = await resp.json();
  if (resp.status === 401 && sesion) volverALogin(MENSAJE_SESION_VENCIDA);
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
      el("mensajeErrorLogin").textContent = "Ya puedes volver a intentarlo.";
      el("btnEntrarAcademia").disabled = false;
      return;
    }
    el("mensajeErrorLogin").textContent = textoBloqueo(faltan);
    el("btnEntrarAcademia").disabled = true;
  };
  pintar();
  intervaloBloqueoLogin = setInterval(pintar, 1000);
}

// ---------------------------------------------------------------
// LOGIN / SESIÓN (se guarda en esta tablet — no hay que repetirlo)
// ---------------------------------------------------------------
function guardarSesion(s) {
  sesion = s;
  localStorage.setItem("biometrico_sesion_kiosko", JSON.stringify(s));
}

function cargarSesionGuardada() {
  try {
    const cruda = localStorage.getItem("biometrico_sesion_kiosko");
    return cruda ? JSON.parse(cruda) : null;
  } catch (e) {
    return null;
  }
}

function sesionVencida(s) {
  return s && s.expiraEn && new Date(s.expiraEn).getTime() <= Date.now();
}

// Con dispositivoToken el Worker da una sesión de KIOSKO (180 días,
// ligada a esta tablet) y no gasta un cupo nuevo si la tablet ya
// estaba registrada.
async function pedirToken(nombre, clave) {
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accion: "academiaLogin", nombre, clave, dispositivoToken: obtenerOCrearTokenDispositivo() }),
  });
  return { status: resp.status, r: await resp.json() };
}

// Migración de una tablet que ya estaba funcionando antes de los
// tokens: se cambia la clave guardada por un token UNA vez y la clave
// se borra. Si no se puede ahora (sin internet, demasiados intentos, le
// cambiaron el nombre a la cuenta...), NO se saca a la tablet de la
// pantalla de marcar: sigue usando la clave por el camino viejo y se
// reintenta cada 5 minutos.
async function migrarSesionVieja() {
  if (!sesion?.clave || sesion.token) return;
  try {
    const { r } = await pedirToken(sesion.nombre, sesion.clave);
    if (!r.success || !r.token || !sesion?.clave) return;
    sesion.token = r.token;
    sesion.expiraEn = r.expiraEn;
    sesion.tipoCliente = r.tipoCliente || sesion.tipoCliente || "academia";
    delete sesion.clave;
    guardarSesion(sesion);
  } catch (e) {
    // Se reintenta en el siguiente ciclo.
  }
}

function volverALogin(mensaje) {
  sesion = null;
  localStorage.removeItem("biometrico_sesion_kiosko");
  clearTimeout(timeoutConfirmacion);
  clearTimeout(timeoutResultado);
  codigoPendienteConfirmacion = null;
  el("pantallaTeclado").hidden = true;
  el("pantallaConfirmacion").hidden = true;
  el("pantallaResultado").hidden = true;
  el("pantallaLogin").hidden = false;
  aplicarMarca(null);
  aplicarLogoKiosko(null);
  el("inputNombreAcademia").value = "";
  el("inputClaveAcademia").value = "";
  el("mensajeErrorLogin").textContent = mensaje || "";
}

function mostrarTeclado() {
  el("pantallaLogin").hidden = true;
  el("pantallaResultado").hidden = true;
  el("pantallaTeclado").hidden = false;
  el("marcaAcademiaKiosko").textContent = sesion.nombre;
  aplicarMarca(sesion.colorMarca);
  aplicarLogoKiosko(sesion.logoKey);
  reiniciarCodigo();
  // El color y el logo se refrescan solos cada 3 minutos (refrescarMarca).
}

// Si la cuenta cambia su color, su logo o su nombre, la tablet lo toma
// sola, sin volver a iniciar sesión. En silencio: si falla (sin
// internet, Worker viejo...), se queda con lo que ya tenía.
async function refrescarMarca() {
  if (!sesion) return;
  try {
    const r = await llamar("kioskoConsultarMarca", {});
    if (!r.success || !sesion) return;
    const cambio = r.colorMarca !== sesion.colorMarca || r.logoKey !== sesion.logoKey || r.nombre !== sesion.nombre;
    if (!cambio) return;
    sesion.colorMarca = r.colorMarca || null;
    sesion.logoKey = r.logoKey || null;
    sesion.nombre = r.nombre || sesion.nombre;
    if (r.tipoCliente) sesion.tipoCliente = r.tipoCliente;
    guardarSesion(sesion);
    el("marcaAcademiaKiosko").textContent = sesion.nombre;
    aplicarMarca(sesion.colorMarca);
    aplicarLogoKiosko(sesion.logoKey);
  } catch (e) {
    // Se reintenta en el siguiente ciclo.
  }
}

async function intentarEntrar() {
  const nombre = el("inputNombreAcademia").value.trim();
  const clave = el("inputClaveAcademia").value.trim();
  if (!nombre || !clave) return;
  el("mensajeErrorLogin").textContent = "";
  el("btnEntrarAcademia").disabled = true;
  el("btnEntrarAcademia").textContent = "Entrando...";

  let bloqueado = false;
  try {
    const { status, r } = await pedirToken(nombre, clave);
    if (status === 429) {
      bloqueado = true;
      mostrarBloqueoLogin(r.reintentarEnSegundos);
      return;
    }
    if (!r.success) {
      el("mensajeErrorLogin").textContent = r.error || "No se pudo entrar.";
      return;
    }
    el("inputClaveAcademia").value = "";
    guardarSesion({
      token: r.token,
      expiraEn: r.expiraEn,
      academiaId: r.academiaId,
      nombre: r.nombre,
      colorMarca: r.colorMarca || null,
      logoKey: r.logoKey || null,
      tipoCliente: r.tipoCliente || "academia",
    });
    mostrarTeclado();
  } catch (e) {
    el("mensajeErrorLogin").textContent = "No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.";
  } finally {
    el("btnEntrarAcademia").disabled = bloqueado;
    el("btnEntrarAcademia").textContent = "Entrar →";
  }
}

el("btnEntrarAcademia").addEventListener("click", intentarEntrar);
el("inputClaveAcademia").addEventListener("keydown", (e) => { if (e.key === "Enter") intentarEntrar(); });

el("btnSalirKiosko").addEventListener("click", async () => {
  if (!window.confirm("¿Salir de esta pantalla? Vas a tener que volver a escribir el nombre y la contraseña de la cuenta para volver a dejarla lista.")) return;
  // Se avisa al servidor para que el token deje de servir (si falla por
  // red, igual se borra de esta tablet).
  if (sesion?.token) {
    try { await llamar("cerrarSesion", {}); } catch (e) { /* mejor esfuerzo */ }
  }
  volverALogin();
});

// ---------------------------------------------------------------
// TECLADO NUMÉRICO
// ---------------------------------------------------------------
const LARGO_MAXIMO_CODIGO = 6;

function reiniciarCodigo() {
  codigoActual = "";
  el("mensajeErrorKiosko").textContent = "";
  pintarVisor();
}

function pintarVisor() {
  const visor = el("visorCodigo");
  if (!codigoActual) {
    visor.textContent = "Escribe tu número";
    visor.classList.add("vacio");
  } else {
    visor.textContent = codigoActual;
    visor.classList.remove("vacio");
  }
}

function agregarDigito(d) {
  if (codigoActual.length >= LARGO_MAXIMO_CODIGO) return;
  codigoActual += d;
  el("mensajeErrorKiosko").textContent = "";
  pintarVisor();
}

function borrarDigito() {
  codigoActual = codigoActual.slice(0, -1);
  pintarVisor();
}

document.querySelectorAll(".tecla-numpad[data-tecla]").forEach((btn) => {
  btn.addEventListener("click", () => agregarDigito(btn.dataset.tecla));
});
el("btnBorrarDigito").addEventListener("click", borrarDigito);
el("btnConfirmarCodigo").addEventListener("click", buscarAlumnaParaConfirmar);
el("btnSiSoyYo").addEventListener("click", confirmarEntradaFinal);
el("btnNoSoyYo").addEventListener("click", cancelarConfirmacion);

// También acepta un teclado físico, por si la tablet tiene uno conectado.
document.addEventListener("keydown", (e) => {
  if (!el("pantallaTeclado").hidden) {
    if (e.key >= "0" && e.key <= "9") agregarDigito(e.key);
    else if (e.key === "Backspace") borrarDigito();
    else if (e.key === "Enter") buscarAlumnaParaConfirmar();
  } else if (!el("pantallaConfirmacion").hidden) {
    if (e.key === "Enter") confirmarEntradaFinal();
    else if (e.key === "Escape") cancelarConfirmacion();
  }
});

// ---------------------------------------------------------------
// MARCAR ASISTENCIA (primero se busca y se confirma, luego se marca)
// ---------------------------------------------------------------
// El flujo tiene dos pasos a propósito: 1) se busca el código y se
// muestra la foto y el nombre del alumno para que confirme que sí
// es ella, y 2) solo al darle "Sí, entrar" se marca la asistencia de
// verdad. Así, si alguien teclea mal el código y por casualidad cae
// en el código de otro alumno, no se marca su entrada por error — se
// ve el nombre equivocado y se puede corregir antes de confirmar.
let codigoPendienteConfirmacion = null;
let timeoutConfirmacion = null;

// En esta pantalla (la tablet, a la vista de los alumnos y sus papás)
// no se debe mostrar el motivo real de un bloqueo por falta de pago —
// eso es un asunto entre la academia y el administrador del sistema,
// no algo que deba verse públicamente en la entrada. Por eso, cuando
// el bloqueo es por mensualidad (r.bloqueadaPorPago), se reemplaza por
// un mensaje genérico; cualquier otro error se sigue mostrando tal cual.
function mensajeErrorParaKiosko(r, textoPorDefecto) {
  if (r && r.bloqueadaPorPago) {
    return "Esta cuenta está desactivada. Favor contactar a soporte.";
  }
  return (r && r.error) || textoPorDefecto;
}

async function buscarAlumnaParaConfirmar() {
  if (!codigoActual) return;
  const codigo = Number(codigoActual);
  el("btnConfirmarCodigo").disabled = true;

  try {
    const r = await llamar("academiaBuscarAlumnaPorCodigo", { codigo });
    if (!r.success) {
      el("mensajeErrorKiosko").textContent = mensajeErrorParaKiosko(r, "No se pudo buscar ese código.");
      codigoActual = "";
      pintarVisor();
      return;
    }
    codigoPendienteConfirmacion = codigo;
    mostrarConfirmacion(r.alumna);
  } catch (e) {
    el("mensajeErrorKiosko").textContent = "No se pudo conectar. Inténtalo de nuevo.";
  } finally {
    el("btnConfirmarCodigo").disabled = false;
  }
}

function mostrarConfirmacion(alumna) {
  el("pantallaTeclado").hidden = true;
  el("pantallaConfirmacion").hidden = false;

  const foto = alumna.fotoKey
    ? `<img class="foto-bienvenida" src="${escaparHtml(fotoAlumna(alumna))}" alt="" />`
    : `<div class="foto-bienvenida vacia">💃</div>`;

  el("contenidoConfirmacion").innerHTML = `
    <div class="kiosko-bienvenida">
      ${foto}
      <div class="mensaje-bienvenida">¿Eres tú, ${escaparHtml(alumna.nombre)}?</div>
      <div class="detalle-bienvenida">Confirma para marcar tu entrada.</div>
    </div>
  `;

  // Si nadie confirma ni cancela (por ejemplo, se aleja de la tablet),
  // regresa sola al teclado después de un rato para no quedarse
  // trabada esperando.
  clearTimeout(timeoutConfirmacion);
  timeoutConfirmacion = setTimeout(cancelarConfirmacion, 10000);
}

async function capturarFotoSilenciosa() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();
    await new Promise(r => setTimeout(r, 300));
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    stream.getTracks().forEach(t => t.stop());
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch (e) {
    console.error("No se pudo capturar foto de verificacion:", e);
    return null;
  }
}

async function confirmarEntradaFinal() {
  if (!codigoPendienteConfirmacion) return;
  clearTimeout(timeoutConfirmacion);
  el("btnSiSoyYo").disabled = true;
  el("btnNoSoyYo").disabled = true;

  try {
    let fotoVerificacionBase64 = null;
    if (sesion?.tipoCliente === "empresa") { fotoVerificacionBase64 = await capturarFotoSilenciosa(); }
    const r = await llamar("academiaMarcarAsistencia", { codigo: codigoPendienteConfirmacion, metodo: "Codigo", ...(fotoVerificacionBase64 ? { fotoVerificacionBase64 } : {}) });
    el("pantallaConfirmacion").hidden = true;
    if (!r.success) {
      el("pantallaTeclado").hidden = false;
      el("mensajeErrorKiosko").textContent = mensajeErrorParaKiosko(r, "No se pudo marcar la asistencia.");
      reiniciarCodigo();
      return;
    }
    mostrarBienvenida(r);
  } catch (e) {
    el("pantallaConfirmacion").hidden = true;
    el("pantallaTeclado").hidden = false;
    el("mensajeErrorKiosko").textContent = "No se pudo conectar. Inténtalo de nuevo.";
    reiniciarCodigo();
  } finally {
    codigoPendienteConfirmacion = null;
    el("btnSiSoyYo").disabled = false;
    el("btnNoSoyYo").disabled = false;
  }
}

function cancelarConfirmacion() {
  clearTimeout(timeoutConfirmacion);
  codigoPendienteConfirmacion = null;
  el("pantallaConfirmacion").hidden = true;
  el("pantallaTeclado").hidden = false;
  reiniciarCodigo();
}

function mostrarBienvenida(r) {
  el("pantallaTeclado").hidden = true;
  el("pantallaResultado").hidden = false;

  const foto = r.alumna.fotoKey
    ? `<img class="foto-bienvenida" src="${escaparHtml(fotoAlumna(r.alumna))}" alt="" />`
    : `<div class="foto-bienvenida vacia">💃</div>`;

  el("contenidoResultado").innerHTML = `
    <div class="kiosko-bienvenida">
      ${foto}
      <div class="mensaje-bienvenida">¡Bienvenido, ${escaparHtml(r.alumna.nombre)}!</div>
      <div class="detalle-bienvenida">${sesion?.tipoCliente === "empresa" ? "Asistencia marcada." : `Asistencia marcada — ${r.clasesEsteMes} / ${r.clasesPorMes} clases este mes.`}</div>
    </div>
  `;

  clearTimeout(timeoutResultado);
  timeoutResultado = setTimeout(() => {
    el("pantallaResultado").hidden = true;
    el("pantallaTeclado").hidden = false;
    reiniciarCodigo();
  }, 4000);
}

// ---------------------------------------------------------------
// INICIO
// ---------------------------------------------------------------
// Si la tablet ya tenía sesión, entra directo al teclado SIN esperar a
// la red — la migración de una sesión vieja corre en segundo plano.
const sesionGuardada = cargarSesionGuardada();
if (sesionVencida(sesionGuardada)) {
  volverALogin(MENSAJE_SESION_VENCIDA);
} else if (sesionGuardada) {
  sesion = sesionGuardada;
  mostrarTeclado();
  migrarSesionVieja();
  refrescarMarca();
}
setInterval(migrarSesionVieja, 5 * 60 * 1000);
setInterval(refrescarMarca, 3 * 60 * 1000);

// ---------------------------------------------------------------
// AUTO-ACTUALIZACIÓN — revisa cada 5 minutos si hay una versión
// nueva subida y, si la hay, recarga la tablet sola. No se recarga a
// medias de una marcación: solo cuando la pantalla está en reposo
// (esperando código, sin ningún dígito escrito todavía) — para no
// cortar a un alumno que está a medio escribir su número, ni la
// pantalla de confirmación o de bienvenida justo cuando alguien
// acaba de marcar.
// ---------------------------------------------------------------
function tabletEnReposo() {
  const enTeclado = el("pantallaTeclado") && !el("pantallaTeclado").hidden;
  const enConfirmacion = el("pantallaConfirmacion") && !el("pantallaConfirmacion").hidden;
  const enResultado = el("pantallaResultado") && !el("pantallaResultado").hidden;
  if (enConfirmacion || enResultado) return false;
  if (enTeclado && codigoActual) return false;
  return true;
}

async function verificarActualizacion() {
  try {
    const resp = await fetch(`version.txt?_=${Date.now()}`, { cache: "no-store" });
    if (!resp.ok) return;
    const versionServidor = (await resp.text()).trim();
    if (!versionServidor || versionServidor === VERSION_APP) return;
    if (!tabletEnReposo()) return;

    const url = new URL(location.href);
    url.searchParams.set("_actualizado", Date.now());
    location.href = url.href;
  } catch (e) {
    // Sin internet o falló la revisión — se reintenta solo más tarde.
  }
}

verificarActualizacion();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") verificarActualizacion();
});
setInterval(verificarActualizacion, 5 * 60 * 1000);
