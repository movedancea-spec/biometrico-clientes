// =====================================================================
// BIOMÉTRICO — Panel de la Academia cliente
// =====================================================================
// IMPORTANTE: cambia esta URL por la de TU Worker una vez publicado en
// Cloudflare — debe ser la MISMA URL que pusiste en dueno.js. Sin "/"
// al final.
const API_URL = "https://biometrico-saas.movedancea.workers.dev";

const el = (id) => document.getElementById(id);

let sesion = null; // { academiaId, clave, nombre, limiteAlumnas }
let alumnaEditandoId = null;
let fotoNuevaBase64 = null; // usada tanto para crear como para editar (se limpia entre usos)

function urlFoto(fotoKey) {
  return fotoKey ? `${API_URL}/foto?key=${encodeURIComponent(fotoKey)}` : "";
}

async function llamar(accion, datos) {
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accion, academiaId: sesion?.academiaId, clave: sesion?.clave, ...datos }),
  });
  return await resp.json();
}

function escaparHtml(t) {
  const d = document.createElement("div");
  d.textContent = t == null ? "" : String(t);
  return d.innerHTML;
}

function leerArchivoComoBase64(archivo) {
  return new Promise((resolve, reject) => {
    if (!archivo) return resolve(null);
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = reject;
    lector.readAsDataURL(archivo);
  });
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

function mostrarPanel() {
  el("pantallaLogin").hidden = true;
  el("pantallaPanel").hidden = false;
  el("tituloAcademia").textContent = `📋 ${sesion.nombre}`;
  cargarAlumnas();
}

function volverALogin(mensaje) {
  sesion = null;
  localStorage.removeItem("biometrico_sesion_academia");
  el("pantallaPanel").hidden = true;
  el("pantallaLogin").hidden = false;
  if (mensaje) el("mensajeErrorLogin").textContent = mensaje;
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
    guardarSesion({ academiaId: r.academiaId, clave, nombre: r.nombre, limiteAlumnas: r.limiteAlumnas });
    mostrarPanel();
  } catch (e) {
    el("mensajeErrorLogin").textContent = "No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.";
  } finally {
    el("btnEntrarAcademia").disabled = false;
    el("btnEntrarAcademia").textContent = "Entrar →";
  }
}

el("btnEntrarAcademia").addEventListener("click", intentarEntrar);
el("inputClaveAcademia").addEventListener("keydown", (e) => { if (e.key === "Enter") intentarEntrar(); });

el("btnSalirAcademia").addEventListener("click", () => volverALogin());

// ---------------------------------------------------------------
// LISTAR / PINTAR ALUMNAS
// ---------------------------------------------------------------
async function cargarAlumnas() {
  try {
    const r = await llamar("academiaListarAlumnas", {});
    if (!r.success) { volverALogin(r.error || "Tu sesión ya no es válida, vuelve a entrar."); return; }
    sesion.limiteAlumnas = r.limiteAlumnas;
    pintarAlumnas(r.alumnas, r.cantidadAlumnas, r.limiteAlumnas);
  } catch (e) {
    el("listaAlumnas").innerHTML = '<p class="lista-vacia">No se pudo cargar la lista. Revisa tu conexión.</p>';
  }
}

