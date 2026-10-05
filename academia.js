// =====================================================================
// BIOMÉTRICO — Panel de la Academia cliente
// =====================================================================
// IMPORTANTE: cambia esta URL por la de TU Worker una vez publicado en
// Cloudflare — debe ser la MISMA URL que pusiste en dueno.js. Sin "/"
// al final.
const API_URL = "https://biometrico-saas.movedancea.workers.dev";

// Se actualiza solo, en automático, cada vez que se sube una versión
// nueva de los archivos — ver verificarActualizacion() al final de
// este archivo. NO cambiar este valor a mano: lo actualiza el script
// actualizar-versiones.mjs cada vez que algo cambia.
const VERSION_APP = "c7a6b15b7f14";

const el = (id) => document.getElementById(id);

// { token, expiraEn, academiaId, nombre, limiteAlumnas, ... } — la
// contraseña NO se guarda. Una sesión guardada sin token (de antes de
// los tokens) ya no sirve: al abrir se borra y se pide entrar de nuevo.
let sesion = null;
let alumnaEditandoId = null;
let fotoNuevaBase64 = null; // usada tanto para crear como para editar (se limpia entre usos)
let intervaloAlumnas = null; // refresca sola la lista de alumnos (asistencias en tiempo casi real)

// Solo para el logo (que sigue siendo público). Las fotos de alumnos y
// de verificación vienen ya firmadas del Worker (fotoUrl /
// fotoVerificacionUrl); sin firma, /foto no las sirve.
function urlFoto(fotoKey) {
  return fotoKey ? `${API_URL}/foto?key=${encodeURIComponent(fotoKey)}` : "";
}

// Las URLs firmadas cambian en cada respuesta (traen su vencimiento),
// y la lista de alumnos se refresca sola cada 15 s — si se usara la URL
// nueva cada vez, el navegador volvería a bajar todas las fotos en cada
// refresco. Por eso se reutiliza la misma URL de cada foto mientras
// tenga menos de 45 minutos (las firmas duran 1 hora).
const MS_REUSAR_URL_FOTO = 45 * 60 * 1000;
const urlsFotoFirmadas = new Map(); // fotoKey → { url, en }

function urlFotoFirmada(fotoKey, urlDelServidor) {
  if (!fotoKey) return "";
  const guardada = urlsFotoFirmadas.get(fotoKey);
  if (guardada && Date.now() - guardada.en < MS_REUSAR_URL_FOTO) return guardada.url;
  if (!urlDelServidor) return "";
  urlsFotoFirmadas.set(fotoKey, { url: urlDelServidor, en: Date.now() });
  return urlDelServidor;
}

const MENSAJE_SESION_VENCIDA = "Tu sesión terminó. Vuelve a entrar con el nombre de tu cuenta y tu contraseña.";

async function llamar(accion, datos) {
  const headers = { "Content-Type": "application/json" };
  if (sesion?.token) headers.Authorization = `Bearer ${sesion.token}`;
  const resp = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ accion, ...datos }),
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

function escaparHtml(t) {
  const d = document.createElement("div");
  d.textContent = t == null ? "" : String(t);
  return d.innerHTML;
}

