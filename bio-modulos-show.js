// ===============================================================
// Módulo show en el panel de la academia: crear y editar shows (solo
// uno activo), ver quién respondió Sí / No, corregir respuestas y
// exportar la lista a CSV. Lo arranca bio-modulos-panel.js; usa el y
// llamar de academia.js y bioComun.
// ===============================================================
const modulosShow = (() => {
  const c = bioComun;
  let shows = [];
  let editandoId = null;

  function html() {
    return `
      <div class="panel" id="panelShow">
        <h2>🎭 Show</h2>
        <p class="ayuda">Los papás responden en el Portal de Alumnos si su alumno participa (Sí / No) y pueden cambiar su respuesta hasta la fecha límite. Solo un show puede estar activo a la vez.</p>
        <div class="fila-formulario">
          <div>
            <label>Nombre del show</label>
            <input type="text" id="inputShowNombre" maxlength="80" placeholder="Ej.: Show de fin de año" />
          </div>
          <div>
            <label>Año</label>
            <input type="number" id="inputShowAnio" min="2000" max="2100" value="${c.hoy().slice(0, 4)}" />
          </div>
          <div>
            <label>Fecha límite para responder</label>
            <input type="date" id="inputShowFecha" />
          </div>
        </div>
        <label class="opcion-check" style="margin-top:8px;"><input type="checkbox" id="checkShowActivo" checked /> Activo (es el que ven los papás)</label>
        <button class="btn" id="btnCrearShow" type="button">Crear show</button>
        <p class="mensaje-error" id="mensajeErrorShow"></p>
        <div class="lista-tarjetas" id="listaShows" style="margin-top:12px;"><p class="lista-vacia">Cargando...</p></div>
      </div>
    `;
  }

  function iniciar() {
    el("btnCrearShow").addEventListener("click", crear);
    cargar();
  }

  function reiniciar() {
    shows = [];
    editandoId = null;
  }

  async function cargar() {
    try {
      const r = await llamar("academiaListarShows", {});
      if (!r.success) { el("listaShows").innerHTML = `<p class="lista-vacia">${c.escapar(r.error || "No se pudieron cargar los shows.")}</p>`; return; }
      shows = r.shows || [];
      pintar();
    } catch (e) {
      el("listaShows").innerHTML = '<p class="lista-vacia">No se pudieron cargar los shows. Revisa tu conexión.</p>';
    }
  }

  function pintar() {
    const cont = el("listaShows");
    if (!cont) return;
    if (!shows.length) { cont.innerHTML = '<p class="lista-vacia">Todavía no hay shows.</p>'; return; }
    cont.innerHTML = shows.map((s) => (s.id === editandoId ? htmlEditando(s) : htmlShow(s))).join("");
    cont.querySelectorAll("[data-ver-show]").forEach((b) => b.addEventListener("click", () => abrirRespuestas(Number(b.dataset.verShow))));
    cont.querySelectorAll("[data-activar-show]").forEach((b) => b.addEventListener("click", () => editar(Number(b.dataset.activarShow), { activo: true })));
    cont.querySelectorAll("[data-desactivar-show]").forEach((b) => b.addEventListener("click", () => editar(Number(b.dataset.desactivarShow), { activo: false })));
    cont.querySelectorAll("[data-editar-show]").forEach((b) => b.addEventListener("click", () => { editandoId = Number(b.dataset.editarShow); pintar(); }));
    cont.querySelectorAll("[data-cancelar-show]").forEach((b) => b.addEventListener("click", () => { editandoId = null; pintar(); }));
    cont.querySelectorAll("[data-guardar-show]").forEach((b) => b.addEventListener("click", () => editar(Number(b.dataset.guardarShow), {
      nombre: el("inputEditarShowNombre").value,
      anio: Number(el("inputEditarShowAnio").value),
      fechaLimite: el("inputEditarShowFecha").value,
    })));
  }

  function htmlShow(s) {
    return `
      <div class="tarjeta-item">
        <div class="info-principal">
          <div class="nombre-item">${c.escapar(s.nombre)} (${s.anio})
            ${s.activo ? '<span class="etiqueta-estado activa">Activo</span>' : '<span class="etiqueta-estado exento">Inactivo</span>'}
          </div>
          <div class="detalle-item">Fecha límite: ${c.escapar(c.fecha(s.fechaLimite))} · ${s.abierto ? "abierto para responder" : "cerrado (solo lectura para los papás)"}
            · ✅ ${s.totalSi ?? 0} sí · ❌ ${s.totalNo ?? 0} no</div>
        </div>
        <div class="acciones-item">
          <button class="btn secundario chico" type="button" data-ver-show="${s.id}">Ver respuestas</button>
          <button class="btn secundario chico" type="button" data-editar-show="${s.id}">Editar</button>
          ${s.activo
            ? `<button class="btn secundario chico" type="button" data-desactivar-show="${s.id}">Desactivar</button>`
            : `<button class="btn secundario chico" type="button" data-activar-show="${s.id}">Activar</button>`}
        </div>
      </div>
    `;
  }

  function htmlEditando(s) {
    return `
      <div class="tarjeta-item">
        <div class="info-principal" style="width:100%;">
          <input type="text" id="inputEditarShowNombre" maxlength="80" value="${c.escapar(s.nombre)}" aria-label="Nombre" />
          <input type="number" id="inputEditarShowAnio" min="2000" max="2100" value="${s.anio}" aria-label="Año" />
          <input type="date" id="inputEditarShowFecha" value="${c.escapar(s.fechaLimite)}" aria-label="Fecha límite" />
        </div>
        <div class="acciones-item">
          <button class="btn chico" type="button" data-guardar-show="${s.id}">Guardar</button>
          <button class="btn secundario chico" type="button" data-cancelar-show="${s.id}">Cancelar</button>
        </div>
      </div>
    `;
  }

  async function crear() {
    const datos = {
      nombre: el("inputShowNombre").value.trim(),
      anio: Number(el("inputShowAnio").value),
      fechaLimite: el("inputShowFecha").value,
      activo: el("checkShowActivo").checked,
    };
    el("mensajeErrorShow").textContent = "";
    if (!datos.nombre) { el("mensajeErrorShow").textContent = "Escribe el nombre del show."; return; }
    if (!datos.fechaLimite) { el("mensajeErrorShow").textContent = "Elige la fecha límite para responder."; return; }
    el("btnCrearShow").disabled = true;
    try {
      const r = await llamar("academiaCrearShow", datos);
      if (!r.success) { el("mensajeErrorShow").textContent = r.error || "No se pudo crear el show."; return; }
      el("inputShowNombre").value = "";
      el("inputShowFecha").value = "";
      await cargar();
    } catch (e) {
      el("mensajeErrorShow").textContent = "No se pudo conectar. Inténtalo de nuevo.";
    } finally {
      el("btnCrearShow").disabled = false;
    }
  }

  async function editar(showId, cambios) {
    el("mensajeErrorShow").textContent = "";
    try {
      const r = await llamar("academiaEditarShow", { showId, ...cambios });
      if (!r.success) { el("mensajeErrorShow").textContent = r.error || "No se pudo guardar el show."; return; }
      editandoId = null;
      await cargar();
    } catch (e) {
      el("mensajeErrorShow").textContent = "No se pudo conectar. Inténtalo de nuevo.";
    }
  }

  // ---- respuestas (modal) ----
  let respuestas = null; // última respuesta de academiaRespuestasShow

  async function abrirRespuestas(showId) {
    const caja = c.abrirModal('<h3>🎭 Respuestas</h3><p class="lista-vacia">Cargando...</p>');
    try {
      const r = await llamar("academiaRespuestasShow", { showId });
      if (!r.success) { caja.innerHTML = `<h3>🎭 Respuestas</h3><p class="mensaje-error">${c.escapar(r.error || "No se pudieron cargar.")}</p>${botonCerrar()}`; enlazarCerrar(caja); return; }
      respuestas = r;
      pintarRespuestas(caja);
    } catch (e) {
      caja.innerHTML = `<h3>🎭 Respuestas</h3><p class="mensaje-error">No se pudo conectar. Revisa tu conexión.</p>${botonCerrar()}`;
      enlazarCerrar(caja);
    }
  }

  const botonCerrar = () => '<div class="acciones-modal"><button class="btn secundario" type="button" data-cerrar-modal>Cerrar</button></div>';
  const enlazarCerrar = (caja) => caja.querySelector("[data-cerrar-modal]").addEventListener("click", () => { c.cerrarModal(); cargar(); });
  const textoRespuesta = { si: "✅ Sí", no: "❌ No" };

  function pintarRespuestas(caja) {
    const { show, alumnos, totales } = respuestas;
    caja.innerHTML = `
      <h3>🎭 ${c.escapar(show.nombre)} (${show.anio})</h3>
      <p class="ayuda">Fecha límite: ${c.escapar(c.fecha(show.fechaLimite))} — ${show.abierto ? "los papás todavía pueden cambiar su respuesta." : "cerrado: los papás ya no pueden cambiarla (tú sí puedes corregirla)."}</p>
      <div class="grid-stats">
        <div class="stat-caja"><div class="stat-numero">${totales.si}</div><div class="stat-etiqueta">Sí</div></div>
        <div class="stat-caja"><div class="stat-numero">${totales.no}</div><div class="stat-etiqueta">No</div></div>
        <div class="stat-caja"><div class="stat-numero">${totales.sinResponder}</div><div class="stat-etiqueta">Sin responder</div></div>
      </div>
      <button class="btn secundario chico" type="button" id="btnExportarShow" style="margin:12px 0;">⬇️ Exportar CSV</button>
      <p class="mensaje-error" id="mensajeErrorRespuestas"></p>
      <div class="lista-tarjetas">
        ${alumnos.map((a) => `
          <div class="tarjeta-item">
            <div class="info-principal">
              <div class="nombre-item">${c.escapar(a.nombre)} <span class="ayuda" style="margin:0;">#${a.codigo}${a.activo ? "" : " · inactivo"}</span></div>
              <div class="detalle-item">${a.respuesta ? textoRespuesta[a.respuesta] : "Sin responder"}${a.respondidoEn ? ` · ${c.escapar(c.fechaHora(a.respondidoEn))}${a.origen === "academia" ? " (corregida por la academia)" : ""}` : ""}</div>
            </div>
            <div class="acciones-item">
              <select data-corregir="${a.alumnaId}" aria-label="Corregir respuesta" style="margin:0;">
                <option value=""${a.respuesta ? "" : " selected"}>— Sin respuesta</option>
                <option value="si"${a.respuesta === "si" ? " selected" : ""}>Sí</option>
                <option value="no"${a.respuesta === "no" ? " selected" : ""}>No</option>
              </select>
            </div>
          </div>
        `).join("") || '<p class="lista-vacia">No hay alumnos activos.</p>'}
      </div>
      ${botonCerrar()}
    `;
    enlazarCerrar(caja);
    caja.querySelector("#btnExportarShow").addEventListener("click", exportarCsv);
    caja.querySelectorAll("[data-corregir]").forEach((s) => s.addEventListener("change", () => corregir(caja, Number(s.dataset.corregir), s.value || null)));
  }

  async function corregir(caja, alumnaId, respuesta) {
    try {
      const r = await llamar("academiaCorregirRespuestaShow", c.conResponsable({ showId: respuestas.show.id, alumnaId, respuesta }));
      if (!r.success) { caja.querySelector("#mensajeErrorRespuestas").textContent = r.error || "No se pudo corregir."; return; }
      const rr = await llamar("academiaRespuestasShow", { showId: respuestas.show.id });
      if (rr.success) { respuestas = rr; pintarRespuestas(caja); }
    } catch (e) {
      caja.querySelector("#mensajeErrorRespuestas").textContent = "No se pudo conectar. Inténtalo de nuevo.";
    }
  }

  function exportarCsv() {
    const { show, alumnos } = respuestas;
    const filas = [["Código", "Alumno", "Respuesta", "Respondido", "Origen", "Activo"]];
    for (const a of alumnos) {
      filas.push([
        a.codigo, a.nombre, a.respuesta === "si" ? "Sí" : a.respuesta === "no" ? "No" : "Sin responder",
        a.respondidoEn ? c.fechaHora(a.respondidoEn) : "", a.origen === "academia" ? "Academia" : a.origen === "portal" ? "Portal" : "",
        a.activo ? "Sí" : "No",
      ]);
    }
    const nombre = `show-${show.anio}-${show.nombre.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}.csv`;
    c.descargarCsv(nombre, filas);
  }

  return { html, iniciar, reiniciar };
})();
