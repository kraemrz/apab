import os
from minio import Minio
from minio.error import S3Error
import json
from datetime import datetime

# ====================== KONFIG ======================
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin123")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"

# Skapa MinIO-klient
minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=MINIO_SECURE
)

BUCKET_REPORTS = "apab-reports"
BUCKET_INSPECTIONS = "apab-inspections"

# Skapa buckets om de inte finns
for bucket in [BUCKET_REPORTS, BUCKET_INSPECTIONS]:
    try:
        if not minio_client.bucket_exists(bucket):
            minio_client.make_bucket(bucket)
            print(f"Bucket '{bucket}' skapad.")
    except S3Error as e:
        print(f"Bucket '{bucket}' fel: {e}")


def build_report_path(customer: str, machine_number: str, service_date: str):
    date_str = service_date.replace("-", "")
    return f"{customer}/{machine_number}/{date_str}.pdf"


def build_inspection_path(customer: str, machine_number: str, inspection_date: str):
    date_str = inspection_date.replace("-", "")
    return f"{customer}/{machine_number}/{date_str}.json"


def minio_upload_pdf(object_path: str, pdf_bytes: bytes):
    try:
        minio_client.put_object(
            BUCKET_REPORTS,
            object_path,
            data=pdf_bytes,
            length=len(pdf_bytes),
            content_type="application/pdf"
        )
        print(f"PDF uppladdad: {object_path}")
    except Exception as e:
        print(f"MinIO PDF upload error: {e}")
        raise


def minio_upload_json(object_path: str, data: dict):
    try:
        json_bytes = json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')
        minio_client.put_object(
            BUCKET_INSPECTIONS,
            object_path,
            data=json_bytes,
            length=len(json_bytes),
            content_type="application/json"
        )
        print(f"JSON uppladdad: {object_path}")
    except Exception as e:
        print(f"MinIO JSON upload error: {e}")
        raise


def fetch_pdf(object_path: str) -> bytes:
    try:
        response = minio_client.get_object(BUCKET_REPORTS, object_path)
        return response.read()
    except S3Error as e:
        print(f"MinIO fetch error: {e}")
        raise
    finally:
        if 'response' in locals():
            response.close()
            response.release_conn()


def fetch_json(object_path: str) -> dict:
    try:
        response = minio_client.get_object(BUCKET_INSPECTIONS, object_path)
        data = response.read()
        return json.loads(data.decode('utf-8'))
    except Exception as e:
        print(f"MinIO JSON fetch error: {e}")
        raise
    finally:
        if 'response' in locals():
            response.close()
            response.release_conn()


def get_pdf_url(object_path: str, expires=3600):
    try:
        url = minio_client.presigned_get_object(BUCKET_REPORTS, object_path, expires=expires)
        return url
    except Exception as e:
        print(f"Presigned URL error: {e}")
        return None


def list_reports(machine: str = None):
    try:
        objects = minio_client.list_objects(BUCKET_REPORTS, recursive=True)
        reports = []
        for obj in objects:
            if machine and machine not in obj.object_name:
                continue
            reports.append({
                "path": obj.object_name,
                "size": obj.size,
                "last_modified": obj.last_modified.isoformat()
            })
        return reports
    except Exception as e:
        print(f"List reports error: {e}")
        return []


def delete_report(object_path: str):
    try:
        minio_client.remove_object(BUCKET_REPORTS, object_path)
        print(f"Deleted: {object_path}")
    except Exception as e:
        print(f"Delete error: {e}")