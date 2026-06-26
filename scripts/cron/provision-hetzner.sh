#!/usr/bin/env bash
# Provision Hetzner VPS + Hyperpool cron (keeper + daily-rewards) via CLI.
#
# Prerequisites (one-time, browser):
#   1. Hetzner Cloud account → https://console.hetzner.cloud
#   2. API token → Project → Security → API tokens (Read & Write)
#
# Usage (from repo root, on your Mac):
#   export HCLOUD_TOKEN='your-token'
#   ./scripts/cron/provision-hetzner.sh
#
# Optional env:
#   HCLOUD_SERVER_NAME=hyperpool-cron   (default)
#   HCLOUD_SERVER_TYPE=cx23             (default, ~€4/mo EU)
#   HCLOUD_LOCATION=nbg1                (Nuremberg, cheapest EU)
#   HYPERPOOL_ENV_FILE=.env.testnet     (default, copied to VPS)
#   HCLOUD_SSH_KEY=~/.ssh/hyperpool_hetzner (default)
#
# See docs/本番運用/vps-cron.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

SERVER_NAME="${HCLOUD_SERVER_NAME:-hyperpool-cron}"
SERVER_TYPE="${HCLOUD_SERVER_TYPE:-cx23}"
LOCATION="${HCLOUD_LOCATION:-nbg1}"
IMAGE="${HCLOUD_IMAGE:-ubuntu-24.04}"
SSH_KEY_PATH="${HCLOUD_SSH_KEY:-$HOME/.ssh/hyperpool_hetzner}"
ENV_SOURCE="${HYPERPOOL_ENV_FILE:-$ROOT/.env.testnet}"
REPO_URL="$(git remote get-url origin)"
REPO_SSH_URL="${REPO_URL/https:\/\/github.com\//git@github.com:}"
REPO_SSH_URL="${REPO_SSH_URL%.git}.git"

if [[ -z "${HCLOUD_TOKEN:-}" ]]; then
  echo "ERROR: Set HCLOUD_TOKEN (Hetzner Cloud → Project → Security → API tokens)"
  exit 1
fi

if [[ ! -f "$ENV_SOURCE" ]]; then
  echo "ERROR: env file not found: $ENV_SOURCE"
  exit 1
fi

if ! command -v hcloud >/dev/null 2>&1; then
  echo "==> Installing hcloud CLI (brew)..."
  brew install hcloud
fi

export HCLOUD_TOKEN

if [[ ! -f "$SSH_KEY_PATH" ]]; then
  echo "==> Generating SSH key: $SSH_KEY_PATH"
  ssh-keygen -t ed25519 -f "$SSH_KEY_PATH" -N "" -C "hyperpool-hetzner"
fi

PUBKEY="$(cat "${SSH_KEY_PATH}.pub")"
KEY_NAME="hyperpool-cron-$(whoami)"

if ! hcloud ssh-key describe "$KEY_NAME" >/dev/null 2>&1; then
  hcloud ssh-key create --name "$KEY_NAME" --public-key-from-file "${SSH_KEY_PATH}.pub"
  echo "Created Hetzner SSH key: $KEY_NAME"
fi

if hcloud server describe "$SERVER_NAME" >/dev/null 2>&1; then
  SERVER_IP="$(hcloud server ip "$SERVER_NAME")"
  echo "Server '$SERVER_NAME' already exists ($SERVER_IP). Skipping create."
else
  echo "==> Creating Hetzner server: $SERVER_NAME ($SERVER_TYPE @ $LOCATION)"
  hcloud server create \
    --name "$SERVER_NAME" \
    --type "$SERVER_TYPE" \
    --image "$IMAGE" \
    --location "$LOCATION" \
    --ssh-key "$KEY_NAME"
  SERVER_IP="$(hcloud server ip "$SERVER_NAME")"
fi

echo "==> Waiting for SSH on $SERVER_IP ..."
for i in $(seq 1 60); do
  if ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 "root@$SERVER_IP" true 2>/dev/null; then
    break
  fi
  sleep 5
  if [[ "$i" -eq 60 ]]; then
    echo "ERROR: SSH timeout"
    exit 1
  fi
done

SSH=(ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=accept-new "root@$SERVER_IP")

