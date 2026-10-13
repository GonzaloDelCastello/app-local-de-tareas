# -*- coding: utf-8 -*-
"""Genera manual.docx y manual.epub desde manual.md (Markdown simple).

No usa pandoc: convierte a mano lo que el manual necesita
(encabezados, parrafos, listas, citas, negrita, cursiva, separadores).
"""
import os, re, zipfile, html, datetime

BASE = r"C:\Users\gonza\Documents\Desarrollo\app local de tareas\docs\manual"
MD = os.path.join(BASE, "manual.md")
DOCX = os.path.join(BASE, "manual.docx")
EPUB = os.path.join(BASE, "manual.epub")

TITULO = "Disenar software con agentes de IA"
AUTOR = "Proyecto app local de tareas"
FECHA = datetime.date.today().isoformat()

raw = open(MD, encoding="utf-8").read()
lineas = raw.split("\n")

# ---------- parseo en bloques ----------
bloques = []
buf = []

def flush():
    global buf
    if buf:
        bloques.append(("p", " ".join(buf).strip()))
        buf = []

for l in lineas:
    s = l.rstrip()
    if s.strip() == "":
        flush(); continue
    if s.startswith("# "):
        flush(); bloques.append(("h1", s[2:].strip()))
    elif s.startswith("## "):
        flush(); bloques.append(("h2", s[3:].strip()))
    elif s.startswith("### "):
        flush(); bloques.append(("h3", s[4:].strip()))
    elif s.strip() in ("---", "***", "___"):
        flush(); bloques.append(("hr", ""))
    elif s.lstrip().startswith("> "):
        flush(); bloques.append(("quote", s.lstrip()[2:].strip()))
    elif re.match(r"^\s*[-*] ", s):
        flush(); bloques.append(("li", re.sub(r"^\s*[-*] ", "", s).strip()))
    elif re.match(r"^\s*\d+\.\s", s):
        flush(); bloques.append(("oli", re.sub(r"^\s*\d+\.\s", "", s).strip()))
    else:
        buf.append(s.strip())
flush()

print("bloques:", len(bloques))

# ---------- inline: **negrita** y *cursiva* ----------
TOKEN = re.compile(r"(\*\*.+?\*\*|\*[^*]+?\*)")

def inline_runs(texto):
    """Devuelve lista de (texto, bold, italic)."""
    texto = texto.replace("`", "")
    out = []
    for parte in TOKEN.split(texto):
        if not parte:
            continue
        if parte.startswith("**") and parte.endswith("**") and len(parte) > 4:
            out.append((parte[2:-2], True, False))
        elif parte.startswith("*") and parte.endswith("*") and len(parte) > 2:
            out.append((parte[1:-1], False, True))
        else:
            out.append((parte, False, False))
    return out

def inline_xhtml(texto):
    texto = texto.replace("`", "")
    texto = html.escape(texto, quote=False)
    texto = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", texto)
    texto = re.sub(r"\*(.+?)\*", r"<em>\1</em>", texto)
    return texto

# ---------- DOCX ----------
from docx import Document

doc = Document()
for tipo, t in bloques:
    if tipo == "h1":
        doc.add_heading(t, level=1)
    elif tipo == "h2":
        doc.add_heading(t, level=2)
    elif tipo == "h3":
        doc.add_heading(t, level=3)
    elif tipo == "hr":
        doc.add_paragraph("")
    elif tipo == "li":
        p = doc.add_paragraph(style="List Bullet")
        for txt, b, i in inline_runs(t):
            r = p.add_run(txt); r.bold = b; r.italic = i
    elif tipo == "oli":
        p = doc.add_paragraph(style="List Number")
        for txt, b, i in inline_runs(t):
            r = p.add_run(txt); r.bold = b; r.italic = i
    elif tipo == "quote":
        p = doc.add_paragraph()
        for txt, b, i in inline_runs(t):
            r = p.add_run(txt); r.bold = b; r.italic = True
    else:
        p = doc.add_paragraph()
        for txt, b, i in inline_runs(t):
            r = p.add_run(txt); r.bold = b; r.italic = i

doc.save(DOCX)
print("DOCX:", DOCX)

