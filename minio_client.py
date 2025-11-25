from minio import Minio
import io
import os

use_test = os.getenv("USE_TEST_DB", "1") == "1"

if use_test:
    endpoint = "minio-test:9000"
    access = os.getenv("MINIO_TEST_USER")
    secret = os.getenv("MINIO_TEST_PASSWORD")
    bucket = "apab-test-reports"
else:
    endpoint = "minio-prod:9000"
    access = os.getenv("MINIO_PROD_USER")
    secret = os.getenv("MINIO_PROD_PASSWORD")
    bucket = "apab-prod-reports"

minio_client = Minio(endpoint, access_key=access, secret_key=secret, secure=False)

# se till att bucket finns
if not minio_client.bucket_exists(bucket):
    minio_client.make_bucket(bucket)

def minio_upload_pdf(object_path, pdf_bytes):
    minio_client.put_object(
        bucket,
        object_path,
        data=io.BytesIO(pdf_bytes),
        length=len(pdf_bytes),
        content_type="application/pdf"
    )

def list_reports(prefix=""):
    # Returnera tom lista tills vi implementerar det
    return []

def get_pdf_url(object_path):
    # Returnera None tills vi implementerar riktig presigned-URL
    return None

def delete_report(object_path):
    # Dummy-delete tills vi implementerar
    return True
