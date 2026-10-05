// ===============================================================
// Módulo trajes en el panel de la academia: catálogo de trajes (con la
// pantalla de cada traje para vincular alumnos), cargos sueltos (a un
// alumno, a una clase o a los que dijeron Sí al show activo), abonos,
// saldos y un modal por alumno para editar o anular movimientos (con
// motivo) y ver la bitácora. Lo arranca bio-modulos-panel.js; usa el y llamar de
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
  let catalogo = [];        // [{ id, nombre, precioCentavos, activo, vinculados, cobradoCentavos, pendienteCentavos, cargosSinAbono }]
  let trajeEditandoId = null;
  let precioPendiente = null; // { trajeId, nombre, precioCentavos } esperando "¿aplicar a los cargos sin abono?"

  function html() {
    return `
      <div class="panel" id="panelTrajes">
        <h2>👗 Trajes</h2>
        <p class="ayuda">Registra lo que cuesta cada traje (cargos) y lo que va pagando cada alumno (abonos). Saldo = cargos − abonos. Los papás ven su saldo y el detalle en el portal.</p>
        <h3 style="margin:8px 0;">Catálogo de trajes</h3>
        <p class="ayuda" style="margin-top:0;">Crea cada traje con su precio y elige qué alumnos lo llevan: a cada uno se le crea su cargo.</p>
        <div class="fila-formulario">
          <div><label>Nombre del traje</label><input type="text" id="inputTrajeNombre" maxlength="80" placeholder="Ej.: Vestido rojo" /></div>
          <div><label>Precio</label><input type="text" id="inputTrajePrecio" inputmode="decimal" placeholder="0.00" /></div>
        </div>
        <button class="btn" id="btnCrearTraje" type="button" style="margin-top:6px;">Agregar traje</button>
        <p class="mensaje-error" id="mensajeErrorCatalogo"></p>
        <div id="avisoPrecioTraje"></div>
        <div class="lista-tarjetas" id="listaCatalogo" style="margin-top:12px;"><p class="lista-vacia">Cargando...</p></div>
        <h3 style="margin:16px 0 8px;">Cargo suelto (sin traje del catálogo)</h3>
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
        <h3 style="margin:16px 0 8px;">Saldos por alumno</h3>
        <label class="opcion-check"><input type="checkbox" id="checkSoloConSaldo" /> Solo alumnos con saldo pendiente</label>
        <div class="lista-tarjetas" id="listaTrajes"><p class="lista-vacia">Cargando...</p></div>
      </div>
    `;
  }

  function iniciar(contexto) {
    ctx = contexto;
    el("selectCargoDestino").addEventListener("change", ajustarDestino);
    el("btnCrearCargo").addEventListener("click", crearCargo);
    el("checkSoloConSaldo").addEventListener("change", pintar);
    el("btnCrearTraje").addEventListener("click", crearTraje);
    cargar();
    cargarCatalogo();
    if (ctx.activos.includes("clases_asistencia")) cargarClases();
  }

  function reiniciar() {
    alumnos = []; clases = []; detalle = null; editandoId = null; anulandoId = null;
    catalogo = []; trajeEditandoId = null; precioPendiente = null; vinculos = null;
  }

  function cambiarMoneda(moneda) {
    ctx.moneda = moneda;
    if (el("listaTrajes")) pintar();
    if (el("listaCatalogo")) pintarCatalogo();
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
    // Por defecto se propone el cargo más viejo que todavía tiene saldo,
    // para que el estado de cada traje se mantenga al día.
    const propuesto = cargosVigentes.slice().reverse().find((m) => (m.abonadoCentavos || 0) < m.montoCentavos);
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
            ${cargosVigentes.map((m) => `<option value="${m.id}"${propuesto && m.id === propuesto.id ? " selected" : ""}>${c.escapar(m.concepto)} (${c.dinero(m.montoCentavos, moneda)}${m.abonadoCentavos ? `, abonado ${c.dinero(m.abonadoCentavos, moneda)}` : ""})</option>`).join("")}
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

  // ---------------------------------------------------------------
  // Catálogo de trajes
  // ---------------------------------------------------------------
  async function cargarCatalogo() {
    try {
      const r = await llamar("academiaListarTrajesCatalogo", {});
      if (!r.success) { el("listaCatalogo").innerHTML = `<p class="lista-vacia">${c.escapar(r.error || "No se pudo cargar el catálogo.")}</p>`; return; }
      catalogo = r.trajes || [];
      pintarCatalogo();
    } catch (e) {
      el("listaCatalogo").innerHTML = '<p class="lista-vacia">No se pudo cargar el catálogo. Revisa tu conexión.</p>';
    }
  }

  function pintarCatalogo() {
    const cont = el("listaCatalogo");
    if (!cont) return;
    if (!catalogo.length) { cont.innerHTML = '<p class="lista-vacia">Todavía no hay trajes en el catálogo.</p>'; return; }
    cont.innerHTML = catalogo.map((t) => (t.id === trajeEditandoId ? `
      <div class="tarjeta-item">
        <div class="info-principal" style="width:100%;">
          <input type="text" id="inputEditarTrajeNombre" maxlength="80" value="${c.escapar(t.nombre)}" aria-label="Nombre" />
          <input type="text" id="inputEditarTrajePrecio" inputmode="decimal" value="${c.montoParaInput(t.precioCentavos)}" aria-label="Precio" />
        </div>
        <div class="acciones-item">
          <button class="btn chico" type="button" data-guardar-traje="${t.id}">Guardar</button>
          <button class="btn secundario chico" type="button" data-cancelar-traje>Cancelar</button>
        </div>
      </div>` : `
      <div class="tarjeta-item">
        <div class="info-principal">
          <div class="nombre-item">${c.escapar(t.nombre)} — ${c.dinero(t.precioCentavos, ctx.moneda)}
            ${t.activo ? "" : '<span class="etiqueta-estado exento">Desactivado</span>'}</div>
          <div class="detalle-item">${t.vinculados} ${t.vinculados === 1 ? "alumno" : "alumnos"} · cobrado ${c.dinero(t.cobradoCentavos, ctx.moneda)} · pendiente ${c.dinero(t.pendienteCentavos, ctx.moneda)}</div>
        </div>
        <div class="acciones-item">
          <button class="btn secundario chico" type="button" data-abrir-traje="${t.id}">Alumnos</button>
          <button class="btn secundario chico" type="button" data-editar-traje="${t.id}">Editar</button>
          <button class="btn secundario chico" type="button" data-activar-traje="${t.id}">${t.activo ? "Desactivar" : "Activar"}</button>
        </div>
      </div>`)).join("");
    cont.querySelectorAll("[data-abrir-traje]").forEach((b) => b.addEventListener("click", () => abrirTraje(Number(b.dataset.abrirTraje))));
    cont.querySelectorAll("[data-editar-traje]").forEach((b) => b.addEventListener("click", () => { trajeEditandoId = Number(b.dataset.editarTraje); pintarCatalogo(); }));
    cont.querySelectorAll("[data-cancelar-traje]").forEach((b) => b.addEventListener("click", () => { trajeEditandoId = null; pintarCatalogo(); }));
    cont.querySelectorAll("[data-activar-traje]").forEach((b) => b.addEventListener("click", () => {
      const t = catalogo.find((x) => x.id === Number(b.dataset.activarTraje));
      editarTraje(t.id, { activo: !t.activo });
    }));
    cont.querySelectorAll("[data-guardar-traje]").forEach((b) => b.addEventListener("click", () => guardarTraje(Number(b.dataset.guardarTraje))));
  }

  async function crearTraje() {
    const nombre = el("inputTrajeNombre").value.trim();
    const precio = c.leerMonto(el("inputTrajePrecio").value);
    el("mensajeErrorCatalogo").textContent = "";
    if (!nombre) { el("mensajeErrorCatalogo").textContent = "Escribe el nombre del traje."; return; }
    if (!precio) { el("mensajeErrorCatalogo").textContent = "Escribe un precio válido."; return; }
    try {
      const r = await llamar("academiaCrearTrajeCatalogo", c.conResponsable({ nombre, precioCentavos: precio }));
      if (!r.success) { el("mensajeErrorCatalogo").textContent = r.error || "No se pudo crear el traje."; return; }
      el("inputTrajeNombre").value = "";
      el("inputTrajePrecio").value = "";
      await cargarCatalogo();
    } catch (e) {
      el("mensajeErrorCatalogo").textContent = "No se pudo conectar. Inténtalo de nuevo.";
    }
  }

  // Si cambia el precio y hay cargos vinculados sin abonos, se pregunta
  // en la misma pantalla si también se les aplica.
  function guardarTraje(trajeId) {
    const t = catalogo.find((x) => x.id === trajeId);
    const nombre = el("inputEditarTrajeNombre").value.trim();
    const precio = c.leerMonto(el("inputEditarTrajePrecio").value);
    el("mensajeErrorCatalogo").textContent = "";
    if (!nombre) { el("mensajeErrorCatalogo").textContent = "Escribe el nombre del traje."; return; }
    if (!precio) { el("mensajeErrorCatalogo").textContent = "Escribe un precio válido."; return; }
    const cambios = {};
    if (nombre !== t.nombre) cambios.nombre = nombre;
    if (precio !== t.precioCentavos) cambios.precioCentavos = precio;
    if (!Object.keys(cambios).length) { trajeEditandoId = null; pintarCatalogo(); return; }
    if (cambios.precioCentavos && t.cargosSinAbono > 0) {
      precioPendiente = { trajeId, cambios, cantidad: t.cargosSinAbono };
      pintarAvisoPrecio();
      return;
    }
    editarTraje(trajeId, cambios);
  }

  function pintarAvisoPrecio() {
    const cont = el("avisoPrecioTraje");
    if (!precioPendiente) { cont.innerHTML = ""; return; }
    const { cambios, cantidad } = precioPendiente;
    cont.innerHTML = `
      <div class="tarjeta-item aviso-fijado" style="margin-top:10px;">
        <div class="info-principal">
          <div class="nombre-item">¿Aplicar el precio nuevo (${c.dinero(cambios.precioCentavos, ctx.moneda)}) también a ${cantidad} ${cantidad === 1 ? "cargo vinculado" : "cargos vinculados"} sin abonos?</div>
          <div class="detalle-item">Los cargos que ya tienen abonos no cambian.</div>
        </div>
        <div class="acciones-item">
          <button class="btn chico" type="button" id="btnPrecioAplicar">Sí, aplicar</button>
          <button class="btn secundario chico" type="button" id="btnPrecioSoloNuevos">No, solo para los nuevos</button>
          <button class="btn secundario chico" type="button" id="btnPrecioCancelar">Cancelar</button>
        </div>
      </div>
    `;
    el("btnPrecioAplicar").addEventListener("click", () => confirmarPrecio(true));
    el("btnPrecioSoloNuevos").addEventListener("click", () => confirmarPrecio(false));
    el("btnPrecioCancelar").addEventListener("click", () => { precioPendiente = null; pintarAvisoPrecio(); });
  }

  function confirmarPrecio(aplicar) {
    const { trajeId, cambios } = precioPendiente;
    precioPendiente = null;
    pintarAvisoPrecio();
    editarTraje(trajeId, { ...cambios, aplicarACargosSinAbono: aplicar });
  }

  async function editarTraje(trajeId, cambios) {
    el("mensajeErrorCatalogo").textContent = "";
    try {
      const r = await llamar("academiaEditarTrajeCatalogo", c.conResponsable({ trajeId, ...cambios }));
      if (!r.success) { el("mensajeErrorCatalogo").textContent = r.error || "No se pudo guardar el traje."; return; }
      trajeEditandoId = null;
      if (cambios.aplicarACargosSinAbono) {
        el("mensajeErrorCatalogo").textContent = "";
        el("avisoPrecioTraje").innerHTML = `<p class="mensaje-exito">Precio aplicado a ${r.cargosActualizados} ${r.cargosActualizados === 1 ? "cargo" : "cargos"}${r.cargosConAbonoSinCambio ? `; ${r.cargosConAbonoSinCambio} con abonos no cambiaron` : ""}.</p>`;
      }
      await cargarCatalogo();
      cargar();
    } catch (e) {
      el("mensajeErrorCatalogo").textContent = "No se pudo conectar. Inténtalo de nuevo.";
    }
  }

  // ---- pantalla de un traje (modal): vincular alumnos ----
  let vinculos = null;         // respuesta de academiaVinculosTraje
  let marcados = new Set();    // alumnos con la casilla marcada
  let conAbonos = [];          // desvinculados con abonos esperando decisión
  const filtros = { texto: "", clase: "", show: false };

  async function abrirTraje(trajeId) {
    filtros.texto = ""; filtros.clase = ""; filtros.show = false;
    conAbonos = [];
    const caja = c.abrirModal('<h3>👗 Traje</h3><p class="lista-vacia">Cargando...</p>');
    await recargarTraje(caja, trajeId);
  }

  async function recargarTraje(caja, trajeId) {
    try {
      const r = await llamar("academiaVinculosTraje", { trajeId });
      if (!r.success) { caja.innerHTML = `<p class="mensaje-error">${c.escapar(r.error || "No se pudo cargar.")}</p>`; return; }
      vinculos = r;
      marcados = new Set(r.alumnos.filter((a) => a.vinculado).map((a) => a.alumnaId));
      pintarTraje(caja);
    } catch (e) {
      caja.innerHTML = '<p class="mensaje-error">No se pudo conectar. Revisa tu conexión.</p><div class="acciones-modal"><button class="btn secundario" type="button" data-cerrar-modal>Cerrar</button></div>';
      caja.querySelector("[data-cerrar-modal]").addEventListener("click", c.cerrarModal);
    }
  }

  const ESTADO_VINCULO = { pagado: ["Pagado", "activa"], con_abono: ["Con abono", "parcial"], pendiente: ["Pendiente", "inactiva"] };

  function alumnosFiltrados() {
    const texto = filtros.texto.trim().toLowerCase();
    return vinculos.alumnos.filter((a) =>
      (!texto || a.nombre.toLowerCase().includes(texto) || String(a.codigo).includes(texto))
      && (!filtros.clase || a.claseIds.includes(Number(filtros.clase)))
      && (!filtros.show || a.respuestaShow === "si"));
  }

  function pintarTraje(caja) {
    const { traje, clases: clasesTraje, show } = vinculos;
    const moneda = vinculos.moneda || ctx.moneda;
    caja.innerHTML = `
      <h3>👗 ${c.escapar(traje.nombre)} — ${c.dinero(traje.precioCentavos, moneda)}</h3>
      ${traje.activo ? "" : '<p class="mensaje-error">Este traje está desactivado: no se le pueden vincular alumnos nuevos.</p>'}
      <div class="grid-stats">
        <div class="stat-caja"><div class="stat-numero">${traje.vinculados}</div><div class="stat-etiqueta">Vinculados</div></div>
        <div class="stat-caja"><div class="stat-numero">${c.dinero(traje.cobradoCentavos, moneda)}</div><div class="stat-etiqueta">Cobrado</div></div>
        <div class="stat-caja"><div class="stat-numero">${c.dinero(traje.pendienteCentavos, moneda)}</div><div class="stat-etiqueta">Pendiente</div></div>
      </div>
      <div class="fila-formulario" style="margin-top:12px;">
        <div><label>Buscar</label><input type="text" id="inputBuscarVinculo" placeholder="Nombre o código" value="${c.escapar(filtros.texto)}" /></div>
        ${clasesTraje.length ? `<div><label>Clase</label><select id="selectFiltroClase"><option value="">Todas</option>${clasesTraje.map((x) => `<option value="${x.id}"${String(x.id) === filtros.clase ? " selected" : ""}>${c.escapar(x.nombre)}</option>`).join("")}</select></div>` : ""}
      </div>
      ${show ? `<label class="opcion-check"><input type="checkbox" id="checkFiltroShow"${filtros.show ? " checked" : ""} /> Solo los que respondieron Sí a ${c.escapar(show.nombre)}</label>` : ""}
      <div style="display:flex; gap:8px; margin:6px 0;">
        <button class="enlace-texto" type="button" id="btnMarcarVisibles">Marcar los que se ven</button>
        <button class="enlace-texto" type="button" id="btnDesmarcarVisibles">Desmarcar los que se ven</button>
      </div>
      <div id="avisoConAbonos"></div>
      <div class="lista-tarjetas" id="listaVinculos"></div>
      <p class="mensaje-error" id="mensajeErrorVinculos"></p>
      <p class="mensaje-exito" id="mensajeExitoVinculos"></p>
      <div class="acciones-modal">
        <button class="btn secundario" type="button" data-cerrar-modal>Cerrar</button>
        <button class="btn" type="button" id="btnGuardarVinculos">Guardar cambios</button>
      </div>
    `;
    caja.querySelector("[data-cerrar-modal]").addEventListener("click", () => { c.cerrarModal(); cargarCatalogo(); cargar(); });
    caja.querySelector("#inputBuscarVinculo").addEventListener("input", (e) => { filtros.texto = e.target.value; pintarListaVinculos(caja); });
    const selClase = caja.querySelector("#selectFiltroClase");
    if (selClase) selClase.addEventListener("change", (e) => { filtros.clase = e.target.value; pintarListaVinculos(caja); });
    const chkShow = caja.querySelector("#checkFiltroShow");
    if (chkShow) chkShow.addEventListener("change", (e) => { filtros.show = e.target.checked; pintarListaVinculos(caja); });
    caja.querySelector("#btnMarcarVisibles").addEventListener("click", () => { alumnosFiltrados().forEach((a) => marcados.add(a.alumnaId)); pintarListaVinculos(caja); });
    caja.querySelector("#btnDesmarcarVisibles").addEventListener("click", () => { alumnosFiltrados().forEach((a) => marcados.delete(a.alumnaId)); pintarListaVinculos(caja); });
    caja.querySelector("#btnGuardarVinculos").addEventListener("click", () => guardarVinculos(caja, []));
    pintarListaVinculos(caja);
    pintarConAbonos(caja);
  }

  function pintarListaVinculos(caja) {
    const moneda = vinculos.moneda || ctx.moneda;
    const lista = alumnosFiltrados();
    const cont = caja.querySelector("#listaVinculos");
    cont.innerHTML = lista.map((a) => {
      const marcado = marcados.has(a.alumnaId);
      const cambio = marcado !== a.vinculado ? (marcado ? " · <strong>se vinculará</strong>" : " · <strong>se desvinculará</strong>") : "";
      const estado = a.vinculado ? ESTADO_VINCULO[a.estado] : null;
      return `
        <label class="tarjeta-item opcion-check" style="margin:0;">
          <input type="checkbox" data-vinculo="${a.alumnaId}"${marcado ? " checked" : ""}${!a.vinculado && !vinculos.traje.activo ? " disabled" : ""} />
          <span class="info-principal">
            <span class="nombre-item">${c.escapar(a.nombre)} <span class="ayuda" style="margin:0;">#${a.codigo}${a.activo ? "" : " · inactivo"}</span>
              ${estado ? `<span class="etiqueta-estado ${estado[1]}">${estado[0]}</span>` : ""}</span>
            <span class="detalle-item">${a.vinculado ? `${c.dinero(a.montoCentavos, moneda)} · abonado ${c.dinero(a.abonadoCentavos, moneda)} · falta ${c.dinero(a.faltaCentavos, moneda)}` : "Sin vincular"}${cambio}</span>
          </span>
        </label>`;
    }).join("") || '<p class="lista-vacia">Ningún alumno coincide con el filtro.</p>';
    cont.querySelectorAll("[data-vinculo]").forEach((chk) => chk.addEventListener("change", () => {
      const id = Number(chk.dataset.vinculo);
      if (chk.checked) marcados.add(id); else marcados.delete(id);
      pintarListaVinculos(caja);
    }));
  }

  // Desvinculados con abonos: la academia decide uno por uno.
  function pintarConAbonos(caja) {
    const moneda = vinculos.moneda || ctx.moneda;
    const cont = caja.querySelector("#avisoConAbonos");
    if (!conAbonos.length) { cont.innerHTML = ""; return; }
    cont.innerHTML = `
      <div class="tarjeta-item aviso-fijado" style="display:block;">
        <div class="nombre-item">Estos alumnos ya abonaron a este traje, así que no se desvincularon:</div>
        ${conAbonos.map((a) => `
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px;">
            <span>${c.escapar(a.nombre)} — abonó ${c.dinero(a.abonadoCentavos, moneda)} de ${c.dinero(a.montoCentavos, moneda)}</span>
            <button class="btn secundario chico" type="button" data-mantener="${a.alumnaId}" style="width:auto;">Mantener vinculado</button>
            <button class="btn peligro chico" type="button" data-forzar="${a.alumnaId}" style="width:auto;">Desvincular de todos modos (el abono queda como saldo a favor)</button>
          </div>`).join("")}
      </div>
    `;
    cont.querySelectorAll("[data-mantener]").forEach((b) => b.addEventListener("click", () => {
      conAbonos = conAbonos.filter((a) => a.alumnaId !== Number(b.dataset.mantener));
      pintarConAbonos(caja);
    }));
    cont.querySelectorAll("[data-forzar]").forEach((b) => b.addEventListener("click", () => {
      const id = Number(b.dataset.forzar);
      conAbonos = conAbonos.filter((a) => a.alumnaId !== id);
      guardarVinculos(caja, [id]);
    }));
  }

  async function guardarVinculos(caja, forzar) {
    const vincular = vinculos.alumnos.filter((a) => !a.vinculado && marcados.has(a.alumnaId)).map((a) => a.alumnaId);
    const desvincular = vinculos.alumnos.filter((a) => a.vinculado && !marcados.has(a.alumnaId)).map((a) => a.alumnaId);
    caja.querySelector("#mensajeErrorVinculos").textContent = "";
    caja.querySelector("#mensajeExitoVinculos").textContent = "";
    if (!vincular.length && !desvincular.length && !forzar.length) { caja.querySelector("#mensajeErrorVinculos").textContent = "No hay cambios que guardar."; return; }
    try {
      const r = await llamar("academiaGuardarVinculosTraje", c.conResponsable({
        trajeId: vinculos.traje.id,
        vincular,
        desvincular: desvincular.filter((id) => !forzar.includes(id)),
        forzarDesvincular: forzar,
      }));
      if (!r.success) { caja.querySelector("#mensajeErrorVinculos").textContent = r.error || "No se pudo guardar."; return; }
      const pendientes = conAbonos.filter((a) => !r.conAbonos.some((x) => x.alumnaId === a.alumnaId));
      conAbonos = [...pendientes, ...r.conAbonos];
      await recargarTraje(caja, vinculos.traje.id);
      const partes = [];
      if (r.vinculados) partes.push(`${r.vinculados} ${r.vinculados === 1 ? "vinculado" : "vinculados"}`);
      if (r.desvinculados) partes.push(`${r.desvinculados} ${r.desvinculados === 1 ? "desvinculado" : "desvinculados"}`);
      if (partes.length) caja.querySelector("#mensajeExitoVinculos").textContent = `Listo: ${partes.join(", ")}.`;
    } catch (e) {
      caja.querySelector("#mensajeErrorVinculos").textContent = "No se pudo conectar. Inténtalo de nuevo.";
    }
  }

  return { html, iniciar, reiniciar, cambiarMoneda };
})();
