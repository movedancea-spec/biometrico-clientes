// =====================================================================
// BIOMÉTRICO — Pantalla de Entrada (para dejar en una tablet)
// =====================================================================
// Esta es la pantalla que se queda fija en la entrada: la alumna
// escribe su código con el teclado en pantalla, ve su foto y un
// mensaje de bienvenida, y automáticamente regresa a esperar el
// siguiente código. No tiene NADA de administración — para eso está
// academia.html, aparte.
//
// IMPORTANTE: misma URL que en dueno.js/academia.js. Sin "/" al final.
const API_URL = "https://biometrico-saas.movedancea.workers.dev";

const el = (id) => document.getElementById(id);

let sesion = null; // { academiaId, clave, nombre }
let codigoActual = "";
let timeoutResultado = null;

document.body.classList.add("modo-kiosko");

function urlFoto(fotoKey) {
  return fotoKey ? `${API_URL}/foto?key=${encodeURIComponent(fotoKey)}` : "";
}

function escaparHtml(t) {
  const d = document.createElement("div");
  d.textContent = t == null ? "" : String(t);
  return d.innerHTML;
}

async function llamar(accion, datos) {
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accion, academiaId: sesion?.academiaId, clave: sesion?.clave, ...datos }),
  });
  return await resp.json();
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

function mostrarTeclado() {
  el("pantallaLogin").hidden = true;
  el("pantallaResultado").hidden = true;
  el("pantallaTeclado").hidden = false;
  el("marcaAcademiaKiosko").textContent = sesion.nombre;
  reiniciarCodigo();
}

async function intentarEntrar() {
  const nombre = el("inputNombreAcademia").value.trim();
  const clave = el("inputClaveAcademia").value.trim();
  if (!nombre || !clave) return;
  el("mensajeErrorLogin").textContent = "";
  el("btnEntrarAcademia").disabled = true;
  el("btnEntrarAcademia").textContent = "Entrando...";

  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "academiaLogin", nombre, clave }),
    });
    const r = await resp.json();
    if (!r.success) {
      el("mensajeErrorLogin").textContent = r.error || "No se pudo entrar.";
      return;
    }
    guardarSesion({ academiaId: r.academiaId, clave, nombre: r.nombre });
    mostrarTeclado();
  } catch (e) {
    el("mensajeErrorLogin").textContent = "No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.";
  } finally {
    el("btnEntrarAcademia").disabled = false;
    el("btnEntrarAcademia").textContent = "Entrar →";
  }
}

el("btnEntrarAcademia").addEventListener("click", intentarEntrar);
el("inputClaveAcademia").addEventListener("keydown", (e) => { if (e.key === "Enter") intentarEntrar(); });

el("btnSalirKiosko").addEventListener("click", () => {
  if (!window.confirm("¿Salir de esta pantalla? Vas a tener que volver a escribir el nombre y la contraseña de la academia para volver a dejarla lista.")) return;
  sesion = null;
  localStorage.removeItem("biometrico_sesion_kiosko");
  el("pantallaTeclado").hidden = true;
  el("pantallaLogin").hidden = false;
  el("inputNombreAcademia").value = "";
  el("inputClaveAcademia").value = "";
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
el("btnConfirmarCodigo").addEventListener("click", confirmarCodigo);

// También acepta un teclado físico, por si la tablet tiene uno conectado.
document.addEventListener("keydown", (e) => {
  if (el("pantallaTeclado").hidden) return;
  if (e.key >= "0" && e.key <= "9") agregarDigito(e.key);
  else if (e.key === "Backspace") borrarDigito();
  else if (e.key === "Enter") confirmarCodigo();
});

// ---------------------------------------------------------------
// MARCAR ASISTENCIA
// ---------------------------------------------------------------
async function confirmarCodigo() {
  if (!codigoActual) return;
  const codigo = Number(codigoActual);
  el("btnConfirmarCodigo").disabled = true;

  try {
    const r = await llamar("academiaMarcarAsistencia", { codigo, metodo: "Codigo" });
    if (!r.success) {
      el("mensajeErrorKiosko").textContent = r.error || "No se pudo marcar la asistencia.";
      codigoActual = "";
      pintarVisor();
      return;
    }
    mostrarBienvenida(r);
  } catch (e) {
    el("mensajeErrorKiosko").textContent = "No se pudo conectar. Inténtalo de nuevo.";
  } finally {
    el("btnConfirmarCodigo").disabled = false;
  }
}

function mostrarBienvenida(r) {
  el("pantallaTeclado").hidden = true;
  el("pantallaResultado").hidden = false;

  const foto = r.alumna.fotoKey
    ? `<img class="foto-bienvenida" src="${urlFoto(r.alumna.fotoKey)}" alt="" />`
    : `<div class="foto-bienvenida vacia">💃</div>`;

  el("contenidoResultado").innerHTML = `
    <div class="kiosko-bienvenida">
      ${foto}
      <div class="mensaje-bienvenida">¡Bienvenida, ${escaparHtml(r.alumna.nombre)}!</div>
      <div class="detalle-bienvenida">Asistencia marcada — ${r.clasesEsteMes} / ${r.clasesPorMes} clases este mes.</div>
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
const sesionGuardada = cargarSesionGuardada();
if (sesionGuardada) {
  sesion = sesionGuardada;
  mostrarTeclado();
}