function pintarAlumnas(alumnas, cantidad, limite) {
  el("infoLimiteAlumnas").textContent = `${cantidad} / ${limite} alumnas`;
  el("ayudaCantidadAlumnas").textContent =
    cantidad >= limite
      ? `Llegaste al límite de tu plan (${limite}). Para agregar más, hay que ampliar el plan con el administrador del sistema.`
      : `Tienes ${cantidad} de ${limite} alumnas de tu plan actual.`;

  el("btnCrearAlumna").disabled = cantidad >= limite;

  const cont = el("listaAlumnas");
  if (!alumnas.length) {
    cont.innerHTML = '<p class="lista-vacia">Todavía no has agregado ninguna alumna.</p>';
    return;
  }

  cont.innerHTML = "";
  alumnas.forEach((a) => {
    const div = document.createElement("div");
    div.className = "tarjeta-item";
    const foto = a.foto_key
      ? `<img class="foto-miniatura" src="${urlFoto(a.foto_key)}" alt="" />`
      : `<div class="foto-miniatura vacia">🧑</div>`;
    div.innerHTML = `
      ${foto}
      <div class="info-principal">
        <div class="nombre-item">#${a.codigo} — ${escaparHtml(a.nombre)}</div>
        <div class="detalle-item">
          <span class="etiqueta-estado ${a.estado === "Activa" ? "activa" : "inactiva"}">${a.estado}</span>
          &nbsp;·&nbsp; ${a.clasesEsteMes} / ${a.clases_por_mes} clases este mes
        </div>
      </div>
      <div class="acciones-item">
        <button class="btn secundario chico" data-accion="editar">Editar</button>
      </div>
    `;
    div.querySelector('[data-accion="editar"]').addEventListener("click", () => abrirModalEditar(a));
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

  el("mensajeErrorCrear").textContent = "";
  el("mensajeExitoCrear").textContent = "";

  if (!nombre) { el("mensajeErrorCrear").textContent = "Escribe el nombre de la alumna."; return; }

  el("btnCrearAlumna").disabled = true;
  try {
    const fotoBase64 = await leerArchivoComoBase64(archivo);
    const r = await llamar("academiaCrearAlumna", { nombre, clasesPorMes, fotoBase64 });
    if (!r.success) {
      el("mensajeErrorCrear").textContent = r.error || "No se pudo agregar.";
      return;
    }
    el("mensajeExitoCrear").textContent = `"${nombre}" agregada con el código #${r.codigo}.`;
    el("inputNuevaAlumnaNombre").value = "";
    el("inputNuevaAlumnaClases").value = "8";
    el("inputNuevaAlumnaFoto").value = "";
    cargarAlumnas();
  } catch (e) {
    el("mensajeErrorCrear").textContent = "No se pudo conectar. Inténtalo de nuevo.";
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

  const preview = el("fotoPreviewModal");
  if (alumna.foto_key) {
    preview.src = urlFoto(alumna.foto_key);
    preview.hidden = false;
  } else {
    preview.hidden = true;
  }

  el("modalAlumna").hidden = false;
}

el("btnCancelarEditar").addEventListener("click", () => { el("modalAlumna").hidden = true; });

el("btnGuardarEditar").addEventListener("click", async () => {
  const nombre = el("inputEditarNombre").value.trim();
  const clasesPorMes = Number(el("inputEditarClases").value) || 8;
  const estado = el("selectEditarEstado").value;
  const archivo = el("inputEditarFoto").files[0] || null;

  if (!nombre) { el("mensajeErrorEditar").textContent = "El nombre no puede quedar vacío."; return; }

  el("btnGuardarEditar").disabled = true;
  try {
    const fotoBase64 = await leerArchivoComoBase64(archivo);
    const r = await llamar("academiaEditarAlumna", {
      alumnaId: alumnaEditandoId,
      nombre,
      clasesPorMes,
      estado,
      ...(fotoBase64 ? { fotoBase64 } : {}),
    });
    if (!r.success) { el("mensajeErrorEditar").textContent = r.error || "No se pudo guardar."; return; }
    el("modalAlumna").hidden = true;
    cargarAlumnas();
  } catch (e) {
    el("mensajeErrorEditar").textContent = "No se pudo conectar. Inténtalo de nuevo.";
  } finally {
    el("btnGuardarEditar").disabled = false;
  }
});

el("btnBorrarAlumna").addEventListener("click", async () => {
  const nombre = el("inputEditarNombre").value.trim();
  if (!window.confirm(`¿Borrar a "${nombre}"? Su código nunca se volverá a usar, pero se conserva su historial de asistencia.`)) return;

  try {
    const r = await llamar("academiaBorrarAlumna", { alumnaId: alumnaEditandoId });
    if (!r.success) { el("mensajeErrorEditar").textContent = r.error || "No se pudo borrar."; return; }
    el("modalAlumna").hidden = true;
    cargarAlumnas();
  } catch (e) {
    el("mensajeErrorEditar").textContent = "No se pudo conectar. Inténtalo de nuevo.";
  }
});

// NOTA: marcar asistencia (la pantalla de "meter el código") ya NO vive
// aquí — vive aparte, en biometrico.html/biometrico.js, pensada para
// quedarse abierta en una tablet en la entrada. Esta página
// (academia.html) es solo para administrar alumnas.

// ---------------------------------------------------------------
// INICIO — si ya había sesión guardada, entra directo
// ---------------------------------------------------------------
const sesionGuardada = cargarSesionGuardada();
if (sesionGuardada) {
  sesion = sesionGuardada;
  mostrarPanel();
}
