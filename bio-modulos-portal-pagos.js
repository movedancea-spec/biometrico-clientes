// ===============================================================
// Módulo pagos en el Portal de Alumnos (Fase 4): botón "Pagar" junto a
// cada mensualidad pendiente o parcial y cada cargo de traje con saldo.
//   - manual: abre el link de la academia y permite subir el comprobante.
//   - paggo: genera el link por el monto exacto y luego "Ya pagué,
//     verificar". Al volver de Paggo (?pago=volver) verifica solo.
// También muestra "Mis pagos" (comprobantes y pagos en línea). Lo usa
// bio-modulos-portal-cuentas.js; usa el, llamar y alumnaActivaId de
// portal.js, y bioComun.
// ===============================================================
const modulosPortalPagos = (() => {
  const c = bioComun;
  const MAX_BYTES = 5 * 1024 * 1024;
  let config = null;        // respuesta de portalConfigPagos (del alumno activo)
  let alumnaConfig = null;
  let verificadoAlVolver = false;

  function limpiar() {
    config = null; alumnaConfig = null;
    el("panelPagosPortal").hidden = true;
  }

  async function cargarConfig(entrada) {
    try {
      const r = await llamar("portalConfigPagos", {}, entrada);
      config = r.success ? r : null;
      alumnaConfig = entrada.alumnaId;
    } catch (e) {
      config = null;
    }
    return config;
  }

  const disponible = () => !!config && ((config.modo === "manual" && config.linkManual) || (config.modo === "paggo" && config.pagoEnLineaDisponible));

  // HTML del botón "Pagar" (vacío si no aplica).
  function boton(referencia, faltaCentavos, moneda) {
    if (!disponible() || !referencia || !(faltaCentavos > 0)) return "";
    return `
      <div style="margin-top:8px;">
        <button class="btn chico" type="button" data-pagar-ref="${c.escapar(referencia)}" data-falta="${faltaCentavos}" style="width:auto;">💳 Pagar ${c.dinero(faltaCentavos, moneda)}</button>
        <div data-zona-pago="${c.escapar(referencia)}"></div>
      </div>`;
  }

  // Engancha los botones de un contenedor. recargar() vuelve a pintar las
  // cuentas (después de un pago verificado).
  function enlazar(contenedor, entrada, moneda, recargar) {
    contenedor.querySelectorAll("[data-pagar-ref]").forEach((b) => b.addEventListener("click", () => {
      const referencia = b.dataset.pagarRef;
      const zona = contenedor.querySelector(`[data-zona-pago="${CSS.escape(referencia)}"]`);
      if (config.modo === "manual") pagarManual(zona, entrada, referencia, Number(b.dataset.falta), moneda, recargar);
      else pagarEnLinea(zona, entrada, referencia, recargar);
    }));
  }

  // ---- manual ----
  function pagarManual(zona, entrada, referencia, falta, moneda, recargar) {
    window.open(config.linkManual, "_blank", "noopener");
    zona.innerHTML = `
      <div class="tarjeta-item" style="display:block; margin-top:8px;">
        <p class="ayuda" style="margin:0 0 8px;">Se abrió el link de pago de la academia. Cuando termines, sube aquí tu comprobante (foto o PDF, máximo 5 MB).</p>
        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" data-archivo />
        <input type="text" inputmode="decimal" data-monto placeholder="¿Cuánto pagaste? (opcional)" value="${c.montoParaInput(falta)}" />
        <button class="btn chico" type="button" data-subir style="width:auto;">Subir comprobante</button>
        <p class="mensaje-error" data-error></p>
        <p class="mensaje-exito" data-exito></p>
      </div>`;
    zona.querySelector("[data-subir]").addEventListener("click", async () => {
      const error = zona.querySelector("[data-error]");
      const exito = zona.querySelector("[data-exito]");
      error.textContent = ""; exito.textContent = "";
      const archivo = zona.querySelector("[data-archivo]").files[0];
      if (!archivo) { error.textContent = "Elige la foto o el PDF del comprobante."; return; }
      if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(archivo.type)) { error.textContent = "Solo fotos JPG, PNG o WEBP, o PDF."; return; }
      if (archivo.size > MAX_BYTES) { error.textContent = "El archivo pesa más de 5 MB."; return; }
      const textoMonto = zona.querySelector("[data-monto]").value.trim();
      const monto = textoMonto ? c.leerMonto(textoMonto) : null;
      if (textoMonto && !monto) { error.textContent = "Escribe un monto válido."; return; }
      const boton = zona.querySelector("[data-subir]");
      boton.disabled = true;
      try {
        const archivoBase64 = await new Promise((ok, mal) => {
          const lector = new FileReader();
          lector.onload = () => ok(lector.result);
          lector.onerror = () => mal(new Error("No se pudo leer el archivo."));
          lector.readAsDataURL(archivo);
        });
        const r = await llamar("portalSubirComprobante", { referencia, montoReportadoCentavos: monto, archivoBase64 }, entrada);
        if (!r.success) { error.textContent = r.error || "No se pudo subir."; return; }
        exito.textContent = "¡Listo! La academia va a revisar tu comprobante.";
        zona.querySelector("[data-archivo]").value = "";
        cargarMisPagos(entrada, moneda);
      } catch (e) {
        error.textContent = "No se pudo subir. Revisa tu conexión.";
      } finally {
        boton.disabled = false;
      }
    });
  }

  // ---- Paggo ----
  async function pagarEnLinea(zona, entrada, referencia, recargar) {
    // La ventana se abre antes de esperar al servidor para que el
    // navegador no la bloquee.
    const ventana = window.open("", "_blank");
    if (ventana) ventana.opener = null;
    zona.innerHTML = '<p class="ayuda" style="margin:8px 0 0;">Preparando el pago...</p>';
    try {
      const r = await llamar("portalLinkPago", { referencia }, entrada);
      if (!r.success) {
        if (ventana) ventana.close();
        zona.innerHTML = `<p class="mensaje-error">${c.escapar(r.error || "No se pudo preparar el pago.")}</p>`;
        return;
      }
      if (ventana) ventana.location.href = r.link; else location.href = r.link;
      zona.innerHTML = `
        <p class="ayuda" style="margin:8px 0 6px;">Se abrió la página de pago. Cuando termines, toca:</p>
        <button class="btn secundario chico" type="button" data-verificar style="width:auto;">Ya pagué, verificar</button>
        <p class="mensaje-error" data-error></p>`;
      zona.querySelector("[data-verificar]").addEventListener("click", () => verificar(zona, entrada, referencia, recargar));
    } catch (e) {
      if (ventana) ventana.close();
      zona.innerHTML = '<p class="mensaje-error">No se pudo conectar. Inténtalo de nuevo.</p>';
    }
  }

  async function verificar(zona, entrada, referencia, recargar) {
    const error = zona.querySelector("[data-error]");
    error.textContent = "";
    try {
      const r = await llamar("portalVerificarPagosPendientes", { referencia }, entrada);
      if (!r.success) { error.textContent = r.error || "No se pudo verificar."; return; }
      const pagado = r.pagos.some((p) => p.referencia === referencia && p.estado === "pagado");
      if (pagado) recargar();
      else error.textContent = "Todavía no vemos el pago. Si ya pagaste, espera un momento y vuelve a intentar.";
    } catch (e) {
      error.textContent = "No se pudo conectar. Inténtalo de nuevo.";
    }
  }

  // Al volver de Paggo (?pago=volver): verifica una vez los pendientes del
  // alumno y quita el parámetro para que un refresh no lo repita.
  async function verificarAlVolver(entrada, recargar) {
    const params = new URLSearchParams(location.search);
    if (verificadoAlVolver || params.get("pago") !== "volver" || !config || config.modo !== "paggo") return;
    verificadoAlVolver = true;
    params.delete("pago");
    history.replaceState(null, "", `${location.pathname}${params.toString() ? `?${params}` : ""}${location.hash}`);
    try {
      const r = await llamar("portalVerificarPagosPendientes", {}, entrada);
      if (r.success && r.pagos.some((p) => p.estado === "pagado")) recargar();
    } catch (e) { /* se puede verificar después con "Ya pagué" */ }
  }

  // ---- Mis pagos ----
  async function cargarMisPagos(entrada, moneda) {
    if (!config || !config.modo) { el("panelPagosPortal").hidden = true; return; }
    try {
      const r = config.modo === "manual"
        ? await llamar("portalMisComprobantes", {}, entrada)
        : null;
      if (alumnaActivaId !== entrada.alumnaId) return;
      if (config.modo === "manual") {
        if (!r || !r.success) return;
        const textoEstado = { por_revisar: ["Por revisar", "parcial"], aprobado: ["Aprobado", "activa"], rechazado: ["Rechazado", "inactiva"] };
        el("contenidoPagosPortal").innerHTML = r.comprobantes.length
          ? r.comprobantes.map((x) => {
              const e = textoEstado[x.estado] || [x.estado, ""];
              return `
                <div class="tarjeta-item"><div class="info-principal">
                  <div class="nombre-item">${c.escapar(x.descripcion || x.referencia)} <span class="etiqueta-estado ${e[1]}">${e[0]}</span></div>
                  <div class="detalle-item">Subido el ${c.escapar(c.fechaHora(x.creadoEn))}${x.estado === "aprobado" ? ` · registrado ${c.dinero(x.montoAprobadoCentavos, r.moneda || moneda)}` : ""}${x.estado === "rechazado" ? ` · motivo: ${c.escapar(x.motivoRechazo || "")}` : ""}
                    · <a href="${c.escapar(x.archivoUrl || "#")}" target="_blank" rel="noopener">Ver archivo</a></div>
                </div></div>`;
            }).join("")
          : '<p class="lista-vacia">Todavía no has subido comprobantes.</p>';
        el("panelPagosPortal").hidden = false;
      } else {
        el("panelPagosPortal").hidden = true;
      }
    } catch (e) { /* sin conexión: se queda como estaba */ }
  }

  return { limpiar, cargarConfig, boton, enlazar, verificarAlVolver, cargarMisPagos, disponible };
})();