// Las fotos que salen directo de un celular pueden pesar varios MB —
// eso es lo que hacía que subir el logo (o una foto de alumno) se
// sintiera lentísimo, o hasta se quedara pegado. Antes de mandarla al
// servidor, se reduce aquí mismo en el navegador a un tamaño de sobra
// para cómo se usa en el sistema (nunca se muestra más grande que un
// círculo o un logo chiquito), así que baja de varios MB a unos pocos
// cientos de KB sin notarse la diferencia visualmente.
function redimensionarImagen(archivo, ladoMaximo = 480, calidadJpeg = 0.82) {
  return new Promise((resolve, reject) => {
    if (!archivo) return resolve(null);
    const lector = new FileReader();
    lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo abrir esa imagen. Prueba con un JPG o PNG."));
      img.onload = () => {
        let { width, height } = img;
        if (width > ladoMaximo || height > ladoMaximo) {
          if (width >= height) {
            height = Math.round(height * (ladoMaximo / width));
            width = ladoMaximo;
          } else {
            width = Math.round(width * (ladoMaximo / height));
            height = ladoMaximo;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // Los logos suelen tener fondo transparente (PNG) — eso se
        // conserva. Las fotos normales (JPEG) se comprimen más, porque
        // no necesitan transparencia y así pesan bastante menos.
        const conservaTransparencia = /image\/(png|webp|gif)/.test(archivo.type);
        const dataUrl = conservaTransparencia
          ? canvas.toDataURL("image/png")
          : canvas.toDataURL("image/jpeg", calidadJpeg);
        resolve(dataUrl);
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

// Lee cualquier archivo (PDF incluido) como data URL, tal cual, sin
// pasar por canvas — se usa para los comprobantes de pago cuando son
// PDF, porque un PDF no se puede "dibujar" en un canvas como una foto.
function leerArchivoBase64(archivo) {
  return new Promise((resolve, reject) => {
    if (!archivo) return resolve(null);
    const lector = new FileReader();
    lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
    lector.onload = () => resolve(lector.result);
    lector.readAsDataURL(archivo);
  });
}

// El comprobante de pago puede ser una foto (se reduce, igual que el
// resto de imágenes del sistema, pero a un tamaño más grande que un
// logo/foto de alumno para que los montos y datos se sigan leyendo
// bien) o un PDF (se manda tal cual, no se puede reducir).
async function leerComprobanteBase64(archivo) {
  if (!archivo) return null;
  if (archivo.type === "application/pdf") {
    return leerArchivoBase64(archivo);
  }
  return redimensionarImagen(archivo, 1400, 0.85);
}

// ---------------------------------------------------------------
// PERSONALIZACIÓN (color + logo) — se aplica con variables CSS, así
// que un solo color elegido por la academia recolorea todo el panel
// (y, con el mismo mecanismo, biometrico.js recolorea la pantalla de
// la tablet). Ver biometrico-style.css para las variables --color-*.
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

  // Siempre se limpia primero: si este navegador ya había aplicado el
  // color de OTRA academia (por ejemplo, alguien salió e inició sesión
  // con una cuenta distinta), no debe quedarse pegado.
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

function aplicarLogoEnHeader(logoKey) {
  const img = el("logoAcademia");
  if (logoKey) {
    img.src = urlFoto(logoKey);
    img.hidden = false;
  } else {
    img.hidden = true;
  }
}

// ---------------------------------------------------------------
// LOGIN / SESIÓN
// ---------------------------------------------------------------
function guardarSesion(s) {
  sesion = s;
  localStorage.setItem("biometrico_sesion_academia", JSON.stringify(s));
}

function cargarSesionGuardada() {
  try {
    const cruda = localStorage.getItem("biometrico_sesion_academia");
    if (!cruda) return null;
    return JSON.parse(cruda);
  } catch (e) {
    return null;
  }
}

function sesionVencida(s) {
  return s && s.expiraEn && new Date(s.expiraEn).getTime() <= Date.now();
}

async function pedirToken(nombre, clave) {
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accion: "academiaLogin", nombre, clave }),
  });
  return { status: resp.status, r: await resp.json() };
}

function ajustarInterfazSegunTipo() {
  const esEmpresa = sesion?.tipoCliente === "empresa";
  el("campoClasesAlumno").hidden = esEmpresa;
  el("campoHoraEntradaEmpresa").hidden = !esEmpresa;
  el("campoHoraSalidaEmpresa").hidden = !esEmpresa;
  document.querySelectorAll("h2").forEach((h) => {
    if (h.textContent.includes("Agregar alumno")) {
      h.innerHTML = h.innerHTML.replace("Agregar alumno", esEmpresa ? "Agregar empleado" : "Agregar alumno");
    }
    if (h.textContent.includes("Alumnos")) {
      h.innerHTML = h.innerHTML.replace("Alumnos", esEmpresa ? "Empleados" : "Alumnos");
    }
  });
  el("inputNuevaAlumnaNombre").placeholder = esEmpresa ? "Nombre del empleado" : "Nombre del alumno";
  el("btnCrearAlumna").textContent = esEmpresa ? "Agregar empleado" : "Agregar alumno";
  el("etiquetaPortalPapas").textContent = esEmpresa ? "" : "(para los papás)";
  el("etiquetaPortalTipo1").textContent = esEmpresa ? "Empleados" : "Alumnos";
  el("etiquetaPortalTipo2").textContent = esEmpresa ? "los empleados" : "los papás";
}

function mostrarPanel() {
  el("pantallaLogin").hidden = true;
  el("pantallaPanel").hidden = false;
  el("tituloAcademia").textContent = `📋 ${sesion.nombre}`;
  aplicarMarca(sesion.colorMarca);
  aplicarLogoEnHeader(sesion.logoKey);
  el("inputColorMarca").value = sesion.colorMarca || "#9c7b4f";
  el("inputEmailCuenta").value = sesion.email || "";
  pintarLinkPortal();
  cargarCodigoPublico();
  cargarAlumnas();
  ajustarInterfazSegunTipo();
  cargarMensualidad();
  iniciarActualizacionAutomatica();
  modulosPanel.iniciar();
}

// El link trae el código público de ESTA academia (?a=...) para que a
// los papás el Portal de Alumnos les abra directo en su academia, sin
// tener que buscarla ni escribir el nombre. Mientras no se conoce el
// código (sesión guardada de antes), va el link viejo con el id, que
// sigue funcionando.
function linkPortal() {
  const ruta = sesion.codigoPublico
    ? `portal.html?a=${encodeURIComponent(sesion.codigoPublico)}`
    : `portal.html?academia=${sesion.academiaId}`;
  return new URL(ruta, location.href).href;
}

function pintarLinkPortal() {
  const link = linkPortal();
  el("linkPortalAlumnos").href = link;
  el("inputLinkPortal").value = link;
}

// Sesiones guardadas antes de que academiaLogin devolviera el código.
async function cargarCodigoPublico() {
  if (sesion.codigoPublico) return;
  try {
    const r = await llamar("academiaConsultarCodigoPublico", {});
    if (!r.success || !r.codigoPublico || !sesion) return;
    sesion.codigoPublico = r.codigoPublico;
    guardarSesion(sesion);
    pintarLinkPortal();
  } catch (e) {
    // Se queda el link viejo; se reintenta la próxima vez que se abra el panel.
  }
}

el("inputLinkPortal").addEventListener("focus", (e) => e.target.select());

el("btnCopiarLinkPortal").addEventListener("click", async () => {
  const link = linkPortal();
  const mensaje = el("mensajeCopiadoLinkPortal");
  try {
    await navigator.clipboard.writeText(link);
    mensaje.textContent = "¡Enlace copiado! Ya lo puedes pegar y mandar por WhatsApp.";
  } catch (e) {
    mensaje.textContent = `No se pudo copiar solo — cópialo a mano: ${link}`;
  }
  setTimeout(() => { mensaje.textContent = ""; }, 6000);
});

// Refresca sola la lista de alumnos Y el estado de la mensualidad
// cada pocos segundos mientras el panel está abierto — así, sin que
// nadie tenga que darle refresh a la página:
//   - cuando un alumno marca su entrada en la tablet (biometrico.html),
//     el conteo de "clases este mes" se actualiza solo.
//   - cuando Ana marca la academia como "pagada manualmente" desde su
//     panel de dueño, aquí deja de decir "Pendiente de pago" y pasa a
//     "✅ Al día" solo, sin que la academia tenga que recargar.
// Se detiene al salir de la sesión, y se pausa mientras la pestaña
// está en segundo plano para no gastar de más.
function iniciarActualizacionAutomatica() {
  detenerActualizacionAutomatica();
  intervaloAlumnas = setInterval(() => {
    if (document.hidden) return; // pestaña en segundo plano — no molesta con llamadas de más
    if (el("modalAlumna").hidden) cargarAlumnas(); // no refrescar la lista mientras se está editando un alumno
    cargarMensualidad();
  }, 15000);
}

function detenerActualizacionAutomatica() {
  if (intervaloAlumnas) {
    clearInterval(intervaloAlumnas);
    intervaloAlumnas = null;
  }
}

function volverALogin(mensaje) {
  sesion = null;
  localStorage.removeItem("biometrico_sesion_academia");
  detenerActualizacionAutomatica();
  el("pantallaPanel").hidden = true;
  el("pantallaLogin").hidden = false;
  aplicarMarca(null);
  aplicarLogoEnHeader(null);
  el("modalAlumna").hidden = true;
  el("modalAsistencias").hidden = true;
  modulosPanel.reiniciar();
  el("mensajeErrorLogin").textContent = mensaje || "";
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
      limiteAlumnas: r.limiteAlumnas,
      colorMarca: r.colorMarca || null,
      logoKey: r.logoKey || null,
      email: r.email || null,
      tipoCliente: r.tipoCliente || "academia",
      codigoPublico: r.codigoPublico || null,
    });
    mostrarPanel();
  } catch (e) {
    el("mensajeErrorLogin").textContent = "No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.";
  } finally {
    el("btnEntrarAcademia").disabled = bloqueado;
    el("btnEntrarAcademia").textContent = "Entrar →";
  }
}

