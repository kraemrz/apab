from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
from docx import Document
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.shared import Inches
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_PARAGRAPH_ALIGNMENT, WD_ALIGN_PARAGRAPH

from bs4 import BeautifulSoup
import tempfile, os
from io import BytesIO
import re

app = Flask(__name__)
CORS(app)

TEMP_DOCX_PATH = os.path.join(tempfile.gettempdir(), "uploaded.docx")

# Funktion för att tolka filnamn och extrahera metadata
def parse_filename(filename):
    filename = filename.replace("MALL", "").strip()

    if "Inspektionsprotokoll" in filename:
        language = "sv"
        kund_match = re.search(r"Inspektionsprotokoll (.*?) M(\d+)", filename)
        period_match = re.search(r"(\d+)\s*månader?", filename, re.IGNORECASE)
        maskin_match = re.search(r"M\d+", filename)

        customer = kund_match.group(1).strip() if kund_match else "Unknown"
        machine = "M" + kund_match.group(2) if kund_match else (maskin_match.group(0) if maskin_match else "M000000")
        period = period_match.group(1) if period_match else "?"
        title = f"Inspektionsprotokoll {period} månader"

    elif "Inspection" in filename:
        language = "en"
        kund_match = re.search(r"Inspection\s+([A-Za-z]+)\s+.*?M(\d+)", filename)
        period_match = re.search(r"(\d+)[-\s]*month", filename, re.IGNORECASE)
        maskin_match = re.search(r"M\d+", filename)

        customer = kund_match.group(1).strip() if kund_match else "Unknown"
        machine = "M" + kund_match.group(2) if kund_match else (maskin_match.group(0) if maskin_match else "M000000")
        period = period_match.group(1) if period_match else "?"
        title = f"Inspection protocol {period}-month"

    else:
        return None  # Ingen match

    return {
        "customer": customer,
        "machine": machine,
        "title": title,
        "language": language
    }


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

    # Konvertera Word-tabeller till listor av listor, och ta bort tomma slutrader
    for sec in sections:
        if sec["table"] and hasattr(sec["table"], "rows"):
            table = sec["table"]
            parsed_table = []

            for row in table.rows:
                parsed_row = [cell.text.strip() for cell in row.cells]
                parsed_table.append(parsed_row)

            # Ta bort sista raden om alla celler är tomma
            if parsed_table:
                last_row = parsed_table[-1]
                if all(cell == "" for cell in last_row):
                    parsed_table.pop()

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
        if isinstance(block, Paragraph) and (
            "datum för utförd inspektion" in block.text.lower() or
            "date & signature" in block.text.lower()
        ):
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


def add_table_of_contents(document, heading_text="Innehåll"):
    # Rubrik
    document.add_heading(heading_text, level=1)

    # TOC-fält
    paragraph = document.add_paragraph()
    run = paragraph.add_run()
    
    fldChar_begin = OxmlElement('w:fldChar')
    fldChar_begin.set(qn('w:fldCharType'), 'begin')

    instrText = OxmlElement('w:instrText')
    instrText.set(qn('xml:space'), 'preserve')
    instrText.text = 'TOC \\o "1-3" \\h \\z \\u'

    fldChar_separate = OxmlElement('w:fldChar')
    fldChar_separate.set(qn('w:fldCharType'), 'separate')

    fldChar_end = OxmlElement('w:fldChar')
    fldChar_end.set(qn('w:fldCharType'), 'end')

    run._r.append(fldChar_begin)
    run._r.append(instrText)
    run._r.append(fldChar_separate)
    run._r.append(fldChar_end)

    paragraph.alignment = WD_PARAGRAPH_ALIGNMENT.LEFT

@app.route("/export-word", methods=["POST"])

