from peewee import *
from playhouse.shortcuts import model_to_dict
from datetime import datetime
from collections import defaultdict
import os
from dotenv import load_dotenv
from urllib.parse import urlparse

load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')

if not DATABASE_URL:
    raise ValueError("DATABASE_URL saknas i .env-filen.")

url = urlparse(DATABASE_URL)
db_name = url.path[1:] # Tar bort det ledande '/'
db_user = url.username
db_password = url.password
db_host = url.hostname
db_port = url.port

if not all([db_name, db_user, db_password, db_host, db_port]):
     raise ValueError("Ofullständig DATABASE_URL i .env-filen.")

db = PostgresqlDatabase(
        db_name,
        user=db_user,
        password=db_password,
        host=db_host,
        port=db_port,
        sslmode='require'
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
    machine_number = CharField()
    created_date = DateTimeField(default=datetime.now)
    filename = CharField()
    pdf_data = BlobField()  # <-- HÄR SPARAS SJÄLVA PDF-FILEN (BYTEA)

    class Meta:
        database = db

def init_db():
    with db:
        db.create_tables([Inspection, InspectionComment, ServiceReport])

def save_service_report(machine_number, filename, pdf_bytes):
    # Säkerställ att tabellen finns
    init_db()

    # Spara med Peewee istället för SQL
    report = ServiceReport.create(
        machine_number=machine_number,
        filename=filename,
        pdf_data=pdf_bytes
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

def get_history_for_machine(machine_id):
    query = (InspectionComment
             .select(InspectionComment.station_name, InspectionComment.action_text, InspectionComment.comment_text, Inspection.inspection_date)
             .join(Inspection)
             .where(Inspection.machine == machine_id)
             .order_by(Inspection.inspection_date.desc()))

    history_map = defaultdict(list)
    
    for item in query:
        key = f"{item.station_name}|{item.action_text}"
        history_map[key].append({
            'date': item.inspection.inspection_date.strftime('%Y-%m-%d'),
            'comment': item.comment_text
        })
        
    return dict(history_map)

if __name__ == '__main__':
    print("Initierar databas...")
    init_db()
    print("Klar.")