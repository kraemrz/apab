# I filen: test_db_connection.py
import os
import sys
from dotenv import load_dotenv
from peewee import OperationalError, InterfaceError, InternalError
# Importa din databasmodul för att få tillgång till db-objektet och modellerna
from database import db, Inspection, InspectionComment # Importa Inspection/InspectionComment även om vi inte använder dem direkt, för att säkerställa att db är konfigurerad


def test_database_connection():
    """
    Försöker ansluta till databasen och utföra en enkel fråga för att verifiera anslutningen.
    """
    print("--- Testar databasanslutning ---")

    # Ladda miljövariabler (krävs om du kör denna fil direkt)
    # Observera att din database.py redan kör load_dotenv(), så detta är en redundans
    # om du importerar från database.py, men skadar inte.
    load_dotenv() 
    
    # Försök att ansluta till databasen
    try:
        db.connect()
        print("✅ Lyckades ansluta till databasen!")

        # Försök att göra en enkel operation för att bekräfta att anslutningen fungerar
        # En enkel SELECT COUNT(*) FROM table är bra för att testa.
        # Vi använder Inspection-modellen, men vi ändrar inget.
        count = Inspection.select().count()
        print(f"Databasen innehåller {count} inspektioner. (Enkel fråga lyckades)")
        
        # Om vi vill testa specifikt om en table existerar (vid första initieringen)
        # Man kan också köra db.create_tables() här om man vill testa och skapa
        # tabellerna vid samma tillfälle, men då bör man hantera om de redan finns.
        # if db.is_closed(): db.connect() # Re-connect if closed by other operations
        # db.create_tables([Inspection, InspectionComment], safe=True) # safe=True förhindrar fel om de redan finns
        # print("✅ Tabeller verifierade/skapade.")

    except OperationalError as e:
        print(f"❌ Anslutningsfel (OperationalError): {e}", file=sys.stderr)
        print("Kontrollera dina databasuppgifter i .env-filen (DB_USER, DB_PASSWORD, DB_HOST, DB_PORT).", file=sys.stderr)
        print("Se också till att databas-servern är igång och tillgänglig från din miljö.", file=sys.stderr)
        sys.exit(1)
    except InterfaceError as e:
        print(f"❌ Gränssnittsfel (InterfaceError): {e}", file=sys.stderr)
        print("Detta kan tyda på problem med databasdrivrutinen (t.ex. psycopg2).", file=sys.stderr)
        sys.exit(1)
    except InternalError as e:
        print(f"❌ Internt fel i databasen (InternalError): {e}", file=sys.stderr)
        print("Detta kan vara ett databas-specifikt fel, kontrollera databasens egna loggar.", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"❌ Ett oväntat fel uppstod: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        # Stäng anslutningen oavsett om det lyckades eller misslyckades
        if not db.is_closed():
            db.close()
            print("Databasanslutningen stängd.")
    
    print("--- Databasanslutningstest avslutat ---")

if __name__ == '__main__':
    test_database_connection()