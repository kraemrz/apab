from peewee import *
from database import db, Inspection, InspectionComment, ServiceReport, InspectionHistory

class SchemaVersion(Model):
    version = IntegerField()

    class Meta:
        database = db
        table_name = "schema_version"

def init_db_if_needed():
    with db:
        db.create_tables([SchemaVersion])

        row = SchemaVersion.select().first()
        if row and row.version >= 1:
            print("✅ DB already initialized")
            return

        print("🚀 Initializing database schema...")
        db.create_tables([
            Inspection,
            InspectionComment,
            ServiceReport, 
            InspectionHistory,
        ])

        if row:
            row.version = 1
            row.save()
        else:
            SchemaVersion.create(version=1)

        print("✅ Database initialized")

if __name__ == "__main__":
    init_db_if_needed()
