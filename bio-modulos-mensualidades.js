// ===============================================================
// Módulo mensualidades de alumnos en el panel de la academia:
// mensualidad general, lista con lo pendiente de cada alumno y un modal
// por alumno con sus meses (pendiente / parcial / pagado / exento),
// pagos (varios por mes), anulaciones con motivo, monto propio y la
// bitácora. Lo arranca bio-modulos-panel.js; usa el y llamar de
// academia.js y bioComun.
// ===============================================================
const modulosMensualidades = (() => {
  const c = bioComun;
  let ctx = { activos: [], moneda: { codigo: "GTQ", simbolo: "Q" } };
  let alumnos = [];
  let general = 0;
  let detalle = null;      // { alumnaId, nombre, ...respuesta de academiaMensualidadesAlumno }
  let anulandoPagoId = null;
  let exentoMes = null;    // mes al que se le está escribiendo el motivo de exención

  function html() {
    return `
      <div class="panel" id="panelMensualidades">
        <h2>💳 Mensualidades de alumnos</h2>
        <p class="ayuda">Cada mes, desde que el alumno entró, se marca como pendiente, parcial, pagado o exento según los pagos que registres. Los papás ven su historial y lo que falta en el portal.</p>
        <div class="campo">
          <label>Mensualidad general</label>
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="text" id="inputMensualidadGeneral" inputmode="decimal" placeholder="0.00" style="max-width:160px; margin:0;" />
            <button class="btn secundario chico" id="btnGuardarMensualidadGeneral" type="button" style="width:auto;">Guardar</button>
          </div>
          <p class="ayuda" style="margin:4px 0 0;">El cambio vale desde este mes; los meses anteriores conservan su monto. A cada alumno le puedes poner un monto propio en "Ver meses".</p>
          <p class="mensaje-error" id="mensajeErrorMensualidades"></p>
          <p class="mensaje-exito" id="mensajeExitoMensualidades"></p>
        </div>
        <label class="opcion-check"><input type="checkbox" id="checkSoloPendientes" /> Solo alumnos con pendiente</label>
        <div class="lista-tarjetas" id="listaMensualidades"><p class="lista-vacia">Cargando...</p></div>
      </div>
    `;
  }

  function iniciar(contexto) {
    ctx = contexto;
    el("btnGuardarMensualidadGeneral").addEventListener("click", guardarGeneral);
    el("checkSoloPendientes").addEventListener("change", pintar);
    cargar();
  }

  function reiniciar() {
    alumnos = []; general = 0; detalle = null; anulandoPagoId = null; exentoMes = null;
  }

  function cambiarMoneda(moneda) {
    ctx.moneda = moneda;
    if (el("listaMensualidades")) pintar();
  }

  async function cargar() {
    try {
      const r = await llamar("academiaResumenMensualidades", {});
      if (!r.success) { el("listaMensualidades").innerHTML = `<p class="lista-vacia">${c.escapar(r.error || "No se pudieron cargar las mensualidades.")}</p>`; return; }
      alumnos = r.alumnos || [];
      general = r.mensualidadGeneralCentavos || 0;
      ctx.moneda = r.moneda || ctx.moneda;
      el("inputMensualidadGeneral").value = c.montoParaInput(general);
      pintar();
    } catch (e) {
      el("listaMensualidades").innerHTML = '<p class="lista-vacia">No se pudieron cargar las mensualidades. Revisa tu conexión.</p>';
    }
  }

  function pintar() {
    const cont = el("listaMensualidades");
    if (!cont) return;
    const lista = el("checkSoloPendientes").checked ? alumnos.filter((a) => a.totalPendienteCentavos > 0) : alumnos;
    if (!lista.length) { cont.innerHTML = '<p class="lista-vacia">No hay alumnos para mostrar.</p>'; return; }
    cont.innerHTML = lista.map((a) => `
      <div class="tarjeta-item">
        <div class="info-principal">
          <div class="nombre-item">${c.escapar(a.nombre)} <span class="ayuda" style="margin:0;">#${a.codigo}${a.activo ? "" : " · inactivo"}</span>
            ${a.estadoMesActual ? c.etiquetaEstadoMes(a.estadoMesActual) : ""}</div>
          <div class="detalle-item">Pendiente: <strong>${c.dinero(a.totalPendienteCentavos, ctx.moneda)}</strong>
            ${a.mesesPendientes ? ` · ${a.mesesPendientes} ${a.mesesPendientes === 1 ? "mes" : "meses"} sin completar` : ""}
            ${a.montoPropioCentavos !== null ? ` · monto propio ${c.dinero(a.montoPropioCentavos, ctx.moneda)}` : ""}</div>
        </div>
        <div class="acciones-item"><button class="btn secundario chico" type="button" data-meses="${a.alumnaId}">Ver meses</button></div>
      </div>
    `).join("");
    cont.querySelectorAll("[data-meses]").forEach((b) => b.addEventListener("click", () => abrirDetalle(Number(b.dataset.meses))));
  }

  async function guardarGeneral() {
    const monto = c.leerMonto(el("inputMensualidadGeneral").value);
    el("mensajeErrorMensualidades").textContent = "";
    el("mensajeExitoMensualidades").textContent = "";
    if (monto === null) { el("mensajeErrorMensualidades").textContent = "Escribe un monto válido (por ejemplo 300 o 300.50)."; return; }
    try {
      const r = await llamar("academiaConfigurarMensualidad", c.conResponsable({ montoCentavos: monto }));
      if (!r.success) { el("mensajeErrorMensualidades").textContent = r.error || "No se pudo guardar."; return; }
      el("mensajeExitoMensualidades").textContent = `Guardado: ${c.dinero(monto, ctx.moneda)} desde ${c.nombreMes(r.desde)}.`;
      await cargar();
    } catch (e) {
      el("mensajeErrorMensualidades").textContent = "No se pudo conectar. Inténtalo de nuevo.";
    }
  }

  // ---- meses de un alumno (modal) ----
  async function abrirDetalle(alumnaId) {
    const alumno = alumnos.find((a) => a.alumnaId === alumnaId);
    anulandoPagoId = null; exentoMes = null;
    const caja = c.abrirModal('<h3>💳 Mensualidades</h3><p class="lista-vacia">Cargando...</p>');
    await recargarDetalle(caja, alumnaId, alumno ? alumno.nombre : "");
  }

  async function recargarDetalle(caja, alumnaId, nombre, mesElegido) {
    try {
      const r = await llamar("academiaMensualidadesAlumno", { alumnaId });
      if (!r.success) { caja.innerHTML = `<p class="mensaje-error">${c.escapar(r.error || "No se pudo cargar.")}</p>`; return; }
      detalle = { alumnaId, nombre, ...r };
      pintarDetalle(caja, mesElegido);
    } catch (e) {
      caja.innerHTML = '<p class="mensaje-error">No se pudo conectar. Revisa tu conexión.</p><div class="acciones-modal"><button class="btn secundario" type="button" data-cerrar-modal>Cerrar</button></div>';
      caja.querySelector("[data-cerrar-modal]").addEventListener("click", c.cerrarModal);
    }
  }

  // Meses que se pueden elegir para pagar: los del historial más los
  // próximos 12 (pago adelantado).
  function mesesParaPagar() {
    const meses = detalle.meses.map((m) => m.mes);
    let mes = c.mesActual();
    for (let i = 0; i < 12; i++) {
      const [a, n] = mes.split("-").map(Number);
      mes = new Date(Date.UTC(a, n, 1)).toISOString().slice(0, 7);
      if (!meses.includes(mes)) meses.push(mes);
    }
    return meses;
  }

  function htmlMes(m) {
    const moneda = detalle.moneda || ctx.moneda;
    const montos = m.estado === "parcial"
      ? `Pagado ${c.dinero(m.pagadoCentavos, moneda)} de ${c.dinero(m.montoCentavos, moneda)} · <strong>faltan ${c.dinero(m.faltaCentavos, moneda)}</strong>`
      : m.estado === "pendiente" ? `<strong>Falta ${c.dinero(m.faltaCentavos, moneda)}</strong>`
      : m.estado === "exento" ? `Exento${m.motivoExento ? `: ${c.escapar(m.motivoExento)}` : ""}`
      : m.estado === "inactivo" ? "Alumno inactivo este mes"
      : m.estado === "sin_cobro" ? "Sin mensualidad configurada"
      : `Pagado ${c.dinero(m.pagadoCentavos, moneda)}`;
    const pagos = m.pagos.map((p) => `
      <li${p.anulado ? ' style="opacity:.6; text-decoration:line-through;"' : ""}>${c.dinero(p.montoCentavos, moneda)} · ${c.escapar(c.fecha(p.fecha))} · ${c.escapar(c.FORMAS_PAGO[p.formaPago] || p.formaPago)}${p.nota ? ` · ${c.escapar(p.nota)}` : ""}${p.anulado ? ` (anulado: ${c.escapar(p.motivoAnulacion || "")})` : ""}
        ${p.anulado ? "" : p.id === anulandoPagoId ? `
          <span style="display:flex; gap:6px; margin-top:4px;">
            <input type="text" id="inputMotivoAnularPago" maxlength="300" placeholder="Motivo" style="margin:0;" aria-label="Motivo" />
            <button class="btn peligro chico" type="button" data-confirmar-anular-pago="${p.id}" style="width:auto;">Anular</button>
            <button class="btn secundario chico" type="button" data-cancelar style="width:auto;">Cancelar</button>
          </span>` : ` <button class="enlace-texto" type="button" data-anular-pago="${p.id}">anular</button>`}
      </li>`).join("");
    return `
      <div class="tarjeta-item">
        <div class="info-principal" style="width:100%;">
          <div class="nombre-item">${c.escapar(c.nombreMes(m.mes))} ${c.etiquetaEstadoMes(m.estado)}</div>
          <div class="detalle-item">${montos}</div>
          ${pagos ? `<ul style="margin:6px 0 0; padding-left:18px; font-size:13px;">${pagos}</ul>` : ""}
          ${m.mes === exentoMes ? `
            <div style="display:flex; gap:6px; margin-top:8px;">
              <input type="text" id="inputMotivoExento" maxlength="300" placeholder="Motivo (vacaciones, beca...)" style="margin:0;" aria-label="Motivo" />
              <button class="btn chico" type="button" data-confirmar-exento="${m.mes}" style="width:auto;">Marcar exento</button>
              <button class="btn secundario chico" type="button" data-cancelar style="width:auto;">Cancelar</button>
            </div>` : ""}
        </div>
        <div class="acciones-item">
          ${m.faltaCentavos > 0 ? `<button class="btn secundario chico" type="button" data-pagar-mes="${m.mes}">Pagar</button>` : ""}
          ${m.estado === "exento" ? `<button class="btn secundario chico" type="button" data-quitar-exento="${m.mes}">Quitar exento</button>`
            : m.estado !== "inactivo" && m.mes !== exentoMes ? `<button class="btn secundario chico" type="button" data-exento="${m.mes}">Exento</button>` : ""}
        </div>
      </div>
    `;
  }

  function pintarDetalle(caja, mesElegido) {
    const moneda = detalle.moneda || ctx.moneda;
    const primerPendiente = detalle.meses.find((m) => m.faltaCentavos > 0);
    const mesForm = mesElegido || (primerPendiente ? primerPendiente.mes : c.mesActual());
    const datosMes = detalle.meses.find((m) => m.mes === mesForm);
    caja.innerHTML = `
      <h3>💳 Mensualidades de ${c.escapar(detalle.nombre)}</h3>
      <div class="grid-stats"><div class="stat-caja"><div class="stat-numero">${c.dinero(detalle.totalPendienteCentavos, moneda)}</div><div class="stat-etiqueta">Total pendiente</div></div></div>
      <div class="campo" style="margin-top:12px;">
        <label>Monto propio de este alumno</label>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <input type="text" id="inputMontoPropio" inputmode="decimal" value="${detalle.montoPropioCentavos !== null ? c.montoParaInput(detalle.montoPropioCentavos) : ""}" placeholder="General: ${c.montoParaInput(detalle.mensualidadGeneralCentavos)}" style="max-width:160px; margin:0;" />
          <button class="btn secundario chico" type="button" id="btnGuardarMontoPropio" style="width:auto;">Guardar</button>
          ${detalle.montoPropioCentavos !== null ? '<button class="btn secundario chico" type="button" id="btnUsarGeneral" style="width:auto;">Usar la general</button>' : ""}
        </div>
        <p class="ayuda" style="margin:4px 0 0;">Vale desde este mes. Vacío = usa la mensualidad general.</p>
      </div>
      <h3 style="margin:14px 0 6px;">Registrar pago</h3>
      <div class="fila-formulario">
        <div><label>Mes</label><select id="selectPagoMes">${mesesParaPagar().map((mes) => `<option value="${mes}"${mes === mesForm ? " selected" : ""}>${c.escapar(c.nombreMes(mes))}</option>`).join("")}</select></div>
        <div><label>Monto</label><input type="text" id="inputPagoMonto" inputmode="decimal" value="${datosMes && datosMes.faltaCentavos > 0 ? c.montoParaInput(datosMes.faltaCentavos) : ""}" placeholder="0.00" /></div>
        <div><label>Fecha</label><input type="date" id="inputPagoFecha" value="${c.hoy()}" /></div>
      </div>
      <div class="fila-formulario">
        <div><label>Forma de pago</label><select id="selectPagoForma">${c.opcionesFormaPago()}</select></div>
        <div><label>Nota (opcional)</label><input type="text" id="inputPagoNota" maxlength="300" /></div>
      </div>
      <button class="btn" type="button" id="btnRegistrarPago" style="margin-top:6px;">Registrar pago</button>
      <p class="mensaje-error" id="mensajeErrorMeses"></p>
      <h3 style="margin:14px 0 6px;">Meses</h3>
      <div class="lista-tarjetas">${detalle.meses.slice().reverse().map(htmlMes).join("") || '<p class="lista-vacia">Sin meses.</p>'}</div>
      <details style="margin-top:12px;"><summary>📜 Bitácora (${detalle.bitacora.length})</summary>
        <ul style="padding-left:18px; font-size:13px;">${detalle.bitacora.map((b) => `<li>${c.escapar(c.textoBitacora(b))} · ${c.escapar(textoEntidad(b))}</li>`).join("")}</ul>
      </details>
      <div class="acciones-modal"><button class="btn secundario" type="button" data-cerrar-modal>Cerrar</button></div>
    `;
    caja.querySelector("[data-cerrar-modal]").addEventListener("click", () => { c.cerrarModal(); cargar(); });
    caja.querySelector("#selectPagoMes").addEventListener("change", (e) => {
      const m = detalle.meses.find((x) => x.mes === e.target.value);
      caja.querySelector("#inputPagoMonto").value = m && m.faltaCentavos > 0 ? c.montoParaInput(m.faltaCentavos) : "";
    });
    caja.querySelector("#btnRegistrarPago").addEventListener("click", () => registrarPago(caja));
    caja.querySelector("#btnGuardarMontoPropio").addEventListener("click", () => guardarMontoPropio(caja, false));
    const usarGeneral = caja.querySelector("#btnUsarGeneral");
    if (usarGeneral) usarGeneral.addEventListener("click", () => guardarMontoPropio(caja, true));
    caja.querySelectorAll("[data-pagar-mes]").forEach((b) => b.addEventListener("click", () => pintarDetalle(caja, b.dataset.pagarMes)));
    caja.querySelectorAll("[data-anular-pago]").forEach((b) => b.addEventListener("click", () => { anulandoPagoId = Number(b.dataset.anularPago); exentoMes = null; pintarDetalle(caja, mesForm); }));
    caja.querySelectorAll("[data-exento]").forEach((b) => b.addEventListener("click", () => { exentoMes = b.dataset.exento; anulandoPagoId = null; pintarDetalle(caja, mesForm); }));
    caja.querySelectorAll("[data-cancelar]").forEach((b) => b.addEventListener("click", () => { exentoMes = null; anulandoPagoId = null; pintarDetalle(caja, mesForm); }));
    caja.querySelectorAll("[data-confirmar-anular-pago]").forEach((b) => b.addEventListener("click", () => {
      const motivo = caja.querySelector("#inputMotivoAnularPago").value.trim();
      if (!motivo) { caja.querySelector("#mensajeErrorMeses").textContent = "Escribe el motivo de la anulación."; return; }
      ejecutar(caja, "academiaAnularPagoMensualidad", { pagoId: Number(b.dataset.confirmarAnularPago), motivo });
    }));
    caja.querySelectorAll("[data-confirmar-exento]").forEach((b) => b.addEventListener("click", () => {
      ejecutar(caja, "academiaMarcarExento", { alumnaId: detalle.alumnaId, mes: b.dataset.confirmarExento, motivo: caja.querySelector("#inputMotivoExento").value });
    }));
    caja.querySelectorAll("[data-quitar-exento]").forEach((b) => b.addEventListener("click", () => {
      ejecutar(caja, "academiaQuitarExento", { alumnaId: detalle.alumnaId, mes: b.dataset.quitarExento });
    }));
  }

  function textoEntidad(b) {
    const moneda = detalle.moneda || ctx.moneda;
    const d = b.despues || {}, a = b.antes || {};
    if (b.entidad === "pago_mensualidad") {
      return b.accion === "anular" ? `pago de ${c.nombreMes(a.mes)} (${c.dinero(a.montoCentavos, moneda)}) · motivo: ${d.motivo || ""}`
        : `pago de ${c.nombreMes(d.mes)} por ${c.dinero(d.montoCentavos, moneda)}`;
    }
    if (b.entidad === "exento") return `exento ${c.nombreMes(d.mes || a.mes)}${d.motivo ? ` (${d.motivo})` : ""}`;
    if (b.entidad === "monto_mensualidad") return `monto propio: ${d.montoCentavos === null ? "usa la general" : c.dinero(d.montoCentavos, moneda)} desde ${c.nombreMes(d.desde)}`;
    return b.entidad;
  }

  async function ejecutar(caja, accion, datos, mesElegido) {
    caja.querySelector("#mensajeErrorMeses").textContent = "";
    try {
      const r = await llamar(accion, c.conResponsable(datos));
      if (!r.success) { caja.querySelector("#mensajeErrorMeses").textContent = r.error || "No se pudo guardar."; return; }
      anulandoPagoId = null; exentoMes = null;
      await recargarDetalle(caja, detalle.alumnaId, detalle.nombre, mesElegido);
    } catch (e) {
      caja.querySelector("#mensajeErrorMeses").textContent = "No se pudo conectar. Inténtalo de nuevo.";
    }
  }

  function registrarPago(caja) {
    const monto = c.leerMonto(caja.querySelector("#inputPagoMonto").value);
    if (!monto) { caja.querySelector("#mensajeErrorMeses").textContent = "Escribe un monto válido."; return; }
    const mes = caja.querySelector("#selectPagoMes").value;
    ejecutar(caja, "academiaRegistrarPagoMensualidad", {
      alumnaId: detalle.alumnaId, mes, montoCentavos: monto, fecha: caja.querySelector("#inputPagoFecha").value,
      formaPago: caja.querySelector("#selectPagoForma").value, nota: caja.querySelector("#inputPagoNota").value,
    });
  }

  function guardarMontoPropio(caja, usarGeneral) {
    const texto = caja.querySelector("#inputMontoPropio").value.trim();
    const monto = usarGeneral || !texto ? null : c.leerMonto(texto);
    if (!usarGeneral && texto && monto === null) { caja.querySelector("#mensajeErrorMeses").textContent = "Escribe un monto válido."; return; }
    ejecutar(caja, "academiaMontoMensualidadAlumno", { alumnaId: detalle.alumnaId, montoCentavos: monto });
  }

  return { html, iniciar, reiniciar, cambiarMoneda };
})();