el("btnEntrarAcademia").addEventListener("click", intentarEntrar);
el("inputClaveAcademia").addEventListener("keydown", (e) => { if (e.key === "Enter") intentarEntrar(); });

// Cerrar sesión: se avisa al servidor para que el token deje de servir
// (si falla por red, igual se borra de este navegador).
el("btnSalirAcademia").addEventListener("click", async () => {
  if (sesion?.token) {
    try { await llamar("cerrarSesion", {}); } catch (e) { /* mejor esfuerzo */ }
  }
  volverALogin();
});

// ---------------------------------------------------------------
// OLVIDÉ MI CONTRASEÑA — paso 1: pedir el enlace de recuperación.
// No requiere haber iniciado sesión (es justo para cuando no se
// puede entrar).
// ---------------------------------------------------------------
el("btnMostrarOlvide").addEventListener("click", () => {
  el("pantallaLogin").hidden = true;
  el("pantallaOlvide").hidden = false;
  el("inputOlvideNombre").value = el("inputNombreAcademia").value;
  el("mensajeErrorOlvide").textContent = "";
  el("mensajeExitoOlvide").textContent = "";
});

el("btnCancelarOlvide").addEventListener("click", () => {
  el("pantallaOlvide").hidden = true;
  el("pantallaLogin").hidden = false;
});

el("btnEnviarOlvide").addEventListener("click", async () => {
  const nombre = el("inputOlvideNombre").value.trim();
  const email = el("inputOlvideEmail").value.trim();
  el("mensajeErrorOlvide").textContent = "";
  el("mensajeExitoOlvide").textContent = "";

  if (!nombre || !email) {
    el("mensajeErrorOlvide").textContent = "Escribe el nombre de tu cuenta y tu correo registrado.";
    return;
  }

  el("btnEnviarOlvide").disabled = true;
  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // "origenPanel" le dice al servidor a qué dirección apunta ESTA
      // misma página, para armar el enlace del correo — así el Worker
      // no necesita saber de antemano dónde quedó publicado el panel.
      body: JSON.stringify({
        accion: "academiaSolicitarRecuperacion",
        nombre,
        email,
        origenPanel: window.location.origin + window.location.pathname,
      }),
    });
    const r = await resp.json();
    if (!r.success) {
      el("mensajeErrorOlvide").textContent = r.error || "No se pudo procesar la solicitud.";
      return;
    }
    el("mensajeExitoOlvide").textContent = r.mensaje || "Si los datos coinciden con una cuenta, te llega un correo con instrucciones.";
  } catch (e) {
    el("mensajeErrorOlvide").textContent = "No se pudo conectar. Inténtalo de nuevo.";
  } finally {
    el("btnEnviarOlvide").disabled = false;
  }
});

// ---------------------------------------------------------------
// OLVIDÉ MI CONTRASEÑA — paso 2: se llega aquí desde el enlace del
// correo (academia.html?recuperar=TOKEN). Se detecta apenas carga la
// página y se muestra directo el formulario de contraseña nueva.
// ---------------------------------------------------------------
const tokenRecuperacion = new URLSearchParams(window.location.search).get("recuperar");

if (tokenRecuperacion) {
  el("pantallaLogin").hidden = true;
  el("pantallaOlvide").hidden = true;
  el("pantallaRestablecer").hidden = false;
}

el("btnRestablecerClave").addEventListener("click", async () => {
  const claveNueva = el("inputRestablecerClave").value;
  const confirmar = el("inputRestablecerClaveConfirmar").value;
  el("mensajeErrorRestablecer").textContent = "";
  el("mensajeExitoRestablecer").textContent = "";

  if (claveNueva.length < 4) {
    el("mensajeErrorRestablecer").textContent = "La contraseña nueva debe tener al menos 4 caracteres.";
    return;
  }
  if (claveNueva !== confirmar) {
    el("mensajeErrorRestablecer").textContent = "Las dos contraseñas no coinciden.";
    return;
  }

  el("btnRestablecerClave").disabled = true;
  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "academiaRestablecerClave", token: tokenRecuperacion, claveNueva }),
    });
    const r = await resp.json();
    if (!r.success) {
      el("mensajeErrorRestablecer").textContent = r.error || "No se pudo cambiar la contraseña.";
      return;
    }
    el("mensajeExitoRestablecer").textContent = "¡Listo! Ya puedes entrar con tu contraseña nueva.";
    el("btnRestablecerClave").disabled = true;
    setTimeout(() => {
      // Se quita el "?recuperar=..." de la URL y regresa al login normal.
      window.location.href = window.location.pathname;
    }, 2000);
  } catch (e) {
    el("mensajeErrorRestablecer").textContent = "No se pudo conectar. Inténtalo de nuevo.";
    el("btnRestablecerClave").disabled = false;
  }
});

