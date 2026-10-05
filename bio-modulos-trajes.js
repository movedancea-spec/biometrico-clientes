// ===============================================================
// Módulo trajes en el panel de la academia: cargos (a un alumno, a una
// clase o a los que dijeron Sí al show activo), abonos, saldos y un
// modal por alumno para editar o anular movimientos (con motivo) y ver
// la bitácora. Lo arranca bio-modulos-panel.js; usa el y llamar de
// academia.js y bioComun.
// ===============================================================
const modulosTrajes = (() => {
  const c = bioComun;
  let ctx = { activos: [], moneda: { codigo: "GTQ", simbolo: "Q" } };
  let alumnos = [];
  let clases = [];
  let detalle = null;       // { alumnaId, nombre, ...respuesta de academiaMovimientosTrajes }
  let editandoId = null;    // movimiento en edición dentro del modal
  let anulandoId = null;    // movimiento al que se le está escribiendo el motivo

  function html() {
    return `
      <div class="panel" id="panelTrajes">
        <h2>👗 Trajes</h2>
        <p class="ayuda">Registra lo que cuesta cada traje (cargos) y lo que va pagando cada alumno (abonos). Saldo = cargos − abonos. Los papás ven su saldo y el detalle en el portal.</p>
        <h3 style="margin:8px 0;">Nuevo cargo</h3>
        <div class="fila-formulario">
          <div><label>Concepto</label><input type="text" id="inputCargoConcepto" maxlength="120" placeholder="Ej.: Traje de ballet" /></div>
          <div><label>Monto</label><input type="text" id="inputCargoMonto" inputmode="decimal" placeholder="0.00" /></div>
          <div><label>Fecha</label><input type="date" id="inputCargoFecha" value="${c.hoy()}" /></div>
        </div>
        <div class="fila-formulario">
          <div>
            <label>Asignar a</label>
            <select id="selectCargoDestino">
              <option value="alumno">Un alumno</option>
              ${ctx.activos.includes("clases_asistencia") ? '<option value="clase">Todos los de una clase</option>' : ""}
              ${ctx.activos.includes("show") ? '<option value="show">Los que dijeron Sí al show activo</option>' : ""}
            </select>
          </div>
          <div id="campoCargoAlumno"><label>Alumno</label><select id="selectCargoAlumno"></select></div>
          <div id="campoCargoClase" hidden><label>Clase</label><select id="selectCargoClase"></select></div>
        </div>
        <button class="btn" id="btnCrearCargo" type="button" style="margin-top:6px;">Agregar cargo</button>
        <p class="mensaje-error" id="mensajeErrorTrajes"></p>
        <p class="mensaje-exito" id="mensajeExitoTrajes"></p>
        <label class="opcion-check" style="margin-top:12px;"><input type="checkbox" id="checkSoloConSaldo" /> Solo alumnos con saldo pendiente</label>
        <div class="lista-tarjetas" id="listaTrajes"><p class="lista-vacia">Cargando...</p></div>
      </div>
    `;
  }

  function iniciar(contexto) {
    ctx = contexto;
    el("selectCargoDestino").addEventListener("change", ajustarDestino);
    el("btnCrearCargo").addEventListener("click", crearCargo);
    el("checkSoloConSaldo").addEventListener("change", pintar);
    cargar();
    if (ctx.activos.includes("clases_asistencia")) cargarClases();
  }

  function reiniciar() {
    alumnos = []; clases = []; detalle = null; editandoId = null; anulandoId = null;
  }

  function cambiarMoneda(moneda) {
    ctx.moneda = moneda;
    if (el("listaTrajes")) pintar();
  }

  function ajustarDestino() {
    const destino = el("selectCargoDestino").value;
    el("campoCargoAlumno").hidden = destino !== "alumno";
    el("campoCargoClase").hidden = destino !== "clase";
  }

  async function cargar() {
    try {
      const r = await llamar("academiaResumenTrajes", {});
      if (!r.success) { el("listaTrajes").innerHTML = `<p class="lista-vacia">${c.escapar(r.error || "No se pudieron cargar los saldos.")}</p>`; return; }
      alumnos = r.alumnos || [];
      ctx.moneda = r.moneda || ctx.moneda;
      el("selectCargoAlumno").innerHTML = alumnos.filter((a) => a.activo)
        .map((a) => `<option value="${a.alumnaId}">${c.escapar(a.nombre)} (#${a.codigo})</option>`).join("");
      pintar();
    } catch (e) {
      el("listaTrajes").innerHTML = '<p class="lista-vacia">No se pudieron cargar los saldos. Revisa tu conexión.</p>';
    }
  }

  async function cargarClases() {
    try {
      const r = await llamar("academiaListarClases", {});
      if (!r.success) return;
      clases = (r.clases || []).filter((x) => x.activa);
      el("selectCargoClase").innerHTML = clases.map((x) => `<option value="${x.id}">${c.escapar(x.nombre)} (${x.inscritos} inscritos)</option>`).join("");
    } catch (e) { /* sin clases: queda vacío */ }
  }

  function pintar() {
    const cont = el("listaTrajes");
    if (!cont) return;
    const lista = el("checkSoloConSaldo").checked ? alumnos.filter((a) => a.saldoCentavos > 0) : alumnos;
    if (!lista.length) { cont.innerHTML = '<p class="lista-vacia">No hay alumnos para mostrar.</p>'; return; }
    cont.innerHTML = lista.map((a) => `
      <div class="tarjeta-item">
        <div class="info-principal">
          <div class="nombre-item">${c.escapar(a.nombre)} <span class="ayuda" style="margin:0;">#${a.codigo}${a.activo ? "" : " · inactivo"}</span></div>
          <div class="detalle-item">Saldo: <strong>${c.dinero(a.saldoCentavos, ctx.moneda)}</strong> · cargos ${c.dinero(a.cargosCentavos, ctx.moneda)} · abonos ${c.dinero(a.abonosCentavos, ctx.moneda)}</div>
        </div>
        <div class="acciones-item">
          <button class="btn secundario chico" type="button" data-detalle-traje="${a.alumnaId}">Ver detalle</button>
        </div>
      </div>
    `).join("");
    cont.querySelectorAll("[data-detalle-traje]").forEach((b) => b.addEventListener("click", () => abrirDetalle(Number(b.dataset.detalleTraje))));
  }

  async function crearCargo() {
    const monto = c.leerMonto(el("inputCargoMonto").value);
    const tipo = el("selectCargoDestino").value;
    const destino = tipo === "alumno" ? { tipo, alumnaId: Number(el("selectCargoAlumno").value) }
      : tipo === "clase" ? { tipo, claseId: Number(el("selectCargoClase").value) } : { tipo };
    const datos = { concepto: el("inputCargoConcepto").value.trim(), montoCentavos: monto, fecha: el("inputCargoFecha").value, destino };
    el("mensajeErrorTrajes").textContent = "";
    el("mensajeExitoTrajes").textContent = "";
    if (!datos.concepto) { el("mensajeErrorTrajes").textContent = "Escribe el concepto del cargo."; return; }
    if (!monto) { el("mensajeErrorTrajes").textContent = "Escribe un monto válido (por ejemplo 250 o 250.50)."; return; }
    if (tipo !== "alumno" && !window.confirm(`¿Agregar el cargo "${datos.concepto}" de ${c.dinero(monto, ctx.moneda)} a ${tipo === "clase" ? "todos los alumnos activos de esa clase" : "todos los que dijeron Sí al show activo"}?`)) return;
    el("btnCrearCargo").disabled = true;
    try {
      const r = await llamar("academiaCrearCargoTraje", c.conResponsable(datos));
      if (!r.success) { el("mensajeErrorTrajes").textContent = r.error || "No se pudo agregar el cargo."; return; }
      el("inputCargoConcepto").value = "";
      el("inputCargoMonto").value = "";
      el("mensajeExitoTrajes").textContent = `Cargo agregado a ${r.creados} ${r.creados === 1 ? "alumno" : "alumnos"}.`;
      await cargar();
    } catch (e) {
      el("mensajeErrorTrajes").textContent = "No se pudo conectar. Inténtalo de nuevo.";
    } finally {
      el("btnCrearCargo").disabled = false;
    }
  }

  // ---- detalle de un alumno (modal) ----
  async function abrirDetalle(alumnaId) {
    const alumno = alumnos.find((a) => a.alumnaId === alumnaId);
    editandoId = null; anulandoId = null;
    const caja = c.abrirModal('<h3>👗 Trajes</h3><p class="lista-vacia">Cargando...</p>');
    await recargarDetalle(caja, alumnaId, alumno ? alumno.nombre : "");
  }

  async function recargarDetalle(caja, alumnaId, nombre) {
    try {
      const r = await llamar("academiaMovimientosTrajes", { alumnaId });
      if (!r.success) { caja.innerHTML = `<p class="mensaje-error">${c.escapar(r.error || "No se pudo cargar.")}</p>`; return; }
      detalle = { alumnaId, nombre, ...r };
      pintarDetalle(caja);
    } catch (e) {
      caja.innerHTML = '<p class="mensaje-error">No se pudo conectar. Revisa tu conexión.</p><div class="acciones-modal"><button class="btn secundario" type="button" data-cerrar-modal>Cerrar</button></div>';
      caja.querySelector("[data-cerrar-modal]").addEventListener("click", c.cerrarModal);
    }
  }

  function htmlMovimiento(m) {
    const moneda = detalle.moneda || ctx.moneda;
    if (m.id === editandoId) {
      return `
        <div class="tarjeta-item">
          <div class="info-principal" style="width:100%;">
            ${m.tipo === "cargo" ? `<input type="text" id="inputEditarConcepto" maxlength="120" value="${c.escapar(m.concepto || "")}" aria-label="Concepto" />` : ""}
            <input type="text" id="inputEditarMonto" inputmode="decimal" value="${c.montoParaInput(m.montoCentavos)}" aria-label="Monto" />
            <input type="date" id="inputEditarFecha" value="${c.escapar(m.fecha)}" aria-label="Fecha" />
            ${m.tipo === "abono" ? `<select id="selectEditarForma" aria-label="Forma de pago">${c.opcionesFormaPago(m.formaPago)}</select>` : ""}
            <input type="text" id="inputEditarNota" maxlength="300" value="${c.escapar(m.nota || "")}" placeholder="Nota (opcional)" aria-label="Nota" />
          </div>
          <div class="acciones-item">
            <button class="btn chico" type="button" data-guardar-mov="${m.id}">Guardar</button>
            <button class="btn secundario chico" type="button" data-cancelar-mov>Cancelar</button>
          </div>
        </div>
      `;
    }
    const titulo = m.tipo === "cargo" ? `➕ ${c.escapar(m.concepto)}` : `➖ Abono · ${c.escapar(c.FORMAS_PAGO[m.formaPago] || m.formaPago || "")}`;
    return `
      <div class="tarjeta-item"${m.anulado ? ' style="opacity:.6;"' : ""}>
        <div class="info-principal">
          <div class="nombre-item">${titulo} — ${c.dinero(m.montoCentavos, moneda)}
            ${m.anulado ? '<span class="etiqueta-estado inactiva">Anulado</span>' : ""}</div>
          <div class="detalle-item">${c.escapar(c.fecha(m.fecha))}${m.nota ? ` · ${c.escapar(m.nota)}` : ""}${m.anulado ? ` · motivo: ${c.escapar(m.motivoAnulacion || "")}` : ""}${m.cargoId ? " · aplicado a un cargo" : ""}</div>
          ${m.id === anulandoId ? `
            <div style="display:flex; gap:8px; margin-top:8px;">
              <input type="text" id="inputMotivoAnular" maxlength="300" placeholder="Motivo de la anulación" style="margin:0;" aria-label="Motivo" />
              <button class="btn peligro chico" type="button" data-confirmar-anular="${m.id}" style="width:auto;">Anular</button>
              <button class="btn secundario chico" type="button" data-cancelar-mov style="width:auto;">Cancelar</button>
            </div>` : ""}
        </div>
        ${m.anulado || m.id === anulandoId ? "" : `
          <div class="acciones-item">
            <button class="btn secundario chico" type="button" data-editar-mov="${m.id}">Editar</button>
            <button class="btn peligro chico" type="button" data-anular-mov="${m.id}">Anular</button>
          </div>`}
      </div>
    `;
  }

  function pintarDetalle(caja) {
    const moneda = detalle.moneda || ctx.moneda;
    const cargosVigentes = detalle.movimientos.filter((m) => m.tipo === "cargo" && !m.anulado);
    caja.innerHTML = `
      <h3>👗 Trajes de ${c.escapar(detalle.nombre)}</h3>
      <div class="grid-stats"><div class="stat-caja"><div class="stat-numero">${c.dinero(detalle.saldoCentavos, moneda)}</div><div class="stat-etiqueta">Saldo</div></div></div>
      <h3 style="margin:14px 0 6px;">Registrar abono</h3>
      <div class="fila-formulario">
        <div><label>Monto</label><input type="text" id="inputAbonoMonto" inputmode="decimal" placeholder="0.00" /></div>
        <div><label>Fecha</label><input type="date" id="inputAbonoFecha" value="${c.hoy()}" /></div>
        <div><label>Forma de pago</label><select id="selectAbonoForma">${c.opcionesFormaPago()}</select></div>
      </div>
      <div class="fila-formulario">
        <div><label>Nota (opcional)</label><input type="text" id="inputAbonoNota" maxlength="300" /></div>
        <div><label>Aplicar a un cargo (opcional)</label>
          <select id="selectAbonoCargo"><option value="">— Al saldo general</option>
            ${cargosVigentes.map((m) => `<option value="${m.id}">${c.escapar(m.concepto)} (${c.dinero(m.montoCentavos, moneda)})</option>`).join("")}
          </select></div>
      </div>
      <button class="btn" type="button" id="btnRegistrarAbono" style="margin-top:6px;">Registrar abono</button>
      <p class="mensaje-error" id="mensajeErrorDetalle"></p>
      <h3 style="margin:14px 0 6px;">Movimientos</h3>
      <div class="lista-tarjetas">${detalle.movimientos.map(htmlMovimiento).join("") || '<p class="lista-vacia">Sin movimientos.</p>'}</div>
      <details style="margin-top:12px;"><summary>📜 Bitácora (${detalle.bitacora.length})</summary>
        <ul style="padding-left:18px; font-size:13px;">${detalle.bitacora.map((b) => `<li>${c.escapar(c.textoBitacora(b))} · movimiento #${c.escapar(b.entidadId)}${b.despues && b.despues.motivo ? ` · motivo: ${c.escapar(b.despues.motivo)}` : ""}</li>`).join("")}</ul>
      </details>
      <div class="acciones-modal"><button class="btn secundario" type="button" data-cerrar-modal>Cerrar</button></div>
    `;
    caja.querySelector("[data-cerrar-modal]").addEventListener("click", () => { c.cerrarModal(); cargar(); });
    caja.querySelector("#btnRegistrarAbono").addEventListener("click", () => registrarAbono(caja));
    caja.querySelectorAll("[data-editar-mov]").forEach((b) => b.addEventListener("click", () => { editandoId = Number(b.dataset.editarMov); anulandoId = null; pintarDetalle(caja); }));
    caja.querySelectorAll("[data-anular-mov]").forEach((b) => b.addEventListener("click", () => { anulandoId = Number(b.dataset.anularMov); editandoId = null; pintarDetalle(caja); }));
    caja.querySelectorAll("[data-cancelar-mov]").forEach((b) => b.addEventListener("click", () => { editandoId = null; anulandoId = null; pintarDetalle(caja); }));
    caja.querySelectorAll("[data-guardar-mov]").forEach((b) => b.addEventListener("click", () => guardarEdicion(caja, Number(b.dataset.guardarMov))));
    caja.querySelectorAll("[data-confirmar-anular]").forEach((b) => b.addEventListener("click", () => anular(caja, Number(b.dataset.confirmarAnular))));
  }

  async function ejecutar(caja, accion, datos) {
    caja.querySelector("#mensajeErrorDetalle").textContent = "";
    try {
      const r = await llamar(accion, c.conResponsable(datos));
      if (!r.success) { caja.querySelector("#mensajeErrorDetalle").textContent = r.error || "No se pudo guardar."; return false; }
      editandoId = null; anulandoId = null;
      await recargarDetalle(caja, detalle.alumnaId, detalle.nombre);
      return true;
    } catch (e) {
      caja.querySelector("#mensajeErrorDetalle").textContent = "No se pudo conectar. Inténtalo de nuevo.";
      return false;
    }
  }

  function registrarAbono(caja) {
    const monto = c.leerMonto(caja.querySelector("#inputAbonoMonto").value);
    if (!monto) { caja.querySelector("#mensajeErrorDetalle").textContent = "Escribe un monto válido."; return; }
    const cargoId = Number(caja.querySelector("#selectAbonoCargo").value) || undefined;
    ejecutar(caja, "academiaRegistrarAbonoTraje", {
      alumnaId: detalle.alumnaId, montoCentavos: monto, fecha: caja.querySelector("#inputAbonoFecha").value,
      formaPago: caja.querySelector("#selectAbonoForma").value, nota: caja.querySelector("#inputAbonoNota").value, cargoId,
    });
  }

  function guardarEdicion(caja, movimientoId) {
    const m = detalle.movimientos.find((x) => x.id === movimientoId);
    const monto = c.leerMonto(caja.querySelector("#inputEditarMonto").value);
    if (!monto) { caja.querySelector("#mensajeErrorDetalle").textContent = "Escribe un monto válido."; return; }
    const cambios = { movimientoId, montoCentavos: monto, fecha: caja.querySelector("#inputEditarFecha").value, nota: caja.querySelector("#inputEditarNota").value };
    if (m.tipo === "cargo") cambios.concepto = caja.querySelector("#inputEditarConcepto").value;
    if (m.tipo === "abono") cambios.formaPago = caja.querySelector("#selectEditarForma").value;
    ejecutar(caja, "academiaEditarMovimientoTraje", cambios);
  }

  function anular(caja, movimientoId) {
    const motivo = caja.querySelector("#inputMotivoAnular").value.trim();
    if (!motivo) { caja.querySelector("#mensajeErrorDetalle").textContent = "Escribe el motivo de la anulación."; return; }
    ejecutar(caja, "academiaAnularMovimientoTraje", { movimientoId, motivo });
  }

  return { html, iniciar, reiniciar, cambiarMoneda };
})();
