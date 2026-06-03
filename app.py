import os
import re
import sys
from flask import Flask, render_template, request, jsonify, send_file, abort, send_from_directory
from werkzeug.utils import secure_filename
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.oxml.text.paragraph import CT_P
from docx.oxml.table import CT_Tbl
from docx.shared import Inches, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from bs4 import BeautifulSoup
from io import BytesIO
from datetime import datetime, date
from collections import defaultdict
import json

# MinIO
from minio_client import (
    minio_upload_pdf,
    list_reports,
    get_pdf_url,
    delete_report,
    fetch_pdf,
    build_report_path,
    minio_upload_json,
    build_inspection_path,
    fetch_json
)

SAVE_FOLDER = 'Sparade_Rapporter'
os.makedirs(SAVE_FOLDER, exist_ok=True)


def resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)


app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

TRANSLATIONS = {
    'sv': {
        'toc_title': 'Innehåll',
        'report_title': 'Inspektionsprotokoll',
        'keywords': ['status', 'åtgärd', 'kommentar', 'signatur']
    },
    'en': {
        'toc_title': 'Table of Contents',
        'report_title': 'Inspection',
        'keywords': ['results', 'description', 'comment', 'signature']
    }
}


def parse_filename_for_info(filename, lang):
    try:
        prefix = TRANSLATIONS[lang]['report_title']
        clean = filename.replace(".docx", "").replace("_MALL", "").replace("_mall", "").strip()

        if clean.lower().startswith(prefix.lower()):
            clean = clean[len(prefix):].strip()

        # Försök 1: Kund + Maskin + M-nummer
        m = re.search(
            r'^(?P<customer>.+?)\s+(?P<machine_name>[A-Za-zÅÄÖåäö0-9\- ]+?)[\s\-–]*\(?(?P<machine_no>M\d{6})\)?',
            clean, re.IGNORECASE
        )
        if m:
            return (
                m.group("customer").strip().title(),
                m.group("machine_name").strip().title(),
                m.group("machine_no").upper()
            )

        # Försök 2: Kund + M-nummer
        m = re.search(r'^(?P<customer>.+?)\s+(?P<machine_no>M\d{6})', clean, re.IGNORECASE)
        if m:
            return m.group("customer").strip().title(), None, m.group("machine_no").upper()

        # Försök 3: Endast M-nummer
        m = re.search(r'\b(M\d{6})\b', clean, re.IGNORECASE)
        if m:
            return "Okänd Kund", None, m.group(1).upper()

    except Exception as e:
        print("Filename parse error:", e)

    return "Okänd Kund", None, None


def set_cell_shade(cell, shade):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:fill'), shade)
    tcPr.append(shd)


def add_table_of_contents(document, toc_title):
    document.add_heading(toc_title, level=1)
    paragraph = document.add_paragraph()
    run = paragraph.add_run()
    fldChar_begin = OxmlElement('w:fldChar')
    fldChar_begin.set(qn('w:fldCharType'), 'begin')
    instrText = OxmlElement('w:instrText')
    instrText.set(qn('xml:space'), 'preserve')
    instrText.text = 'TOC \\o "2-2" \\h \\z \\u'
    fldChar_separate = OxmlElement('w:fldChar')
    fldChar_separate.set(qn('w:fldCharType'), 'separate')
    fldChar_end = OxmlElement('w:fldChar')
    fldChar_end.set(qn('w:fldCharType'), 'end')
    run._r.extend([fldChar_begin, instrText, fldChar_separate, fldChar_end])


def detect_language_from_doc(document):
    text_content = [cell.text.lower() for table in document.tables for row in table.rows for cell in row.cells]
    full_text = " ".join(text_content)
    return 'en' if any(kw in full_text for kw in TRANSLATIONS['en']['keywords']) else 'sv'


# ====================== ROUTES ======================

@app.route("/ping", methods=["GET", "HEAD"])
def ping_server():
    return "ok", 200


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/inspection_editor')
def inspection_editor():
    return render_template('inspection_editor.html')


@app.route('/history_page')
def history_page():
    return render_template('history_page.html')


@app.route('/backlog_page')
def backlog_page():
    return render_template('backlogg.html')


@app.route('/service_report')
def service_report():
    return render_template('service_report.html')


@app.route("/inspection/view")
def inspection_view():
    path = request.args.get("path")
    if not path:
        abort(400, description="Missing inspection path")
    return render_template("inspection_view.html", json_path=path)