// ---------------------------------------------------------------
// MI CUENTA — correo de recuperación y cambiar contraseña (estando
// ya logueado, distinto del flujo de "olvidé mi contraseña").
// ---------------------------------------------------------------
el("btnGuardarEmail").addEventListener("click", async () => {
  const email = el("inputEmailCuenta").value.trim();
  el("mensajeErrorEmail").textContent = "";
  el("mensajeExitoEmail").textContent = "";
  el("btnGuardarEmail").disabled = true;

  try {
    const r = await llamar("academiaActualizarEmail", { email });
    if (!r.success) { el("mensajeErrorEmail").textContent = r.error || "No se pudo guardar."; return; }
    sesion.email = r.email || null;
    guardarSesion(sesion);
    el("mensajeExitoEmail").textContent = "¡Correo guardado!";
  } catch (e) {
    el("mensajeErrorEmail").textContent = "No se pudo conectar. Inténtalo de nuevo.";
  } finally {
    el("btnGuardarEmail").disabled = false;
  }
});

el("btnCambiarClave").addEventListener("click", async () => {
  const claveNueva = el("inputClaveNueva").value;
  const confirmar = el("inputClaveNuevaConfirmar").value;
  el("mensajeErrorClave").textContent = "";
  el("mensajeExitoClave").textContent = "";

  if (claveNueva.length < 4) {
    el("mensajeErrorClave").textContent = "La contraseña nueva debe tener al menos 4 caracteres.";
    return;
  }
  if (claveNueva !== confirmar) {
    el("mensajeErrorClave").textContent = "Las dos contraseñas no coinciden.";
    return;
  }

  el("btnCambiarClave").disabled = true;
  try {
    const r = await llamar("academiaCambiarClave", { claveNueva });
    if (!r.success) { el("mensajeErrorClave").textContent = r.error || "No se pudo cambiar."; return; }
    // No hay nada que actualizar aquí: el servidor deja viva esta
    // sesión y cierra las demás.
    el("inputClaveNueva").value = "";
    el("inputClaveNuevaConfirmar").value = "";
    el("mensajeExitoClave").textContent = "¡Contraseña cambiada! La vas a necesitar la próxima vez que entres.";
  } catch (e) {
    el("mensajeErrorClave").textContent = "No se pudo conectar. Inténtalo de nuevo.";
  } finally {
    el("btnCambiarClave").disabled = false;
  }
});

// ---------------------------------------------------------------
// LISTAR / PINTAR ALUMNAS
// ---------------------------------------------------------------
async function cargarAlumnas() {
  try {
    const r = await llamar("academiaListarAlumnas", {});
    if (!r.success) {
      if (r.bloqueadaPorPago) {
        // Sigue con la sesión iniciada (NO se manda a volverALogin) —
        // así puede quedarse viendo la pantalla y usar "💳 Mensualidad"
        // para pagar y desbloquearse sola.
        el("listaAlumnas").innerHTML =
          '<p class="lista-vacia">Tu cuenta está desactivada por falta de pago de la mensualidad. Ve a "💳 Mensualidad" arriba para ponerte al día.</p>';
        el("infoLimiteAlumnas").textContent = "Cuenta desactivada";
        el("btnCrearAlumna").disabled = true;
        return;
      }
      // 401 ya mandó al login desde llamar(); cualquier otro error
      // (por ejemplo, 429) se muestra sin sacar a nadie de su sesión.
      if (!sesion) return;
      el("listaAlumnas").innerHTML = `<p class="lista-vacia">${escaparHtml(r.error || "No se pudo cargar la lista.")}</p>`;
      return;
    }
    sesion.limiteAlumnas = r.limiteAlumnas;
    pintarAlumnas(r.alumnas, r.cantidadAlumnas, r.limiteAlumnas);
  } catch (e) {
    el("listaAlumnas").innerHTML = '<p class="lista-vacia">No se pudo cargar la lista. Revisa tu conexión.</p>';
  }
}

// ---------------------------------------------------------------
// MENSUALIDAD — estado del cobro del mes y botón para generar el
// link de pago de Paggo. A propósito NO depende de que la academia
// esté al día (por eso el servidor usa verificarAcademiaSoloActiva
// para estas dos acciones) — así siempre puede pagar y desbloquearse.
// ---------------------------------------------------------------
async function cargarMensualidad() {
  try {
    const r = await llamar("academiaConsultarPago", {});
    if (!r.success) {
      el("mensualidadTextoAyuda").textContent = r.error || "No se pudo consultar tu mensualidad.";
      return;
    }
    pintarMensualidad(r);
  } catch (e) {
    el("mensualidadTextoAyuda").textContent = "No se pudo consultar tu mensualidad. Revisa tu conexión.";
  }
}

