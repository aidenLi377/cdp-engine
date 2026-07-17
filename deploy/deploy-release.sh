#!/usr/bin/env bash
set -Eeuo pipefail

release_id="${1:-}"
artifact="${2:-}"
deploy_root="/srv/cdp"
releases_root="$deploy_root/releases"
shared_root="$deploy_root/shared"
backups_root="$deploy_root/backups"
current_link="$deploy_root/current"

if [[ ! "$release_id" =~ ^[A-Za-z0-9._-]{7,80}$ ]]; then
  echo "Invalid release id: $release_id" >&2
  exit 2
fi

if [[ "$artifact" != "$deploy_root/incoming/"* || ! -f "$artifact" ]]; then
  echo "Release artifact is missing or outside $deploy_root/incoming" >&2
  exit 2
fi

release_dir="$releases_root/$release_id"
temporary_dir="$releases_root/.${release_id}.tmp"
next_link="$deploy_root/.current.next"

mkdir -p "$releases_root" "$shared_root" "$backups_root" "$deploy_root/incoming"
exec 9>"$deploy_root/.deploy.lock"
if ! flock -n 9; then
  echo "Another deployment is already running" >&2
  exit 3
fi

if [[ -d "$release_dir" ]]; then
  echo "Release $release_id is already installed; reactivating it"
else
  rm -rf -- "$temporary_dir"
  mkdir -p "$temporary_dir"
  trap 'rm -rf -- "$temporary_dir" "$next_link"' EXIT

  tar --extract --gzip --file "$artifact" --directory "$temporary_dir" --no-same-owner

  required_files=(
    "$temporary_dir/app.py"
    "$temporary_dir/gunicorn.conf.py"
    "$temporary_dir/requirements.txt"
    "$temporary_dir/cdp-web/dist/index.html"
  )
  for required_file in "${required_files[@]}"; do
    if [[ ! -f "$required_file" ]]; then
      echo "Release is missing required file: $required_file" >&2
      exit 4
    fi
  done

  mv -- "$temporary_dir" "$release_dir"

  # Python virtualenv launchers contain absolute shebang paths, so the
  # environment must be created only after the release reaches its final path.
  if ! (
    python3 -m venv "$release_dir/.venv"
    "$release_dir/.venv/bin/python" -m pip install \
      --disable-pip-version-check \
      --no-input \
      -r "$release_dir/requirements.txt"

    set -a
    # shellcheck disable=SC1091
    source /etc/cdp/cdp.env
    set +a
    cd "$release_dir"
    "$release_dir/.venv/bin/python" -c "from app import app; assert app is not None"
  ); then
    rm -rf -- "$release_dir"
    echo "Failed to prepare release $release_id" >&2
    exit 4
  fi

  chmod -R u=rwX,go=rX "$release_dir"
fi

set -a
# shellcheck disable=SC1091
source /etc/cdp/cdp.env
set +a

if [[ -n "${CDP_DB_PATH:-}" && -f "$CDP_DB_PATH" ]]; then
  backup_file="$backups_root/cdp-$(date -u +%Y%m%dT%H%M%SZ)-${release_id:0:12}.db"
  sqlite3 "$CDP_DB_PATH" ".backup '$backup_file'"
  chmod 600 "$backup_file"
  echo "Database backup created: $backup_file"
fi

previous_release=""
if [[ -L "$current_link" ]]; then
  previous_release="$(readlink -f "$current_link" || true)"
fi

ln -s -- "$release_dir" "$next_link"
mv -Tf -- "$next_link" "$current_link"

if ! sudo -n /usr/bin/systemctl restart cdp.service; then
  echo "Failed to restart cdp.service" >&2
  if [[ -n "$previous_release" && -d "$previous_release" ]]; then
    ln -s -- "$previous_release" "$next_link"
    mv -Tf -- "$next_link" "$current_link"
    sudo -n /usr/bin/systemctl restart cdp.service || true
    echo "Rolled back to $previous_release" >&2
  else
    sudo -n /usr/bin/systemctl stop cdp.service || true
  fi
  exit 5
fi

healthy=false
for _ in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 3 \
    http://127.0.0.1:5000/api/health | grep -q '"status":"ok"'; then
    healthy=true
    break
  fi
  sleep 1
done

if [[ "$healthy" != true ]]; then
  echo "Health check failed for release $release_id" >&2
  if [[ -n "$previous_release" && -d "$previous_release" ]]; then
    ln -s -- "$previous_release" "$next_link"
    mv -Tf -- "$next_link" "$current_link"
    sudo -n /usr/bin/systemctl restart cdp.service
    echo "Rolled back to $previous_release" >&2
  else
    sudo -n /usr/bin/systemctl stop cdp.service || true
  fi
  exit 6
fi

rm -f -- "$artifact"
trap - EXIT
echo "Release $release_id is healthy and active"
