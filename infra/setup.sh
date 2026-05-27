#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="bmon-osrs-multiplot"
REGION="australia-southeast1"
SERVICE_NAME="lightbearer-sim"
AR_REPO="lightbearer-sim"
TRIGGER_NAME="lightbearer-sim-deploy"
SA_NAME="lightbearer-sim-sa"

GITHUB_OWNER="bmon"
GITHUB_REPO="osrs-lightbearer-sim"

# ---------------------------------------------------------------------------

SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
SA_RESOURCE="projects/${PROJECT_ID}/serviceAccounts/${SA}"

echo "==> Enabling APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project="$PROJECT_ID"

echo "==> Creating Artifact Registry repository..."
gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --project="$PROJECT_ID" 2>/dev/null || echo "    (already exists, skipping)"

echo "==> Creating service account..."
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="Lightbearer Sim Service Account" \
  --project="$PROJECT_ID" 2>/dev/null || echo "    (already exists, skipping)"

echo "==> Granting service account permissions..."
for role in roles/run.admin roles/artifactregistry.writer roles/logging.logWriter roles/storage.objectAdmin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA}" \
    --role="$role" \
    --condition=None
done

gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --member="serviceAccount:${SA}" \
  --role="roles/iam.serviceAccountUser" \
  --project="$PROJECT_ID"

echo "==> Creating Cloud Build trigger (replacing if exists)..."
if gcloud builds triggers describe "$TRIGGER_NAME" --project="$PROJECT_ID" &>/dev/null; then
  echo "    Trigger exists — deleting and recreating..."
  gcloud builds triggers delete "$TRIGGER_NAME" --project="$PROJECT_ID" --quiet
fi

gcloud builds triggers create github \
  --name="$TRIGGER_NAME" \
  --repo-owner="$GITHUB_OWNER" \
  --repo-name="$GITHUB_REPO" \
  --branch-pattern="master" \
  --build-config="cloudbuild.yaml" \
  --service-account="$SA_RESOURCE" \
  --project="$PROJECT_ID"

echo ""
echo "==> Done."
echo "    Trigger '$TRIGGER_NAME' will deploy to Cloud Run service '$SERVICE_NAME'"
echo "    in region '$REGION' on every push to master."
