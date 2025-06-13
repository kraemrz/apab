from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
from docx import Document
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph
from bs4 import BeautifulSoup
import pdfkit
from PyPDF2 import PdfMerger
from docx2pdf import convert
import io, zipfile, tempfile, os

app = Flask(__name__)
CORS(app)

TEMP_DOCX_PATH = os.path.join(tempfile.gettempdir(), "uploaded.docx")

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/upload", methods=["POST"])
def upload():
    file = request.files.get("file")
    if not file or not file.filename.endswith(".docx"):
        return "Invalid file", 400
    
    # spara filen till en temporär plats
    file.save(TEMP_DOCX_PATH)

    doc = Document(file)
    sections = []
    current_section = None
    table_queue = doc.tables

    # Flush-funktion för att spara föregående sektion
    def flush():
        nonlocal current_section
        if current_section:
            # Om sektionen inte har en tabell, lägg till en text N/A
            if not current_section["table"]:
                current_section["table"] = [["N/A"]]
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
                else:
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

    # Lägg till valfritt CSS om du vill ha marginaler etc.
    options = {
        'encoding': 'utf-8',
        'enable-local-file-access': None,
        'page-size': 'A4',
        'margin-top': '15mm',
        'margin-bottom': '15mm',
        'margin-left': '15mm',
        'margin-right': '15mm'
    }

    # Ange rätt sökväg till wkhtmltopdf
    config = pdfkit.configuration(wkhtmltopdf="C:/Program Files/wkhtmltopdf/bin/wkhtmltopdf.exe")

    html_pdf_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf").name
    pdfkit.from_string(html, html_pdf_path, configuration=config, options=options)

    return send_file(html_pdf_path, as_attachment=True, download_name="inspektionsprotokoll.pdf", mimetype="application/pdf")


if __name__ == "__main__":
    app.run(debug=True)