def export_word():
    html_content = request.form.get("html")
    ### 2 rader lagt till här
    filename = request.form.get("filename", "")  # du skickar in detta från frontend
    parsed = parse_filename(filename)
    ### slutar här
    soup = BeautifulSoup(html_content, "html.parser")

    document = Document()
    section = document.sections[0]
    section.page_width = Inches(8.27)
    section.page_height = Inches(11.69)

    # Lägg till logotyp högst upp till höger
    logo_path = "static/images/apab_logo.png"  # Flytta bilden till denna plats
    p = document.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = p.add_run()
    run.add_picture(logo_path, width=Inches(1.5))  # justerbar storlek
    
    ### START Förstasida – om match finns
    if parsed:
        title = parsed["title"]
        machine = parsed["machine"]
        customer = parsed["customer"]

        # Lägg till 5 radbrytningar
        for _ in range(5):
            document.add_paragraph("")
        
        document.add_paragraph("", style="Normal")  # spacing
        document.add_paragraph(title, style="Title").alignment = WD_ALIGN_PARAGRAPH.CENTER

        p = document.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.add_run(f"Maskinnummer: {machine}\n").bold = True
        p.add_run(f"Kund: {customer}")

        document.add_page_break()
        language = parsed["language"]
    else:
        # fallback om inget matchas
        language = "sv" if "Station" in html_content or "Datum för utförd inspektion" in html_content else "en"

    ### SLUT

    # Kontrollera språk baserat på rubrik eller innehåll
    language = "sv" if "Station" in html_content or "Datum för utförd inspektion" in html_content else "en"

    heading_text = "Innehåll" if language == "sv" else "Index"
    add_table_of_contents(document, heading_text)
    document.add_page_break()


    for elem in soup.find_all(["h2", "p", "table"]):
        if elem.name == "h2":
            document.add_heading(elem.get_text(), level=2)
        elif elem.name == "p":
            p = document.add_paragraph()
            run = p.add_run(elem.get_text())
            run.italic = True
        elif elem.name == "table":
            rows = elem.find_all("tr")
            if not rows:
                continue

            num_cols = len(rows[0].find_all(["td", "th"]))
            table = document.add_table(rows=len(rows), cols=num_cols)
            table.alignment = WD_TABLE_ALIGNMENT.LEFT
            table.style = "Table Grid"

            for i, row in enumerate(rows):
                cells = row.find_all(["td", "th"])
                for j, cell in enumerate(cells):
                    text = cell.get_text().strip()
                    cell_obj = table.cell(i, j)
                    cell_obj.text = text

                    # Header-rad
                    if i == 0:
                        for run in cell_obj.paragraphs[0].runs:
                            run.bold = True
                        shading_elm = OxmlElement('w:shd')
                        shading_elm.set(qn('w:fill'), 'F0C040')  # gul bakgrund
                        cell_obj._tc.get_or_add_tcPr().append(shading_elm)

                    # Kommentar-kolumn (index 2)
                    elif j == 2:
                        shading_elm = OxmlElement('w:shd')
                        shading_elm.set(qn('w:fill'), 'DDEEFF')  # ljusblå
                        cell_obj._tc.get_or_add_tcPr().append(shading_elm)

            # Justera kolumnbredder om 3 kolumner (status / åtgärd / kommentar)
            if num_cols == 3:
                widths = [Inches(1.3), Inches(3.7), Inches(3.7)]
                for i, width in enumerate(widths):
                    for row in table.rows:
                        row.cells[i].width = width

    doc_io = BytesIO()
    document.save(doc_io)
    doc_io.seek(0)

    if parsed and parsed["language"] == "sv":
        filename = f"Inspektionsprotokoll {parsed['customer']} {parsed['machine']} - {parsed['title'].removeprefix('Inspektionsprotokoll').strip()} {datetime.now().strftime('%Y-%m-%d')}.docx"
    elif parsed and parsed["language"] == "en":
        filename = f"Inspection protocol {parsed['customer']} {parsed['machine']} - {parsed['title'].removeprefix('Inspection').strip()} {datetime.now().strftime('%Y-%m-%d')}.docx"
    else:
        filename = "inspection_protocol.docx"
    
    return send_file(
        doc_io,
        as_attachment=True,
        download_name=filename,
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )


if __name__ == "__main__":
    app.run(debug=True)
