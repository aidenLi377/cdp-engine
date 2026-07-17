#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run this script as root" >&2
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
deploy_user="cdpdeploy"
deploy_root="/srv/cdp"

if ! id "$deploy_user" >/dev/null 2>&1; then
  echo "Missing deployment user: $deploy_user" >&2
  exit 1
fi

install -d -m 755 -o "$deploy_user" -g "$deploy_user" \
  "$deploy_root" \
  "$deploy_root/releases" \
  "$deploy_root/shared" \
  "$deploy_root/backups" \
  "$deploy_root/incoming" \
  /var/log/cdp

install -d -m 750 -o root -g "$deploy_user" /etc/cdp
if [[ ! -f /etc/cdp/cdp.env ]]; then
  umask 027
  secret_key="$(openssl rand -hex 32)"
  cat > /etc/cdp/cdp.env <<EOF
FLASK_ENV=production
SECRET_KEY=$secret_key
CORS_ORIGINS=https://duruo377.top,https://www.duruo377.top
CDP_DB_PATH=/srv/cdp/shared/cdp.db
LOG_DIR=/var/log/cdp
EOF
fi
chown root:"$deploy_user" /etc/cdp/cdp.env
chmod 640 /etc/cdp/cdp.env

install -m 644 "$script_dir/cdp.service" /etc/systemd/system/cdp.service
install -m 644 "$script_dir/Caddyfile" /etc/caddy/Caddyfile

cat > /etc/sudoers.d/cdpdeploy-cdp <<'EOF'
cdpdeploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart cdp.service, /usr/bin/systemctl stop cdp.service, /usr/bin/systemctl is-active cdp.service
EOF
chmod 440 /etc/sudoers.d/cdpdeploy-cdp
visudo -cf /etc/sudoers.d/cdpdeploy-cdp

systemctl daemon-reload
systemctl enable cdp.service
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy.service

echo "Server bootstrap completed"
