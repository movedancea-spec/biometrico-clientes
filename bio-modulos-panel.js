// ===============================================================
// Módulos de academia en el panel: clases (con inscripción desde la
// ficha del alumno) y avisos (Fase 2); responsable y moneda, y arranque
// de show, trajes y mensualidades (Fase 3, cada uno en su archivo
// bio-modulos-*.js). Solo aparecen si el dueño activó
// el módulo para esta academia (academiaConsultarModulos); el Worker
// también los rechaza si está apagado.
//
// Se carga ANTES de academia.js y usa sus funciones (el, llamar,
// escaparHtml) solo cuando academia.js lo llama: iniciar() desde
// mostrarPanel, reiniciar() desde volverALogin, abrirFicha() y
// guardarFicha() desde el modal de editar alumno.
// ===============================================================
const modulosPanel = (() => {
  const MINUTOS_MIN = 5;
  const MINUTOS_MAX = 120;
  let activos = [];
  let minutosMarcaDoble = 30;   // minutos para que una marca repetida no cuente
  let moneda = { codigo: "GTQ", simbolo: "Q" };
  let monedasDisponibles = [];
  let clases = [];              // [{ id, nombre, horario, activa, inscritos }]
  let avisos = [];              // [{ id, tipo, titulo, texto, fijado, mes, anio, creadoEn, vigente }]
  let claseEditandoId = null;
  let avisoEditandoId = null;
  let fichaAlumnaId = null;     // alumno cuyas clases se ven en el modal
  let fichaClasesOriginales = null; // ids al abrir la ficha (null = no se cargaron)

  const tiene = (modulo) => activos.includes(modulo);

  function nombreMes(mes) {
    const [anio, numero] = String(mes || "").split("-").map(Number);
    if (!anio || !numero) return mes || "";
    return new Date(Date.UTC(anio, numero - 1, 1)).toLocaleString("es-GT", { month: "long", year: "numeric", timeZone: "UTC" });
  }

  function fechaCorta(iso) {
    try {
      return new Date(iso).toLocaleString("es-GT", { timeZone: "America/Guatemala", day: "numeric", month: "short", year: "numeric" });
    } catch (e) {
      return "";
    }
  }

  // ---------------------------------------------------------------
  // Arranque
  // ---------------------------------------------------------------
  function reiniciar() {
    activos = []; clases = []; avisos = [];
    minutosMarcaDoble = 30;
    claseEditandoId = null; avisoEditandoId = null;
    fichaAlumnaId = null; fichaClasesOriginales = null;
    el("contenedorModulos").innerHTML = "";
    el("bloqueClasesAlumna").hidden = true;
    el("bloqueClasesAlumna").innerHTML = "";
    el("etiquetaEditarClases").textContent = "Clases al mes";
    // Fase 3
    moneda = { codigo: "GTQ", simbolo: "Q" };
    monedasDisponibles = [];
    modulosShow.reiniciar();
    modulosTrajes.reiniciar();
    modulosMensualidades.reiniciar();
    bioComun.cerrarModal();
  }

  async function iniciar() {
    reiniciar();
    try {
      const r = await llamar("academiaConsultarModulos", {});
      if (!r.success) return;
      activos = r.modulos || [];
      minutosMarcaDoble = r.minutosMarcaDoble || 30;
      moneda = r.moneda || moneda;
      monedasDisponibles = r.monedasDisponibles || [];
    } catch (e) {
      return; // sin conexión: el panel sigue sin módulos
    }

    const conDinero = tiene("trajes") || tiene("mensualidades");
    let html = "";
    if (tiene("clases_asistencia")) html += htmlPanelClases();
    if (tiene("avisos")) html += htmlPanelAvisos();
    if (tiene("show") || conDinero) html += htmlPanelResponsable(conDinero);
    if (tiene("show")) html += modulosShow.html();
    if (tiene("trajes")) html += modulosTrajes.html();
    if (tiene("mensualidades")) html += modulosMensualidades.html();
    el("contenedorModulos").innerHTML = html;

    // Fase 3: responsable, moneda, show, trajes y mensualidades.
    if (tiene("show") || conDinero) iniciarResponsable(conDinero);
    const contexto = { activos, moneda };
    if (tiene("show")) modulosShow.iniciar();
    if (tiene("trajes")) modulosTrajes.iniciar({ ...contexto });
    if (tiene("mensualidades")) modulosMensualidades.iniciar({ ...contexto });

    if (tiene("clases_asistencia")) {
      el("etiquetaEditarClases").textContent = "Clases esperadas por mes (el cambio vale desde este mes)";
      el("btnCrearClase").addEventListener("click", crearClase);
      el("btnGuardarMinutosMarcaDoble").addEventListener("click", guardarMinutosMarcaDoble);
      cargarClases();
    }
    if (tiene("avisos")) {
      el("btnPublicarAviso").addEventListener("click", publicarAviso);
      cargarAvisos();
    }
  }

  // ---------------------------------------------------------------
  // Responsable (para la bitácora) y moneda — Fase 3
  // ---------------------------------------------------------------
  function htmlPanelResponsable(conDinero) {
    return `
      <div class="panel" id="panelResponsable">
        <h2>👤 Registros</h2>
        <div class="fila-formulario">
          <div>
            <label>Responsable (opcional)</label>
            <input type="text" id="inputResponsable" maxlength="60" placeholder="Tu nombre" value="${escaparHtml(bioComun.responsable())}" />
            <p class="ayuda" style="margin:4px 0 0;">Se recuerda en este navegador y queda anotado en la bitácora de cada pago, cargo o corrección.</p>
          </div>
          ${conDinero ? `
            <div>
              <label>Moneda</label>
              <select id="selectMoneda">${monedasDisponibles.map((m) => `<option value="${m.codigo}"${m.codigo === moneda.codigo ? " selected" : ""}>${escaparHtml(m.nombre)}</option>`).join("")}</select>
            </div>` : ""}
        </div>
        <p class="mensaje-error" id="mensajeErrorRegistros"></p>
        <p class="mensaje-exito" id="mensajeExitoRegistros"></p>
      </div>
    `;
  }

  function iniciarResponsable(conDinero) {
    el("inputResponsable").addEventListener("change", (e) => {
      bioComun.guardarResponsable(e.target.value);
      e.target.value = bioComun.responsable();
    });
    if (conDinero) el("selectMoneda").addEventListener("change", cambiarMoneda);
  }

  async function cambiarMoneda(e) {
    const codigo = e.target.value;
    el("mensajeErrorRegistros").textContent = "";
    el("mensajeExitoRegistros").textContent = "";
    try {
      const r = await llamar("academiaActualizarMoneda", { moneda: codigo });
      if (!r.success) { el("mensajeErrorRegistros").textContent = r.error || "No se pudo cambiar la moneda."; e.target.value = moneda.codigo; return; }
      moneda = { codigo, simbolo: r.moneda.simbolo };
      el("mensajeExitoRegistros").textContent = "Moneda guardada.";
      if (tiene("trajes")) modulosTrajes.cambiarMoneda(moneda);
      if (tiene("mensualidades")) modulosMensualidades.cambiarMoneda(moneda);
    } catch (err) {
      el("mensajeErrorRegistros").textContent = "No se pudo conectar. Inténtalo de nuevo.";
      e.target.value = moneda.codigo;
    }
  }

  // ---------------------------------------------------------------
  // Clases
  // ---------------------------------------------------------------
  function htmlPanelClases() {
    return `
      <div class="panel" id="panelClases">
        <h2>📚 Clases</h2>
        <p class="ayuda">Crea las clases de tu academia. Para inscribir a un alumno, ábrelo con "Editar" en su tarjeta (más abajo). En "clases este mes" cuenta cada marca, salvo las repetidas (ver abajo).</p>
        <div class="fila-formulario">
          <div>
            <label>Nombre de la clase</label>
            <input type="text" id="inputNuevaClaseNombre" maxlength="80" placeholder="Ej.: Ballet infantil" />
          </div>
          <div>
            <label>Horario (opcional)</label>
            <input type="text" id="inputNuevaClaseHorario" maxlength="120" placeholder="Ej.: lunes y miércoles 4:00 pm" />
          </div>
        </div>
        <button class="btn" id="btnCrearClase" type="button" style="margin-top:6px;">Agregar clase</button>
        <p class="mensaje-error" id="mensajeErrorClases"></p>
        <div class="lista-tarjetas" id="listaClases" style="margin-top:12px;">
          <p class="lista-vacia">Cargando...</p>
        </div>
        <div class="campo" style="margin-top:16px;">
          <label>Marcas repetidas</label>
          <p class="ayuda" style="margin:2px 0 8px;">Si alguien marca otra vez a menos de estos minutos de su marca anterior, se guarda pero no suma (por ejemplo, si marcó dos veces por error). De ${MINUTOS_MIN} a ${MINUTOS_MAX} minutos.</p>
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="number" id="inputMinutosMarcaDoble" min="${MINUTOS_MIN}" max="${MINUTOS_MAX}" step="1" value="${minutosMarcaDoble}" style="max-width:110px; margin:0;" aria-label="Minutos" />
            <span>minutos</span>
            <button class="btn secundario chico" id="btnGuardarMinutosMarcaDoble" type="button" style="width:auto;">Guardar</button>
          </div>
          <p class="mensaje-error" id="mensajeErrorMinutos"></p>
          <p class="mensaje-exito" id="mensajeExitoMinutos"></p>
        </div>
      </div>
    `;
  }

  async function guardarMinutosMarcaDoble() {
    const minutos = Number(el("inputMinutosMarcaDoble").value);
    el("mensajeErrorMinutos").textContent = "";
    el("mensajeExitoMinutos").textContent = "";
    if (!Number.isInteger(minutos) || minutos < MINUTOS_MIN || minutos > MINUTOS_MAX) {
      el("mensajeErrorMinutos").textContent = `Escribe un número entero entre ${MINUTOS_MIN} y ${MINUTOS_MAX}.`;
      return;
    }
    el("btnGuardarMinutosMarcaDoble").disabled = true;
    try {
      const r = await llamar("academiaActualizarMinutosMarcaDoble", { minutos });
      if (!r.success) { el("mensajeErrorMinutos").textContent = r.error || "No se pudo guardar."; return; }
      minutosMarcaDoble = r.minutosMarcaDoble;
      el("mensajeExitoMinutos").textContent = `Guardado: ${minutosMarcaDoble} minutos. Los conteos ya se recalcularon.`;
      cargarAlumnas(); // "clases este mes" con la regla nueva
    } catch (e) {
      el("mensajeErrorMinutos").textContent = "No se pudo conectar. Inténtalo de nuevo.";
    } finally {
      el("btnGuardarMinutosMarcaDoble").disabled = false;
    }
  }

  async function cargarClases() {
    try {
      const r = await llamar("academiaListarClases", {});
      if (!r.success) { el("listaClases").innerHTML = `<p class="lista-vacia">${escaparHtml(r.error || "No se pudieron cargar las clases.")}</p>`; return; }
      clases = r.clases || [];
      pintarClases();
    } catch (e) {
      el("listaClases").innerHTML = '<p class="lista-vacia">No se pudieron cargar las clases. Revisa tu conexión.</p>';
    }
  }

  function pintarClases() {
    const cont = el("listaClases");
    if (!cont) return;
    if (!clases.length) { cont.innerHTML = '<p class="lista-vacia">Todavía no hay clases.</p>'; return; }
    cont.innerHTML = clases.map((c) => (c.id === claseEditandoId ? htmlClaseEditando(c) : htmlClase(c))).join("");
    cont.querySelectorAll("[data-editar-clase]").forEach((b) => b.addEventListener("click", () => {
      claseEditandoId = Number(b.dataset.editarClase);
      pintarClases();
    }));
    cont.querySelectorAll("[data-activar-clase]").forEach((b) => b.addEventListener("click", () => {
      const clase = clases.find((c) => c.id === Number(b.dataset.activarClase));
      if (clase) editarClase(clase.id, { activa: !clase.activa });
    }));
    cont.querySelectorAll("[data-guardar-clase]").forEach((b) => b.addEventListener("click", () => {
      editarClase(Number(b.dataset.guardarClase), {
        nombre: el("inputEditarClaseNombre").value,
        horario: el("inputEditarClaseHorario").value,
      });
    }));
    cont.querySelectorAll("[data-cancelar-clase]").forEach((b) => b.addEventListener("click", () => {
      claseEditandoId = null;
      pintarClases();
    }));
  }

  function htmlClase(c) {
    const inscritos = `${c.inscritos} ${c.inscritos === 1 ? "alumno" : "alumnos"}`;
    return `
      <div class="tarjeta-item">
        <div class="info-principal">
          <div class="nombre-item">${escaparHtml(c.nombre)}
            <span class="etiqueta-estado ${c.activa ? "activa" : "inactiva"}">${c.activa ? "Activa" : "Desactivada"}</span>
          </div>
          <div class="detalle-item">${c.horario ? `🕐 ${escaparHtml(c.horario)} · ` : ""}${inscritos}</div>
        </div>
        <div class="acciones-item">
          <button class="btn secundario chico" type="button" data-editar-clase="${c.id}">Editar</button>
          <button class="btn secundario chico" type="button" data-activar-clase="${c.id}">${c.activa ? "Desactivar" : "Activar"}</button>
        </div>
      </div>
    `;
  }

  function htmlClaseEditando(c) {
    return `
      <div class="tarjeta-item">
        <div class="info-principal" style="width:100%;">
          <input type="text" id="inputEditarClaseNombre" maxlength="80" value="${escaparHtml(c.nombre)}" aria-label="Nombre de la clase" />
          <input type="text" id="inputEditarClaseHorario" maxlength="120" value="${escaparHtml(c.horario || "")}" placeholder="Horario (opcional)" aria-label="Horario" />
        </div>
        <div class="acciones-item">
          <button class="btn chico" type="button" data-guardar-clase="${c.id}">Guardar</button>
          <button class="btn secundario chico" type="button" data-cancelar-clase="${c.id}">Cancelar</button>
        </div>
      </div>
    `;
  }

  async function crearClase() {
    const nombre = el("inputNuevaClaseNombre").value.trim();
    const horario = el("inputNuevaClaseHorario").value.trim();
    el("mensajeErrorClases").textContent = "";
    if (!nombre) { el("mensajeErrorClases").textContent = "Escribe el nombre de la clase."; return; }
    el("btnCrearClase").disabled = true;
    try {
      const r = await llamar("academiaCrearClase", { nombre, horario });
      if (!r.success) { el("mensajeErrorClases").textContent = r.error || "No se pudo crear la clase."; return; }
      el("inputNuevaClaseNombre").value = "";
      el("inputNuevaClaseHorario").value = "";
      await cargarClases();
    } catch (e) {
      el("mensajeErrorClases").textContent = "No se pudo conectar. Inténtalo de nuevo.";
    } finally {
      el("btnCrearClase").disabled = false;
    }
  }

  async function editarClase(claseId, cambios) {
    el("mensajeErrorClases").textContent = "";
    try {
      const r = await llamar("academiaEditarClase", { claseId, ...cambios });
      if (!r.success) { el("mensajeErrorClases").textContent = r.error || "No se pudo guardar la clase."; return; }
      claseEditandoId = null;
      await cargarClases();
    } catch (e) {
      el("mensajeErrorClases").textContent = "No se pudo conectar. Inténtalo de nuevo.";
    }
  }

  // ---------------------------------------------------------------
  // Clases inscritas en la ficha del alumno (modal de editar)
  // ---------------------------------------------------------------
  async function abrirFicha(alumna) {
    const bloque = el("bloqueClasesAlumna");
    fichaAlumnaId = alumna.id;
    fichaClasesOriginales = null;
    if (!tiene("clases_asistencia")) { bloque.hidden = true; return; }

    bloque.hidden = false;
    bloque.innerHTML = '<label>📚 Clases inscritas</label><p class="ayuda">Cargando...</p>';
    try {
      const [rClases, rAlumna] = await Promise.all([
        llamar("academiaListarClases", {}),
        llamar("academiaClasesDeAlumna", { alumnaId: alumna.id }),
      ]);
      if (fichaAlumnaId !== alumna.id) return; // se abrió otro alumno mientras tanto
      if (!rClases.success || !rAlumna.success) {
        bloque.innerHTML = `<label>📚 Clases inscritas</label><p class="mensaje-error">${escaparHtml(rClases.error || rAlumna.error || "No se pudieron cargar las clases.")}</p>`;
        return;
      }
      clases = rClases.clases || [];
      pintarClases();
      fichaClasesOriginales = rAlumna.claseIds || [];
      pintarFicha();
    } catch (e) {
      bloque.innerHTML = '<label>📚 Clases inscritas</label><p class="mensaje-error">No se pudieron cargar las clases. Revisa tu conexión.</p>';
    }
  }

  function pintarFicha() {
    const inscritas = new Set(fichaClasesOriginales);
    // Las desactivadas solo aparecen si el alumno ya estaba en ellas.
    const visibles = clases.filter((c) => c.activa || inscritas.has(c.id));
    const bloque = el("bloqueClasesAlumna");
    if (!visibles.length) {
      bloque.innerHTML = '<label>📚 Clases inscritas</label><p class="ayuda">Todavía no hay clases. Créalas en el panel "📚 Clases".</p>';
      return;
    }
    bloque.innerHTML = `
      <label>📚 Clases inscritas</label>
      ${visibles.map((c) => `
        <label class="opcion-check">
          <input type="checkbox" data-clase-ficha="${c.id}" ${inscritas.has(c.id) ? "checked" : ""} />
          ${escaparHtml(c.nombre)}${c.horario ? ` <span class="ayuda" style="margin:0;">(${escaparHtml(c.horario)})</span>` : ""}${c.activa ? "" : " — desactivada"}
        </label>
      `).join("")}
    `;
  }

  // Devuelve un mensaje de error, o null si se guardó (o no había nada
  // que guardar).
  async function guardarFicha(alumnaId) {
    if (!tiene("clases_asistencia") || fichaAlumnaId !== alumnaId || !fichaClasesOriginales) return null;
    const elegidas = [...document.querySelectorAll("[data-clase-ficha]")]
      .filter((c) => c.checked).map((c) => Number(c.dataset.claseFicha));
    const iguales = elegidas.length === fichaClasesOriginales.length && elegidas.every((id) => fichaClasesOriginales.includes(id));
    if (iguales) return null;
    try {
      const r = await llamar("academiaGuardarClasesAlumna", { alumnaId, claseIds: elegidas });
      if (!r.success) return r.error || "No se pudieron guardar las clases del alumno.";
      fichaClasesOriginales = r.claseIds || elegidas;
      cargarClases(); // para refrescar cuántos inscritos tiene cada clase
      return null;
    } catch (e) {
      return "No se pudieron guardar las clases del alumno. Revisa tu conexión.";
    }
  }

  // ---------------------------------------------------------------
  // Avisos
  // ---------------------------------------------------------------
  function htmlPanelAvisos() {
    return `
      <div class="panel" id="panelAvisos">
        <h2>📢 Avisos</h2>
        <p class="ayuda">Se ven en el Portal de Alumnos. Un <strong>aviso del mes</strong> se ve solo durante el mes en que lo publicas. La <strong>información importante</strong> se ve todo el año (hasta el 31 de diciembre) o hasta que la borres.</p>
        <div class="campo">
          <label>Tipo</label>
          <select id="selectTipoAviso">
            <option value="mes">Aviso del mes</option>
            <option value="importante">Información importante</option>
          </select>
        </div>
        <div class="campo">
          <label>Título</label>
          <input type="text" id="inputTituloAviso" maxlength="120" placeholder="Ej.: Recital de fin de año" />
        </div>
        <div class="campo">
          <label>Texto</label>
          <textarea id="inputTextoAviso" maxlength="2000" placeholder="Escribe el aviso"></textarea>
        </div>
        <label class="opcion-check"><input type="checkbox" id="checkFijarAviso" /> 📌 Fijar arriba</label>
        <button class="btn" id="btnPublicarAviso" type="button">Publicar aviso</button>
        <p class="mensaje-error" id="mensajeErrorAvisos"></p>
        <p class="mensaje-exito" id="mensajeExitoAvisos"></p>
        <div class="lista-tarjetas" id="listaAvisos" style="margin-top:12px;">
          <p class="lista-vacia">Cargando...</p>
        </div>
      </div>
    `;
  }

  async function cargarAvisos() {
    try {
      const r = await llamar("academiaListarAvisos", {});
      if (!r.success) { el("listaAvisos").innerHTML = `<p class="lista-vacia">${escaparHtml(r.error || "No se pudieron cargar los avisos.")}</p>`; return; }
      avisos = r.avisos || [];
      pintarAvisos();
    } catch (e) {
      el("listaAvisos").innerHTML = '<p class="lista-vacia">No se pudieron cargar los avisos. Revisa tu conexión.</p>';
    }
  }

  function textoVigencia(a) {
    if (a.tipo === "mes") return a.vigente ? `Aviso de ${nombreMes(a.mes)}` : `Fue de ${nombreMes(a.mes)} — ya no se ve en el portal`;
    return a.vigente ? `Importante · se ve hasta el 31 de diciembre de ${a.anio}` : `Importante de ${a.anio} — ya no se ve en el portal`;
  }

  function pintarAvisos() {
    const cont = el("listaAvisos");
    if (!cont) return;
    if (!avisos.length) { cont.innerHTML = '<p class="lista-vacia">Todavía no hay avisos.</p>'; return; }
    cont.innerHTML = avisos.map((a) => (a.id === avisoEditandoId ? htmlAvisoEditando(a) : htmlAviso(a))).join("");
    cont.querySelectorAll("[data-fijar-aviso]").forEach((b) => b.addEventListener("click", () => {
      const aviso = avisos.find((a) => a.id === Number(b.dataset.fijarAviso));
      if (aviso) editarAviso(aviso.id, { fijado: !aviso.fijado });
    }));
    cont.querySelectorAll("[data-editar-aviso]").forEach((b) => b.addEventListener("click", () => {
      avisoEditandoId = Number(b.dataset.editarAviso);
      pintarAvisos();
    }));
    cont.querySelectorAll("[data-guardar-aviso]").forEach((b) => b.addEventListener("click", () => {
      editarAviso(Number(b.dataset.guardarAviso), {
        titulo: el("inputEditarTituloAviso").value,
        texto: el("inputEditarTextoAviso").value,
      });
    }));
    cont.querySelectorAll("[data-cancelar-aviso]").forEach((b) => b.addEventListener("click", () => {
      avisoEditandoId = null;
      pintarAvisos();
    }));
    cont.querySelectorAll("[data-borrar-aviso]").forEach((b) => b.addEventListener("click", () => borrarAviso(Number(b.dataset.borrarAviso))));
  }

  function htmlAviso(a) {
    return `
      <div class="tarjeta-item${a.fijado ? " aviso-fijado" : ""}">
        <div class="info-principal">
          <div class="nombre-item">${a.fijado ? "📌 " : ""}${escaparHtml(a.titulo)}</div>
          <div class="detalle-item">
            <span class="etiqueta-estado ${a.vigente ? "activa" : "inactiva"}">${escaparHtml(textoVigencia(a))}</span>
            &nbsp;·&nbsp; publicado el ${escaparHtml(fechaCorta(a.creadoEn))}
          </div>
          <div class="texto-aviso">${escaparHtml(a.texto)}</div>
        </div>
        <div class="acciones-item">
          <button class="btn secundario chico" type="button" data-fijar-aviso="${a.id}">${a.fijado ? "Quitar de arriba" : "📌 Fijar"}</button>
          <button class="btn secundario chico" type="button" data-editar-aviso="${a.id}">Editar</button>
          <button class="btn peligro chico" type="button" data-borrar-aviso="${a.id}">🗑️ Borrar</button>
        </div>
      </div>
    `;
  }

  function htmlAvisoEditando(a) {
    return `
      <div class="tarjeta-item">
        <div class="info-principal" style="width:100%;">
          <input type="text" id="inputEditarTituloAviso" maxlength="120" value="${escaparHtml(a.titulo)}" aria-label="Título" />
          <textarea id="inputEditarTextoAviso" maxlength="2000" aria-label="Texto">${escaparHtml(a.texto)}</textarea>
        </div>
        <div class="acciones-item">
          <button class="btn chico" type="button" data-guardar-aviso="${a.id}">Guardar</button>
          <button class="btn secundario chico" type="button" data-cancelar-aviso="${a.id}">Cancelar</button>
        </div>
      </div>
    `;
  }

  async function publicarAviso() {
    const datos = {
      tipo: el("selectTipoAviso").value,
      titulo: el("inputTituloAviso").value.trim(),
      texto: el("inputTextoAviso").value.trim(),
      fijado: el("checkFijarAviso").checked,
    };
    el("mensajeErrorAvisos").textContent = "";
    el("mensajeExitoAvisos").textContent = "";
    if (!datos.titulo) { el("mensajeErrorAvisos").textContent = "Escribe el título del aviso."; return; }
    if (!datos.texto) { el("mensajeErrorAvisos").textContent = "Escribe el texto del aviso."; return; }
    el("btnPublicarAviso").disabled = true;
    try {
      const r = await llamar("academiaCrearAviso", datos);
      if (!r.success) { el("mensajeErrorAvisos").textContent = r.error || "No se pudo publicar."; return; }
      el("inputTituloAviso").value = "";
      el("inputTextoAviso").value = "";
      el("checkFijarAviso").checked = false;
      el("mensajeExitoAvisos").textContent = "¡Aviso publicado! Ya se ve en el Portal de Alumnos.";
      setTimeout(() => { if (el("mensajeExitoAvisos")) el("mensajeExitoAvisos").textContent = ""; }, 5000);
      await cargarAvisos();
    } catch (e) {
      el("mensajeErrorAvisos").textContent = "No se pudo conectar. Inténtalo de nuevo.";
    } finally {
      el("btnPublicarAviso").disabled = false;
    }
  }

  async function editarAviso(avisoId, cambios) {
    el("mensajeErrorAvisos").textContent = "";
    try {
      const r = await llamar("academiaEditarAviso", { avisoId, ...cambios });
      if (!r.success) { el("mensajeErrorAvisos").textContent = r.error || "No se pudo guardar el aviso."; return; }
      avisoEditandoId = null;
      await cargarAvisos();
    } catch (e) {
      el("mensajeErrorAvisos").textContent = "No se pudo conectar. Inténtalo de nuevo.";
    }
  }

  async function borrarAviso(avisoId) {
    const aviso = avisos.find((a) => a.id === avisoId);
    if (!window.confirm(`¿Borrar el aviso "${aviso ? aviso.titulo : ""}"? Deja de verse en el portal y no se puede deshacer.`)) return;
    el("mensajeErrorAvisos").textContent = "";
    try {
      const r = await llamar("academiaBorrarAviso", { avisoId });
      if (!r.success) { el("mensajeErrorAvisos").textContent = r.error || "No se pudo borrar."; return; }
      await cargarAvisos();
    } catch (e) {
      el("mensajeErrorAvisos").textContent = "No se pudo conectar. Inténtalo de nuevo.";
    }
  }

  return { iniciar, reiniciar, abrirFicha, guardarFicha };
})();