function pintarMensualidad(r) {
  el("mensajeErrorMensualidad").textContent = "";
  el("mensajeExitoMensualidad").textContent = "";
  pintarEstadoComprobante(r);

  if (r.estadoMes === "pagado") {
    el("mensualidadTextoAyuda").textContent = `Tu mensualidad de este mes (${r.mes}) ya está pagada. ¡Gracias!`;
    el("mensualidadEstadoTexto").textContent = "✅ Al día";
    el("mensualidadEstadoTexto").style.color = "#1a9c5c";
    el("btnGenerarLinkPago").hidden = true;
    el("enlaceLinkPago").hidden = true;
    el("mensualidadTextoLinkVence").hidden = true;
    return;
  }

  el("mensualidadEstadoTexto").style.color = r.pagoAlDia ? "inherit" : "#d0304c";
  el("mensualidadEstadoTexto").textContent = r.pagoAlDia
    ? "⏳ Pendiente de pago"
    : "🚫 Cuenta desactivada por falta de pago";
  el("mensualidadTextoAyuda").textContent = r.mensualidad
    ? `Tu mensualidad de ${r.mes} es de Q${Number(r.mensualidad).toFixed(2)}. Genera tu link y págalo con tarjeta.`
    : "Todavía no tienes una mensualidad asignada — pídele al administrador del sistema que te la configure.";

  // Un botón a la vez: si ya hay un link generado y pendiente de pagar,
  // se muestra SOLO "Pagar ahora" (ya no tiene caso volver a generar
  // otro); si todavía no hay link (o el anterior ya venció, pasadas 24
  // horas), se muestra SOLO "Generar link de pago".
  if (r.link) {
    el("btnGenerarLinkPago").hidden = true;
    el("enlaceLinkPago").href = r.link;
    el("enlaceLinkPago").hidden = false;
    el("mensualidadTextoLinkVence").hidden = false;
    el("mensualidadTextoLinkVence").textContent = "Este link de pago es válido por 24 horas desde que se generó.";
  } else {
    el("btnGenerarLinkPago").hidden = !r.mensualidad;
    el("enlaceLinkPago").hidden = true;
    el("mensualidadTextoLinkVence").hidden = !r.linkExpirado;
    if (r.linkExpirado) {
      el("mensualidadTextoLinkVence").textContent = "Tu link anterior ya venció (duran 24 horas) — genera uno nuevo.";
    }
  }
}

function pintarEstadoComprobante(r) {
  el("comprobanteEstadoTexto").textContent = r.comprobanteSubido
    ? `✅ Ya subiste un comprobante para ${r.mes}${r.comprobanteSubidoEn ? " (" + r.comprobanteSubidoEn + " UTC)" : ""} — el administrador lo va a revisar.`
    : `Todavía no has subido ningún comprobante para ${r.mes}.`;
}

el("btnGenerarLinkPago").addEventListener("click", async () => {
  el("mensajeErrorMensualidad").textContent = "";
  el("mensajeExitoMensualidad").textContent = "";
  el("btnGenerarLinkPago").disabled = true;
  el("btnGenerarLinkPago").textContent = "Generando link...";

  try {
    const r = await llamar("academiaGenerarLinkPago", {});
    if (!r.success) { el("mensajeErrorMensualidad").textContent = r.error || "No se pudo generar el link de pago."; return; }
    if (r.estadoMes === "pagado") {
      el("mensajeExitoMensualidad").textContent = "Este mes ya estaba pagado.";
      cargarMensualidad();
      return;
    }
    el("btnGenerarLinkPago").hidden = true;
    el("enlaceLinkPago").href = r.link;
    el("enlaceLinkPago").hidden = false;
    el("mensajeExitoMensualidad").textContent = "¡Listo! Dale clic a \"Pagar ahora\" para completar el pago con tarjeta.";
  } catch (e) {
    el("mensajeErrorMensualidad").textContent = "No se pudo conectar. Inténtalo de nuevo.";
  } finally {
    el("btnGenerarLinkPago").disabled = false;
    el("btnGenerarLinkPago").textContent = "Generar link de pago";
  }
});

el("btnSubirComprobante").addEventListener("click", async () => {
  el("mensajeErrorComprobante").textContent = "";
  el("mensajeExitoComprobante").textContent = "";

  const archivo = el("inputComprobantePago").files[0] || null;
  if (!archivo) { el("mensajeErrorComprobante").textContent = "Elige primero una foto o un PDF de tu comprobante."; return; }
  if (archivo.type !== "application/pdf" && !archivo.type.startsWith("image/")) {
    el("mensajeErrorComprobante").textContent = "Ese archivo no es una foto ni un PDF."; return;
  }

  el("btnSubirComprobante").disabled = true;
  el("btnSubirComprobante").textContent = "Subiendo...";
  try {
    const comprobanteBase64 = await leerComprobanteBase64(archivo);
    const r = await llamar("academiaSubirComprobante", { comprobanteBase64 });
    if (!r.success) { el("mensajeErrorComprobante").textContent = r.error || "No se pudo subir el comprobante."; return; }
    el("mensajeExitoComprobante").textContent = r.mensaje || "¡Comprobante subido!";
    el("inputComprobantePago").value = "";
    cargarMensualidad();
  } catch (e) {
    el("mensajeErrorComprobante").textContent = e.message || "No se pudo conectar. Inténtalo de nuevo.";
  } finally {
    el("btnSubirComprobante").disabled = false;
    el("btnSubirComprobante").textContent = "Subir comprobante";
  }
});

