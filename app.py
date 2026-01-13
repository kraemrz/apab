import os
import re
import sys
from flask import Flask, render_template, request, jsonify, send_file, send_from_directory, abort
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
from datetime import datetime
from database import (
    add_inspection, 
    get_history_for_machine, 
    save_service_report, 
    get_last_inspection, 
    get_service_reports_between, 
    list_inspection_history, 
    upsert_inspection_history, 
    InspectionHistory, 
    get_nearest_service_report,
    ServiceReport,
    Inspection
)
import json
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
from datetime import date
from collections import defaultdict


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
    'sv': { 'toc_title': 'Innehåll', 'report_title': 'Inspektionsprotokoll', 'keywords': ['status', 'åtgärd', 'kommentar', 'signatur'] },
    'en': { 'toc_title': 'Table of Contents', 'report_title': 'Inspection', 'keywords': ['results', 'description', 'comment', 'signature'] }
}

def parse_filename_for_info(filename, lang):
    try:
        prefix = TRANSLATIONS[lang]['report_title']

        clean = (
            filename
            .replace(".docx", "")
            .replace("_MALL", "")
            .replace("_mall", "")
            .strip()
        )

        # Ta bort rapporttitel i början
        if clean.lower().startswith(prefix.lower()):
            clean = clean[len(prefix):].strip()

        # --- Försök 1: Kund + Maskinnamn + M-nummer ---
        # Abbott Mellitus-M100091
        m = re.search(
            r'^(?P<customer>.+?)\s+(?P<machine_name>[A-Za-zÅÄÖåäö0-9\- ]+?)[\s\-–]*\(?'
            r'(?P<machine_no>M\d{6})\)?',
            clean,
            re.IGNORECASE
        )

        if m:
            return (
                m.group("customer").strip().title(),
                m.group("machine_name").strip().title(),
                m.group("machine_no").upper()
            )

        # --- Försök 2: Kund + endast M-nummer ---
        # Nolato M100025
        m = re.search(
            r'^(?P<customer>.+?)\s+(?P<machine_no>M\d{6})',
            clean,
            re.IGNORECASE
        )

        if m:
            return (
                m.group("customer").strip().title(),
                None,
                m.group("machine_no").upper()
            )

        # --- Försök 3: Endast M-nummer ---
        m = re.search(r'\b(M\d{6})\b', clean, re.IGNORECASE)
        if m:
            return "Okänd Kund", None, m.group(1).upper()

    except Exception as e:
        print("Filename parse error:", e)

    return "Okänd Kund", None, None


def set_cell_shade(cell, shade):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd'); shd.set(qn('w:val'), 'clear'); shd.set(qn('w:fill'), shade)
    tcPr.append(shd)

def add_table_of_contents(document, toc_title):
    document.add_heading(toc_title, level=1)
    paragraph = document.add_paragraph(); run = paragraph.add_run()
    fldChar_begin = OxmlElement('w:fldChar'); fldChar_begin.set(qn('w:fldCharType'), 'begin')
    instrText = OxmlElement('w:instrText'); instrText.set(qn('xml:space'), 'preserve'); instrText.text = 'TOC \\o "2-2" \\h \\z \\u'
    fldChar_separate = OxmlElement('w:fldChar'); fldChar_separate.set(qn('w:fldCharType'), 'separate')
    fldChar_end = OxmlElement('w:fldChar'); fldChar_end.set(qn('w:fldCharType'), 'end')
    run._r.extend([fldChar_begin, instrText, fldChar_separate, fldChar_end])

def detect_language_from_doc(document):
    text_content = [cell.text.lower() for table in document.tables for row in table.rows for cell in row.cells]
    full_text = " ".join(text_content)
    return 'en' if any(keyword in full_text for keyword in TRANSLATIONS['en']['keywords']) else 'sv'


@app.route("/ping", methods=["GET", "HEAD"])
def ping_server():
    return "ok", 200 # Returnerar bara en enkel "ok" med status 200

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/inspection_editor')
def inspection_editor():
    return render_template('inspection_editor.html')

@app.route('/history_page')
def history_page():
    return render_template('history_page.html')

