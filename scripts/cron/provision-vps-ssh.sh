#!/usr/bin/env bash
# Configure Hyperpool cron on ANY Linux VPS via SSH (ConoHa, Oracle, DO, etc.).
# Hetzner 専用は provision-hetzner.sh を使う。
#
# Prerequisites:
#   - Ubuntu 24.04 VPS (root SSH)
#   - .env.testnet on your Mac
#   - gh logged in (optional, for deploy key)
#
# Usage:
#   export VPS_IP=203.0.113.10
#   export VPS_SSH_KEY=~/.ssh/id_ed25519   # optional
#   export VPS_USER=root                   # optional
#   ./scripts/cron/provision-vps-ssh.sh
#
# See docs/本番運用/vps-cron.md · docs/本番運用/external-cron.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

VPS_IP="${VPS_IP:?Set VPS_IP (e.g. ConoHa コントロールパネルの IP)}"
VPS_USER="${VPS_USER:-root}"
SSH_KEY_PATH="${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519}"
ENV_SOURCE="${HYPERPOOL_ENV_FILE:-$ROOT/.env.testnet}"
REPO_URL="$(git remote get-url origin)"
REPO_SSH_URL="${REPO_URL/https:\/\/github.com\//git@github.com:}"
REPO_SSH_URL="${REPO_SSH_URL%.git}.git"

if [[ ! -f "$ENV_SOURCE" ]]; then
  echo "ERROR: env file not found: $ENV_SOURCE"
  exit 1
fi

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)
[[ -f "$SSH_KEY_PATH" ]] && SSH_OPTS+=(-i "$SSH_KEY_PATH")
SSH=(ssh "${SSH_OPTS[@]}" "${VPS_USER}@${VPS_IP}")
SCP=(scp "${SSH_OPTS[@]}")

echo "==> VPS: ${VPS_USER}@${VPS_IP}"
"${SSH[@]}" true

echo "==> Base packages + Node 20"
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

echo "==> Deploy key"
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
      echo "GitHub deploy key already exists"
    fi
  fi
else
  echo "Add this deploy key to GitHub (Allow write):"
  echo "$DEPLOY_PUB"
fi

echo "==> Clone + npm ci"
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

echo "==> /etc/hyperpool/env"
"${SCP[@]}" "$ENV_SOURCE" "${VPS_USER}@${VPS_IP}:/tmp/hyperpool.env"
"${SSH[@]}" bash -s <<'REMOTE_ENV'
set -euo pipefail
install -d -m 750 -o root -g hyperpool /etc/hyperpool
install -m 640 -o root -g hyperpool /tmp/hyperpool.env /etc/hyperpool/env
rm -f /tmp/hyperpool.env
REMOTE_ENV

echo "==> crontab"
"${SSH[@]}" sudo -u hyperpool env \
  HYPERPOOL_ROOT=/opt/hyperpool/hyper_evm \
  HYPERPOOL_ENV_FILE=/etc/hyperpool/env \
  HYPERPOOL_LOG_DIR=/var/log/hyperpool \
  /opt/hyperpool/hyper_evm/scripts/cron/install-vps-crontab.sh

echo ""
echo "Done. Logs: ssh ${VPS_USER}@${VPS_IP} 'tail -f /var/log/hyperpool/daily.log'"
echo "Disable Mac cron after verifying VPS runs."
