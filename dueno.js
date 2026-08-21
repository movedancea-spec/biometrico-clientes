// =====================================================================
// BIOMÉTRICO — Panel del Dueño (Ana)
// =====================================================================
// IMPORTANTE: cambia esta URL por la de TU Worker una vez que lo hayas
// publicado en Cloudflare (Settings → Domains and Routes, o la URL
// "*.workers.dev" que te da por defecto). Debe terminar SIN "/" al final.
const API_URL = "https://TU-WORKER-BIOMETRICO.workers.dev";

const el = (id) => document.getElementById(id);

let claveDueno = localStorage.getItem("biometrico_clave_dueno") || "";
let academiaEditandoId = null;

async function llamar(accion, datos) {
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accion, ...datos }),
  });
  return await resp.json();
}

// ---------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------
function mostrarPanel() {
  el("pantallaLogin").hidden = true;
  el("pantallaPanel").hidden = false;
  cargarAcademias();
}

async function intentarEntrar() {
  const clave = el("inputClaveDueno").value.trim();
  if (!clave) return;
  el("mensajeErrorLogin").textContent = "";
  el("btnEntrarDueno").disabled = true;
  el("btnEntrarDueno").textContent = "Entrando...";

  try {
    const r = await llamar("duenoListarAcademias", { claveDueno: clave });
    if (!r.success) {
      el("mensajeErrorLogin").textContent = r.error || "Clave incorrecta.";
      return;
    }
    claveDueno = clave;
    localStorage.setItem("biometrico_clave_dueno", clave);
    pintarAcademias(r.academias);
    mostrarPanel();
  } catch (e) {
    el("mensajeErrorLogin").textContent = "No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.";
  } finally {
    el("btnEntrarDueno").disabled = false;
    el("btnEntrarDueno").textContent = "Entrar →";
  }
}

el("btnEntrarDueno").addEventListener("click", intentarEntrar);
el("inputClaveDueno").addEventListener("keydown", (e) => { if (e.key === "Enter") intentarEntrar(); });

el("btnSalirDueno").addEventListener("click", () => {
  claveDueno = "";
  localStorage.removeItem("biometrico_clave_dueno");
  el("pantallaPanel").hidden = true;
  el("pantallaLogin").hidden = false;
  el("inputClaveDueno").value = "";
});

// ---------------------------------------------------------------
// LISTAR / PINTAR ACADEMIAS
// ---------------------------------------------------------------
async function cargarAcademias() {
  try {
    const r = await llamar("duenoListarAcademias", { claveDueno });
    if (!r.success) {
      // La clave guardada ya no sirve — regresa al login.
      el("pantallaPanel").hidden = true;
      el("pantallaLogin").hidden = false;
      el("mensajeErrorLogin").textContent = r.error || "Tu sesión ya no es válida, vuelve a entrar.";
      return;
    }
    pintarAcademias(r.academias);
  } catch (e) {
    el("listaAcademias").innerHTML = '<p class="lista-vacia">No se pudo cargar la lista. Revisa tu conexión.</p>';
  }
}

function pintarAcademias(academias) {
  el("statCantidadAcademias").textContent = academias.length;
  el("statAcademiasActivas").textContent = academias.filter((a) => a.activo).length;
  el("statTotalAlumnas").textContent = academias.reduce((s, a) => s + (a.cantidadAlumnas || 0), 0);

  const cont = el("listaAcademias");
  if (!academias.length) {
    cont.innerHTML = '<p class="lista-vacia">Todavía no has creado ninguna academia.</p>';
    return;
  }

  cont.innerHTML = "";
  academias.forEach((a) => {
    const div = document.createElement("div");
    div.className = "tarjeta-item";
    div.innerHTML = `
      <div class="info-principal">
        <div class="nombre-item">${escaparHtml(a.nombre)}</div>
        <div class="detalle-item">
          <span class="etiqueta-estado ${a.activo ? "activa" : "inactiva"}">${a.activo ? "Activa" : "Desactivada"}</span>
          &nbsp;·&nbsp; ${a.cantidadAlumnas} / ${a.limite_alumnas} alumnas
        </div>
      </div>
      <div class="acciones-item">
        <button class="btn secundario chico" data-accion="limite">Límite</button>
        <button class="btn ${a.activo ? "peligro" : ""} chico" data-accion="toggle">${a.activo ? "Desactivar" : "Activar"}</button>
      </div>
    `;
    div.querySelector('[data-accion="limite"]').addEventListener("click", () => abrirModalLimite(a));
    div.querySelector('[data-accion="toggle"]').addEventListener("click", () => alternarActivo(a));
    cont.appendChild(div);
  });
}

