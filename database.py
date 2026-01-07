from peewee import *
from playhouse.shortcuts import model_to_dict
from datetime import datetime
from collections import defaultdict
import os
from dotenv import load_dotenv
from urllib.parse import urlparse
from datetime import date


load_dotenv()

IS_TEST = os.getenv("TEST_ENV", "0") == "1"

# -------------------------------------------------------
# DATABASE CONFIG
# -------------------------------------------------------
if IS_TEST:
    DATABASE_URL = os.getenv("DATABASE_URL_TEST")
else:
    DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL saknas i .env-filen.")

# -------------------------------------------------------
# MINIO CONFIG
# -------------------------------------------------------
if IS_TEST:
    minio_endpoint = os.getenv("MINIO_TEST_ENDPOINT")
    access = os.getenv("MINIO_TEST_ACCESS")
    secret = os.getenv("MINIO_TEST_SECRET")
else:
    minio_endpoint = os.getenv("MINIO_PROD_ENDPOINT")
    access = os.getenv("MINIO_PROD_ACCESS")
    secret = os.getenv("MINIO_PROD_SECRET")


url = urlparse(DATABASE_URL)
db_name = url.path[1:]
db_user = url.username
db_password = url.password
db_host = url.hostname
db_port = url.port

if not all([db_name, db_user, db_password, db_host, db_port]):
     raise ValueError("Ofullständig DATABASE_URL i .env-filen.")

use_ssl ="supabase" in db_host or "pooler" in db_host

db = PostgresqlDatabase(
        db_name,
        user=db_user,
        password=db_password,
        host=db_host,
        port=db_port,
        sslmode='require' if use_ssl else None
    )

class Inspection(Model):
    customer = CharField()
    machine = CharField()
    inspection_date = DateField()
    inspector = CharField(null=True) 
    notes = TextField(null=True)
    class Meta:
        database = db

class InspectionComment(Model):
    inspection = ForeignKeyField(Inspection, backref='comments')
    station_name = CharField()
    action_text = CharField()
    comment_text = TextField()
    class Meta:
        database = db

class ServiceReport(Model):
    customer = CharField(null=True)
    machine_number = CharField()
    service_date = DateField(null=True)
    filename = CharField()
    pdf_path = CharField()  # <-- istället för pdf_data BLOB
    created_date = DateTimeField(default=datetime.now)

    class Meta:
        database = db

class InspectionHistory(Model):
    customer = CharField()
    machine = CharField()
    inspection_date = DateField()

    json_path = TextField()
    docx_path = TextField(null=True)

    created_at = DateTimeField(default=datetime.now)

    class Meta:
        database = db
        table_name = "inspection_history"
        indexes = (
        (("customer",), False),
        (("machine",), False),
        (("inspection_date",), False),
        (("customer", "machine", "inspection_date"), True),
        )


def get_last_inspection(customer, machine):
    record = (
        Inspection
        .select()
        .where(
            (Inspection.customer == customer) &
            (Inspection.machine == machine)
        )
        .order_by(Inspection.inspection_date.desc())
        .first()
    )
    return record.inspection_date if record else None


def get_service_reports_between(machine, start_date, end_date):
    query = (
        ServiceReport
        .select()
        .where(
            (ServiceReport.machine_number == machine) &
            (ServiceReport.service_date >= start_date) &
            (ServiceReport.service_date <= end_date)
        )
        .order_by(ServiceReport.service_date.asc())
    )

    return [
        {
            "id": r.id,
            "customer": r.customer,
            "machine": r.machine_number,
            "service_date": r.service_date.strftime("%Y-%m-%d") if r.service_date else None,
            "filename": r.filename,
            "pdf_path": r.pdf_path
        }
        for r in query
    ]

def save_service_report(customer, machine_number, service_date, filename, pdf_path):
    report = ServiceReport.create(
        customer=customer,
        machine_number=machine_number,
        service_date=service_date,
        filename=filename,
        pdf_path=pdf_path
    )
    return report.id

def add_inspection(customer, machine, inspection_date, inspector=None, notes=None, comments=None):
    with db.atomic() as transaction:
        try:
            new_inspection = Inspection.create(
                customer=customer,
                machine=machine,
                inspection_date=inspection_date,
                inspector=inspector,
                notes=notes
            )
            if comments:
                for comment_data in comments:
                    InspectionComment.create(
                        inspection=new_inspection,
                        station_name=comment_data['station'],
                        action_text=comment_data['action'], # <-- Spara den nya datan
                        comment_text=comment_data['comment']
                    )
            print(f"Sparade inspektion för {machine} med {len(comments or [])} kommentar(er).")
        except Exception as e:
            print(f"Transaktionen misslyckades: {e}")
            transaction.rollback()

def get_history_for_machine(machine):
    query = (InspectionComment
             .select(InspectionComment.station_name, InspectionComment.action_text, InspectionComment.comment_text, Inspection.inspection_date)
             .join(Inspection)
             .where(Inspection.machine == machine)
             .order_by(Inspection.inspection_date.desc()))

    history_map = defaultdict(list)
    
    for item in query:
        key = f"{item.station_name}|{item.action_text}"
        history_map[key].append({
            'date': item.inspection.inspection_date.strftime('%Y-%m-%d'),
            'comment': item.comment_text
        })
        
    return dict(history_map)

def list_inspection_history(
    customer: str | None = None,
    machine: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    query = InspectionHistory.select()

    if customer:
        query = query.where(InspectionHistory.customer.ilike(f"%{customer}%"))

    if machine:
        query = query.where(InspectionHistory.machine.ilike(f"%{machine}%"))

    if date_from:
        query = query.where(InspectionHistory.inspection_date >= date_from)

    if date_to:
        query = query.where(InspectionHistory.inspection_date <= date_to)

    query = query.order_by(InspectionHistory.inspection_date.desc())

    return [
        {
            "id": row.id,
            "customer": row.customer,
            "machine": row.machine,
            "inspection_date": row.inspection_date.isoformat(),
            "json_path": row.json_path,
            "docx_path": row.docx_path,
            "created_at": row.created_at.isoformat(),
        }
        for row in query
    ]

def upsert_inspection_history(
    customer: str,
    machine: str,
    inspection_date: date,
    json_path: str,
):
    record = (
        InspectionHistory
        .select()
        .where(
            (InspectionHistory.customer == customer) &
            (InspectionHistory.machine == machine) &
            (InspectionHistory.inspection_date == inspection_date)
        )
        .first()
    )

    if record:
        record.json_path = json_path
        record.save()
        return record.id
    else:
        new = InspectionHistory.create(
            customer=customer,
            machine=machine,
            inspection_date=inspection_date,
            json_path=json_path,
        )
        return new.id