@app.route("/api/inspection-history")
def inspection_history():
    customer = request.args.get("customer")
    machine = request.args.get("machine")

    from_date = request.args.get("from")
    to_date = request.args.get("to")

    from_date = date.fromisoformat(from_date) if from_date else None
    to_date = date.fromisoformat(to_date) if to_date else None

    results = list_inspection_history(
        customer=customer,
        machine=machine,
        date_from=from_date,
        date_to=to_date,
    )

    return jsonify(results)


@app.route("/inspection/view")
def inspection_view():
    path = request.args.get("path")
    if not path:
        abort(400, description="Missing inspection path")

    return render_template(
        "inspection_view.html",
        json_path=path
    )

@app.route("/api/inspection/load")
def api_load_inspection():
    path = request.args.get("path")
    if not path:
        abort(400)

    data = fetch_json(path)
    return jsonify(data)


@app.route('/backlog_page')
def backlog_page():
    return render_template('backlogg.html')

from flask import jsonify
from collections import defaultdict

@app.route("/api/backlog/customers")
def backlog_customers():
    customers = defaultdict(set)

    # --- Inspektioner ---
    inspections = (
        InspectionHistory
        .select(InspectionHistory.customer, InspectionHistory.machine_number)
    )

    for row in inspections:
        customers[row.customer].add(row.machine_number)

    # --- Service rapporter ---
    services = (
        ServiceReport
        .select(ServiceReport.customer, ServiceReport.machine_number)
        .where(ServiceReport.customer.is_null(False))
    )

    for row in services:
        customers[row.customer].add(row.machine_number)

    # --- Formatterat svar ---
    result = [
        {
            "customer": customer,
            "machines": len(machines)
        }
        for customer, machines in sorted(customers.items())
    ]

    return jsonify(result)

@app.route("/api/backlog/customer/<customer>")
def backlog_customer(customer):
    result = {}

    # -----------------------------
    # Inspektioner
    # -----------------------------
    inspections = (
        InspectionHistory
        .select()
        .where(InspectionHistory.customer == customer)
        .order_by(InspectionHistory.inspection_date.desc())
    )

    for ins in inspections:
        machine = ins.machine_number
        result.setdefault(machine, {
            "machine": machine,
            "inspections": [],
            "service_reports": []
        })

        result[machine]["inspections"].append({
            "date": ins.inspection_date.isoformat(),
            "json_path": ins.json_path,
            "docx_path": ins.docx_path
        })

    # -----------------------------
    # Service rapporter
    # -----------------------------
    reports = (
        ServiceReport
        .select()
        .where(ServiceReport.customer == customer)
        .order_by(ServiceReport.service_date.desc())
    )

    for rep in reports:
        machine = rep.machine_number
        result.setdefault(machine, {
            "machine": machine,
            "inspections": [],
            "service_reports": []
        })

        result[machine]["service_reports"].append({
            "date": rep.service_date.isoformat() if rep.service_date else None,
            "filename": rep.filename,
            "pdf_path": rep.pdf_path
        })

    return jsonify({
        "customer": customer,
        "machines": list(result.values())
    })


@app.route('/service_report')
def service_report():
    return render_template('service_report.html')

@app.route("/api/machines")
def list_machines():
    rows = (
        Inspection
        .select(Inspection.machine_number, Inspection.customer)
        .distinct()
        .order_by(Inspection.machine_number)
    )

    return jsonify([
        {
            "machine_number": r.machine_number,
            "customer": r.customer
        }
        for r in rows
    ])

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files: return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if not file.filename: return jsonify({"error": "No selected file"}), 400

    original_filename = file.filename
    safe_filename = secure_filename(original_filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], safe_filename)
    file.save(filepath)

    try:
        doc = Document(filepath)
        detected_lang = detect_language_from_doc(doc)
        customer, machine_name, machine_number = parse_filename_for_info(original_filename, detected_lang)

        history_data = get_history_for_machine(machine_number)
        
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

        # Hämta senaste inspektion för maskinen
        last_inspection = get_last_inspection(customer, machine_number)

        # Idag
        today = date.today()

        # Sök servicerapporter
        service_reports = []
        if last_inspection:
            service_reports = get_service_reports_between(machine_number, last_inspection, today)
        
        for r in service_reports:
            r["url"] = f"/download_report?path={r['pdf_path']}"

        return jsonify({
            "blocks": blocks,
            "lang": detected_lang,
            "customer": customer,
            "machine_name": machine_name,
            "machine_number": machine_number,
            "machine_display": f"{machine_name} ({machine_number})" if machine_name else "Okänd Maskin",
            "history": history_data,
            "service_reports": service_reports
        })

    
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({"error": f"Failed to process document: {e}"}), 500
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)

