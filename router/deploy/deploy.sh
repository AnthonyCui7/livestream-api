#!/bin/bash
# Build + push the router image (arm64 — the router EC2 is a t4g) and deploy
# the Caddy+router compose stack to the EC2 host over SSH.
#
# Secrets never leave AWS: the .env consumed by compose is generated ON the
# instance from Secrets Manager via the instance role, mode 600.
#
# Usage: ./deploy.sh [--skip-build]
set -euo pipefail

REGION="us-east-1"
REGISTRY="519659320853.dkr.ecr.us-east-1.amazonaws.com"
IMAGE="$REGISTRY/livestream-router:latest"
HOST="44.218.15.199"
SSH_KEY="$HOME/.ssh/livestream-debug.pem"
SECRET_ARN="arn:aws:secretsmanager:us-east-1:519659320853:secret:livestream/worker-secrets-Z8TfVV"
FRONTEND_ORIGIN="https://clipfarmlive.tech,https://www.clipfarmlive.tech,http://localhost:5173,http://127.0.0.1:5173"

SSH=(/usr/bin/ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "ec2-user@$HOST")
cd "$(dirname "$0")"

if [[ "${1:-}" != "--skip-build" ]]; then
    echo "== Building and pushing $IMAGE"
    aws ecr get-login-password --region "$REGION" \
        | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
    docker buildx build --platform linux/arm64 -t "$IMAGE" --push .. >/dev/null
fi

echo "== Shipping compose files to $HOST:/opt/clipfarm"
tar cz Caddyfile docker-compose.yml | "${SSH[@]}" \
    "sudo mkdir -p /opt/clipfarm && sudo tar xz -C /opt/clipfarm"

echo "== Deploying on the instance"
"${SSH[@]}" "bash -s" <<REMOTE
set -euo pipefail

# docker compose plugin (not packaged on Amazon Linux 2023)
if ! sudo docker compose version >/dev/null 2>&1; then
    sudo mkdir -p /usr/local/lib/docker/cli-plugins
    sudo curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-\$(uname -m)" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

# Regenerate .env from Secrets Manager on every deploy (values stay on-box).
BUNDLE="\$(aws secretsmanager get-secret-value --region $REGION --secret-id "$SECRET_ARN" --query SecretString --output text)"
sudo install -m 600 /dev/null /opt/clipfarm/.env
sudo tee /opt/clipfarm/.env >/dev/null <<ENV
SUPABASE_URL=https://lctugqzqonnfyzpmenne.supabase.co
SUPABASE_ANON_KEY=\$(jq -r .SUPABASE_ANON_KEY <<<"\$BUNDLE")
SUPABASE_SERVICE_ROLE_KEY=\$(jq -r .SUPABASE_SERVICE_ROLE_KEY <<<"\$BUNDLE")
SUPABASE_STORAGE_BUCKET=clips
FRONTEND_ORIGIN=$FRONTEND_ORIGIN
AWS_REGION=$REGION
WORKER_AMI_ID=ami-02e447f4c654c7179
WORKER_INSTANCE_TYPE=c7g.xlarge
WORKER_SECURITY_GROUP_IDS=sg-0f869299689f74a47
WORKER_IAM_INSTANCE_PROFILE=livestream-worker-profile
WORKER_SECRETS_ARN=$SECRET_ARN
WORKER_KEY_NAME=livestream-debug
WORKER_IMAGE_URI=$REGISTRY/livestream-container:latest
WORKER_EBS_VOLUME_SIZE_GB=100
WORKER_TAG_PROJECT=livestream-clipper
WORKER_S3_BUCKET=livestream-media-519659320853
LOG_LEVEL=INFO
ENV
unset BUNDLE

cd /opt/clipfarm
aws ecr get-login-password --region $REGION \
    | sudo docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
sudo docker compose pull -q
# The pre-compose standalone router held port 80; clear both names before up.
sudo docker rm -f router caddy >/dev/null 2>&1 || true
sudo docker compose up -d

# Wait for the certificate + healthy router (HTTP-01 runs on first boot).
for i in \$(seq 1 45); do
    code="\$(curl -s -o /dev/null -w '%{http_code}' \
        --resolve api.clipfarmlive.tech:443:127.0.0.1 \
        https://api.clipfarmlive.tech/health || true)"
    if [ "\$code" = "200" ]; then
        echo "HTTPS health OK (valid certificate)"
        exit 0
    fi
    sleep 2
done
echo "HTTPS health did not come up; caddy logs:" >&2
sudo docker compose logs --tail 30 caddy >&2
exit 1
REMOTE