function escaparHtml(t) {
  const d = document.createElement("div");
  d.textContent = t == null ? "" : String(t);
  return d.innerHTML;
}

// ---------------------------------------------------------------
// ACTIVAR / DESACTIVAR
// ---------------------------------------------------------------
async function alternarActivo(academia) {
  const nuevoEstado = !academia.activo;
  const confirmacion = nuevoEstado
    ? `¿Activar el acceso de "${academia.nombre}"?`
    : `¿Desactivar el acceso de "${academia.nombre}"? No podrán usar el sistema hasta que lo vuelvas a activar.`;
  if (!window.confirm(confirmacion)) return;

  try {
    const r = await llamar("duenoActualizarAcademia", { claveDueno, academiaId: academia.id, activo: nuevoEstado });
    if (!r.success) { alert(r.error || "No se pudo actualizar."); return; }
    cargarAcademias();
  } catch (e) {
    alert("No se pudo conectar. Inténtalo de nuevo.");
  }
}

// ---------------------------------------------------------------
// EDITAR LÍMITE (modal)
// ---------------------------------------------------------------
function abrirModalLimite(academia) {
  academiaEditandoId = academia.id;
  el("inputEditarLimite").value = academia.limite_alumnas;
  el("mensajeErrorLimite").textContent = "";
  el("modalLimite").hidden = false;
}

el("btnCancelarLimite").addEventListener("click", () => { el("modalLimite").hidden = true; });

el("btnGuardarLimite").addEventListener("click", async () => {
  const nuevoLimite = Number(el("inputEditarLimite").value);
  if (!nuevoLimite || nuevoLimite < 1) {
    el("mensajeErrorLimite").textContent = "Escribe un número válido.";
    return;
  }
  try {
    const r = await llamar("duenoActualizarAcademia", { claveDueno, academiaId: academiaEditandoId, limite: nuevoLimite });
    if (!r.success) { el("mensajeErrorLimite").textContent = r.error || "No se pudo guardar."; return; }
    el("modalLimite").hidden = true;
    cargarAcademias();
  } catch (e) {
    el("mensajeErrorLimite").textContent = "No se pudo conectar. Inténtalo de nuevo.";
  }
});

// ---------------------------------------------------------------
// CREAR ACADEMIA
// ---------------------------------------------------------------
el("btnCrearAcademia").addEventListener("click", async () => {
  const nombre = el("inputNuevaAcademiaNombre").value.trim();
  const clave = el("inputNuevaAcademiaClave").value.trim();
  const limite = Number(el("inputNuevaAcademiaLimite").value) || 150;

  el("mensajeErrorCrear").textContent = "";
  el("mensajeExitoCrear").textContent = "";

  if (!nombre) { el("mensajeErrorCrear").textContent = "Escribe el nombre de la academia."; return; }
  if (clave.length < 4) { el("mensajeErrorCrear").textContent = "La contraseña debe tener al menos 4 caracteres."; return; }

  el("btnCrearAcademia").disabled = true;
  try {
    const r = await llamar("duenoCrearAcademia", { claveDueno, nombre, clave, limite });
    if (!r.success) { el("mensajeErrorCrear").textContent = r.error || "No se pudo crear."; return; }
    el("mensajeExitoCrear").textContent = `Academia "${nombre}" creada. Avísales el nombre y la contraseña para que entren a su panel.`;
    el("inputNuevaAcademiaNombre").value = "";
    el("inputNuevaAcademiaClave").value = "";
    el("inputNuevaAcademiaLimite").value = "150";
    cargarAcademias();
  } catch (e) {
    el("mensajeErrorCrear").textContent = "No se pudo conectar. Inténtalo de nuevo.";
  } finally {
    el("btnCrearAcademia").disabled = false;
  }
});

// ---------------------------------------------------------------
// INICIO — si ya había una clave guardada, entra directo
// ---------------------------------------------------------------
if (claveDueno) {
  el("inputClaveDueno").value = claveDueno;
  intentarEntrar();
}
