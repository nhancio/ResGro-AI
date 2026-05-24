#!/usr/bin/env bash
# One-time GCS setup for large ResGro agent uploads (signed URLs from browser).
#
# Usage (from repo root, with gcloud auth and project set):
#   ./scripts/setup-gcs-uploads.sh
#
# Optional env:
#   GCP_PROJECT_ID=resgro-ai
#   GCP_REGION=us-west2
#   GCS_UPLOAD_BUCKET=resgro-ai-uploads

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT="${GCP_PROJECT_ID:-resgro-ai}"
REGION="${GCP_REGION:-us-west2}"
BUCKET="${GCS_UPLOAD_BUCKET:-resgro-ai-uploads}"

echo "Project:  $PROJECT"
echo "Region:   $REGION"
echo "Bucket:   gs://$BUCKET"

if ! gcloud storage buckets describe "gs://${BUCKET}" --project="$PROJECT" &>/dev/null; then
  echo "→ Creating bucket gs://${BUCKET} …"
  gcloud storage buckets create "gs://${BUCKET}" \
    --project="$PROJECT" \
    --location="$REGION" \
    --uniform-bucket-level-access
else
  echo "→ Bucket already exists"
fi

echo "→ Lifecycle: delete objects after 2 days"
cat > /tmp/resgro-gcs-lifecycle.json <<'EOF'
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": { "age": 2 }
    }
  ]
}
EOF
gcloud storage buckets update "gs://${BUCKET}" --lifecycle-file=/tmp/resgro-gcs-lifecycle.json --project="$PROJECT"

echo "→ CORS for app.resgro.ai + local dev"
cat > /tmp/resgro-gcs-cors.json <<'EOF'
[
  {
    "origin": [
      "https://app.resgro.ai",
      "https://resgro.ai",
      "https://www.resgro.ai",
      "http://localhost:5173",
      "http://127.0.0.1:5173"
    ],
    "method": ["GET", "PUT", "HEAD", "OPTIONS"],
    "responseHeader": ["Content-Type", "Content-Length", "x-goog-resumable"],
    "maxAgeSeconds": 3600
  }
]
EOF
gcloud storage buckets update "gs://${BUCKET}" --cors-file=/tmp/resgro-gcs-cors.json --project="$PROJECT"

# Cloud Run agents service account (default compute SA unless custom)
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
RUN_SA="${CLOUD_RUN_SA:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"

echo "→ Grant Storage Object Admin on bucket to $RUN_SA"
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --project="$PROJECT" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/storage.objectAdmin" \
  --quiet

echo "→ Allow Cloud Run SA to sign URLs (token creator on itself)"
gcloud iam service-accounts add-iam-policy-binding "$RUN_SA" \
  --project="$PROJECT" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --quiet

echo ""
echo "Done. Add to .env.gcp:"
echo "  GCS_UPLOAD_BUCKET=${BUCKET}"
echo "  GCS_SIGNING_SERVICE_ACCOUNT=${RUN_SA}"
echo ""
echo "Then redeploy agents: ./deploy.sh gcp agents"
