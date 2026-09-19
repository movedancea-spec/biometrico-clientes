# -*- coding: utf-8 -*-
"""
Aplica los fixes de textos "alumnos -> empleados" en academia.js y academia.html.
Uso: coloca este archivo dentro de ~/Documents/biometrico-clientes y corre:
    python3 aplicar_fixes.py
"""

EMOJI_FAMILIA = "\U0001F468\u200D\U0001F469\u200D\U0001F467\u200D\U0001F466"  # 👨‍👩‍👧‍👦

# --- academia.js ---
with open("academia.js", "r", encoding="utf-8") as f:
    js = f.read()

antes_1 = '''function pintarAlumnas(alumnas, cantidad, limite) {
  el("infoLimiteAlumnas").textContent = `${cantidad} / ${limite} alumnos`;
  el("ayudaCantidadAlumnas").textContent =
    cantidad >= limite
      ? `Llegaste al límite de tu plan (${limite}). Para agregar más, hay que ampliar el plan con el administrador del sistema.`
      : `Tienes ${cantidad} de ${limite} alumnos de tu plan actual.`;'''

despues_1 = '''function pintarAlumnas(alumnas, cantidad, limite) {
  const esEmpresa = sesion?.tipoCliente === "empresa";
  const etiqueta = esEmpresa ? "empleados" : "alumnos";
  el("infoLimiteAlumnas").textContent = `${cantidad} / ${limite} ${etiqueta}`;
  el("ayudaCantidadAlumnas").textContent =
    cantidad >= limite
      ? `Llegaste al límite de tu plan (${limite}). Para agregar más, hay que ampliar el plan con el administrador del sistema.`
      : `Tienes ${cantidad} de ${limite} ${etiqueta} de tu plan actual.`;'''

if antes_1 not in js:
    print("AVISO: no se encontró el bloque 1 (pintarAlumnas) — revisa manualmente.")
else:
    js = js.replace(antes_1, despues_1)
    print("OK: bloque 1 (contador de alumnos/empleados) aplicado.")

antes_2 = '          &nbsp;\u00b7&nbsp; ${a.clasesEsteMes} / ${a.clases_por_mes} clases este mes'
despues_2 = '          ${esEmpresa ? "" : `&nbsp;\u00b7&nbsp; ${a.clasesEsteMes} / ${a.clases_por_mes} clases este mes`}'

if antes_2 not in js:
    print("AVISO: no se encontró el bloque 2 (clases este mes) — revisa manualmente.")
else:
    js = js.replace(antes_2, despues_2)
    print("OK: bloque 2 (ocultar clases este mes para empresas) aplicado.")

antes_3 = '''  el("inputNuevaAlumnaNombre").placeholder = esEmpresa ? "Nombre del empleado" : "Nombre del alumno";
  el("btnCrearAlumna").textContent = esEmpresa ? "Agregar empleado" : "Agregar alumno";
}'''

despues_3 = '''  el("inputNuevaAlumnaNombre").placeholder = esEmpresa ? "Nombre del empleado" : "Nombre del alumno";
  el("btnCrearAlumna").textContent = esEmpresa ? "Agregar empleado" : "Agregar alumno";
  el("etiquetaPortalPapas").textContent = esEmpresa ? "" : "(para los papás)";
  el("etiquetaPortalTipo1").textContent = esEmpresa ? "Empleados" : "Alumnos";
  el("etiquetaPortalTipo2").textContent = esEmpresa ? "los empleados" : "los papás";
}'''

if antes_3 not in js:
    print("AVISO: no se encontró el bloque 3 (ajustarInterfazSegunTipo) — revisa manualmente.")
else:
    js = js.replace(antes_3, despues_3)
    print("OK: bloque 3 (etiquetas del portal) aplicado.")

with open("academia.js", "w", encoding="utf-8") as f:
    f.write(js)

# --- academia.html ---
with open("academia.html", "r", encoding="utf-8") as f:
    html = f.read()

antes_html = f'''    <h2>{EMOJI_FAMILIA} Portal de Alumnos (para los papás)</h2>
    <p class="ayuda" style="margin-bottom:12px;">Compárteles este enlace a los papás (por WhatsApp, por ejemplo) — ya abre directo en TU academia, sin que tengan que buscarla ni escribir su nombre. Ahí eligen a su hijo y ponen la contraseña. Cada alumno tiene su propia contraseña del portal (la generas desde "Editar" en su tarjeta, más abajo) — esa es la que le compartes a la familia.</p>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <a class="btn secundario chico" id="linkPortalAlumnos" href="portal.html" target="_blank" rel="noopener">Abrir el Portal de Alumnos →</a>
      <button class="btn secundario chico" id="btnCopiarLinkPortal" type="button">\U0001F4CB Copiar enlace para los papás</button>
    </div>'''

despues_html = f'''    <h2>{EMOJI_FAMILIA} Portal de Alumnos <span id="etiquetaPortalPapas">(para los papás)</span></h2>
    <p class="ayuda" style="margin-bottom:12px;" id="textoAyudaPortal">Compárteles este enlace a los papás (por WhatsApp, por ejemplo) — ya abre directo en TU academia, sin que tengan que buscarla ni escribir su nombre. Ahí eligen a su hijo y ponen la contraseña. Cada alumno tiene su propia contraseña del portal (la generas desde "Editar" en su tarjeta, más abajo) — esa es la que le compartes a la familia.</p>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <a class="btn secundario chico" id="linkPortalAlumnos" href="portal.html" target="_blank" rel="noopener">Abrir el Portal de <span id="etiquetaPortalTipo1">Alumnos</span> →</a>
      <button class="btn secundario chico" id="btnCopiarLinkPortal" type="button">\U0001F4CB Copiar enlace para <span id="etiquetaPortalTipo2">los papás</span></button>
    </div>'''

if antes_html not in html:
    print("AVISO: no se encontró el bloque HTML del portal — revisa manualmente.")
else:
    html = html.replace(antes_html, despues_html)
    print("OK: bloque HTML (portal de empleados) aplicado.")

with open("academia.html", "w", encoding="utf-8") as f:
    f.write(html)

print("\nListo. Revisa con: grep -n 'etiqueta\\|esEmpresa\\|empleados' academia.js academia.html")
