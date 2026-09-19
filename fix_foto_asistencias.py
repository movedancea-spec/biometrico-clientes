# -*- coding: utf-8 -*-
"""
Agrega la miniatura de la foto de verificación (fotoVerificacionKey) en cada
tarjeta del historial de asistencias, en academia.js.

Uso: colócalo en ~/Documents/biometrico-clientes y corre:
    python3 fix_foto_asistencias.py
"""
import re

EMOJI_MANO = "\U0001F446"       # 👆
EMOJI_TECLADO = "\U0001F522"    # 🔢
EMOJI_BASURA = "\U0001F5D1\uFE0F"  # 🗑️

with open("academia.js", "r", encoding="utf-8") as f:
    contenido = f.read()

patron = re.compile(
    r'cont\.innerHTML = r\.asistencias\.map\(\(a\) => `\s*'
    r'<div class="tarjeta-item">\s*'
    r'<div class="info-principal">\s*'
    r'<div class="nombre-item">\$\{escaparHtml\(formatearFechaHora\(a\.fecha\)\)\}</div>\s*'
    r'<div class="detalle-item">\$\{a\.metodo === "Huella" \? "[^"]*" : "[^"]*"\}</div>\s*'
    r'</div>\s*'
    r'<div class="acciones-item">\s*'
    r'<button class="btn peligro chico" data-id="\$\{a\.id\}">[^<]*Borrar</button>\s*'
    r'</div>\s*'
    r'</div>\s*'
    r'`\)\.join\("\"\);\s*'
    r'cont\.querySelectorAll\("\[data-id\]"\)\.forEach\(\(btn\) => \{\s*'
    r'btn\.addEventListener\("click", \(\) => borrarAsistencia\(Number\(btn\.dataset\.id\)\)\);\s*'
    r'\}\);',
    re.MULTILINE,
)

nuevo_bloque = f'''cont.innerHTML = r.asistencias.map((a) => {{
      const foto = a.fotoVerificacionKey
        ? `<img class="foto-miniatura" src="${{urlFoto(a.fotoVerificacionKey)}}" alt="" style="cursor:pointer" data-foto="${{urlFoto(a.fotoVerificacionKey)}}" />`
        : `<div class="foto-miniatura vacia">🧑</div>`;
      return `
      <div class="tarjeta-item">
        ${{foto}}
        <div class="info-principal">
          <div class="nombre-item">${{escaparHtml(formatearFechaHora(a.fecha))}}</div>
          <div class="detalle-item">${{a.metodo === "Huella" ? "{EMOJI_MANO} Huella" : "{EMOJI_TECLADO} Código"}}</div>
        </div>
        <div class="acciones-item">
          <button class="btn peligro chico" data-id="${{a.id}}">{EMOJI_BASURA}Borrar</button>
        </div>
      </div>
    `;
    }}).join("");
    cont.querySelectorAll("[data-id]").forEach((btn) => {{
      btn.addEventListener("click", () => borrarAsistencia(Number(btn.dataset.id)));
    }});
    cont.querySelectorAll("[data-foto]").forEach((img) => {{
      img.addEventListener("click", () => window.open(img.dataset.foto, "_blank"));
    }});'''

nuevo_contenido, n = patron.subn(nuevo_bloque, contenido, count=1)

if n == 0:
    print("AVISO: no se encontró el bloque — pega aquí el resultado de:")
    print("  sed -n '850,870p' academia.js")
    print("para ajustar el patrón.")
else:
    with open("academia.js", "w", encoding="utf-8") as f:
        f.write(nuevo_contenido)
    print("OK: fix aplicado correctamente.")