echo "==> Base packages + Node 20 on VPS"
"${SSH[@]}" bash -s <<'REMOTE_BASE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq git curl build-essential ca-certificates
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
id hyperpool &>/dev/null || useradd -m -s /bin/bash hyperpool
mkdir -p /opt/hyperpool /var/log/hyperpool
chown hyperpool:hyperpool /opt/hyperpool /var/log/hyperpool
REMOTE_BASE

echo "==> Deploy key for git push (daily-rewards)"
DEPLOY_PUB="$("${SSH[@]}" sudo -u hyperpool bash -lc '
  mkdir -p ~/.ssh && chmod 700 ~/.ssh
  if [[ ! -f ~/.ssh/deploy_key ]]; then
    ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -N "" -C "hyperpool-deploy"
  fi
  cat ~/.ssh/deploy_key.pub
')"
DEPLOY_PUB="$(echo "$DEPLOY_PUB" | tr -d '\r')"

if command -v gh >/dev/null 2>&1; then
  REPO_SLUG="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
  if [[ -n "$REPO_SLUG" ]]; then
    EXISTING="$(gh api "repos/${REPO_SLUG}/keys" --jq ".[] | select(.title==\"hyperpool-vps-deploy\") | .id" 2>/dev/null || true)"
    if [[ -z "$EXISTING" ]]; then
      gh api "repos/${REPO_SLUG}/keys" \
        -f title="hyperpool-vps-deploy" \
        -f key="$DEPLOY_PUB" \
        -F read_only=false >/dev/null
      echo "Added GitHub deploy key via gh CLI"
    else
      echo "GitHub deploy key already exists (hyperpool-vps-deploy)"
    fi
  fi
else
  echo "WARN: gh not found — add this deploy key manually (Allow write):"
  echo "$DEPLOY_PUB"
fi

echo "==> Clone repo + npm ci"
"${SSH[@]}" sudo -u hyperpool bash -s <<REMOTE_CLONE
set -euo pipefail
mkdir -p ~/.ssh && chmod 700 ~/.ssh
cat > ~/.ssh/config <<EOF
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/deploy_key
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
if [[ ! -d /opt/hyperpool/hyper_evm/.git ]]; then
  git clone "$REPO_SSH_URL" /opt/hyperpool/hyper_evm
else
  cd /opt/hyperpool/hyper_evm && git fetch origin && git checkout main && git pull origin main
fi
cd /opt/hyperpool/hyper_evm/frontend && npm ci
cd /opt/hyperpool/hyper_evm
git config user.email "hyperpool-cron@hyperpool.local"
git config user.name "Hyperpool VPS Cron"
REMOTE_CLONE

echo "==> Install /etc/hyperpool/env"
scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=accept-new "$ENV_SOURCE" "root@$SERVER_IP:/tmp/hyperpool.env"
"${SSH[@]}" bash -s <<'REMOTE_ENV'
set -euo pipefail
install -d -m 750 -o root -g hyperpool /etc/hyperpool
install -m 640 -o root -g hyperpool /tmp/hyperpool.env /etc/hyperpool/env
rm -f /tmp/hyperpool.env
REMOTE_ENV

echo "==> Install crontab"
"${SSH[@]}" sudo -u hyperpool env \
  HYPERPOOL_ROOT=/opt/hyperpool/hyper_evm \
  HYPERPOOL_ENV_FILE=/etc/hyperpool/env \
  HYPERPOOL_LOG_DIR=/var/log/hyperpool \
  /opt/hyperpool/hyper_evm/scripts/cron/install-vps-crontab.sh

echo ""
echo "=============================================="
echo " Hetzner cron VPS ready"
echo " Server:  $SERVER_NAME ($SERVER_IP)"
echo " SSH:     ssh -i $SSH_KEY_PATH root@$SERVER_IP"
echo " Logs:    /var/log/hyperpool/{keeper,daily}.log"
echo ""
echo " Manual test (on VPS as hyperpool):"
echo "   sudo -u hyperpool env HYPERPOOL_ROOT=/opt/hyperpool/hyper_evm HYPERPOOL_ENV_FILE=/etc/hyperpool/env /opt/hyperpool/hyper_evm/scripts/cron/run-keeper-vps.sh"
echo ""
echo " Disable Mac cron to avoid double runs:"
echo "   crontab -l | awk '/>>> hyperpool cron begin >>>/,/<<< hyperpool cron end <<</ {next} {print}' | crontab -"
echo "=============================================="