@app.route("/api/inspection/load")
def api_load_inspection():
    path = request.args.get("path")
    if not path:
        abort(400)
    data = fetch_json(path)
    return jsonify(data)


# ==================== TEMPORÄRT AVSTÄNGDA DB-ROUTER ====================

@app.route("/api/inspection-history")
def inspection_history():
    return jsonify([])  # TODO: Kan byggas om med MinIO senare


@app.route("/api/backlog/customers")
def backlog_customers():
    return jsonify([])  # TODO: Kan byggas om med MinIO senare


@app.route("/api/backlog/customer/<customer>")
def backlog_customer(customer):
    return jsonify({"customer": customer, "machines": []})


@app.route("/api/machines")
def list_machines():
    return jsonify([])  # TODO: Kan byggas om med MinIO senare


# =====================================================================


@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({"error": "No selected file"}), 400

    original_filename = file.filename
    safe_filename = secure_filename(original_filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], safe_filename)
    file.save(filepath)

    try:
        doc = Document(filepath)
        detected_lang = detect_language_from_doc(doc)
        customer, machine_name, machine_number = parse_filename_for_info(original_filename, detected_lang)

        blocks = []
        content_started = False

        for child in doc.element.body:
            if not content_started:
                if isinstance(child, CT_P):
                    p = Paragraph(child, doc)
                    if p.text.strip().lower().startswith('station') or re.match(r'^\d+\s+station', p.text.strip().lower()):
                        content_started = True
                if not content_started:
                    continue

            if isinstance(child, CT_P):
                p = Paragraph(child, doc)
                text = p.text.strip()
                if text:
                    blocks.append({"type": "paragraph", "text": text})
            elif isinstance(child, CT_Tbl):
                t = Table(child, doc)
                table_data = [[cell.text.strip() for cell in row.cells] for row in t.rows]
                blocks.append({"type": "table", "data": table_data})

        return jsonify({
            "blocks": blocks,
            "lang": detected_lang,
            "customer": customer,
            "machine_name": machine_name,
            "machine_number": machine_number,
            "machine_display": f"{machine_name} ({machine_number})" if machine_name else "Okänd Maskin",
            "history": [],           # DB borttagen
            "service_reports": []    # DB borttagen
        })

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({"error": f"Failed to process document: {e}"}), 500
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)


@app.route('/save_pdf_report', methods=['POST'])
def save_pdf_report():
    try:
        customer = request.form.get("customer")
        machine_number = request.form.get("machine_number")
        service_date = request.form.get("serviceDate") or datetime.now().strftime("%Y-%m-%d")
        filename = request.form.get("filename")
        pdf_file = request.files.get("pdf")

        if not (machine_number and pdf_file):
            return jsonify({"error": "Missing PDF or machine number"}), 400

        pdf_bytes = pdf_file.read()

        object_path = build_report_path(customer=customer, machine_number=machine_number, service_date=service_date)
        minio_upload_pdf(object_path, pdf_bytes)

        return jsonify({
            "message": "PDF saved successfully in MinIO",
            "path": object_path
        }), 200

    except Exception as e:
        print("Error saving PDF:", e)
        return jsonify({"error": str(e)}), 500


@app.route("/reports/<machine>")
def list_machine_reports(machine):
    reports = list_reports(machine)
    return jsonify(reports)


@app.route("/download_report")
def download_report():
    path = request.args.get("path")
    if not path:
        abort(400, description="Missing 'path' parameter")

    try:
        pdf_bytes = fetch_pdf(path)
    except Exception:
        abort(404, description="PDF not found")

    filename = path.split("/")[-1] or "report.pdf"
    return send_file(
        BytesIO(pdf_bytes),
        mimetype="application/pdf",
        as_attachment=False,
        download_name=filename,
    )


@app.route("/report_url")
def report_url():
    path = request.args.get("path")
    if not path:
        return jsonify({"error": "missing_path"}), 400

    try:
        url = get_pdf_url(path)
        return jsonify({"url": url})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/delete_report", methods=["POST"])
def delete_report_api():
    path = request.form.get("path")
    if path:
        delete_report(path)
    return jsonify({"status": "deleted"})


