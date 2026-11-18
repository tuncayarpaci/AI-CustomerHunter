#!/bin/bash
# AI-CustomerHunter (ReplyPulse AI) - sunucu platformuna (/opt/platform) kurulum / güncelleme.
#
# Kod /opt/customerhunter altına kopyalandıktan sonra root olarak çalıştırılır:
#     bash /opt/customerhunter/deploy/sunucu_kur.sh customerhunter.appcook.store 2.24.62.11
set -euo pipefail

DOMAIN="${1:-customerhunter.appcook.store}"
SERVER_IP="${2:-2.24.62.11}"
APP_DIR=/opt/customerhunter
COMPOSE=(docker compose -p customerhunter -f "$APP_DIR/deploy/compose.sunucu.yml")

log() { printf '\n==> %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "root olarak çalıştırın"; exit 1; }
if ! docker ps --format '{{.Names}}' | grep -qx platform-caddy || [ ! -x /opt/platform/bin/site-yukle.sh ]; then
  echo "Ortak platform Caddy'si (platform-caddy) çalışmıyor veya /opt/platform/bin/site-yukle.sh bulunamadı."
  exit 1
fi

cd "$APP_DIR"

log "Uygulama derleniyor ve başlatılıyor"
"${COMPOSE[@]}" up -d --build --remove-orphans
docker image prune -f >/dev/null

log "Sağlık kontrolü"
state=yok
for i in $(seq 1 30); do
  state="$(docker inspect --format '{{.State.Health.Status}}' customerhunter-app-1 2>/dev/null || echo yok)"
  [ "$state" = "healthy" ] && break
  sleep 2
done
echo "Uygulama durumu: $state"
[ "$state" = "healthy" ] || { "${COMPOSE[@]}" logs --tail 40 app; echo "Uygulama sağlıklı başlamadı."; exit 1; }

docker exec platform-caddy wget -q -O /dev/null http://customerhunter:3090/api/health \
  && echo "Ortak Caddy uygulamaya (customerhunter:3090) ulaşabiliyor." \
  || { echo "Ortak Caddy uygulamaya (customerhunter:3090) ulaşamadı."; exit 1; }

log "Caddy site tanımı yükleniyor: $DOMAIN"
NEW="$(mktemp)"
cat > "$NEW" <<EOF
# /opt/customerhunter/deploy/sunucu_kur.sh tarafından üretildi. Elle düzenlemeyin.
${DOMAIN} {
	encode gzip
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		-Server
	}
	reverse_proxy customerhunter:3090
}
EOF
bash /opt/platform/bin/site-yukle.sh customerhunter "$NEW" || { rm -f "$NEW"; exit 1; }
rm -f "$NEW"
echo "Site tanımı yüklendi: https://${DOMAIN} (Sunucu IP: ${SERVER_IP})"

log "Konteyner durumu ve bellek özeti"
"${COMPOSE[@]}" ps --format '{{.Service}}: {{.Status}}'
echo
echo "Bellek:"
docker stats --no-stream --format '  {{.Name}}: {{.MemUsage}}' | sort
exit 0
