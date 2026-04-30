#!/usr/bin/env bash
# deploy/setup.sh — provision an Ubuntu server for firemaxxer
# Usage: sudo bash setup.sh
# Tested on: Ubuntu 22.04 / 24.04
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
DB_NAME="firemaxxer"
DB_USER="firemaxxer"
DB_PASS=""   # Set via FIREMAXXER_DB_PASS env var or prompted below
NODE_MAJOR=20
APP_DIR="/opt/firemaxxer"
APP_USER="firemaxxer"
SERVICE_NAME="firemaxxer-backend"

# ── Helpers ───────────────────────────────────────────────────────────────────
info()  { echo -e "\033[1;34m[INFO]\033[0m  $*"; }
ok()    { echo -e "\033[1;32m[ OK ]\033[0m  $*"; }
warn()  { echo -e "\033[1;33m[WARN]\033[0m  $*"; }
die()   { echo -e "\033[1;31m[ERR ]\033[0m  $*" >&2; exit 1; }

require_root() {
  [[ $EUID -eq 0 ]] || die "Run this script with sudo."
}

# ── Preflight ─────────────────────────────────────────────────────────────────
require_root
[[ -f /etc/os-release ]] && source /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || warn "This script targets Ubuntu; results may vary on ${ID:-unknown}."

# Resolve DB password
if [[ -z "${FIREMAXXER_DB_PASS:-}" ]]; then
  read -rsp "Enter a password for the PostgreSQL '${DB_USER}' user: " DB_PASS
  echo
  [[ -n "$DB_PASS" ]] || die "Password cannot be empty."
else
  DB_PASS="$FIREMAXXER_DB_PASS"
fi

# ── 1. System packages ────────────────────────────────────────────────────────
info "Updating apt..."
apt-get update -qq

info "Installing prerequisites..."
apt-get install -y -qq curl gnupg ca-certificates lsb-release

# ── 2. Node.js ────────────────────────────────────────────────────────────────
if command -v node &>/dev/null && \
   [[ "$(node -e 'process.stdout.write(process.version.slice(1).split(".")[0])')" -ge $NODE_MAJOR ]]; then
  ok "Node.js $(node --version) already installed."
else
  info "Installing Node.js ${NODE_MAJOR}..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
  ok "Node.js $(node --version) installed."
fi

# ── 3. PostgreSQL ─────────────────────────────────────────────────────────────
if dpkg -s postgresql &>/dev/null; then
  ok "PostgreSQL already installed ($(psql --version | head -1))."
else
  info "Installing PostgreSQL..."
  apt-get install -y -qq postgresql postgresql-contrib
  systemctl enable --now postgresql
  ok "PostgreSQL installed."
fi

# Create role and database (idempotent)
info "Configuring PostgreSQL user and database..."
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE "${DB_USER}" WITH LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE "${DB_USER}" WITH PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE "${DB_NAME}" OWNER "${DB_USER}"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')
\gexec
SQL
ok "PostgreSQL user '${DB_USER}' and database '${DB_NAME}' ready."

# ── 4. Redis ──────────────────────────────────────────────────────────────────
if dpkg -s redis-server &>/dev/null; then
  ok "Redis already installed."
else
  info "Installing Redis..."
  apt-get install -y -qq redis-server
  sed -i 's/^# \?bind 127.0.0.1.*/bind 127.0.0.1/' /etc/redis/redis.conf
  systemctl enable --now redis-server
  ok "Redis installed."
fi

# ── 5. nginx ──────────────────────────────────────────────────────────────────
if dpkg -s nginx &>/dev/null; then
  ok "nginx already installed."
else
  info "Installing nginx..."
  apt-get install -y -qq nginx
  systemctl enable --now nginx
  ok "nginx installed."
fi

# ── 6. App user and directories ───────────────────────────────────────────────
if id "$APP_USER" &>/dev/null; then
  ok "System user '${APP_USER}' already exists."
else
  info "Creating system user '${APP_USER}'..."
  useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER"
fi

BACKEND_DIR="${APP_DIR}/backend"
CLIENT_DIR="${APP_DIR}/client"

mkdir -p "$BACKEND_DIR" "$CLIENT_DIR" "${APP_DIR}/.npm-cache"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ── 7. .env file ──────────────────────────────────────────────────────────────
ENV_FILE="${BACKEND_DIR}/.env"
if [[ -f "$ENV_FILE" ]]; then
  warn ".env already exists at ${ENV_FILE} — skipping generation. Edit it manually if needed."
