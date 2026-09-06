#!/usr/bin/env bash
# =============================================================
#  نسخ احتياطي يومي لقاعدة بيانات نظام بيان
# -------------------------------------------------------------
#  تشغيل يدوي:      bash backup.sh
#  تثبيت جدولة يومية: bash backup.sh --install
#  استرجاع نسخة:     bash backup.sh --restore /path/to/dump.sql.gz
#
#  ⚠️ نسخة احتياطية لم تُختبر ليست نسخة احتياطية.
#     جرّب الاسترجاع على خادم تجريبي مرة كل ربع سنة على الأقل.
# =============================================================

set -euo pipefail

APP_DIR="/opt/bayan"
BACKUP_DIR="$APP_DIR/backups"
KEEP_DAYS=30
STAMP="$(date +%Y-%m-%d_%H%M)"

cd "$APP_DIR/supabase"

# ---------- تثبيت الجدولة ----------
if [[ "${1:-}" == "--install" ]]; then
  SELF="$(readlink -f "$0")"
  ( crontab -l 2>/dev/null | grep -v "$SELF" ; echo "30 2 * * * bash $SELF >> $APP_DIR/backup.log 2>&1" ) | crontab -
  echo "✅ تم تثبيت نسخة احتياطية يومية الساعة 2:30 فجراً."
  echo "   السجل: $APP_DIR/backup.log"
  crontab -l | grep backup
  exit 0
fi

# ---------- الاسترجاع ----------
if [[ "${1:-}" == "--restore" ]]; then
  FILE="${2:-}"
  [[ -f "$FILE" ]] || { echo "الملف غير موجود: $FILE"; exit 1; }
  echo "⚠️  سيُستبدل محتوى قاعدة البيانات بالكامل بمحتوى: $FILE"
  read -r -p "اكتب  YES  للمتابعة: " ok
  [[ "$ok" == "YES" ]] || { echo "أُلغي."; exit 1; }
  gunzip -c "$FILE" | docker compose exec -T db psql -U postgres -d postgres
  echo "✅ تم الاسترجاع."
  exit 0
fi

# ---------- النسخ ----------
mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/bayan_$STAMP.sql.gz"

echo "[$(date '+%F %T')] بدء النسخ الاحتياطي…"
docker compose exec -T db pg_dumpall -U postgres | gzip -9 > "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
# نسخة تالفة أصغر من 10 كيلوبايت غالباً تعني فشلاً صامتاً
BYTES="$(stat -c%s "$OUT")"
if (( BYTES < 10240 )); then
  echo "[$(date '+%F %T')] ❌ النسخة صغيرة بشكل مريب ($SIZE) — يُرجَّح فشلها."
  exit 1
fi

# ---------- تنظيف النسخ القديمة ----------
find "$BACKUP_DIR" -name "bayan_*.sql.gz" -mtime +$KEEP_DAYS -delete

COUNT="$(find "$BACKUP_DIR" -name 'bayan_*.sql.gz' | wc -l)"
echo "[$(date '+%F %T')] ✅ اكتمل: $OUT ($SIZE) — إجمالي النسخ المحفوظة: $COUNT"

# =============================================================
#  ⚠️ مهم: النسخ أعلاه على نفس الخادم — لا تحمي من فقده.
#
#  انسخها خارج الخادم إلى تخزين داخل المملكة. مثال بـ rclone
#  إلى تخزين كائني سعودي، أضِفه بعد ضبط rclone config:
#
#     rclone copy "$OUT" ksa-storage:bayan-backups/ --no-traverse
#
#  أو اسحبها لجهاز داخل الجمعية عبر scp من طرف الجهاز:
#     scp root@<الخادم>:/opt/bayan/backups/*.sql.gz /نسخ/بيان/
# =============================================================
