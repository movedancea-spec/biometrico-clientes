// ===============================================================
// Módulo pagos en el panel de la academia (Fase 4): configuración
// (modo manual con link fijo, o Paggo automático con la llave de la
// academia), instrucciones con la URL del webhook y la de redirección,
// bandeja de comprobantes y pagos por revisar, e historial. Lo arranca
// bio-modulos-panel.js; usa el, llamar y sesion de academia.js, y
// bioComun.
// ===============================================================
const modulosPagos = (() => {
  const c = bioComun;
  let config = null;     // respuesta de academiaConsultarConfigPagos
  let bandeja = null;    // respuesta de academiaBandejaPagos
  let moneda = { codigo: "GTQ", simbolo: "Q" };

  function html() {
    return `
      <div class="panel" id="panelPagos">
        <h2>💳 Pagos de las familias</h2>
        <p class="ayuda">Las familias pagan desde el Portal de Alumnos las mensualidades y los trajes que deben. Elige cómo:</p>
        <div id="contenidoConfigPagos"><p class="lista-vacia">Cargando...</p></div>
        <h3 style="margin:16px 0 6px;">📥 Bandeja por revisar</h3>
        <div id="contenidoBandejaPagos"><p class="lista-vacia">Cargando...</p></div>
        <h3 style="margin:16px 0 6px;">🧾 Historial</h3>
        <button class="btn secundario chico" type="button" id="btnVerHistorialPagos">Ver historial de pagos</button>
        <div id="contenidoHistorialPagos"></div>
      </div>
    `;
  }

  function iniciar() {
    el("btnVerHistorialPagos").addEventListener("click", cargarHistorial);
    cargarConfig();
    cargarBandeja();
  }

  function reiniciar() {
    config = null; bandeja = null;
  }

  function cambiarMoneda(nueva) {
    moneda = nueva;
    if (el("contenidoBandejaPagos") && bandeja) pintarBandeja();
  }

  // ---------------------------------------------------------------
  // Configuración
  // ---------------------------------------------------------------
  async function cargarConfig() {
    try {
      const r = await llamar("academiaConsultarConfigPagos", {});
      if (!r.success) { el("contenidoConfigPagos").innerHTML = `<p class="mensaje-error">${c.escapar(r.error || "No se pudo cargar.")}</p>`; return; }
      config = r;
      moneda = r.moneda || moneda;
      pintarConfig();
    } catch (e) {
      el("contenidoConfigPagos").innerHTML = '<p class="mensaje-error">No se pudo cargar. Revisa tu conexión.</p>';
    }
  }

  function urlRedireccion() {
    if (!sesion || !sesion.codigoPublico) return "";
    return new URL(`portal.html?a=${encodeURIComponent(sesion.codigoPublico)}&pago=volver`, location.href).href;
  }

  function avisosLlave() {
    if (!config.llaveConfigurada) return "";
    if (config.llaveEstado === "invalida" || config.llaveVencida) {
      return '<p class="mensaje-error">❌ Llave inválida o vencida: las familias no pueden pagar en línea. Crea una llave nueva en Paggo y guárdala aquí.</p>';
    }
    if (config.llaveVencePronto) {
      return `<p class="mensaje-error">⚠️ Tu llave de Paggo vence el ${c.escapar(c.fecha(config.llaveExpira))}. Crea una nueva en Paggo antes de esa fecha y guárdala aquí.</p>`;
    }
    return "";
  }

  function pintarConfig() {
    const modo = config.modo || "";
    const cont = el("contenidoConfigPagos");
    cont.innerHTML = `
      <div class="campo">
        <label>Modo de pago</label>
        <select id="selectModoPagos">
          <option value=""${modo === "" ? " selected" : ""}>Apagado (no se ofrece pagar en el portal)</option>
          <option value="manual"${modo === "manual" ? " selected" : ""}>Manual: un link de pago fijo + comprobante</option>
          <option value="paggo"${modo === "paggo" ? " selected" : ""}>Paggo automático (link por el monto exacto)</option>
        </select>
      </div>
      <div id="bloqueModoManual"${modo === "manual" ? "" : " hidden"}>
        <div class="campo">
          <label>Link de pago (cualquier proveedor)</label>
          <input type="url" id="inputLinkManual" maxlength="500" placeholder="https://..." value="${c.escapar(config.linkManual || "")}" />
          <p class="ayuda" style="margin:4px 0 0;">En el portal, junto a cada pago pendiente aparece "Pagar": abre este link y después la familia sube su comprobante. Tú lo apruebas aquí abajo, en la bandeja.</p>
        </div>
      </div>
      <button class="btn" type="button" id="btnGuardarModoPagos">Guardar</button>
      <p class="mensaje-error" id="mensajeErrorConfigPagos"></p>
      <p class="mensaje-exito" id="mensajeExitoConfigPagos"></p>
      <div id="bloqueModoPaggo"${modo === "paggo" ? "" : " hidden"}>${htmlPaggo()}</div>
    `;
    el("selectModoPagos").addEventListener("change", (e) => {
      el("bloqueModoManual").hidden = e.target.value !== "manual";
      el("bloqueModoPaggo").hidden = e.target.value !== "paggo";
    });
    el("btnGuardarModoPagos").addEventListener("click", guardarModo);
    enlazarPaggo();
  }

  function htmlPaggo() {
    const redireccion = urlRedireccion();
    return `
      <div class="campo" style="margin-top:12px;">
        <label>Llave de Paggo (API key)</label>
        <p style="margin:2px 0 6px;">${config.llaveConfigurada ? `✅ Configurada${config.llaveExpira ? ` · vence el ${c.escapar(c.fecha(config.llaveExpira))}` : ""}` : "⚪ No configurada"}</p>
        ${avisosLlave()}
        <div class="fila-formulario">
          <div><label>Llave nueva</label><input type="password" id="inputLlavePaggo" autocomplete="off" placeholder="Pega aquí la API key" /></div>
          <div><label>Vence el (opcional)</label><input type="date" id="inputLlaveExpira" /></div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
          <button class="btn secundario chico" type="button" id="btnGuardarLlave" style="width:auto;">Guardar llave</button>
          ${config.llaveConfigurada ? '<button class="btn secundario chico" type="button" id="btnProbarLlave" style="width:auto;">Probar llave</button><button class="btn peligro chico" type="button" id="btnBorrarLlave" style="width:auto;">Borrar llave</button>' : ""}
        </div>
        <p class="ayuda" style="margin:4px 0 0;">Por seguridad, la llave nunca se vuelve a mostrar: se guarda cifrada.</p>
      </div>
      <div class="campo">
        <label>URL del webhook</label>
        ${config.webhookUrl ? `
          <input type="text" id="inputWebhookUrl" readonly value="${c.escapar(config.webhookUrl)}" />
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn secundario chico" type="button" data-copiar="inputWebhookUrl" style="width:auto;">📋 Copiar</button>
            <button class="btn secundario chico" type="button" id="btnRegenerarWebhook" style="width:auto;">Regenerar URL</button>
          </div>` : '<p class="mensaje-error">Falta configurar el sistema (secret PAGOS_LLAVE_MAESTRA). Avísale al administrador.</p>'}
      </div>
      <div class="campo">
        <label>URL de redirección</label>
        <input type="text" id="inputRedireccionUrl" readonly value="${c.escapar(redireccion)}" />
        <button class="btn secundario chico" type="button" data-copiar="inputRedireccionUrl" style="width:auto;">📋 Copiar</button>
      </div>
      <details open style="margin-top:8px;"><summary><strong>Instrucciones para conectar Paggo</strong></summary>
        <ol style="padding-left:20px; font-size:14px; line-height:1.5;">
          <li>En tu panel de Paggo, crea una <strong>API key exclusiva para este sistema</strong>, con un nombre claro (por ejemplo "Biométrico – mensualidades y trajes"). Si le pones fecha de expiración, escríbela aquí arriba al guardarla: te avisaremos 30 días antes.</li>
          <li>Pega la llave arriba y toca <strong>Guardar llave</strong> (se valida con Paggo en ese momento).</li>
          <li>En esa misma API key, configura el <strong>webhook</strong> con la URL del webhook de arriba. Suscribe <strong>al menos el evento de link pagado</strong> y, si aparecen, el de <strong>reverso</strong> y el de <strong>pago incorrecto</strong>.</li>
          <li>En la pestaña <strong>Redirección</strong> de Paggo, pega la URL de redirección. Así, al terminar de pagar, la familia vuelve al portal y el pago se verifica solo. Ojo: Paggo tiene <strong>una sola URL de redirección por cuenta</strong>; si ya la usas para otra cosa, igual funciona con el webhook y con el botón "Ya pagué" del portal.</li>
          <li>Elige "Paggo automático" en el modo de pago y toca <strong>Guardar</strong>. Después toca <strong>Probar llave</strong>.</li>
          <li>Cada pago se confirma consultando a Paggo, nunca solo con el aviso. Los que no cuadren (monto distinto, ya pagado, sin referencia o posible reverso) aparecen en la bandeja por revisar.</li>
          <li>Si crees que la URL del webhook se filtró, toca <strong>Regenerar URL</strong> y vuelve a pegarla en Paggo.</li>
        </ol>
      </details>
    `;
  }

  function enlazarPaggo() {
    const guardar = el("btnGuardarLlave");
    if (guardar) guardar.addEventListener("click", guardarLlave);
    const probar = el("btnProbarLlave");
    if (probar) probar.addEventListener("click", () => accionConfig("academiaProbarLlavePaggo", {}, (r) => r.llaveValida ? "✅ La llave funciona." : "❌ Paggo no aceptó la llave: inválida o vencida."));
    const borrar = el("btnBorrarLlave");
    if (borrar) borrar.addEventListener("click", () => {
      if (!window.confirm("¿Borrar la llave de Paggo? Las familias ya no podrán pagar en línea hasta que guardes otra.")) return;
      accionConfig("academiaBorrarLlavePaggo", {}, () => "Llave borrada.");
    });
    const regenerar = el("btnRegenerarWebhook");
    if (regenerar) regenerar.addEventListener("click", () => {
      if (!window.confirm("¿Regenerar la URL del webhook? La anterior deja de funcionar y tendrás que pegar la nueva en Paggo.")) return;
      accionConfig("academiaRegenerarWebhook", {}, () => "URL nueva lista: pégala en Paggo.");
    });
    el("contenidoConfigPagos").querySelectorAll("[data-copiar]").forEach((b) => b.addEventListener("click", async () => {
      const input = el(b.dataset.copiar);
      try { await navigator.clipboard.writeText(input.value); b.textContent = "✅ Copiada"; }
      catch (e) { input.select(); b.textContent = "Cópiala a mano"; }
      setTimeout(() => { b.textContent = "📋 Copiar"; }, 3000);
    }));
  }

  async function accionConfig(accion, datos, textoExito) {
    el("mensajeErrorConfigPagos").textContent = "";
    el("mensajeExitoConfigPagos").textContent = "";
    try {
      const r = await llamar(accion, c.conResponsable(datos));
      if (!r.success) { el("mensajeErrorConfigPagos").textContent = r.error || "No se pudo guardar."; return; }
      config = { ...config, ...r };
      pintarConfig();
      el("mensajeExitoConfigPagos").textContent = textoExito(r);
    } catch (e) {
      el("mensajeErrorConfigPagos").textContent = "No se pudo conectar. Inténtalo de nuevo.";
    }
  }

  function guardarModo() {
    const modo = el("selectModoPagos").value || null;
    const datos = { modo };
    if (modo === "manual") {
      datos.linkManual = el("inputLinkManual").value.trim();
      if (!datos.linkManual) { el("mensajeErrorConfigPagos").textContent = "Pega el link de pago."; return; }
    }
    accionConfig("academiaGuardarConfigPagos", datos, () => "Guardado.");
  }

  function guardarLlave() {
    const llave = el("inputLlavePaggo").value.trim();
    if (!llave) { el("mensajeErrorConfigPagos").textContent = "Pega la llave de Paggo."; return; }
    accionConfig("academiaGuardarLlavePaggo", { llave, expira: el("inputLlaveExpira").value || null }, () => "✅ Llave guardada y validada con Paggo.");
  }

  // ---------------------------------------------------------------
  // Bandeja
  // ---------------------------------------------------------------
  async function cargarBandeja() {
    try {
      const r = await llamar("academiaBandejaPagos", {});
      if (!r.success) { el("contenidoBandejaPagos").innerHTML = `<p class="mensaje-error">${c.escapar(r.error || "No se pudo cargar.")}</p>`; return; }
      bandeja = r;
      moneda = r.moneda || moneda;
      pintarBandeja();
    } catch (e) {
      el("contenidoBandejaPagos").innerHTML = '<p class="mensaje-error">No se pudo cargar la bandeja. Revisa tu conexión.</p>';
    }
  }

  function pintarBandeja() {
    const cont = el("contenidoBandejaPagos");
    const { comprobantes, pagosPorRevisar } = bandeja;
    if (!comprobantes.length && !pagosPorRevisar.length) {
      cont.innerHTML = '<p class="lista-vacia">No hay nada por revisar. 🎉</p><p class="mensaje-exito" id="mensajeExitoBandeja"></p>';
      return;
    }
    cont.innerHTML = `
      ${comprobantes.map((x) => {
        const sugerido = x.montoReportadoCentavos || x.faltaCentavos || 0;
        return `
          <div class="tarjeta-item" style="display:block;">
            <div class="nombre-item">🧾 ${c.escapar(x.alumnaNombre || "")} — ${c.escapar(x.descripcion || x.referencia)}</div>
            <div class="detalle-item">Subido el ${c.escapar(c.fechaHora(x.creadoEn))}${x.montoReportadoCentavos ? ` · dice que pagó ${c.dinero(x.montoReportadoCentavos, moneda)}` : ""}${x.faltaCentavos !== null ? ` · falta ${c.dinero(x.faltaCentavos, moneda)}` : " · la referencia ya no existe"}
              · <a href="${c.escapar(x.archivoUrl || "#")}" target="_blank" rel="noopener">Ver ${x.tipoArchivo === "application/pdf" ? "PDF" : "foto"} →</a></div>
            <div class="fila-formulario" style="margin-top:8px;">
              <div><label>Monto que confirmas</label><input type="text" inputmode="decimal" data-monto-comp="${x.id}" value="${sugerido ? c.montoParaInput(sugerido) : ""}" /></div>
              <div><label>Forma de pago</label><select data-forma-comp="${x.id}">${c.opcionesFormaPago("transferencia")}</select></div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
              <button class="btn chico" type="button" data-aprobar="${x.id}" style="width:auto;">✅ Aprobar y registrar el pago</button>
              <input type="text" data-motivo-comp="${x.id}" maxlength="300" placeholder="Motivo del rechazo (lo verá la familia)" style="margin:0; max-width:320px;" />
              <button class="btn peligro chico" type="button" data-rechazar="${x.id}" style="width:auto;">Rechazar</button>
            </div>
          </div>`;
      }).join("")}
      ${pagosPorRevisar.map((p) => `
        <div class="tarjeta-item aviso-fijado" style="display:block;">
          <div class="nombre-item">⚠️ Pago en línea${p.alumnaNombre ? ` de ${c.escapar(p.alumnaNombre)}` : ""}${p.referencia ? ` — ${c.escapar(p.referencia)}` : ""} · ${c.dinero(p.montoPagadoCentavos ?? p.montoCentavos, moneda)}</div>
          <div class="detalle-item">${c.escapar(p.motivoRevision || "")}</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
            <input type="text" data-nota-pago="${p.id}" maxlength="300" placeholder="Nota (opcional)" style="margin:0; max-width:320px;" />
            <button class="btn secundario chico" type="button" data-revisado="${p.id}" style="width:auto;">Marcar revisado</button>
          </div>
        </div>`).join("")}
      <p class="mensaje-error" id="mensajeErrorBandeja"></p>
      <p class="mensaje-exito" id="mensajeExitoBandeja"></p>
    `;
    cont.querySelectorAll("[data-aprobar]").forEach((b) => b.addEventListener("click", () => {
      const id = Number(b.dataset.aprobar);
      const monto = c.leerMonto(cont.querySelector(`[data-monto-comp="${id}"]`).value);
      if (!monto) { el("mensajeErrorBandeja").textContent = "Escribe el monto que confirmas."; return; }
      accionBandeja("academiaAprobarComprobante", { comprobanteId: id, montoCentavos: monto, formaPago: cont.querySelector(`[data-forma-comp="${id}"]`).value }, `Pago de ${c.dinero(monto, moneda)} registrado.`);
    }));
    cont.querySelectorAll("[data-rechazar]").forEach((b) => b.addEventListener("click", () => {
      const id = Number(b.dataset.rechazar);
      const motivo = cont.querySelector(`[data-motivo-comp="${id}"]`).value.trim();
      if (!motivo) { el("mensajeErrorBandeja").textContent = "Escribe el motivo del rechazo."; return; }
      accionBandeja("academiaRechazarComprobante", { comprobanteId: id, motivo }, "Comprobante rechazado.");
    }));
    cont.querySelectorAll("[data-revisado]").forEach((b) => b.addEventListener("click", () => {
      const id = Number(b.dataset.revisado);
      accionBandeja("academiaMarcarPagoRevisado", { pagoId: id, nota: cont.querySelector(`[data-nota-pago="${id}"]`).value }, "Marcado como revisado.");
    }));
  }

  async function accionBandeja(accion, datos, textoExito) {
    el("mensajeErrorBandeja").textContent = "";
    try {
      const r = await llamar(accion, c.conResponsable(datos));
      if (!r.success) { el("mensajeErrorBandeja").textContent = r.error || "No se pudo guardar."; return; }
      await cargarBandeja();
      el("mensajeExitoBandeja").textContent = textoExito;
    } catch (e) {
      el("mensajeErrorBandeja").textContent = "No se pudo conectar. Inténtalo de nuevo.";
    }
  }

  // ---------------------------------------------------------------
  // Historial
  // ---------------------------------------------------------------
  const ESTADO_PAGO = { pendiente: ["Pendiente", "parcial"], pagado: ["Pagado", "activa"], vencido: ["Vencido", "exento"], cancelado: ["Cancelado", "exento"] };

  async function cargarHistorial() {
    const cont = el("contenidoHistorialPagos");
    cont.innerHTML = '<p class="lista-vacia">Cargando...</p>';
    try {
      if (config && config.modo === "paggo") await llamar("academiaVerificarPagosPendientes", {});
      const r = await llamar("academiaHistorialPagosEnLinea", {});
      if (!r.success) { cont.innerHTML = `<p class="mensaje-error">${c.escapar(r.error || "No se pudo cargar.")}</p>`; return; }
      const m = r.moneda || moneda;
      cont.innerHTML = `
        ${r.pagos.length ? '<p class="ayuda" style="margin:8px 0 4px;">Pagos en línea (Paggo)</p>' : ""}
        ${r.pagos.map((p) => {
          const e = ESTADO_PAGO[p.estado] || [p.estado, ""];
          return `
            <div class="tarjeta-item"><div class="info-principal">
              <div class="nombre-item">${c.escapar(p.alumnaNombre || "Sin alumno")} — ${c.escapar(p.referencia || "pago sin referencia")} <span class="etiqueta-estado ${e[1]}">${e[0]}</span>${p.revision === "por_revisar" ? ' <span class="etiqueta-estado inactiva">Por revisar</span>' : ""}</div>
              <div class="detalle-item">${p.montoCentavos ? c.dinero(p.montoCentavos, m) : ""}${p.montoPagadoCentavos !== null && p.montoPagadoCentavos !== undefined ? ` · pagado ${c.dinero(p.montoPagadoCentavos, m)}` : ""} · creado ${c.escapar(c.fechaHora(p.creadoEn))}${p.pagadoEn ? ` · pagado ${c.escapar(c.fechaHora(p.pagadoEn))}` : ""}</div>
            </div></div>`;
        }).join("")}
        ${r.comprobantesRevisados.length ? '<p class="ayuda" style="margin:8px 0 4px;">Comprobantes revisados</p>' : ""}
        ${r.comprobantesRevisados.map((x) => `
          <div class="tarjeta-item"><div class="info-principal">
            <div class="nombre-item">${c.escapar(x.alumnaNombre || "")} — ${c.escapar(x.referencia)} <span class="etiqueta-estado ${x.estado === "aprobado" ? "activa" : "inactiva"}">${x.estado === "aprobado" ? "Aprobado" : "Rechazado"}</span></div>
            <div class="detalle-item">${x.estado === "aprobado" ? `Registrado ${c.dinero(x.montoAprobadoCentavos, m)}` : `Motivo: ${c.escapar(x.motivoRechazo || "")}`} · <a href="${c.escapar(x.archivoUrl || "#")}" target="_blank" rel="noopener">Ver archivo →</a></div>
          </div></div>`).join("")}
        ${!r.pagos.length && !r.comprobantesRevisados.length ? '<p class="lista-vacia">Todavía no hay pagos.</p>' : ""}
      `;
    } catch (e) {
      cont.innerHTML = '<p class="mensaje-error">No se pudo cargar. Revisa tu conexión.</p>';
    }
  }

  return { html, iniciar, reiniciar, cambiarMoneda };
})();
