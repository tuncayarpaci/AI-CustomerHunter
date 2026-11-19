# AI-CustomerHunter

**AI-CustomerHunter**, **Reddit**, **HackerNews** ve **GitHub** üzerindeki potansiyel müşterileri ve rakip şikayetlerini yakalayan, satın alma ihtimalini puanlayan, kaynak içerikleri aktif dile göre (**TR/EN**) çeviren ve doğal yanıt taslakları üreten satış ve müşteri bulma aracıdır.

- **Canlı Adres:** `https://customerhunter.appcook.store`

---

## Öne Çıkan Özellikler

- **AppCook Yönetim Standardı:** Google ile giriş (OAuth 2.0 PKCE + OIDC), yönetici onayı, SMTP üzerinden başvuru/onay/ret e-postaları ve yalnızca yöneticilere açık sol yönetim menüsü (`/yonetim/*`; yöneticiye 2FA yoktur).
- **4 Sekmeli Satış Masası:** **Fırsatlar (Radar)**, **Müşteri Takibi**, **Rakip Şikayetleri** ve **Ürün Ekle** sekmeleri; yalnızca **Türkçe / İngilizce (TR/EN)** arayüz ve Açık/Koyu tema geçişi.
- **Gerçek Tarama Kaynakları:** Reddit Public JSON API, HackerNews Algolia API ve GitHub Issues API (`POST /api/scan`). Sentetik veya uydurma kayıt üretilmez.
- **Katmanlı Kaynak Çeviri Motoru:**
  1. `lead.i18n` kalıcı önbellek
  2. LLM API: **Google Gemini** (varsayılan `gemini-3.5-flash-lite`), **Anthropic** (`claude-haiku-4-5`) veya **OpenAI** (`gpt-4o-mini`)
  3. Ücretsiz resmi **MyMemory API** (450 bayt parçalama)
  4. Orijinal metin (yedek)
  - İngilizce yanıt taslaklarının yanında Türkçe anlam önizlemesi sunar.
- **Telegram Bildirimleri:** Gerçek Telegram Bot API üzerinden yüksek ihtimalli yeni fırsatlar için anlık bildirimler (`/yonetim/bildirimler`, minimum ihtimal eşiği ve deneme bildirimi).
- **Güvenlik ve Kaynak Sınırı:** SSRF korumalı URL analizi, CSRF `Origin` kontrolü, PBKDF2-HMAC-SHA256 parola özetleme + HS256 JWT oturum çerezi (`__Host-customerhunter_oturum`), `mem_limit: 256m` Docker konteyner sınırı.

---

## Teknoloji ve Klasör Yapısı

- **Çalışma Ortamı:** Node.js 22 (harici çerçeve yok)
- **Tek Dış Bağımlılık:** `nodemailer` (MIT-0, SMTP e-posta gönderimi)
- **Kalıcı Veri (`DATA_DIR`):** `db.json`, `auth.json` (`0600`), `settings.json` (`0600`), `secret.key` (`0600`)

```text
AI-CustomerHunter/
├── server.js                 # HTTP sunucusu, tarama, URL analizi, API uçları
├── lib/
│   ├── auth.js               # Yerel giriş (PBKDF2), HS256 JWT, Google OAuth 2.0 (PKCE+OIDC)
│   ├── mailer.js             # nodemailer ile SMTP e-posta gönderimi
│   ├── notifier.js           # Telegram Bot API bildirimleri ve deneme mesajı
│   ├── portfolio.js          # AppCook portföy ürünleri ve örnek başlangıç fırsatları
│   ├── store.js              # Atomik JSON depolama, kullanıcı ve ayar yönetimi
│   ├── translate.js          # Katmanlı TR/EN çeviri motoru (önbellek → LLM → MyMemory)
│   └── yonetim.js            # /yonetim/* sayfaları ve /api/yonetim/* uçları
├── public/
│   ├── index.html            # 4 sekmeli satış masası arayüzü
│   ├── app.js / styles.css   # Ön yüz mantığı ve stiller
│   ├── giris.html            # AppCook giriş ekranı
│   ├── yonetim.html / .js    # Sol menülü yönetim paneli
│   ├── ceviri.js / ceviri/   # TR ve EN arayüz sözlükleri
│   └── appcook-*             # AppCook v2 teması, kabuk ve yerel yazı tipleri
├── deploy/
│   ├── compose.sunucu.yml    # Sunucu Docker Compose (mem_limit: 256m, platform ağı)
│   ├── sunucu_kur.sh         # Sunucu tarafı kurulum betiği
│   └── yayinla.ps1           # Hostinger yayın betiği
├── Dockerfile
├── .env.example
└── package.json
```

---

## Yerel Çalıştırma

1. Bağımlılığı kurun:
   ```bash
   npm install
   ```
2. Örnek ortam dosyasını kopyalayın ve gerekiyorsa düzenleyin:
   ```bash
   cp .env.example .env
   ```
