# init_database.py
from database import db, Inspection, InspectionComment, ServiceReport


with db:
    db.create_tables([Inspection, InspectionComment, ServiceReport])