# ---------- EPUB ----------
# Una seccion por cada h2 (los h1/y primeros van al prefacio)
secciones = []
actual = {"titulo": TITULO, "tipo": "inicio", "cuerpo": []}
for tipo, t in bloques:
    if tipo == "h1":
        continue
    if tipo == "h2":
        secciones.append(actual)
        actual = {"titulo": t, "tipo": "cap", "cuerpo": []}
    else:
        actual["cuerpo"].append((tipo, t))
secciones.append(actual)

secciones = [s for s in secciones if s["cuerpo"]]
print("secciones epub:", len(secciones))

def cuerpo_xhtml(cuerpo):
    partes = []
    for tipo, t in cuerpo:
        if tipo == "p":
            partes.append("<p>%s</p>" % inline_xhtml(t))
        elif tipo == "h3":
            partes.append("<h2>%s</h2>" % inline_xhtml(t))
        elif tipo == "li":
            partes.append("<li>%s</li>" % inline_xhtml(t))
        elif tipo == "oli":
            partes.append("<li>%s</li>" % inline_xhtml(t))
        elif tipo == "quote":
            partes.append("<blockquote><p>%s</p></blockquote>" % inline_xhtml(t))
        elif tipo == "hr":
            partes.append("<hr/>")
    # envolver listas consecutivas
    out, abierto = [], False
    for p in partes:
        es_li = p.startswith("<li>")
        if es_li and not abierto:
            out.append("<ul>"); abierto = True
        elif not es_li and abierto:
            out.append("</ul>"); abierto = False
        out.append(p)
    if abierto:
        out.append("</ul>")
    return "\n".join(out)

def xhtml_doc(titulo, cuerpo):
    return """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="es" lang="es">
<head><meta charset="utf-8"/><title>%s</title></head>
<body>
<h1>%s</h1>
%s
</body>
</html>""" % (html.escape(titulo), html.escape(titulo), cuerpo_xhtml(cuerpo))

uid = "urn:uuid:" + str(__import__("uuid").uuid4())

manifiesto = []
spine = []
nav_lis = []
for i, s in enumerate(secciones):
    fn = "cap%02d.xhtml" % i
    manifiesto.append('<item id="c%d" href="%s" media-type="application/xhtml+xml"/>' % (i, fn))
    spine.append('<itemref idref="c%d"/>' % i)
    nav_lis.append('<li><a href="%s">%s</a></li>' % (fn, html.escape(s["titulo"])))
    with open(os.path.join(BASE, fn), "w", encoding="utf-8") as f:
        f.write(xhtml_doc(s["titulo"], s["cuerpo"]))

content_opf = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="es">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">%s</dc:identifier>
<dc:title>%s</dc:title>
<dc:creator>%s</dc:creator>
<dc:language>es</dc:language>
<meta property="dcterms:modified">%sT00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
%s
</manifest>
<spine toc="ncx">
%s
</spine>
</package>""" % (uid, html.escape(TITULO), html.escape(AUTOR), FECHA, "\n".join(manifiesto), "\n".join(spine))

nav_xhtml = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="es" lang="es">
<head><meta charset="utf-8"/><title>Indice</title></head>
<body>
<nav epub:type="toc" id="toc"><h1>Indice</h1><ol>
%s
</ol></nav>
</body>
</html>""" % "\n".join(nav_lis)

toc_ncx = """<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="%s"/></head>
<docTitle><text>%s</text></docTitle>
<navMap>
%s
</navMap>
</ncx>""" % (uid, html.escape(TITULO),
             "\n".join('<navPoint id="n%d" playOrder="%d"><navLabel><text>%s</text></navLabel><content src="cap%02d.xhtml"/></navPoint>'
                       % (i, i + 1, html.escape(s["titulo"]), i) for i, s in enumerate(secciones)))

container = """<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"""

with zipfile.ZipFile(EPUB, "w") as z:
    z.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
    z.writestr("META-INF/container.xml", container, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr("OEBPS/content.opf", content_opf, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr("OEBPS/nav.xhtml", nav_xhtml, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr("OEBPS/toc.ncx", toc_ncx, compress_type=zipfile.ZIP_DEFLATED)
    for i, s in enumerate(secciones):
        p = os.path.join(BASE, "cap%02d.xhtml" % i)
        z.writestr("OEBPS/cap%02d.xhtml" % i, open(p, encoding="utf-8").read(), compress_type=zipfile.ZIP_DEFLATED)
        os.remove(p)

print("EPUB:", EPUB)
print("listo")