@app.route('/history/<machine_id>')
def get_history(machine_id):
    history = get_history_for_machine(machine_id)
    return jsonify(history)

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

        # 1) Spara PDF i MinIO
        object_path = build_report_path(
            customer=customer,
            machine_number=machine_number,
            service_date=service_date
        )

        minio_upload_pdf(object_path, pdf_bytes)

        # 2) Spara metadata i Postgres
        save_service_report(
            customer=customer,
            machine_number=machine_number,
            service_date=service_date,
            filename=filename,
            pdf_path=object_path  # <-- spara bara en referens till pdf
        )

        return jsonify({"message": "PDF saved successfully"}), 200

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
    except Exception as e:
        print("Error fetching PDF from MinIO:", e)
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
        print("[/report_url] ERROR: path saknas i querystring")
        return jsonify({"error": "missing_path"}), 400

    try:
        # get_pdf_url ska returnera en sträng med en presigned URL
        url = get_pdf_url(path)
        print(f"[/report_url] path={path} -> url={url}")

        if not url:
            # Viktigt: svara tydligt så vi ser det i frontenden
            return jsonify({"error": "no_url_generated", "url": None}), 500

        return jsonify({"url": url})

    except Exception as e:
        print(f"[/report_url] ERROR:", e)
        return jsonify({"error": str(e), "url": None}), 500


@app.route("/delete_report", methods=["POST"])
def delete_report_api():
    path = request.form.get("path")
    delete_report(path)
    return jsonify({"status": "deleted"})