else
  info "Generating .env at ${ENV_FILE}..."
  ACCESS_SECRET=$(openssl rand -hex 32)
  REFRESH_SECRET=$(openssl rand -hex 32)
  cat > "$ENV_FILE" <<ENV
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=${ACCESS_SECRET}
JWT_REFRESH_SECRET=${REFRESH_SECRET}

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASS=your_smtp_password
FROM_EMAIL=noreply@firemaxxer.app

PORT=3003
FRONTEND_ORIGIN=https://yourdomain.example.com
ENV
  chmod 600 "$ENV_FILE"
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  warn "Review and complete ${ENV_FILE} (especially SMTP and FRONTEND_ORIGIN) before starting the service."
fi

# ── 8. nginx site config ──────────────────────────────────────────────────────
NGINX_CONF="/etc/nginx/sites-available/${SERVICE_NAME}"
if [[ -f "$NGINX_CONF" ]]; then
  ok "nginx site config already exists at ${NGINX_CONF}."
else
  info "Writing nginx site config to ${NGINX_CONF}..."
  cat > "$NGINX_CONF" <<'NGINX'
server {
    listen 80;
    server_name _;   # replace with your domain

    # Serve Vite client build
    root /opt/firemaxxer/client;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API to Express
    location /api/ {
        proxy_pass         http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
NGINX
  ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/${SERVICE_NAME}"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
  ok "nginx site config written and enabled."
fi

# ── 9. PM2 ────────────────────────────────────────────────────────────────────
PM2_HOME_DIR="${APP_DIR}/.pm2"
mkdir -p "$PM2_HOME_DIR"
chown "$APP_USER:$APP_USER" "$PM2_HOME_DIR"

if command -v pm2 &>/dev/null; then
  ok "PM2 $(pm2 --version) already installed."
else
  info "Installing PM2 globally..."
  npm install -g pm2
  ok "PM2 $(pm2 --version) installed."
fi

if [[ ! -f "/etc/systemd/system/pm2-${APP_USER}.service" ]]; then
  info "Registering PM2 with systemd for user '${APP_USER}'..."
  PM2_HOME="$PM2_HOME_DIR" pm2 startup systemd -u "$APP_USER" --hp "$PM2_HOME_DIR" --service-name "pm2-${APP_USER}"
  ok "PM2 systemd unit created."
else
  ok "PM2 systemd unit already exists."
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ok "Server provisioning complete."
echo
echo "  Next steps — run these on the server after deploying your code:"
echo
echo "  1. Build locally and copy to server:"
echo "       # backend"
echo "       cd backend && npm run build"
echo "       rsync -az dist/ package*.json ecosystem.config.cjs \\"
echo "           user@host:${BACKEND_DIR}/"
echo "       # client"
echo "       cd client && npm run build"
echo "       rsync -az dist/ user@host:${CLIENT_DIR}/"
echo
echo "  2. Install production dependencies (backend):"
echo "       sudo -u ${APP_USER} npm_config_cache=${APP_DIR}/.npm-cache npm ci --omit=dev --prefix ${BACKEND_DIR}"
echo
echo "  3. Review .env if you haven't already:"
echo "       ${ENV_FILE}"
echo
echo "  4. Run database migrations:"
echo "       sudo -u ${APP_USER} DATABASE_URL=\$(sudo grep DATABASE_URL ${ENV_FILE} | cut -d= -f2-) \\"
echo "           node ${BACKEND_DIR}/dist/config/migrate.js"
echo
echo "  5. Start the backend with PM2:"
echo "       sudo -u ${APP_USER} PM2_HOME=${PM2_HOME_DIR} \\"
echo "           pm2 start ${BACKEND_DIR}/ecosystem.config.cjs --env production"
echo "       sudo -u ${APP_USER} PM2_HOME=${PM2_HOME_DIR} pm2 save"
echo
echo "  6. (Optional) Add TLS with Certbot:"
echo "       apt-get install -y certbot python3-certbot-nginx"
echo "       certbot --nginx -d yourdomain.example.com"
echo
echo "  7. Check logs:"
echo "       sudo -u ${APP_USER} PM2_HOME=${PM2_HOME_DIR} pm2 logs"
echo "       journalctl -u nginx -f"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
