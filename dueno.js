// =====================================================================
// BIOMÉTRICO — Panel del Dueño (Ana)
// =====================================================================
// IMPORTANTE: cambia esta URL por la de TU Worker una vez que lo hayas
// publicado en Cloudflare (Settings → Domains and Routes, o la URL
// "*.workers.dev" que te da por defecto). Debe terminar SIN "/" al final.
const API_URL = "https://biometrico-saas.movedancea.workers.dev";

// Se actualiza solo, en automático, cada vez que se sube una versión
// nueva de los archivos — ver verificarActualizacion() al final de
// este archivo. NO cambiar este valor a mano: lo actualiza el script
// actualizar-versiones.mjs cada vez que algo cambia.
const VERSION_APP = "29d269f15c18";

const el = (id) => document.getElementById(id);

// Sesión del dueño: { token, expiraEn }. La contraseña NO se guarda —
// solo el token que devuelve duenoLogin.
let sesion = null;
let academiaEditandoId = null;
let catalogoModulos = []; // [{ modulo, nombre, disponible }] — viene de duenoListarAcademias

const MENSAJE_SESION_VENCIDA = "Tu sesión terminó. Vuelve a escribir tu clave para seguir.";

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
      el("btnEntrarDueno").disabled = false;
      return;
    }
    el("mensajeErrorLogin").textContent = textoBloqueo(faltan);
    el("btnEntrarDueno").disabled = true;
  };
  pintar();
  intervaloBloqueoLogin = setInterval(pintar, 1000);
}

// ---------------------------------------------------------------
// SESIÓN GUARDADA
// ---------------------------------------------------------------
function guardarSesion(s) {
  sesion = s;
  localStorage.setItem("biometrico_sesion_dueno", JSON.stringify(s));
}

function cargarSesionGuardada() {
  try {
    const cruda = localStorage.getItem("biometrico_sesion_dueno");
    if (cruda) return JSON.parse(cruda);
  } catch (e) { /* dato corrupto — se ignora */ }
  return null;
}

function sesionVencida(s) {
  return s && s.expiraEn && new Date(s.expiraEn).getTime() <= Date.now();
}

async function pedirToken(claveDueno) {
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accion: "duenoLogin", claveDueno }),
  });
  return { status: resp.status, r: await resp.json() };
}

// ---------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------
function mostrarPanel() {
  el("pantallaLogin").hidden = true;
  el("pantallaPanel").hidden = false;
  cargarAcademias();
  iniciarActualizacionAutomaticaDeAcademias();
}

// Refresca sola la lista de academias cada pocos segundos mientras el
// panel está abierto — así, sin que Ana tenga que darle refresh a la
// página, se ve solo: cuando una academia agrega/borra un alumno (el
// contador de alumnos cambia), cuando su mensualidad pasa a "Pendiente"
// o "Al día", o cuando ella misma la activa/desactiva desde acá. Se
// detiene al salir de la sesión, se pausa mientras la pestaña está en
// segundo plano, y no refresca mientras hay un modal de editar abierto
// (para no pisarle el formulario a media edición).
let intervaloAcademias = null;
function iniciarActualizacionAutomaticaDeAcademias() {
  detenerActualizacionAutomaticaDeAcademias();
  intervaloAcademias = setInterval(() => {
    if (document.hidden) return; // pestaña en segundo plano — no molesta con llamadas de más
    if (el("modalEditarAcademia").hidden) cargarAcademias();
  }, 15000);
}
function detenerActualizacionAutomaticaDeAcademias() {
  if (intervaloAcademias) {
    clearInterval(intervaloAcademias);
    intervaloAcademias = null;
  }
}

