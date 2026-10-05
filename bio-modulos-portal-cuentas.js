// ===============================================================
// Módulos de academia (Fase 3) en el Portal de Alumnos: show (Sí / No
// hasta la fecha límite), saldo de trajes con su detalle, y
// mensualidades mes por mes con el total pendiente. Lo llama
// bio-modulos-portal.js (limpiar / pintar); usa el, llamar y
// alumnaActivaId de portal.js, y bioComun.
// ===============================================================
const modulosPortalCuentas = (() => {
  const c = bioComun;

  function limpiar() {
    ["panelShowPortal", "panelTrajesPortal", "panelMensualidadesPortal"].forEach((id) => { el(id).hidden = true; });
  }

  function pintar(modulos, entrada) {
    limpiar();
    if (modulos.includes("show")) cargarShow(entrada);
    if (modulos.includes("trajes")) cargarTrajes(entrada);
    if (modulos.includes("mensualidades")) cargarMensualidades(entrada);
  }

  const sigueEnPantalla = (entrada) => alumnaActivaId === entrada.alumnaId;

  // ---- show ----
  async function cargarShow(entrada) {
    try {
      const r = await llamar("portalShow", {}, entrada);
      if (!r.success || !sigueEnPantalla(entrada) || !r.show) return;
      pintarShow(entrada, r);
    } catch (e) { /* sin conexión: se queda escondido */ }
  }

  function pintarShow(entrada, r) {
    const { show, respuesta, puedeResponder } = r;
    const texto = { si: "✅ Sí participa", no: "❌ No participa" };
    el("contenidoShowPortal").innerHTML = `
      <p style="margin:0 0 6px;"><strong>${c.escapar(show.nombre)} (${show.anio})</strong></p>
      <p class="ayuda" style="margin:0 0 10px;">${puedeResponder
        ? `¿Participa en el show? Puedes cambiar tu respuesta hasta el ${c.escapar(c.fecha(show.fechaLimite))}.`
        : `La fecha para responder fue el ${c.escapar(c.fecha(show.fechaLimite))}. Si necesitas cambiar tu respuesta, comunícate con la academia.`}</p>
      <p style="margin:0 0 10px;">Tu respuesta: <strong>${respuesta ? texto[respuesta] : "todavía no has respondido"}</strong></p>
      ${puedeResponder ? `
        <div style="display:flex; gap:8px;">
          <button class="btn${respuesta === "si" ? "" : " secundario"}" type="button" data-responder-show="si">Sí</button>
          <button class="btn${respuesta === "no" ? "" : " secundario"}" type="button" data-responder-show="no">No</button>
        </div>` : ""}
      <p class="mensaje-error" id="mensajeErrorShowPortal"></p>
    `;
    el("panelShowPortal").hidden = false;
    el("contenidoShowPortal").querySelectorAll("[data-responder-show]").forEach((b) => b.addEventListener("click", async () => {
      try {
        const rr = await llamar("portalResponderShow", { showId: show.id, respuesta: b.dataset.responderShow }, entrada);
        if (!rr.success) { el("mensajeErrorShowPortal").textContent = rr.error || "No se pudo guardar tu respuesta."; if (rr.error) cargarShow(entrada); return; }
        cargarShow(entrada);
      } catch (e) {
        el("mensajeErrorShowPortal").textContent = "No se pudo conectar. Inténtalo de nuevo.";
      }
    }));
  }

  // ---- trajes ----
  async function cargarTrajes(entrada) {
    try {
      const r = await llamar("portalTrajes", {}, entrada);
      if (!r.success || !sigueEnPantalla(entrada)) return;
      const moneda = r.moneda;
      el("contenidoTrajesPortal").innerHTML = `
        <div class="grid-stats"><div class="stat-caja"><div class="stat-numero">${c.dinero(r.saldoCentavos, moneda)}</div><div class="stat-etiqueta">Saldo de trajes</div></div></div>
        <div class="lista-tarjetas" style="margin-top:12px;">
          ${r.movimientos.map((m) => `
            <div class="tarjeta-item">
              <div class="info-principal">
                <div class="nombre-item">${m.tipo === "cargo" ? `➕ ${c.escapar(m.concepto)}` : `➖ Abono (${c.escapar(c.FORMAS_PAGO[m.formaPago] || m.formaPago || "")})`} — ${c.dinero(m.montoCentavos, moneda)}</div>
                <div class="detalle-item">${c.escapar(c.fecha(m.fecha))}${m.nota ? ` · ${c.escapar(m.nota)}` : ""}</div>
              </div>
            </div>`).join("") || '<p class="lista-vacia">Sin movimientos.</p>'}
        </div>
      `;
      el("panelTrajesPortal").hidden = false;
    } catch (e) { /* sin conexión: se queda escondido */ }
  }

  // ---- mensualidades ----
  async function cargarMensualidades(entrada) {
    try {
      const r = await llamar("portalMensualidades", {}, entrada);
      if (!r.success || !sigueEnPantalla(entrada)) return;
      const moneda = r.moneda;
      const detalleMes = (m) => {
        if (m.estado === "parcial") return `Pagado ${c.dinero(m.pagadoCentavos, moneda)} de ${c.dinero(m.montoCentavos, moneda)} · <strong>faltan ${c.dinero(m.faltaCentavos, moneda)}</strong>`;
        if (m.estado === "pendiente") return `<strong>Falta ${c.dinero(m.faltaCentavos, moneda)}</strong>`;
        if (m.estado === "pagado") return `Pagado ${c.dinero(m.pagadoCentavos, moneda)}`;
        if (m.estado === "exento") return `Exento${m.motivoExento ? `: ${c.escapar(m.motivoExento)}` : ""}`;
        if (m.estado === "inactivo") return "Inactivo";
        return "Sin cobro";
      };
      el("contenidoMensualidadesPortal").innerHTML = `
        <div class="grid-stats"><div class="stat-caja"><div class="stat-numero">${c.dinero(r.totalPendienteCentavos, moneda)}</div><div class="stat-etiqueta">Total pendiente</div></div></div>
        <div class="lista-tarjetas" style="margin-top:12px;">
          ${r.meses.slice().reverse().map((m) => `
            <div class="tarjeta-item${m.mes === c.mesActual() ? " tarjeta-mes-actual" : ""}">
              <div class="info-principal">
                <div class="nombre-item">${c.escapar(c.nombreMes(m.mes))} ${c.etiquetaEstadoMes(m.estado)}</div>
                <div class="detalle-item">${detalleMes(m)}</div>
                ${m.pagos.length ? `<div class="detalle-item">${m.pagos.map((p) => `${c.dinero(p.montoCentavos, moneda)} el ${c.escapar(c.fecha(p.fecha))}`).join(" · ")}</div>` : ""}
              </div>
            </div>`).join("") || '<p class="lista-vacia">Sin meses.</p>'}
        </div>
      `;
      el("panelMensualidadesPortal").hidden = false;
    } catch (e) { /* sin conexión: se queda escondido */ }
  }

  return { limpiar, pintar };
})();
