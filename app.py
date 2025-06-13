from flask import Flask, render_template, request, jsonify, send_file
from docx import Document
from flask_cors import CORS
from bs4 import BeautifulSoup
import io, zipfile

app = Flask(__name__)
CORS(app)

from flask import Flask, render_template, request, jsonify
from docx import Document
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

from flask import Flask, render_template, request, jsonify
from docx import Document
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/upload", methods=["POST"])
def upload():
    file = request.files.get("file")
    if not file or not file.filename.endswith(".docx"):
        return "Invalid file", 400

    doc = Document(file)
    sections = []
    current_section = None
    table_queue = doc.tables

    # Flush-funktion för att spara föregående sektion
    def flush():
        nonlocal current_section
        if current_section:
            sections.append(current_section)
            current_section = None

    # Iterera över alla paragrafer
    paragraphs = iter(doc.paragraphs)
    for para in paragraphs:
        text = para.text.strip()
        if not text:
            continue

        lower = text.lower()

        # Hitta stationer och "Övrigt"
        if lower.startswith("station") or lower == "övrigt":
            flush()
            current_section = {
                "title": text,
                "subtitle": "",
                "table": None,
                "na_only": False
            }

            # Försök läsa in underrubrik eller "N/A"
            try:
                next_para = next(paragraphs)
                while not next_para.text.strip():
                    next_para = next(paragraphs)
                next_text = next_para.text.strip()

                if next_text.lower() == "n/a":
                    current_section["subtitle"] = "N/A"
                    current_section["na_only"] = True
                elif (
                    not next_text.lower().startswith("station")
                    and next_text.lower() not in ["datum för utförd inspektion", "övrigt"]
                    and len(next_text.split()) < 5
                    and not all(w in ["datum", "signatur"] for w in next_text.lower().split())
                ):
                    current_section["subtitle"] = next_text
            except StopIteration:
                pass

    flush()

    # Tilldela tabeller till sektioner
    table_index = 0
    for sec in sections:
        if not sec["na_only"] and table_index < len(table_queue):
            sec["table"] = table_queue[table_index]
            table_index += 1

    # Konvertera Word-tabeller till listor av listor
    for sec in sections:
        if sec["table"] and hasattr(sec["table"], "rows"):
            table = sec["table"]
            parsed_table = []
            for row in table.rows:
                parsed_row = [cell.text.strip() for cell in row.cells]
                parsed_table.append(parsed_row)
            sec["table"] = parsed_table

    # === Leta upp "Datum för utförd inspektion" och dess tabell ===
    def iter_block_items(parent):
        """
        Gå igenom dokumentets innehåll (paragrafer och tabeller) i rätt ordning.
        """
        parent_element = parent.element.body
        for child in parent_element.iterchildren():
            if isinstance(child, CT_P):
                yield Paragraph(child, parent)
            elif isinstance(child, CT_Tbl):
                yield Table(child, parent)

    found_datum_section = False
    datum_info = ["", ""]
    for block in iter_block_items(doc):
        if isinstance(block, Paragraph) and "datum för utförd inspektion" in block.text.lower():
            found_datum_section = True
            continue
        if found_datum_section and isinstance(block, Table):
            if len(block.rows) >= 2 and len(block.rows[1].cells) >= 2:
                datum_info = [
                    block.rows[1].cells[0].text.strip(),
                    block.rows[1].cells[1].text.strip()
                ]
                sections.append({
                    "title": "Datum för utförd inspektion",
                    "table": [["Datum", "Signatur"], datum_info]
                })
            break

    return jsonify(sections)

@app.route("/export", methods=["POST"])
def export():
    data = request.get_json()
    html = data.get("html", "")

    soup = BeautifulSoup(html, "html.parser")
    doc = Document()

    doc.add_heading("Inspektionsprotokoll", 0)
    doc.add_paragraph("Genererat från webbappen.")

    doc.add_page_break()
    doc.add_heading("Innehållsförteckning", level=1)
    index = [h2.text.strip() for h2 in soup.find_all("h2") if h2.text.strip()]
    for item in index:
        doc.add_paragraph(item, style="List Number")

    doc.add_page_break()
    for block in soup.find_all("div", class_="station-block"):
        h2 = block.find("h2")
        if h2:
            doc.add_paragraph(h2.text.strip(), style="Heading 1")
        p = block.find("p")
        if p:
            doc.add_paragraph(p.text.strip(), style="Heading 2")

        table = block.find("table")
        if not table:
            continue

        rows = table.find_all("tr")
        if not rows:
            continue

        cols = rows[0].find_all(["td", "th"])
        t = doc.add_table(rows=1, cols=len(cols))
        t.style = "Table Grid"
        hdr_cells = t.rows[0].cells
        for i, cell in enumerate(cols):
            hdr_cells[i].text = cell.get_text(strip=True)

        for row in rows[1:]:
            cells = row.find_all(["td", "th"])
            row_cells = t.add_row().cells
            for i in range(min(len(cells), len(row_cells))):
                row_cells[i].text = cells[i].get_text(strip=True)

        doc.add_paragraph()

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w") as zipf:
        zipf.writestr("inspektionsprotokoll.docx", buf.read())
    zip_buf.seek(0)
    return send_file(zip_buf, mimetype="application/zip", as_attachment=True, download_name="inspektionsprotokoll.zip")

if __name__ == "__main__":
    app.run(debug=True)