async function intentarEntrar() {
  const clave = el("inputClaveDueno").value.trim();
  if (!clave) return;
  el("mensajeErrorLogin").textContent = "";
  el("btnEntrarDueno").disabled = true;
  el("btnEntrarDueno").textContent = "Entrando...";

  let bloqueado = false;
  try {
    const { status, r } = await pedirToken(clave);
    if (status === 429) {
      bloqueado = true;
      mostrarBloqueoLogin(r.reintentarEnSegundos);
      return;
    }
    if (!r.success) {
      el("mensajeErrorLogin").textContent = r.error || "Clave incorrecta.";
      return;
    }
    guardarSesion({ token: r.token, expiraEn: r.expiraEn });
    localStorage.removeItem("biometrico_clave_dueno");
    el("inputClaveDueno").value = "";
    mostrarPanel();
  } catch (e) {
    el("mensajeErrorLogin").textContent = "No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.";
  } finally {
    el("btnEntrarDueno").disabled = bloqueado;
    el("btnEntrarDueno").textContent = "Entrar →";
  }
}

el("btnEntrarDueno").addEventListener("click", intentarEntrar);
el("inputClaveDueno").addEventListener("keydown", (e) => { if (e.key === "Enter") intentarEntrar(); });

function volverALogin(mensaje) {
  sesion = null;
  localStorage.removeItem("biometrico_sesion_dueno");
  localStorage.removeItem("biometrico_clave_dueno");
  detenerActualizacionAutomaticaDeAcademias();
  el("modalEditarAcademia").hidden = true;
  el("pantallaPanel").hidden = true;
  el("pantallaLogin").hidden = false;
  el("inputClaveDueno").value = "";
  el("mensajeErrorLogin").textContent = mensaje || "";
}

// Cerrar sesión: se avisa al servidor para que el token deje de servir
// (si falla por red, igual se borra de este navegador).
el("btnSalirDueno").addEventListener("click", async () => {
  if (sesion?.token) {
    try { await llamar("cerrarSesion", {}); } catch (e) { /* mejor esfuerzo */ }
  }
  volverALogin();
});