function pintarAlumnas(alumnas, cantidad, limite) {
  const esEmpresa = sesion?.tipoCliente === "empresa";
  const etiqueta = esEmpresa ? "empleados" : "alumnos";
  el("infoLimiteAlumnas").textContent = `${cantidad} / ${limite} ${etiqueta}`;
  el("ayudaCantidadAlumnas").textContent =
    cantidad >= limite
      ? `Llegaste al límite de tu plan (${limite}). Para agregar más, hay que ampliar el plan con el administrador del sistema.`
      : `Tienes ${cantidad} de ${limite} ${etiqueta} de tu plan actual.`;

  el("btnCrearAlumna").disabled = cantidad >= limite;

  const cont = el("listaAlumnas");
  if (!alumnas.length) {
    cont.innerHTML = '<p class="lista-vacia">Todavía no has agregado ningún alumno.</p>';
    return;
  }

  cont.innerHTML = "";
  alumnas.forEach((a) => {
    const div = document.createElement("div");
    div.className = "tarjeta-item";
    const foto = a.foto_key
      ? `<img class="foto-miniatura" src="${escaparHtml(urlFotoFirmada(a.foto_key, a.fotoUrl))}" alt="" />`
      : `<div class="foto-miniatura vacia">🧑</div>`;
    div.innerHTML = `
      ${foto}
      <div class="info-principal">
        <div class="nombre-item">#${a.codigo} — ${escaparHtml(a.nombre)}</div>
        <div class="detalle-item">
          <span class="etiqueta-estado ${a.estado === "Activa" ? "activa" : "inactiva"}">${a.estado === "Activa" ? "Activo" : "Inactivo"}</span>
          ${esEmpresa ? "" : `&nbsp;·&nbsp; ${a.clasesEsteMes} / ${a.clases_por_mes} clases este mes`}
        </div>
      </div>
      <div class="acciones-item">
        <button class="btn secundario chico" data-accion="editar">Editar</button>
        <button class="btn secundario chico" data-accion="asistencias">📋 Asistencias</button>
      </div>
    `;
    div.querySelector('[data-accion="editar"]').addEventListener("click", () => abrirModalEditar(a));
    div.querySelector('[data-accion="asistencias"]').addEventListener("click", () => abrirModalAsistencias(a));
    cont.appendChild(div);
  });
}

// ---------------------------------------------------------------
// CREAR ALUMNA
// ---------------------------------------------------------------
el("btnCrearAlumna").addEventListener("click", async () => {
  const nombre = el("inputNuevaAlumnaNombre").value.trim();
  const clasesPorMes = Number(el("inputNuevaAlumnaClases").value) || 8;
  const archivo = el("inputNuevaAlumnaFoto").files[0] || null;
  const horaEntradaEsperada = el("inputNuevaAlumnaHoraEntrada").value || null;
  const horaSalidaEsperada = el("inputNuevaAlumnaHoraSalida").value || null;
  const esEmpresaCrear = sesion?.tipoCliente === "empresa";

  el("mensajeErrorCrear").textContent = "";
  el("mensajeExitoCrear").textContent = "";

  if (!nombre) { el("mensajeErrorCrear").textContent = "Escribe el nombre del alumno."; return; }

  // Módulo mensualidades: el campo solo se ve si está activo. Vacío = el
  // Worker usa la mensualidad sugerida de la academia.
  const extraMensualidad = {};
  if (!el("campoMensualidadNueva").hidden && el("inputNuevaAlumnaMensualidad").value.trim()) {
    const centavos = bioComun.leerMonto(el("inputNuevaAlumnaMensualidad").value);
    if (centavos === null) { el("mensajeErrorCrear").textContent = "Escribe una mensualidad válida (por ejemplo 300 o 300.50)."; return; }
    extraMensualidad.mensualidadCentavos = centavos;
  }

  el("btnCrearAlumna").disabled = true;
  try {
    const fotoBase64 = await redimensionarImagen(archivo);
    const r = await llamar("academiaCrearAlumna", esEmpresaCrear ? { nombre, horaEntradaEsperada, horaSalidaEsperada, fotoBase64 } : { nombre, clasesPorMes, fotoBase64, ...extraMensualidad });
    if (!r.success) {
      el("mensajeErrorCrear").textContent = r.error || "No se pudo agregar.";
      return;
    }
    const textoClavePortal = r.claveInicialPortal
      ? ` Su PIN del Portal de Alumnos es ${r.claveInicialPortal} — compártelo con los papás (lo pueden cambiar después).`
      : "";
    el("mensajeExitoCrear").textContent = r.advertenciaFoto
      ? `"${nombre}" agregada con el código #${r.codigo}.${textoClavePortal} ⚠️ ${r.advertenciaFoto}`
      : `"${nombre}" agregada con el código #${r.codigo}.${textoClavePortal}`;
    el("inputNuevaAlumnaNombre").value = "";
    el("inputNuevaAlumnaClases").value = "8";
    el("inputNuevaAlumnaFoto").value = "";
    cargarAlumnas();
  } catch (e) {
    el("mensajeErrorCrear").textContent = e.message || "No se pudo conectar. Inténtalo de nuevo.";
  } finally {
    el("btnCrearAlumna").disabled = false;
  }
});

// ---------------------------------------------------------------
// EDITAR / BORRAR ALUMNA (modal)
// ---------------------------------------------------------------
function abrirModalEditar(alumna) {
  alumnaEditandoId = alumna.id;
  el("inputEditarNombre").value = alumna.nombre;
  el("inputEditarClases").value = alumna.clases_por_mes;
  el("selectEditarEstado").value = alumna.estado;
  el("inputEditarFoto").value = "";
  el("mensajeErrorEditar").textContent = "";

  el("textoEstadoClavePortal").textContent = alumna.tieneClavePortal
    ? "Ya tiene un PIN asignado — si lo perdió, puedes generarle uno nuevo (el anterior deja de servir)."
    : "Todavía no tiene PIN del Portal de Alumnos — genérale uno para poder compartírselo a los papás.";
  el("btnGenerarClavePortal").textContent = alumna.tieneClavePortal ? "Generar PIN nuevo" : "Generar PIN";
  el("mensajeClavePortalGenerada").textContent = "";

  const preview = el("fotoPreviewModal");
  if (alumna.foto_key) {
    preview.src = urlFotoFirmada(alumna.foto_key, alumna.fotoUrl);
    preview.hidden = false;
  } else {
    preview.hidden = true;
  }

  el("modalAlumna").hidden = false;
  modulosPanel.abrirFicha(alumna);
}