3. Uygulamayı başlatın:
   ```bash
   npm start
   ```
4. Tarayıcıda `http://localhost:3090` adresini açın.

**İlk Yönetici Hesabı:** Hiç kullanıcı yoksa uygulama `ADMIN_USERNAME` (varsayılan `admin`) kullanıcısını otomatik oluşturur. `ADMIN_PASSWORD` boş bırakılmışsa tek seferlik güçlü bir parola üretilir ve `DATA_DIR/ilk-yonetici.txt` dosyasına yazılır.

### Ortam Değişkenleri (`.env.example`)

| Değişken | Açıklama | Varsayılan |
| --- | --- | --- |
| `PORT` | HTTP dinleme portu | `3090` |
| `DATA_DIR` | Kalıcı veri dizini | `./data` |
| `PUBLIC_URL` | Uygulamanın dış erişim adresi (OAuth ve e-posta bağlantıları) | `http://localhost:3090` |
| `TZ` | Zaman dilimi | `Europe/Istanbul` |
| `SECRET_KEY` | HS256 JWT imzalama anahtarı (boşsa `DATA_DIR/secret.key` üretilir) | — |
| `SESSION_HOURS` | Oturum süresi (saat) | `12` |
| `ADMIN_USERNAME` | İlk yerel yönetici kullanıcı adı | `admin` |
| `ADMIN_PASSWORD` | İlk yerel yönetici parolası (boşsa `ilk-yonetici.txt` yazılır) | — |
| `ADMIN_EMAILS` | Doğrudan aktif yönetici açılacak Google e-postaları (virgülle ayrılmış) | — |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 kimlik bilgileri | — |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURITY` | SMTP sunucu ayarları (`starttls` / `ssl`) | `587`, `starttls` |
| `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` | SMTP giriş bilgileri ve gönderici adresi | — |
| `NOTIFY_EMAILS` | Yeni başvuru bildirimi alacak yönetici e-postaları | — |
| `AI_PROVIDER` | Çeviri LLM sağlayıcısı (`none`, `gemini`, `anthropic`, `openai`) | `none` |
| `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` | LLM API anahtarı, isteğe bağlı model ve uç adres | — |
| `MYMEMORY_EMAIL` | MyMemory günlük 50.000 karakter kotası için e-posta (isteğe bağlı) | — |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Telegram Bot API anahtarı ve hedef sohbet/kanal ID'leri (virgülle ayrılmış) | — |
| `TELEGRAM_MIN_SCORE` | Telegram bildirimi için minimum satın alma ihtimali (0–100) | `80` |

---

## Yönetim Paneli ve Kurulum Notları

Yönetici oturumu açtıktan sonra `/yonetim` adresinden sol menü üzerinden tüm entegrasyonlar yapılandırılabilir. Panelden kaydedilen ayarlar `DATA_DIR/settings.json` dosyasında saklanır ve `.env` değerlerine baskın gelir.

- **Kullanıcılar (`/yonetim/kullanicilar`):** Bekleyen Google başvurularını onaylama/reddetme ve kullanıcı rolleri yönetimi.
- **Giriş yöntemleri (`/yonetim/giris`):** Google Cloud Console'da **Authorized redirect URI** olarak `${PUBLIC_URL}/auth/google/callback` (canlıda `https://customerhunter.appcook.store/auth/google/callback`) tanımlanır.
- **E-posta (`/yonetim/eposta`):** Gmail SMTP için sunucu `smtp.gmail.com`, port `587`, güvenlik `starttls` ve Google Hesabı **Uygulama Şifresi (App Password)** kullanılır; panelden deneme e-postası gönderilebilir.
- **Yapay zekâ / Çeviri (`/yonetim/yapay-zeka`):** Sağlayıcı olarak **Gemini** seçildiğinde varsayılan model `gemini-3.5-flash-lite` kullanılır (Anthropic veya OpenAI da seçilebilir). API anahtarı tanımlanmazsa sistem ücretsiz resmi MyMemory API'ye geçer.
- **Bildirimler (`/yonetim/bildirimler`):** `@BotFather` ile oluşturulan **Bot Token**, hedef **Chat ID** (virgülle en fazla 5 hedef) ve **minimum ihtimal eşiği** girilir; **Deneme bildirimi gönder** ile bağlantı doğrulanır.

---

## Canlıya Yayın (Hostinger)

Uygulama Hostinger sunucusunda (`2.24.62.11`) `/opt/customerhunter` dizininde, `customerhunter-app-1` konteyneri (`mem_limit: 256m`, `platform` ağı) olarak ortak Caddy arkasında çalışır.

Yayın komutu:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Projects\AI-CustomerHunter\deploy\yayinla.ps1" -Sunucu 2.24.62.11 -AlanAdi customerhunter.appcook.store
```

Sağlık kontrolü:

```bash
curl -fsS https://customerhunter.appcook.store/api/health
# Beklenen yanıt: {"ok":true,"status":"healthy"}
```
