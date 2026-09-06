#!/usr/bin/env bash
# =============================================================
#  نظام بيان لإدارة المهام — تجهيز خادم سعودي من الصفر
# -------------------------------------------------------------
#  يُشغَّل مرة واحدة على خادم Ubuntu 22.04 أو 24.04 نظيف.
#
#  الاستخدام:
#     sudo bash setup.sh tasks.example.sa admin@example.sa
#                        ^ النطاق          ^ بريد شهادة TLS
#
#  ما يفعله:
#    1. تحديث النظام وتثبيت Docker
#    2. جلب Supabase المستضاف ذاتياً
#    3. توليد كل المفاتيح والأسرار عشوائياً (بما فيها JWT)
#    4. إعداد Caddy: شهادة TLS تلقائية + توجيه الواجهة والـ API
#    5. ضبط جدار الحماية
#    6. تشغيل كل شيء
#
#  ⚠️ لا يضع هذا السكربت أي كلمة مرور في مكان يمكن قراءته إلا
#     ملف .env المحمي (600) — احتفظ بنسخة منه في مكان آمن.
# =============================================================

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_DIR="/opt/bayan"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "الاستخدام: sudo bash setup.sh <النطاق> <البريد>"
  echo "مثال:      sudo bash setup.sh tasks.bayantasks.com it@bayan.sa"
  exit 1
fi
if [[ $EUID -ne 0 ]]; then echo "شغّله بصلاحية root:  sudo bash setup.sh ..."; exit 1; fi

say() { echo -e "\n\033[1;36m▸ $*\033[0m"; }

# ---------- 1. النظام و Docker ----------
say "تحديث النظام وتثبيت المتطلبات"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git ufw jq python3 openssl >/dev/null

if ! command -v docker &>/dev/null; then
  say "تثبيت Docker"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
fi
systemctl enable --now docker >/dev/null

# ---------- 2. جلب Supabase ----------
say "جلب Supabase المستضاف ذاتياً"
mkdir -p "$APP_DIR"
if [[ ! -d "$APP_DIR/supabase" ]]; then
  git clone --depth 1 https://github.com/supabase/supabase "$APP_DIR/supabase-src"
  mkdir -p "$APP_DIR/supabase"
  cp -r "$APP_DIR/supabase-src/docker/." "$APP_DIR/supabase/"
  rm -rf "$APP_DIR/supabase-src"
fi
cd "$APP_DIR/supabase"

# ---------- 3. توليد الأسرار ----------
if [[ -f .env && -f "$APP_DIR/.secrets-generated" ]]; then
  say "ملف .env موجود — لن أعيد توليد الأسرار (حتى لا تفقد الوصول لقاعدتك)"
else
  say "توليد الأسرار والمفاتيح"
  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  JWT_SECRET="$(openssl rand -hex 32)"
  DASHBOARD_PASSWORD="$(openssl rand -hex 12)"
  SECRET_KEY_BASE="$(openssl rand -hex 32)"
  VAULT_ENC_KEY="$(openssl rand -hex 16)"

  # توليد مفتاحَي anon و service_role كـ JWT موقّع بـ HS256
  gen_jwt() {
    python3 - "$JWT_SECRET" "$1" <<'PY'
import base64, hashlib, hmac, json, sys, time
secret, role = sys.argv[1], sys.argv[2]
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
now = int(time.time())
header  = b64(json.dumps({"alg":"HS256","typ":"JWT"},separators=(",",":")).encode())
payload = b64(json.dumps({"role":role,"iss":"supabase","iat":now,
                          "exp":now+60*60*24*365*10},separators=(",",":")).encode())
signing = f"{header}.{payload}".encode()
sig = b64(hmac.new(secret.encode(), signing, hashlib.sha256).digest())
print(f"{header}.{payload}.{sig}")
PY
  }
  ANON_KEY="$(gen_jwt anon)"
  SERVICE_ROLE_KEY="$(gen_jwt service_role)"

  cp .env.example .env
  set_env() { grep -q "^$1=" .env && sed -i "s|^$1=.*|$1=$2|" .env || echo "$1=$2" >> .env; }

  set_env POSTGRES_PASSWORD   "$POSTGRES_PASSWORD"
  set_env JWT_SECRET          "$JWT_SECRET"
  set_env ANON_KEY            "$ANON_KEY"
  set_env SERVICE_ROLE_KEY    "$SERVICE_ROLE_KEY"
  set_env DASHBOARD_USERNAME  "bayan"
  set_env DASHBOARD_PASSWORD  "$DASHBOARD_PASSWORD"
  set_env SECRET_KEY_BASE     "$SECRET_KEY_BASE"
  set_env VAULT_ENC_KEY       "$VAULT_ENC_KEY"
  set_env SITE_URL            "https://$DOMAIN"
  set_env API_EXTERNAL_URL    "https://$DOMAIN"
  set_env SUPABASE_PUBLIC_URL "https://$DOMAIN"
  set_env ADDITIONAL_REDIRECT_URLS "https://$DOMAIN"
  set_env DISABLE_SIGNUP      "false"
  set_env ENABLE_EMAIL_SIGNUP "true"
  set_env ENABLE_EMAIL_AUTOCONFIRM "true"   # لا خادم بريد بعد — يُفعَّل لاحقاً
  set_env STUDIO_DEFAULT_ORGANIZATION "جمعية بيان"
  set_env STUDIO_DEFAULT_PROJECT      "نظام إدارة المهام"

  chmod 600 .env
  touch "$APP_DIR/.secrets-generated"

  cat > "$APP_DIR/بيانات-الدخول.txt" <<EOF