el("btnGenerarClavePortal").addEventListener("click", async () => {
  if (!window.confirm("¿Generar un PIN nuevo del Portal de Alumnos para este alumno? Si ya tenía uno, deja de funcionar.")) return;

  el("btnGenerarClavePortal").disabled = true;
  el("mensajeClavePortalGenerada").textContent = "";
  try {
    const r = await llamar("academiaGenerarClavePortalAlumna", { alumnaId: alumnaEditandoId });
    if (!r.success) { el("mensajeErrorEditar").textContent = r.error || "No se pudo generar."; return; }
    el("mensajeClavePortalGenerada").textContent = `PIN nuevo: ${r.clave} — compártelo con los papás.`;
    el("textoEstadoClavePortal").textContent = "Ya tiene un PIN asignado — si lo perdió, puedes generarle uno nuevo (el anterior deja de servir).";
    el("btnGenerarClavePortal").textContent = "Generar PIN nuevo";
  } catch (e) {
    el("mensajeErrorEditar").textContent = "No se pudo conectar. Inténtalo de nuevo.";
  } finally {
    el("btnGenerarClavePortal").disabled = false;
  }
});

el("btnCancelarEditar").addEventListener("click", () => { el("modalAlumna").hidden = true; });

el("btnGuardarEditar").addEventListener("click", async () => {
  const nombre = el("inputEditarNombre").value.trim();
  const clasesPorMes = Number(el("inputEditarClases").value) || 8;
  const estado = el("selectEditarEstado").value;
  const archivo = el("inputEditarFoto").files[0] || null;

  if (!nombre) { el("mensajeErrorEditar").textContent = "El nombre no puede quedar vacío."; return; }

  el("btnGuardarEditar").disabled = true;
  try {
    const fotoBase64 = await redimensionarImagen(archivo);
    const r = await llamar("academiaEditarAlumna", {
      alumnaId: alumnaEditandoId,
      nombre,
      clasesPorMes,
      estado,
      ...(fotoBase64 ? { fotoBase64 } : {}),
    });
    if (!r.success) { el("mensajeErrorEditar").textContent = r.error || "No se pudo guardar."; return; }
    const errorClases = await modulosPanel.guardarFicha(alumnaEditandoId);
    if (errorClases) {
      el("mensajeErrorEditar").textContent = "⚠️ Los demás cambios se guardaron, pero hubo un problema: " + errorClases;
      cargarAlumnas();
      return;
    }
    if (r.advertenciaFoto) {
      // Se deja el modal abierto (en vez de cerrarlo de una vez) para
      // que se alcance a leer el aviso — si no, "se guarda pero no se
      // ve la foto" y nadie se entera de por qué.
      el("mensajeErrorEditar").textContent = "⚠️ " + r.advertenciaFoto;
      cargarAlumnas();
      return;
    }
    el("modalAlumna").hidden = true;
    cargarAlumnas();
  } catch (e) {
    el("mensajeErrorEditar").textContent = e.message || "No se pudo conectar. Inténtalo de nuevo.";
  } finally {
    el("btnGuardarEditar").disabled = false;
  }
});

el("btnBorrarAlumna").addEventListener("click", async () => {
  const nombre = el("inputEditarNombre").value.trim();
  if (!window.confirm(`¿Borrar a "${nombre}"? Se elimina para siempre junto con su historial de asistencia y su foto. Esto no se puede deshacer.`)) return;

  try {
    const r = await llamar("academiaBorrarAlumna", { alumnaId: alumnaEditandoId });
    if (!r.success) { el("mensajeErrorEditar").textContent = r.error || "No se pudo borrar."; return; }
    el("modalAlumna").hidden = true;
    cargarAlumnas();
  } catch (e) {
    el("mensajeErrorEditar").textContent = "No se pudo conectar. Inténtalo de nuevo.";
  }
});

// ---------------------------------------------------------------
// ASISTENCIAS DE UN ALUMNO (ver + borrar una marcación puntual) —
// para corregir cuando se confunden y marcan doble, o marcan al
// alumno equivocado por error. Es la MISMA fila que cuenta tanto
// "clases este mes" aquí como el historial que ve el papá en su
// portal, así que borrarla aquí arregla los dos lados de una vez.
// ---------------------------------------------------------------
let alumnaAsistenciasId = null;

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

async function abrirModalAsistencias(alumna) {
  alumnaAsistenciasId = alumna.id;
  el("nombreAlumnaAsistencias").textContent = alumna.nombre;
  el("mensajeErrorAsistencias").textContent = "";
  el("modalAsistencias").hidden = false;
  await cargarAsistenciasAlumna();
}

async function cargarAsistenciasAlumna() {
  const cont = el("listaAsistenciasAlumna");
  cont.innerHTML = '<p class="lista-vacia">Cargando...</p>';
  try {
    const r = await llamar("academiaAsistenciaAlumna", { alumnaId: alumnaAsistenciasId });
    if (!r.success) {
      cont.innerHTML = "";
      el("mensajeErrorAsistencias").textContent = r.error || "No se pudo cargar el historial.";
      return;
    }
    if (!r.asistencias.length) {
      cont.innerHTML = '<p class="lista-vacia">Todavía no tiene ninguna asistencia marcada.</p>';
      return;
    }
    cont.innerHTML = r.asistencias.map((a) => {
      const urlVerificacion = escaparHtml(a.fotoVerificacionUrl || "");
      const foto = a.fotoVerificacionUrl
        ? `<img class="foto-miniatura" src="${urlVerificacion}" alt="" style="cursor:pointer" data-foto="${urlVerificacion}" />`
        : `<div class="foto-miniatura vacia">🧑</div>`;
      return `
      <div class="tarjeta-item">
        ${foto}
        <div class="info-principal">
          <div class="nombre-item">${escaparHtml(formatearFechaHora(a.fecha))}</div>
          <div class="detalle-item">${a.metodo === "Huella" ? "👆 Huella" : "🔢 Código"}${a.cuenta === false ? " · ↩️ repetida, no cuenta" : ""}</div>
        </div>
        <div class="acciones-item">
          <button class="btn peligro chico" data-id="${a.id}">🗑️Borrar</button>
        </div>
      </div>
    `;
    }).join("");
    cont.querySelectorAll("[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => borrarAsistencia(Number(btn.dataset.id)));
    });
    cont.querySelectorAll("[data-foto]").forEach((img) => {
      img.addEventListener("click", () => window.open(img.dataset.foto, "_blank"));
    });
  } catch (e) {
    cont.innerHTML = "";
    el("mensajeErrorAsistencias").textContent = "No se pudo conectar. Inténtalo de nuevo.";
  }
}

