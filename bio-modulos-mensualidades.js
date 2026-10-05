// ===============================================================
// Módulo mensualidades de alumnos en el panel de la academia:
// mensualidad sugerida (para alumnos nuevos), pantalla "Mensualidades por
// alumno" para editarlas todas juntas, lista con lo pendiente de cada
// alumno y un modal por alumno con sus meses (pendiente / parcial /
// pagado / exento), pagos (varios por mes), anulaciones con motivo, su
// mensualidad y la bitácora. También llena el campo "Mensualidad" de
// Agregar alumno con la sugerida. Lo arranca bio-modulos-panel.js; usa el y llamar de
// academia.js y bioComun.
// ===============================================================
const modulosMensualidades = (() => {
  const c = bioComun;
  let ctx = { activos: [], moneda: { codigo: "GTQ", simbolo: "Q" } };
  let alumnos = [];
  let sugerida = 0;
  let detalle = null;      // { alumnaId, nombre, ...respuesta de academiaMensualidadesAlumno }
  let anulandoPagoId = null;
  let exentoMes = null;    // mes al que se le está escribiendo el motivo de exención

  function html() {
    return `
      <div class="panel" id="panelMensualidades">
        <h2>💳 Mensualidades de alumnos</h2>
        <p class="ayuda">Cada alumno tiene su mensualidad. Cada mes, desde que entró, se marca como pendiente, parcial, pagado o exento según los pagos que registres. Los papás ven su historial y lo que falta en el portal.</p>
        <button class="btn secundario" id="btnMensualidadesPorAlumno" type="button">📝 Mensualidades por alumno</button>
        <p class="ayuda" id="avisoSinMensualidad" style="margin:6px 0 0;"></p>
        <div class="campo" style="margin-top:12px;">
          <label>Mensualidad sugerida para alumnos nuevos</label>
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="text" id="inputMensualidadGeneral" inputmode="decimal" placeholder="0.00" style="max-width:160px; margin:0;" />
            <button class="btn secundario chico" id="btnGuardarMensualidadGeneral" type="button" style="width:auto;">Guardar</button>
          </div>
          <p class="ayuda" style="margin:4px 0 0;">Es solo el valor que se propone al agregar un alumno; no le cambia la mensualidad a nadie.</p>
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
    el("btnMensualidadesPorAlumno").addEventListener("click", abrirTabla);
    el("campoMensualidadNueva").hidden = false;
    cargar();
  }

  function reiniciar() {
    alumnos = []; sugerida = 0; detalle = null; anulandoPagoId = null; exentoMes = null;
    if (el("campoMensualidadNueva")) {
      el("campoMensualidadNueva").hidden = true;
      el("inputNuevaAlumnaMensualidad").value = "";
    }
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
      sugerida = r.mensualidadSugeridaCentavos || 0;
      ctx.moneda = r.moneda || ctx.moneda;
      el("inputMensualidadGeneral").value = c.montoParaInput(sugerida);
      // Campo "Mensualidad" de Agregar alumno: con la sugerida si está vacío.
      if (!el("inputNuevaAlumnaMensualidad").value && sugerida) el("inputNuevaAlumnaMensualidad").value = c.montoParaInput(sugerida);
      const sinMonto = alumnos.filter((a) => a.activo && a.sinMonto).length;
      el("avisoSinMensualidad").textContent = sinMonto
        ? `⚠️ ${sinMonto} ${sinMonto === 1 ? "alumno activo no tiene" : "alumnos activos no tienen"} mensualidad: complétala en "Mensualidades por alumno".`
        : "";
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
            · ${a.sinMonto ? "⚠️ sin mensualidad" : `mensualidad ${c.dinero(a.montoActualCentavos, ctx.moneda)}`}</div>
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
      el("mensajeExitoMensualidades").textContent = `Sugerida guardada: ${c.dinero(monto, ctx.moneda)}.`;
      el("inputNuevaAlumnaMensualidad").value = monto ? c.montoParaInput(monto) : "";
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
        <label>Mensualidad de este alumno</label>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <input type="text" id="inputMontoPropio" inputmode="decimal" value="${detalle.montoActualCentavos ? c.montoParaInput(detalle.montoActualCentavos) : ""}" placeholder="${detalle.mensualidadSugeridaCentavos ? `Sugerida: ${c.montoParaInput(detalle.mensualidadSugeridaCentavos)}` : "0.00"}" style="max-width:160px; margin:0;" />
          ${detalle.tieneMontoPrevio ? "" : selectorDesde("selectDesdeMontoPropio", detalle.mesAlta)}
          <button class="btn secundario chico" type="button" id="btnGuardarMontoPropio" style="width:auto;">Guardar</button>
        </div>
        <p class="ayuda" style="margin:4px 0 0;">${detalle.tieneMontoPrevio ? "El cambio vale desde este mes; los meses anteriores conservan su monto." : "Es su primera mensualidad: elige desde qué mes aplica."}</p>
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
    caja.querySelector("#btnGuardarMontoPropio").addEventListener("click", () => guardarMontoPropio(caja));
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
    if (b.entidad === "monto_mensualidad") return `mensualidad: ${d.montoCentavos === null ? "sin mensualidad" : c.dinero(d.montoCentavos, moneda)} desde ${c.nombreMes(d.desde)}`;
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

  function guardarMontoPropio(caja) {
    const texto = caja.querySelector("#inputMontoPropio").value.trim();
    const monto = texto ? c.leerMonto(texto) : null;
    if (texto && monto === null) { caja.querySelector("#mensajeErrorMeses").textContent = "Escribe un monto válido."; return; }
    const desde = caja.querySelector("#selectDesdeMontoPropio");
    ejecutar(caja, "academiaMontoMensualidadAlumno", { alumnaId: detalle.alumnaId, montoCentavos: monto, desde: desde ? desde.value : undefined });
  }

  // Selector "Aplicar desde": del mes actual hacia atrás hasta mesAlta.
  function selectorDesde(id, mesAlta) {
    return `<select id="${id}" aria-label="Aplicar desde" style="max-width:220px; margin:0;">${mesesDesde(mesAlta).map((mes, i) => `<option value="${mes}"${i === 0 ? " selected" : ""}>Desde ${c.escapar(c.nombreMes(mes))}</option>`).join("")}</select>`;
  }

  function mesesDesde(mesAlta) {
    const meses = [];
    let mes = c.mesActual();
    while (mes >= (mesAlta || mes) && meses.length < 120) {
      meses.push(mes);
      const [a, n] = mes.split("-").map(Number);
      mes = new Date(Date.UTC(a, n - 2, 1)).toISOString().slice(0, 7);
    }
    return meses;
  }

  // ---- pantalla "Mensualidades por alumno" (modal) ----
  async function abrirTabla() {
    const caja = c.abrirModal('<h3>📝 Mensualidades por alumno</h3><p class="lista-vacia">Cargando...</p>');
    try {
      const r = await llamar("academiaResumenMensualidades", {});
      if (!r.success) { caja.innerHTML = `<p class="mensaje-error">${c.escapar(r.error || "No se pudo cargar.")}</p>`; return; }
      alumnos = r.alumnos || [];
      sugerida = r.mensualidadSugeridaCentavos || 0;
      pintarTabla(caja);
    } catch (e) {
      caja.innerHTML = '<p class="mensaje-error">No se pudo conectar. Revisa tu conexión.</p>';
    }
  }

  function pintarTabla(caja) {
    const moneda = ctx.moneda;
    const activos = alumnos.filter((a) => a.activo);
    const sinMonto = activos.filter((a) => a.sinMonto).length;
    const altaMasVieja = activos.filter((a) => !a.tieneMontoPrevio).map((a) => a.mesAlta).sort()[0];
    caja.innerHTML = `
      <h3>📝 Mensualidades por alumno</h3>
      <p class="ayuda">Edita la mensualidad de cada alumno activo y guarda todo junto. Si ya tenía mensualidad, el cambio vale desde este mes.${sinMonto ? ` <strong>${sinMonto} sin mensualidad</strong> (marcados con ⚠️).` : ""}</p>
      ${altaMasVieja ? `
        <div class="campo"><label>Aplicar desde (solo para los que no tenían mensualidad)</label>
          ${selectorDesde("selectDesdeTabla", altaMasVieja)}
          <p class="ayuda" style="margin:4px 0 0;">A ningún alumno se le aplica antes de su mes de alta.</p></div>` : ""}
      ${sinMonto && sugerida ? `<button class="enlace-texto" type="button" id="btnPonerSugerida">Poner la sugerida (${c.dinero(sugerida, moneda)}) a los que no tienen</button>` : ""}
      <div class="lista-tarjetas" style="margin-top:8px;">
        ${activos.map((a) => `
          <div class="tarjeta-item">
            <div class="info-principal">
              <div class="nombre-item">${a.sinMonto ? "⚠️ " : ""}${c.escapar(a.nombre)} <span class="ayuda" style="margin:0;">#${a.codigo}</span></div>
              <div class="detalle-item">${a.sinMonto ? "Sin mensualidad" : `Actual: ${c.dinero(a.montoActualCentavos, moneda)}`}${a.tieneMontoPrevio ? "" : ` · alta en ${c.escapar(c.nombreMes(a.mesAlta))}`}</div>
            </div>
            <div class="acciones-item">
              <input type="text" inputmode="decimal" data-monto-alumno="${a.alumnaId}" value="${a.sinMonto ? "" : c.montoParaInput(a.montoActualCentavos)}" placeholder="0.00" aria-label="Mensualidad de ${c.escapar(a.nombre)}" style="max-width:130px; margin:0;" />
            </div>
          </div>`).join("") || '<p class="lista-vacia">No hay alumnos activos.</p>'}
      </div>
      <p class="mensaje-error" id="mensajeErrorTabla"></p>
      <p class="mensaje-exito" id="mensajeExitoTabla"></p>
      <div class="acciones-modal">
        <button class="btn secundario" type="button" data-cerrar-modal>Cerrar</button>
        <button class="btn" type="button" id="btnGuardarTabla">Guardar cambios</button>
      </div>
    `;
    caja.querySelector("[data-cerrar-modal]").addEventListener("click", () => { c.cerrarModal(); cargar(); });
    const poner = caja.querySelector("#btnPonerSugerida");
    if (poner) poner.addEventListener("click", () => {
      caja.querySelectorAll("[data-monto-alumno]").forEach((input) => {
        const a = alumnos.find((x) => x.alumnaId === Number(input.dataset.montoAlumno));
        if (a && a.sinMonto && !input.value.trim()) input.value = c.montoParaInput(sugerida);
      });
    });
    caja.querySelector("#btnGuardarTabla").addEventListener("click", () => guardarTabla(caja));
  }

  async function guardarTabla(caja) {
    const cambios = [];
    for (const input of caja.querySelectorAll("[data-monto-alumno]")) {
      const a = alumnos.find((x) => x.alumnaId === Number(input.dataset.montoAlumno));
      const texto = input.value.trim();
      const monto = texto ? c.leerMonto(texto) : null;
      if (texto && monto === null) { caja.querySelector("#mensajeErrorTabla").textContent = `El monto de ${a.nombre} no es válido.`; return; }
      const actual = a.sinMonto ? null : a.montoActualCentavos;
      if (monto !== actual) cambios.push({ alumnaId: a.alumnaId, montoCentavos: monto });
    }
    caja.querySelector("#mensajeErrorTabla").textContent = "";
    if (!cambios.length) { caja.querySelector("#mensajeErrorTabla").textContent = "No hay cambios que guardar."; return; }
    const desde = caja.querySelector("#selectDesdeTabla");
    try {
      const r = await llamar("academiaGuardarMensualidadesAlumnos", c.conResponsable({ cambios, desde: desde ? desde.value : undefined }));
      if (!r.success) { caja.querySelector("#mensajeErrorTabla").textContent = r.error || "No se pudo guardar."; return; }
      await abrirTabla();
      const caja2 = document.getElementById("cajaModalBioModulos");
      caja2.querySelector("#mensajeExitoTabla").textContent = `Guardado: ${r.guardados.length} ${r.guardados.length === 1 ? "mensualidad" : "mensualidades"}.`;
    } catch (e) {
      caja.querySelector("#mensajeErrorTabla").textContent = "No se pudo conectar. Inténtalo de nuevo.";
    }
  }

  return { html, iniciar, reiniciar, cambiarMoneda };
})();