=========================================================
  نظام بيان — بيانات الدخول والمفاتيح
  ⚠️ احتفظ بهذا الملف في مكان آمن ثم احذفه من الخادم
=========================================================

النطاق:                 https://$DOMAIN
لوحة تحكم Supabase:     https://$DOMAIN/studio
  اسم المستخدم:         bayan
  كلمة المرور:          $DASHBOARD_PASSWORD

—— يوضعان في js/config.js ——
SUPABASE_URL:      https://$DOMAIN
SUPABASE_ANON_KEY: $ANON_KEY

—— أسرار لا تُشارَك مع أحد ولا توضع في الموقع ——
كلمة مرور قاعدة البيانات: $POSTGRES_PASSWORD
JWT_SECRET:               $JWT_SECRET
SERVICE_ROLE_KEY:         $SERVICE_ROLE_KEY
EOF
  chmod 600 "$APP_DIR/بيانات-الدخول.txt"
fi

# ---------- 4. الواجهة و Caddy ----------
say "إعداد الواجهة وشهادة TLS"
mkdir -p "$APP_DIR/web" "$APP_DIR/caddy"

cat > "$APP_DIR/caddy/Caddyfile" <<EOF
{
  email $EMAIL
}

$DOMAIN {
  encode gzip zstd

  # واجهة النظام
  handle {
    root * /srv/web
    try_files {path} /index.html
    file_server
    header {
      Content-Security-Policy "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"
      X-Content-Type-Options "nosniff"
      X-Frame-Options "SAMEORIGIN"
      Referrer-Policy "strict-origin-when-cross-origin"
      X-Robots-Tag "noindex, nofollow"
      -Server
    }
  }

  # واجهة Supabase البرمجية
  handle /rest/* { reverse_proxy supabase-kong:8000 }
  handle /auth/* { reverse_proxy supabase-kong:8000 }
  handle /storage/* { reverse_proxy supabase-kong:8000 }
  handle /realtime/* { reverse_proxy supabase-kong:8000 }
  handle /functions/* { reverse_proxy supabase-kong:8000 }

  # لوحة تحكم Supabase — احمِها بجدار الحماية أو أوقفها بعد الإعداد
  handle /studio* { reverse_proxy supabase-kong:8000 }
}
EOF

cat > "$APP_DIR/docker-compose.caddy.yml" <<EOF
services:
  caddy:
    image: caddy:2-alpine
    container_name: bayan-caddy
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - ./web:/srv/web:ro
      - caddy_data:/data
      - caddy_config:/config
    networks: [supabase_default]

volumes:
  caddy_data:
  caddy_config:

networks:
  supabase_default:
    external: true
EOF

# ---------- 5. جدار الحماية ----------
say "ضبط جدار الحماية"
ufw allow 22/tcp  >/dev/null
ufw allow 80/tcp  >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

# ---------- 6. التشغيل ----------
say "تشغيل Supabase"
cd "$APP_DIR/supabase"
docker compose pull -q
docker compose up -d

say "انتظار جهوز قاعدة البيانات"
for i in $(seq 1 60); do
  if docker compose exec -T db pg_isready -U postgres &>/dev/null; then break; fi
  sleep 3
done

say "تشغيل Caddy"
cd "$APP_DIR"
docker compose -f docker-compose.caddy.yml up -d

cat <<EOF

=========================================================
 ✅ اكتمل التجهيز
=========================================================

  الموقع:      https://$DOMAIN   (بعد ثوانٍ لإصدار الشهادة)
  لوحة القاعدة: https://$DOMAIN/studio

  بياناتك ومفاتيحك في:
      $APP_DIR/بيانات-الدخول.txt
  ⚠️ انسخه لمكان آمن ثم:  shred -u $APP_DIR/بيانات-الدخول.txt

الخطوات التالية:
  1. ارفع ملفات النظام إلى:  $APP_DIR/web/
  2. شغّل schema.sql ثم seed.sql من لوحة القاعدة
  3. ضع SUPABASE_URL و ANON_KEY في web/js/config.js
  4. فعّل النسخ الاحتياطي:  bash backup.sh --install

=========================================================
EOF