async function borrarAsistencia(asistenciaId) {
  if (!window.confirm("¿Borrar esta marcación? Se quita de \"clases este mes\" y del historial que ve el papá en su portal. Esto no se puede deshacer.")) return;

  el("mensajeErrorAsistencias").textContent = "";
  try {
    const r = await llamar("academiaBorrarAsistencia", { asistenciaId });
    if (!r.success) { el("mensajeErrorAsistencias").textContent = r.error || "No se pudo borrar."; return; }
    await cargarAsistenciasAlumna();
    cargarAlumnas(); // refresca "clases este mes" en la lista de atrás sin cerrar este modal
  } catch (e) {
    el("mensajeErrorAsistencias").textContent = "No se pudo conectar. Inténtalo de nuevo.";
  }
}

el("btnCerrarAsistencias").addEventListener("click", () => { el("modalAsistencias").hidden = true; });

// NOTA: marcar asistencia (la pantalla de "meter el código") ya NO vive
// aquí — vive aparte, en biometrico.html/biometrico.js, pensada para
// quedarse abierta en una tablet en la entrada. Esta página
// (academia.html) es solo para administrar alumnos.

// ---------------------------------------------------------------
// GUARDAR PERSONALIZACIÓN (color + logo)
// ---------------------------------------------------------------

// Vista previa en vivo del color mientras lo eligen, antes de guardar.
el("inputColorMarca").addEventListener("input", () => {
  aplicarMarca(el("inputColorMarca").value);
});

el("inputLogoMarca").addEventListener("change", async () => {
  const archivo = el("inputLogoMarca").files[0] || null;
  const preview = el("logoPreviewPersonalizar");
  if (!archivo) { preview.hidden = true; return; }
  el("mensajeErrorMarca").textContent = "";
  try {
    const dataUrl = await redimensionarImagen(archivo);
    preview.src = dataUrl;
    preview.hidden = false;
  } catch (e) {
    preview.hidden = true;
    el("mensajeErrorMarca").textContent = e.message || "No se pudo abrir esa imagen.";
  }
});

el("btnGuardarMarca").addEventListener("click", async () => {
  const color = el("inputColorMarca").value;
  const archivo = el("inputLogoMarca").files[0] || null;

  el("mensajeErrorMarca").textContent = "";
  el("mensajeExitoMarca").textContent = "";
  el("btnGuardarMarca").disabled = true;

  try {
    const logoBase64 = await redimensionarImagen(archivo);
    const r = await llamar("academiaActualizarMarca", {
      colorMarca: color,
      ...(logoBase64 ? { logoBase64 } : {}),
    });
    if (!r.success) { el("mensajeErrorMarca").textContent = r.error || "No se pudo guardar."; return; }

    // academiaActualizarMarca devuelve el color y la key del logo ya
    // guardados; con eso el logo nuevo se ve aquí de una vez (la tablet
    // lo toma sola en su siguiente refresco).
    sesion.colorMarca = r.colorMarca || color;
    if (r.logoKey !== undefined) {
      sesion.logoKey = r.logoKey || null;
      aplicarLogoEnHeader(sesion.logoKey);
    } else if (logoBase64) {
      // Worker anterior a la Fase 1c (no devuelve la key): solo la vista previa.
      el("logoAcademia").src = logoBase64;
      el("logoAcademia").hidden = false;
    }
    guardarSesion(sesion);
    el("mensajeExitoMarca").textContent = "¡Personalización guardada!";
    el("inputLogoMarca").value = "";
    el("logoPreviewPersonalizar").hidden = true;
  } catch (e) {
    el("mensajeErrorMarca").textContent = e.message || "No se pudo conectar. Inténtalo de nuevo.";
  } finally {
    el("btnGuardarMarca").disabled = false;
  }
});

// ---------------------------------------------------------------
// INICIO — si ya había sesión guardada, entra directo (a menos que se
// haya llegado aquí desde un enlace de "olvidé mi contraseña" — en
// ese caso se prioriza poner la contraseña nueva, no colar la sesión
// vieja que ya estaba guardada en este navegador).
// ---------------------------------------------------------------
if (!tokenRecuperacion) {
  const sesionGuardada = cargarSesionGuardada();
  // Sin token es una sesión de antes de los tokens (con la contraseña
  // guardada): se borra del navegador y se pide entrar de nuevo.
  if (sesionGuardada && (!sesionGuardada.token || sesionVencida(sesionGuardada))) {
    volverALogin(MENSAJE_SESION_VENCIDA);
  } else if (sesionGuardada) {
    sesion = sesionGuardada;
    mostrarPanel();
  }
}

// ---------------------------------------------------------------
// AUTO-ACTUALIZACIÓN — revisa cada vez que se abre, cada vez que
// vuelve a primer plano y cada 5 minutos si hay una versión nueva
// subida; si la hay, recarga sola en vez de dejar a la academia
// usando una copia vieja hasta que a alguien se le ocurra hacer
// refresh a mano.
// ---------------------------------------------------------------
async function verificarActualizacion() {
  try {
    const resp = await fetch(`version.txt?_=${Date.now()}`, { cache: "no-store" });
    if (!resp.ok) return;
    const versionServidor = (await resp.text()).trim();
    if (!versionServidor || versionServidor === VERSION_APP) return;

    const activo = document.activeElement;
    const escribiendo = activo && (activo.tagName === "INPUT" || activo.tagName === "TEXTAREA") && activo.value;
    if (escribiendo) return;

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
