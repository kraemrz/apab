from flask import Flask, render_template, request, send_file, jsonify
from docx import Document
from bs4 import BeautifulSoup
import io, zipfile
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/parse", methods=["POST"])
def parse():
    data = request.get_json()
    html = data.get("html", "")
    soup = BeautifulSoup(html, "html.parser")

    all_elements = soup.body.contents if soup.body else soup.contents
    tables = []
    export_only = []

    current_block = []
    found_first_table = False

    for el in all_elements:
        if el.name == "table":
            if not found_first_table:
                found_first_table = True
                if current_block:
                    export_only.extend(current_block)
                    current_block = []
            # Lägg till rubriken som hör till tabellen
            heading = el.find_previous_sibling(["h1", "h2", "p"])
            if heading:
                tables.append(heading)
            tables.append(el)
        else:
            if not found_first_table:
                current_block.append(el)

    # Lägg in försättsblad & innehåll i wrapper
    hidden_div = soup.new_tag("div", attrs={"class": "only-export"})
    for el in export_only:
        hidden_div.append(el)

    result_html = str(hidden_div) + "".join([str(t) for t in tables])
    return jsonify({"html": result_html})



@app.route("/export", methods=["POST"])
def export():
    data = request.get_json()
    html = data.get("html", "")
    datum = data.get("datum", "")
    signatur = data.get("signatur", "")
    notes = data.get("notes", "")

    soup = BeautifulSoup(html, "html.parser")
    doc = Document()

    # === Försättsblad ===
    doc.add_heading("Inspektionsprotokoll", 0)
    doc.add_paragraph("Försättsblad genererat av webbappen.\n")

    # === Innehållsförteckning ===
    doc.add_page_break()
    doc.add_heading("Innehållsförteckning", level=1)
    index = []
    for heading in soup.find_all(["h1", "h2", "p"]):
        if heading.text.strip().lower().startswith("station"):
            index.append(heading.text.strip())
    for item in index:
        doc.add_paragraph(item, style="List Number")

    # === Stationer med tabeller ===
    doc.add_page_break()
    for table in soup.find_all("table"):
        prev = table.find_previous_sibling(["h1", "h2", "p"])
        if prev:
            doc.add_paragraph(prev.text.strip(), style='Heading 2')

        rows = table.find_all("tr")
        if not rows: continue

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

    # === Avslutande info ===
    doc.add_page_break()
    doc.add_heading("Avslut", level=1)
    doc.add_paragraph("Datum: " + datum)
    doc.add_paragraph("Signatur: " + signatur)
    doc.add_paragraph("Övrigt:\n" + notes)

    # === ZIP med DOCX ===
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
