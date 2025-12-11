from minio import Minio
from datetime import timedelta
import io
import os
from urllib.parse import quote


use_test = os.getenv("USE_TEST_DB", "1") == "1"

if use_test:
    # Internt endpoint (inne i docker-nätet)
    endpoint        = os.getenv("MINIO_TEST_ENDPOINT", "minio-test:9000")
    access          = os.getenv("MINIO_TEST_USER")
    secret          = os.getenv("MINIO_TEST_PASSWORD")
    bucket          = "apab-test-reports"
    # URL som din browser ska använda
    PUBLIC_MINIO_URL = os.getenv("PUBLIC_MINIO_URL", "http://localhost:9002")
else:
    endpoint        = os.getenv("MINIO_PROD_ENDPOINT", "minio-prod:9000")
    access          = os.getenv("MINIO_PROD_USER")
    secret          = os.getenv("MINIO_PROD_PASSWORD")
    bucket          = "apab-prod-reports"
    PUBLIC_MINIO_URL = os.getenv("PUBLIC_MINIO_URL", "https://din-minio-prod-url:9000")

minio_client = Minio(endpoint, access_key=access, secret_key=secret, secure=False)

# Se till att bucketen finns
if not minio_client.bucket_exists(bucket):
    minio_client.make_bucket(bucket)

def minio_upload_pdf(object_path, pdf_bytes):
    minio_client.put_object(
        bucket,
        object_path,
        data=io.BytesIO(pdf_bytes),
        length=len(pdf_bytes),
        content_type="application/pdf",
    )

def fetch_pdf(object_path: str) -> bytes:
    response = minio_client.get_object(bucket, object_path)
    data = response.read()
    response.close()
    response.release_conn()
    return data

def get_pdf_url(object_path: str) -> str:
    return f"/download_report?path={quote(object_path)}"

def delete_report(object_path: str) -> bool:
    try:
        minio_client.remove_object(bucket, object_path)
        return True
    except Exception as e:
        print("Error deleting report from MinIO:", e)
        return False
    
def list_reports(prefix: str = ""):
    objects = minio_client.list_objects(bucket, prefix=prefix, recursive=True)
    result = []
    for obj in objects:
        path = obj.object_name
        url = get_pdf_url(path)
        result.append({
            "path": path,
            "url": url,
        })
    return result