# I filen: database.py
from peewee import *
from playhouse.shortcuts import model_to_dict
from datetime import datetime
from collections import defaultdict # Användbar för att bygga vår karta

db = SqliteDatabase('inspections.db')

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
    action_text = CharField() # <-- DET NYA, VIKTIGA FÄLTET
    comment_text = TextField()
    class Meta:
        database = db

def init_db():
    with db:
        db.create_tables([Inspection, InspectionComment])

# --- UPPDATERAD FUNKTION ---
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

# --- HELT NY, SMARTARE FUNKTION ---
def get_history_for_machine(machine_id):
    """
    Hämtar historik och bygger en karta för snabb uppslagning i frontend.
    Struktur: {'Station 101|Kontroll cylindrar': [{'date': ..., 'comment': ...}]}
    """
    # Vi behöver både kommentarstext, datum och station/åtgärd. JOIN är perfekt.
    query = (InspectionComment
             .select(InspectionComment.station_name, InspectionComment.action_text, InspectionComment.comment_text, Inspection.inspection_date)
             .join(Inspection)
             .where(Inspection.machine == machine_id)
             .order_by(Inspection.inspection_date.desc()))

    # defaultdict gör det enklare att lägga till i en lista
    history_map = defaultdict(list)
    
    for item in query:
        # Skapa en unik nyckel för varje kontrollpunkt
        key = f"{item.station_name}|{item.action_text}"
        history_map[key].append({
            'date': item.inspection.inspection_date.strftime('%Y-%m-%d'),
            'comment': item.comment_text
        })
        
    return dict(history_map) # Returnera som en vanlig dictionary

if __name__ == '__main__':
    print("Initierar databas...")
    init_db()
    print("Klar.")