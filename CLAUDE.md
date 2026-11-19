# AI-CustomerHunter — Proje Kuralları

## Mimari & Teknoloji
- **Çalışma Ortamı:** Node.js 22 (`server.js`, `lib/*`, `public/*`). Tek dış bağımlılık: `nodemailer` (MIT-0, SMTP e-posta gönderimi).
- **Port & Kalıcı Veri:** Varsayılan port `3090`, kalıcı veri dizini `DATA_DIR` (`/data`):
  - `db.json` — ortak ekip kampanya ve fırsat havuzu (atomik yazım, maks 300 lead budaması; `replied`/`converted` korunur).
  - `auth.json` (`0600`) — kullanıcı hesapları ve tek kullanımlık onay `jti` kayıtları.
  - `settings.json` (`0600`) — yönetim paneli ayarları (Google OAuth, SMTP, LLM/Çeviri, Telegram bildirimleri); `.env` değerlerine baskın gelir, gizli alanlar maskeli döner.
  - `secret.key` (`0600`) — `SECRET_KEY` verilmemişse otomatik üretilen HS256 oturum anahtarı.
- **Modüller (`lib/`):**
  - `lib/store.js` — atomik JSON depolama, kullanıcı/ayar yönetimi, gizli alan maskeleme ve hedef değişikliği koruması.
  - `lib/auth.js` — PBKDF2-HMAC-SHA256 yerel yönetici girişi (2FA yok), HS256 JWT çerez (`__Host-customerhunter_oturum` HTTPS'te), kaba kuvvet koruması, Google OAuth 2.0 (PKCE + OIDC), tek kullanımlık `/onay` akışı.
  - `lib/mailer.js` — `nodemailer` ile STARTTLS/SSL e-posta gönderimi (başvuru bildirimi, onay/ret e-postası, deneme e-postası).
  - `lib/notifier.js` — Telegram Bot API ile yüksek ihtimalli yeni fırsat bildirimleri (`/yonetim/bildirimler`, minimum ihtimal eşiği, en fazla 5 sohbet hedefi ve deneme bildirimi).
  - `lib/yonetim.js` — yalnızca `role === "admin"` erişimli sol yönetim menüsü (`/yonetim/*`) ve `/api/yonetim/*` uçları.
  - `lib/translate.js` — 2 dilli (`tr`/`en`) içerik çeviri zinciri: `lead.i18n` kalıcı önbellek → LLM API (Gemini varsayılan `gemini-3.5-flash-lite` / Anthropic / OpenAI) → MyMemory resmi ücretsiz API (450 bayt parçalama) → Orijinal metin (resmi olmayan `gtx` kullanılmaz).
  - `lib/portfolio.js` — 8 AppCook portföy ürünü ve statik TR/EN çevirili 9 örnek başlangıç fırsatı.
- **Ön Yüz (`public/`):**
  - AppCook giriş kiti (`/giris`, `giris.html`, `appcook-giris.css/js`, `appcook-fonts/*`) ve AppCook v2 teması (`appcook-tema.css`, `appcook-kabuk.js`).
  - Sade Kartlı Satış Masası (4 sekme: **Fırsatlar**, **Müşteri Takibi**, **Rakip Şikayetleri**, **Ürün Ekle**), yalnızca **TR / EN** dil seçici, Açık/Koyu tema geçişi, Türkçe anlam önizlemeli 3 tonlu yanıt taslağı.
- **Gerçek Tarama Kaynakları:** Reddit JSON API, HackerNews Algolia API, GitHub Issues API (`POST /api/scan`). Sentetik/uydurma kayıt üretilmez.

## Yayın (Hostinger `2.24.62.11`)
- **Canlı Adres:** `https://customerhunter.appcook.store`
- **Sunucu Dizini & Konteyner:** `/opt/customerhunter`, Docker Compose projesi `customerhunter`, konteyner `customerhunter-app-1` (`customerhunter:3090`, `mem_limit: 256m`, `platform` ağı, `TZ=Europe/Istanbul`).
- **Yayın Komutu:**
  ```powershell
  $null | powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Projects\AI-CustomerHunter\deploy\yayinla.ps1" -Sunucu 2.24.62.11 -AlanAdi customerhunter.appcook.store
  ```
- **Sağlık Kontrolü:** `https://customerhunter.appcook.store/api/health` → `{"ok":true,"status":"healthy"}`