@app.route("/export-word", methods=["POST"])
def export_to_word():
    lang = request.form.get('lang', 'sv')
    html_content = request.form.get("html", "")
    inspection_date = request.form.get('inspection_date', datetime.now().strftime('%Y-%m-%d'))
    customer = request.form.get('customer', 'Okänd Kund')
    machine_name = request.form.get("machine_name")
    machine_number = request.form.get("machine_number")
    signature = request.form.get('signature', '')

    comments_json = request.form.get('comments_json', '[]')
    comments_data = json.loads(comments_json)

    soup = BeautifulSoup(html_content, "html.parser")
    for box in soup.select(".service-info-box"):
        box.decompose()

    document = Document()
    document.add_picture(resource_path("static/images/apab_logo.png"), width=Inches(3.0))

    p = document.add_paragraph()
    p.add_run(TRANSLATIONS[lang]['report_title']).bold = True
    p.runs[0].font.size = Pt(24)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    document.add_paragraph()

    info_table = document.add_table(rows=4, cols=2)
    info_table.columns[0].width = Inches(1.5)
    info_table.columns[1].width = Inches(4.5)

    info_table.cell(0, 0).text = "Kund:"
    info_table.cell(0, 1).text = customer
    info_table.cell(1, 0).text = "Maskin:"
    info_table.cell(1, 1).text = f"{machine_name} ({machine_number})" if machine_name else machine_number or "Okänd"
    info_table.cell(2, 0).text = "Inspektionsdatum:"
    info_table.cell(2, 1).text = inspection_date
    info_table.cell(3, 0).text = "Signatur:"
    info_table.cell(3, 1).text = signature

    document.add_page_break()
    add_table_of_contents(document, TRANSLATIONS[lang]['toc_title'])
    document.add_page_break()

    # Summary table
    filtered_comments = [c for c in comments_data if c.get("station", "").strip().lower() != "övrigt"]

    if filtered_comments:
        document.add_heading("Summering" if lang == "sv" else "Summary", level=2)
        grouped = defaultdict(list)
        for c in filtered_comments:
            grouped[c["station"]].append(c)

        for station, items in grouped.items():
            document.add_heading(station, level=3)
            table = document.add_table(rows=1, cols=3, style="Table Grid")
            hdr = table.rows[0].cells
            hdr[0].text = "Status" if lang == "sv" else "Status"
            hdr[1].text = "Åtgärd" if lang == "sv" else "Action"
            hdr[2].text = "Kommentar" if lang == "sv" else "Comment"

            for item in items:
                row = table.add_row().cells
                row[0].text = "Anm."
                row[1].text = item.get("action", "")
                row[2].text = item.get("comment", "")

        document.add_page_break()

    # Rest of content
    for element in soup.children:
        if not hasattr(element, 'name') or not element.name:
            continue
        text = element.get_text(strip=True)
        if not text:
            continue

        if element.name == 'h1':
            document.add_heading(text, level=2)
        elif element.name == 'h2':
            document.add_heading(text, level=3)
        elif element.name == 'div' and 'na-bar' in element.get('class', []):
            document.add_paragraph(f"{text} (Ej aktuell)", style='List Bullet')
        elif element.name == 'table':
            rows_data = [[cell.get_text(strip=True) for cell in row.find_all(['th', 'td'])] 
                        for row in element.find_all('tr')]
            if rows_data and rows_data[0]:
                try:
                    doc_table = document.add_table(rows=1, cols=len(rows_data[0]), style='Table Grid')
                    for j, cell_text in enumerate(rows_data[0]):
                        doc_table.cell(0, j).text = cell_text
                        set_cell_shade(doc_table.cell(0, j), 'FFC000')
                    for i in range(1, len(rows_data)):
                        row_cells = doc_table.add_row().cells
                        for j, cell_text in enumerate(rows_data[i]):
                            row_cells[j].text = cell_text
                except:
                    pass

    # Spara JSON till MinIO (istället för databas)
    inspection_payload = {
        "type": "inspection",
        "version": 1,
        "customer": customer,
        "machine_name": machine_name,
        "machine_number": machine_number,
        "inspection_date": inspection_date,
        "lang": lang,
        "signature": signature,
        "comments": comments_data,
        "exported_at": datetime.utcnow().isoformat()
    }

    inspection_path = build_inspection_path(
        customer=customer,
        machine_number=machine_number,
        inspection_date=inspection_date
    )

    minio_upload_json(inspection_path, inspection_payload)

    # Skicka Word-fil
    doc_io = BytesIO()
    document.save(doc_io)
    doc_io.seek(0)

    download_name = f"Inspektionsprotokoll_{customer.replace(' ', '_')}_{machine_number}_{inspection_date}.docx"

    return send_file(
        doc_io,
        as_attachment=True,
        download_name=download_name,
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )


@app.route('/sw.js')
def service_worker():
    return send_from_directory('.', 'sw.js')


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')