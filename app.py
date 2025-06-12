from flask import Flask, render_template, request, jsonify, send_file
from docx import Document
from flask_cors import CORS
from bs4 import BeautifulSoup
import io, zipfile

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

    def flush():
        nonlocal current_section
        if current_section:
            sections.append(current_section)
            current_section = None

    paragraphs = iter(doc.paragraphs)
    for para in paragraphs:
        text = para.text.strip()
        if not text:
            continue

        lower = text.lower()

        if lower.startswith("station") or lower == "övrigt" or lower.startswith("datum för utförd inspektion"):
            flush()
            current_section = {
                "title": text,
                "subtitle": "",
                "table": None,
                "na_only": False
            }

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

    table_index = 0
    for sec in sections:
        if not sec["na_only"] and table_index < len(table_queue):
            sec["table"] = table_queue[table_index]
            table_index += 1

    html_blocks = []
    for sec in sections:
        block = '<div class="station-block">'
        block += f'<h2>{sec["title"]}</h2>'

        if sec["subtitle"]:
            block += f'<p>{sec["subtitle"]}</p>'

        if sec["table"]:
            table = sec["table"]
            html_table = "<table><thead><tr>"

            headers = [cell.text.strip() for cell in table.rows[0].cells]
            for header in headers:
                html_table += f"<th>{header}</th>"
            html_table += "</tr></thead><tbody>"

            for row in table.rows[1:]:
                html_table += "<tr>"
                for i, cell in enumerate(row.cells):
                    val = cell.text.strip()
                    header = headers[i].lower()
                    if header in ["kommentar", "datum", "signatur"]:
                        html_table += f'<td contenteditable="true" class="editable">{val}</td>'
                    else:
                        html_table += f"<td>{val}</td>"
                html_table += "</tr>"

            html_table += "</tbody></table>"
            block += html_table

        block += "</div>"
        html_blocks.append(block)

    return jsonify({"html": "\n".join(html_blocks)})

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
