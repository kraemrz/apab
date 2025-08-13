# I filen: database.py
from peewee import *
from playhouse.shortcuts import model_to_dict
from datetime import datetime

db = SqliteDatabase('inspections.db')

# MODELL 1: Huvudinspektionen (nästan oförändrad)
class Inspection(Model):
    customer = CharField()
    machine = CharField()
    inspection_date = DateField()
    inspector = CharField(null=True) 
    notes = TextField(null=True)

    class Meta:
        database = db

# --- NY MODELL 2: För kommentarer ---
class InspectionComment(Model):
    # Länken till huvudinspektionen. backref='comments' är en smidig genväg.
    inspection = ForeignKeyField(Inspection, backref='comments')
    station_name = CharField()
    comment_text = TextField()

    class Meta:
        database = db

# --- UPPDATERAD FUNKTION ---
def init_db():
    """Skapar BÅDA tabellerna om de inte finns."""
    with db:
        db.create_tables([Inspection, InspectionComment])

# --- HELT NY, MER KRAFTFULL FUNKTION ---
def add_inspection(customer, machine, inspection_date, inspector=None, notes=None, comments=None):
    """
    Sparar en ny inspektion OCH alla tillhörande kommentarer i en säker transaktion.
    'comments' förväntas vara en lista av dicts, t.ex. [{'station': 'Station 101', 'comment': 'Text här'}]
    """
    with db.atomic() as transaction: # Säkerställer att allt sparas, eller inget alls.
        try:
            # 1. Skapa huvud-inspektionen
            new_inspection = Inspection.create(
                customer=customer,
                machine=machine,
                inspection_date=inspection_date,
                inspector=inspector,
                notes=notes
            )

            # 2. Om det finns kommentarer, loopa igenom och spara dem
            if comments:
                for comment_data in comments:
                    InspectionComment.create(
                        inspection=new_inspection, # Koppla till den nyss skapade inspektionen
                        station_name=comment_data['station'],
                        comment_text=comment_data['comment']
                    )
            
            print(f"Sparade inspektion för {machine} med {len(comments or [])} kommentar(er).")

        except Exception as e:
            print(f"Ett fel uppstod. Transaktionen rullas tillbaka. Fel: {e}")
            transaction.rollback() # Rulla tillbaka ändringarna


def get_history_for_machine(machine_id):
    """
    Hämtar all historik för en specifik maskin, INKLUSIVE alla tillhörande kommentarer.
    """
    with db:
        # STEG 1: Använd den explicita prefetch-metoden. Detta är korrekt och robust.
        inspections_query = Inspection.select().where(Inspection.machine == machine_id).order_by(Inspection.inspection_date.desc()).prefetch(InspectionComment)

        results = []
        for inspection in inspections_query:
            inspection_dict = model_to_dict(inspection)
            
            # STEG 2: Använd det korrekta attributet som definieras av `backref='comments'`.
            # Detta är den korrekta raden.
            inspection_dict['comments'] = [model_to_dict(comment) for comment in inspection.comments]
            
            results.append(inspection_dict)
        
        return results

if __name__ == '__main__':
    print("Initierar databas (skapar tabeller om de saknas)...")
    init_db()
    print("Klar.")