@app.route("/export-word", methods=["POST"])
def export_to_word():
    lang = request.form.get('lang', 'sv')
    html_content = request.form.get("html", "")
    inspection_date = request.form.get('inspection_date', datetime.now().strftime('%Y-%m-%d'))
    customer = request.form.get('customer', 'Okänd Kund')
    machine_name   = request.form.get("machine_name")
    machine_number = request.form.get("machine_number")
    machine_display = f"{machine_name} ({machine_number})"
    signature = request.form.get('signature', '') # <-- NY KOD: Hämta signaturen

    comments_json = request.form.get('comments_json', '[]')
    comments_data = json.loads(comments_json)

    soup = BeautifulSoup(html_content, "html.parser")
    for box in soup.select(".service-info-box"):
        box.decompose()
    document = Document()
    
    document.add_picture(resource_path("static/images/apab_logo.png"), width=Inches(3.0))
    p = document.add_paragraph(); p.add_run(TRANSLATIONS[lang]['report_title']).bold = True
    p.runs[0].font.size = Pt(24); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    document.add_paragraph()
    
    # Ändra till 4 rader för att inkludera signaturen
    info_table = document.add_table(rows=4, cols=2) 
    info_table.columns[0].width = Inches(1.5); info_table.columns[1].width = Inches(4.5)
    
    cell_label_c = info_table.cell(0, 0).paragraphs[0]; cell_label_c.add_run('Kund:').bold = True; cell_label_c.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    info_table.cell(0, 1).text = customer
    cell_label_m = info_table.cell(1, 0).paragraphs[0]; cell_label_m.add_run('Maskin:').bold = True; cell_label_m.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    info_table.cell(1, 1).text = machine_display
    cell_label_d = info_table.cell(2, 0).paragraphs[0]; cell_label_d.add_run('Inspektionsdatum:').bold = True; cell_label_d.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    info_table.cell(2, 1).text = inspection_date
    
    # NY KOD: Lägg till signatur i infotabellen
    cell_label_s = info_table.cell(3, 0).paragraphs[0]; cell_label_s.add_run('Signatur:').bold = True; cell_label_s.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    info_table.cell(3, 1).text = signature # <-- Sätt signaturvärdet här

    document.add_page_break()

    add_table_of_contents(document, TRANSLATIONS[lang]['toc_title'])
    document.add_page_break()


    filtered_comments = [
        c for c in comments_data
        if c.get("station", "").strip().lower() != "övrigt"
    ]


    if comments_data:
        if lang == "sv":
            summary_title = "Summering"
            headers = ["Status", "Åtgärd", "Kommentar"]
            status_text = "Anm."
        else:
            summary_title = "Summary"
            headers = ["Status", "Action", "Comment"]
            status_text = "Note"

        document.add_heading(summary_title, level=2)

        # Gruppera kommentarer per station
        grouped = defaultdict(list)
        for c in filtered_comments:
            grouped[c["station"]].append(c)

        # Bygg tabell per station
        for station, items in grouped.items():
            # Stationsrubrik
            document.add_heading(station, level=3)

            table = document.add_table(rows=1, cols=3, style="Table Grid")
            hdr_cells = table.rows[0].cells
            hdr_cells[0].text = headers[0]
            hdr_cells[1].text = headers[1]
            hdr_cells[2].text = headers[2]

            for item in items:
                row = table.add_row().cells
                row[0].text = status_text
                row[1].text = item["action"]
                row[2].text = item["comment"]

        document.add_page_break()



    for element in soup.children:
        if not hasattr(element, 'name') or not element.name: continue
        text = element.get_text(strip=True)
        if not text: continue
        
        if element.name == 'h1': document.add_heading(text, level=2)
        elif element.name == 'h2': document.add_heading(text, level=3)
        elif element.name == 'div' and 'na-bar' in element.get('class', []):
            document.add_paragraph(f"{text} (Ej aktuell)", style='List Bullet')
        elif element.name == 'table':
            rows_data = [[cell.get_text(strip=True) for cell in row.find_all(['th', 'td'])] for row in element.find_all('tr')]
            if rows_data and rows_data[0]:
                try:
                    doc_table = document.add_table(rows=1, cols=len(rows_data[0]), style='Table Grid')
                    header_cells = doc_table.rows[0].cells
                    for j, cell_text in enumerate(rows_data[0]):
                        header_cells[j].text = cell_text
                        set_cell_shade(header_cells[j], 'FFC000')
                    for i in range(1, len(rows_data)):
                        row_cells = doc_table.add_row().cells
                        for j, cell_text in enumerate(rows_data[i]):
                            row_cells[j].text = cell_text
                    document.add_paragraph()
                except IndexError: print("Skipping malformed table.")

    # 🧠 Fallback: försök tolka från originalfilnamn om kund/maskin är okända
    original_filename = request.form.get("original_filename")

    if original_filename and (
            customer == "Okänd Kund" or not machine_number
        ):
            parsed_customer, parsed_machine_name, parsed_machine_number = parse_filename_for_info(
                original_filename,
                lang
            )

            if customer == "Okänd Kund" and parsed_customer != "Okänd Kund":
                customer = parsed_customer

            if machine_number is None and parsed_machine_number:
                machine_name = parsed_machine_name
                machine_number = parsed_machine_number

    if not machine_number:
        print("❌ EXPORT STOPPAD: machine_number saknas")
        return jsonify({
            "error": "machine_number saknas vid export",
            "debug": {
                "customer": customer,
                "machine_name": machine_name,
                "machine_number": machine_number,
                "original_filename": original_filename
            }
        }), 400
    
    doc_io = BytesIO()
    document.save(doc_io)
    doc_io.seek(0)
    
    filename_prefix = TRANSLATIONS[lang]['report_title']
    
    download_name = f"{filename_prefix}_{customer.replace(' ', '_')}_{machine_number.replace(' ', '_')}_{inspection_date}.docx"
    
    try:
        add_inspection(
            customer=customer, 
            machine_name=machine_name,
            machine_number=machine_number, 
            inspection_date=inspection_date,
            comments=comments_data
            )
        print(f"INFO: Inspection added for {customer} - {machine_number} on {inspection_date}")
    except Exception as e:
        print(f"Error saving inspection: {e}")

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

    upsert_inspection_history(
        customer=customer,
        machine_name=machine_name,
        machine_number=machine_number,
        inspection_date=inspection_date,
        json_path=inspection_path,
    )

    return send_file(doc_io, as_attachment=True, download_name=download_name, mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document")


@app.route('/sw.js')
def service_worker():
    return send_from_directory('.', 'sw.js')  

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
