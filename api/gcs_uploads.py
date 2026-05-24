"""
GCS signed-URL uploads for large agent files (bypasses Cloud Run 32 MiB request limit).

Flow: client POST /api/uploads/sign → PUT each file to signed URL → POST */from-gcs.
"""

from __future__ import annotations

import os
import re
import uuid
from datetime import timedelta
from pathlib import Path
from typing import Any

try:
    import google.auth
    from google.auth.transport import requests as auth_requests
    from google.cloud import storage
    _GCS_AVAILABLE = True
except ImportError:
    _GCS_AVAILABLE = False

GCS_UPLOAD_BUCKET = os.environ.get("GCS_UPLOAD_BUCKET", "").strip()
GCS_UPLOAD_PREFIX = os.environ.get("GCS_UPLOAD_PREFIX", "uploads").strip().strip("/")
GCS_SIGNING_SERVICE_ACCOUNT = os.environ.get("GCS_SIGNING_SERVICE_ACCOUNT", "").strip()
SIGNED_URL_EXPIRY_MINUTES = int(os.environ.get("GCS_SIGNED_URL_EXPIRY_MINUTES", "30"))
MAX_UPLOAD_BYTES = int(os.environ.get("GCS_MAX_UPLOAD_BYTES", str(2 * 1024 * 1024 * 1024)))  # 2 GiB

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def uploads_enabled() -> bool:
    return bool(GCS_UPLOAD_BUCKET) and _GCS_AVAILABLE


def _safe_filename(name: str) -> str:
    base = Path(name).name or "file"
    cleaned = _SAFE_NAME.sub("_", base).strip("._")
    return cleaned[:200] or "file"


def _signing_email(credentials: Any) -> str:
    if GCS_SIGNING_SERVICE_ACCOUNT:
        return GCS_SIGNING_SERVICE_ACCOUNT
    email = getattr(credentials, "service_account_email", None)
    if email:
        return email
    raise RuntimeError(
        "Cannot determine service account for signed URLs. "
        "Set GCS_SIGNING_SERVICE_ACCOUNT in Cloud Run env."
    )


def _storage_client():
    if not _GCS_AVAILABLE:
        raise RuntimeError("google-cloud-storage is not installed")
    if not GCS_UPLOAD_BUCKET:
        raise RuntimeError("GCS_UPLOAD_BUCKET is not configured")
    return storage.Client()


def object_path_for(upload_id: str, filename: str) -> str:
    return f"{GCS_UPLOAD_PREFIX}/{upload_id}/{_safe_filename(filename)}"


def create_signed_put_url(
    object_path: str,
    content_type: str = "application/octet-stream",
) -> str:
    credentials, _project = google.auth.default()
    auth_req = auth_requests.Request()
    if not credentials.valid:
        credentials.refresh(auth_req)
    if credentials.token is None:
        credentials.refresh(auth_req)

    client = _storage_client()
    blob = client.bucket(GCS_UPLOAD_BUCKET).blob(object_path)
    return blob.generate_signed_url(
        version="v4",
        expiration=timedelta(minutes=SIGNED_URL_EXPIRY_MINUTES),
        method="PUT",
        content_type=content_type,
        service_account_email=_signing_email(credentials),
        access_token=credentials.token,
    )


def sign_files(files: list[dict[str, Any]]) -> dict[str, Any]:
    if not uploads_enabled():
        raise RuntimeError("GCS uploads are not configured (GCS_UPLOAD_BUCKET missing)")

    upload_id = str(uuid.uuid4())
    signed: list[dict[str, Any]] = []

    for spec in files:
        filename = str(spec.get("filename") or "").strip()
        if not filename:
            raise ValueError("Each file must include filename")
        size_bytes = int(spec.get("size_bytes") or 0)
        if size_bytes <= 0:
            raise ValueError(f"Invalid size for {filename}")
        if size_bytes > MAX_UPLOAD_BYTES:
            mb = size_bytes / (1024 * 1024)
            cap = MAX_UPLOAD_BYTES / (1024 * 1024)
            raise ValueError(f"{filename} is {mb:.1f} MB; maximum is {cap:.0f} MB")

        content_type = str(spec.get("content_type") or "application/octet-stream").strip()
        obj_path = object_path_for(upload_id, filename)
        signed.append(
            {
                "filename": filename,
                "object_path": obj_path,
                "upload_url": create_signed_put_url(obj_path, content_type),
                "content_type": content_type,
                "size_bytes": size_bytes,
            }
        )

    return {"upload_id": upload_id, "bucket": GCS_UPLOAD_BUCKET, "files": signed}


def download_object_to_path(object_path: str, dest: Path) -> Path:
    client = _storage_client()
    blob = client.bucket(GCS_UPLOAD_BUCKET).blob(object_path)
    if not blob.exists():
        raise FileNotFoundError(f"GCS object not found: {object_path}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    blob.download_to_filename(str(dest))
    return dest


def delete_objects(object_paths: list[str]) -> None:
    if not object_paths:
        return
    client = _storage_client()
    bucket = client.bucket(GCS_UPLOAD_BUCKET)
    for path in object_paths:
        try:
            bucket.blob(path).delete()
        except Exception:
            pass


def materialize_objects(
    objects: list[dict[str, str]],
    work: Path,
) -> tuple[list[Path], list[tuple[str, bytes]], list[str]]:
    """Download GCS objects into work dir; return (zip_paths, csv_pairs)."""
    uploaded_zips: list[Path] = []
    csv_pairs: list[tuple[str, bytes]] = []
    paths_to_delete: list[str] = []

    for obj in objects:
        object_path = str(obj.get("object_path") or "").strip()
        filename = str(obj.get("filename") or Path(object_path).name).strip()
        if not object_path:
            continue
        local = work / _safe_filename(filename)
        download_object_to_path(object_path, local)
        paths_to_delete.append(object_path)
        if filename.lower().endswith(".zip"):
            uploaded_zips.append(local)
        else:
            csv_pairs.append((filename, local.read_bytes()))

    return uploaded_zips, csv_pairs, paths_to_delete