// ---------------------------------------------------------------
// LISTAR / PINTAR ACADEMIAS
// ---------------------------------------------------------------
async function cargarAcademias() {
  try {
    const r = await llamar("duenoListarAcademias", {});
    if (!r.success) {
      // 401 ya mandó al login desde llamar(); cualquier otro error se
      // muestra sin sacar a nadie de su sesión.
      if (!sesion) return;
      el("listaAcademias").innerHTML = `<p class="lista-vacia">${escaparHtml(r.error || "No se pudo cargar la lista.")}</p>`;
      return;
    }
    catalogoModulos = r.catalogoModulos || [];
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
    cont.innerHTML = '<p class="lista-vacia">Todavía no has creado ningún cliente.</p>';
    return;
  }

  cont.innerHTML = "";
  academias.forEach((a) => {
    const div = document.createElement("div");
    div.className = "tarjeta-item";
    div.innerHTML = `
      <div class="info-principal">
        <div class="nombre-item">${escaparHtml(a.nombre)}</div>
        <span class="etiqueta-estado ${a.tipo_cliente === "empresa" ? "inactiva" : "activa"}" style="margin-left:6px;">${a.tipo_cliente === "empresa" ? "🏢 Empresa" : "💃 Academia"}</span>
        <div class="detalle-item">
          <span class="etiqueta-estado ${a.activo ? "activa" : "inactiva"}">${a.activo ? "Activa" : "Desactivada"}</span>
          &nbsp;·&nbsp; ${a.cantidadAlumnas} / ${a.limite_alumnas} ${a.tipo_cliente === "empresa" ? "empleados" : "alumnos"}
          &nbsp;·&nbsp; ${a.cantidadDispositivos} / ${a.limite_dispositivos} dispositivos
          &nbsp;·&nbsp; Q${Number(a.mensualidad || 0).toFixed(2)}/mes
          &nbsp;·&nbsp; <span class="etiqueta-estado ${a.pago_al_dia ? "activa" : "inactiva"}">${a.pago_al_dia ? "Al día" : "Debe mensualidad"}</span>
          ${(a.modulos || []).length ? `<br/>🧩 ${escaparHtml(nombresModulos(a.modulos))}` : ""}
        </div>
      </div>
      <div class="acciones-item">
        <button class="btn secundario chico" data-accion="editar">Editar</button>
        <button class="btn ${a.activo ? "peligro" : ""} chico" data-accion="toggle">${a.activo ? "Desactivar" : "Activar"}</button>
      </div>
    `;
    div.querySelector('[data-accion="editar"]').addEventListener("click", () => abrirModalEditarAcademia(a));
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
    const r = await llamar("duenoActualizarAcademia", { academiaId: academia.id, activo: nuevoEstado });
    if (!r.success) { alert(r.error || "No se pudo actualizar."); return; }
    cargarAcademias();
  } catch (e) {
    alert("No se pudo conectar. Inténtalo de nuevo.");
  }
}

// ---------------------------------------------------------------
// EDITAR / BORRAR ACADEMIA (modal)
// ---------------------------------------------------------------
let academiaEditandoNombre = "";

function abrirModalEditarAcademia(academia) {
  academiaEditandoId = academia.id;
  academiaEditandoNombre = academia.nombre;
  el("inputEditarNombreAcademia").value = academia.nombre;
  el("inputEditarClaveAcademia").value = "";
  el("inputEditarLimite").value = academia.limite_alumnas;
  el("inputEditarLimiteDispositivos").value = academia.limite_dispositivos || 1;
  el("inputEditarEmailAcademia").value = academia.email || "";
  el("inputEditarMensualidad").value = academia.mensualidad || 0;
  el("inputEditarTipoCliente").value = academia.tipo_cliente || "academia";
  el("textoEstadoPagoAcademia").textContent = academia.pago_al_dia
    ? "Este mes está al día."
    : "Debe la mensualidad de este mes (o de un mes anterior).";
  el("mensajeErrorEditarAcademia").textContent = "";
  pintarModulosAcademia(academia);
  el("modalEditarAcademia").hidden = false;
  cargarHistorialPagos(academia.id);
  cargarDispositivos(academia.id);
}

// ---------------------------------------------------------------
// MÓDULOS (Fase 2) — solo para academias. Cada casilla se guarda al
// instante con duenoActualizarModulos; los "próximamente" salen grises.
// ---------------------------------------------------------------
// Nombres en el orden del catálogo (no en el que vienen de la base).
function nombresModulos(modulos) {
  return catalogoModulos.filter((c) => modulos.includes(c.modulo)).map((c) => c.nombre).join(", ");
}

function pintarModulosAcademia(academia) {
  const cont = el("listaModulosAcademia");
  el("mensajeModulosAcademia").textContent = "";
  if ((academia.tipo_cliente || "academia") !== "academia") {
    cont.innerHTML = '<p class="ayuda" style="margin:0;">Los módulos son solo para academias.</p>';
    return;
  }
  const activos = new Set(academia.modulos || []);
  cont.innerHTML = catalogoModulos.map((m) => `
    <label class="opcion-check"${m.disponible ? "" : ' style="opacity:.5; cursor:default;"'}>
      <input type="checkbox" data-modulo="${escaparHtml(m.modulo)}" ${activos.has(m.modulo) ? "checked" : ""} ${m.disponible ? "" : "disabled"} />
      ${escaparHtml(m.nombre)}${m.disponible ? "" : " — próximamente"}
    </label>
  `).join("");
  cont.querySelectorAll("[data-modulo]").forEach((casilla) => {
    casilla.addEventListener("change", () => cambiarModulo(academia, casilla));
  });
}

async function cambiarModulo(academia, casilla) {
  const modulo = casilla.dataset.modulo;
  const activo = casilla.checked;
  el("mensajeModulosAcademia").textContent = "";
  el("mensajeErrorEditarAcademia").textContent = "";
  casilla.disabled = true;
  try {
    const r = await llamar("duenoActualizarModulos", { academiaId: academia.id, modulos: { [modulo]: activo } });
    if (!r.success) {
      casilla.checked = !activo;
      el("mensajeErrorEditarAcademia").textContent = r.error || "No se pudo cambiar el módulo.";
      return;
    }
    academia.modulos = r.modulos || [];
    el("mensajeModulosAcademia").textContent = `${activo ? "Activado" : "Apagado"}: ${nombresModulos([modulo])}.`;
    cargarAcademias();
  } catch (e) {
    casilla.checked = !activo;
    el("mensajeErrorEditarAcademia").textContent = "No se pudo conectar. Inténtalo de nuevo.";
  } finally {
    casilla.disabled = false;
  }
}

// ---------------------------------------------------------------
// HISTORIAL DE PAGOS (todos los meses de una academia) — incluye los
// links de pago que generó y los comprobantes que haya subido.
// ---------------------------------------------------------------
async function cargarHistorialPagos(academiaId) {
  const cont = el("listaHistorialPagos");
  cont.innerHTML = '<p class="lista-vacia">Cargando historial...</p>';
  try {
    const r = await llamar("duenoListarPagosAcademia", { academiaId });
    // Si mientras cargaba se cerró el modal o se abrió otra academia,
    // no pintar un historial que ya no corresponde a lo que se ve.
    if (academiaId !== academiaEditandoId) return;
    if (!r.success) {
      cont.innerHTML = `<p class="lista-vacia">${escaparHtml(r.error || "No se pudo cargar el historial.")}</p>`;
      return;
    }
    pintarHistorialPagos(r.pagos);
  } catch (e) {
    if (academiaId !== academiaEditandoId) return;
    cont.innerHTML = '<p class="lista-vacia">No se pudo cargar el historial. Revisa tu conexión.</p>';
  }
}

function pintarHistorialPagos(pagos) {
  const cont = el("listaHistorialPagos");
  if (!pagos || !pagos.length) {
    cont.innerHTML = '<p class="lista-vacia">Todavía no hay ningún cobro generado para este cliente.</p>';
    return;
  }

  cont.innerHTML = "";
  pagos.forEach((p) => {
    const div = document.createElement("div");
    div.className = "tarjeta-item";
    const partes = [];
    if (p.paggo_link) {
      partes.push(`<a href="${escaparHtml(p.paggo_link)}" target="_blank" rel="noopener">Ver link de pago →</a>`);
    }
    if (p.comprobante_key) {
      partes.push(p.comprobanteUrl
        ? `<a href="${escaparHtml(p.comprobanteUrl)}" target="_blank" rel="noopener">📎 Ver comprobante →</a>`
        : "📎 Comprobante subido (no se pudo generar el enlace)");
    }
    div.innerHTML = `
      <div class="info-principal">
        <div class="nombre-item">${escaparHtml(p.mes)} — Q${Number(p.monto || 0).toFixed(2)}</div>
        <div class="detalle-item">
          <span class="etiqueta-estado ${p.estado === "pagado" ? "activa" : "inactiva"}">${p.estado === "pagado" ? "Pagado" : "Pendiente"}</span>
          ${p.pagado_en ? `&nbsp;·&nbsp; pagado el ${escaparHtml(p.pagado_en)} UTC` : ""}
          ${partes.length ? `<br/>${partes.join("&nbsp;·&nbsp;")}` : ""}
        </div>
      </div>
    `;
    cont.appendChild(div);
  });
}

// ---------------------------------------------------------------
// DISPOSITIVOS ACTIVADOS (tablets que ya iniciaron sesión) — permite
// "liberar" uno para que la academia pueda activar una tablet nueva
// sin necesidad de subirle el límite.
// ---------------------------------------------------------------
async function cargarDispositivos(academiaId) {
  const cont = el("listaDispositivos");
  cont.innerHTML = '<p class="lista-vacia">Cargando dispositivos...</p>';
  try {
    const r = await llamar("duenoListarDispositivos", { academiaId });
    if (academiaId !== academiaEditandoId) return;
    if (!r.success) {
      cont.innerHTML = `<p class="lista-vacia">${escaparHtml(r.error || "No se pudo cargar la lista de dispositivos.")}</p>`;
      return;
    }
    pintarDispositivos(r.dispositivos, academiaId);
  } catch (e) {
    if (academiaId !== academiaEditandoId) return;
    cont.innerHTML = '<p class="lista-vacia">No se pudo cargar la lista. Revisa tu conexión.</p>';
  }
}

function pintarDispositivos(dispositivos, academiaId) {
  const cont = el("listaDispositivos");
  if (!dispositivos || !dispositivos.length) {
    cont.innerHTML = '<p class="lista-vacia">Todavía no se ha activado ningún dispositivo para este cliente.</p>';
    return;
  }

  cont.innerHTML = "";
  dispositivos.forEach((d, i) => {
    const div = document.createElement("div");
    div.className = "tarjeta-item";
    div.innerHTML = `
      <div class="info-principal">
        <div class="nombre-item">Dispositivo ${i + 1}</div>
        <div class="detalle-item">
          Activado el ${escaparHtml(d.creado_en)} UTC
          &nbsp;·&nbsp; usado por última vez el ${escaparHtml(d.ultimo_uso_en)} UTC
        </div>
      </div>
      <div class="acciones-item">
        <button class="btn peligro chico" data-accion="liberar">Liberar</button>
      </div>
    `;
    div.querySelector('[data-accion="liberar"]').addEventListener("click", async () => {
      if (!window.confirm(`¿Liberar este dispositivo? La tablet que lo tenía activado deja de "ocupar cupo" — si vuelve a iniciar sesión desde cero, contará como una tablet nueva.`)) return;
      try {
        const r = await llamar("duenoLiberarDispositivo", { dispositivoId: d.id });
        if (!r.success) { alert(r.error || "No se pudo liberar."); return; }
        cargarDispositivos(academiaId);
        cargarAcademias();
      } catch (e) {
        alert("No se pudo conectar. Inténtalo de nuevo.");
      }
    });
    cont.appendChild(div);
  });
}

el("btnMarcarPagadoManual").addEventListener("click", async () => {
  if (!window.confirm(`¿Marcar a "${academiaEditandoNombre}" como al día, aunque no haya llegado el pago por Paggo (por ejemplo, si te pagó en efectivo o transferencia)?`)) return;

  try {
    const r = await llamar("duenoActualizarAcademia", { academiaId: academiaEditandoId, pagoAlDia: true });
    if (!r.success) { alert(r.error || "No se pudo actualizar."); return; }
    el("textoEstadoPagoAcademia").textContent = "Este mes está al día.";
    cargarAcademias();
  } catch (e) {
    alert("No se pudo conectar. Inténtalo de nuevo.");
  }
});

el("btnCancelarEditarAcademia").addEventListener("click", () => { el("modalEditarAcademia").hidden = true; });

el("btnGuardarEditarAcademia").addEventListener("click", async () => {
  const nombre = el("inputEditarNombreAcademia").value.trim();
  const claveNueva = el("inputEditarClaveAcademia").value.trim();
  const nuevoLimite = Number(el("inputEditarLimite").value);
  const nuevoLimiteDispositivos = Number(el("inputEditarLimiteDispositivos").value);
  const email = el("inputEditarEmailAcademia").value.trim();
  const mensualidad = Number(el("inputEditarMensualidad").value) || 0;
  const tipoCliente = el("inputEditarTipoCliente").value;

  el("mensajeErrorEditarAcademia").textContent = "";

  if (!nombre) { el("mensajeErrorEditarAcademia").textContent = "El nombre no puede quedar vacío."; return; }
  if (!nuevoLimite || nuevoLimite < 1) { el("mensajeErrorEditarAcademia").textContent = "Escribe un límite de alumnos válido."; return; }
  if (!nuevoLimiteDispositivos || nuevoLimiteDispositivos < 1) { el("mensajeErrorEditarAcademia").textContent = "Escribe un límite de dispositivos válido."; return; }
  if (claveNueva && claveNueva.length < 4) { el("mensajeErrorEditarAcademia").textContent = "La contraseña nueva debe tener al menos 4 caracteres."; return; }
  if (mensualidad < 0) { el("mensajeErrorEditarAcademia").textContent = "La mensualidad no puede ser negativa."; return; }

  el("btnGuardarEditarAcademia").disabled = true;
  try {
    const r = await llamar("duenoActualizarAcademia", {
      academiaId: academiaEditandoId,
      nombre,
      limite: nuevoLimite,
      limiteDispositivos: nuevoLimiteDispositivos,
      email,
      mensualidad,
      tipoCliente,
      ...(claveNueva ? { clave: claveNueva } : {}),
    });
    if (!r.success) { el("mensajeErrorEditarAcademia").textContent = r.error || "No se pudo guardar."; return; }
    el("modalEditarAcademia").hidden = true;
    cargarAcademias();
  } catch (e) {
    el("mensajeErrorEditarAcademia").textContent = "No se pudo conectar. Inténtalo de nuevo.";
  } finally {
    el("btnGuardarEditarAcademia").disabled = false;
  }
});

el("btnBorrarAcademia").addEventListener("click", async () => {
  if (!window.confirm(`¿Borrar por completo a "${academiaEditandoNombre}"? Se elimina para siempre junto con sus alumnos, su historial de asistencias, sus pagos y sus fotos — después SÍ vas a poder crear otro cliente con ese mismo nombre. Esto no se puede deshacer.`)) return;

  try {
    const r = await llamar("duenoBorrarAcademia", { academiaId: academiaEditandoId });
    if (!r.success) { el("mensajeErrorEditarAcademia").textContent = r.error || "No se pudo borrar."; return; }
    el("modalEditarAcademia").hidden = true;
    cargarAcademias();
  } catch (e) {
    el("mensajeErrorEditarAcademia").textContent = "No se pudo conectar. Inténtalo de nuevo.";
  }
});

// ---------------------------------------------------------------
// CREAR ACADEMIA
// ---------------------------------------------------------------
el("btnCrearAcademia").addEventListener("click", async () => {
  const nombre = el("inputNuevaAcademiaNombre").value.trim();
  const clave = el("inputNuevaAcademiaClave").value.trim();
  const limite = Number(el("inputNuevaAcademiaLimite").value) || 150;
  const limiteDispositivos = Number(el("inputNuevaAcademiaLimiteDispositivos").value) || 1;
  const email = el("inputNuevaAcademiaEmail").value.trim();
  const mensualidad = Number(el("inputNuevaAcademiaMensualidad").value) || 0;
  const tipoCliente = el("inputNuevaAcademiaTipo").value;

  el("mensajeErrorCrear").textContent = "";
  el("mensajeExitoCrear").textContent = "";

  if (!nombre) { el("mensajeErrorCrear").textContent = "Escribe el nombre del cliente."; return; }
  if (clave.length < 4) { el("mensajeErrorCrear").textContent = "La contraseña debe tener al menos 4 caracteres."; return; }

  el("btnCrearAcademia").disabled = true;
  try {
    const r = await llamar("duenoCrearAcademia", { nombre, clave, limite, limiteDispositivos, email, mensualidad, tipoCliente });
    if (!r.success) { el("mensajeErrorCrear").textContent = r.error || "No se pudo crear."; return; }
    el("mensajeExitoCrear").textContent = `Cliente "${nombre}" creado. Avísales el nombre y la contraseña para que entren a su panel.`;
    el("inputNuevaAcademiaNombre").value = "";
    el("inputNuevaAcademiaClave").value = "";
    el("inputNuevaAcademiaLimite").value = "150";
    el("inputNuevaAcademiaLimiteDispositivos").value = "1";
    el("inputNuevaAcademiaEmail").value = "";
    el("inputNuevaAcademiaMensualidad").value = "";
    cargarAcademias();
  } catch (e) {
    el("mensajeErrorCrear").textContent = "No se pudo conectar. Inténtalo de nuevo.";
  } finally {
    el("btnCrearAcademia").disabled = false;
  }
});

// ---------------------------------------------------------------
// INICIO — si ya había una sesión guardada, entra directo. La clave
// suelta de antes de los tokens (biometrico_clave_dueno) ya no sirve:
// se borra del navegador.
// ---------------------------------------------------------------
{
  localStorage.removeItem("biometrico_clave_dueno");
  const guardada = cargarSesionGuardada();
  if (guardada && (!guardada.token || sesionVencida(guardada))) {
    volverALogin(MENSAJE_SESION_VENCIDA);
  } else if (guardada) {
    sesion = guardada;
    mostrarPanel();
  }
}

// ---------------------------------------------------------------
// AUTO-ACTUALIZACIÓN — revisa cada vez que se abre, cada vez que
// vuelve a primer plano y cada 5 minutos si hay una versión nueva
// subida; si la hay, recarga sola en vez de esperar a un refresh a
// mano.
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
