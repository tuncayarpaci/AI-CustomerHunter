'use strict';

function generateReplies(productName, productUrl, postTitle, competitor) {
  const cleanName = productName || 'AI-CustomerHunter';
  const cleanUrl = productUrl || 'https://appcook.store';
  const comp = competitor || 'legacy tools';

  return {
    helpful: `We ran into this exact bottleneck a few months ago when trying to streamline our workflow without adding more complexity.\n\nWhat worked best for us:\n1. Narrow down to the 2-3 daily workflows your team actually repeats instead of paying for bloated enterprise suites.\n2. Standardize how requests come in so nothing gets lost across chat threads.\n3. We also started using ${cleanName} (${cleanUrl}) to handle this automatically. Happy to share how we set it up if helpful!`,
    founder: `Hey! Transparent founder disclosure here — I built ${cleanName} (${cleanUrl}) after getting frustrated with ${comp} being overly complex and expensive for focused teams.\n\nIt's designed to solve this exact workflow cleanly without steep onboarding or bloat.\n\nIf you'd like to test it on your use case, I'd love your honest feedback.`,
    comparison: `If you're comparing options right now, here's a quick breakdown from our testing:\n\n• **${comp}**: Widely known, but gets heavy and expensive as your team grows.\n• **Manual / Patchwork Tools**: Free to start, but costs hours every week in context switching.\n• **${cleanName}** (${cleanUrl}): Purpose-built, lightweight, and fast to adopt.\n\nIf your main goal is getting results quickly without enterprise overhead, ${cleanName} is worth a look.`
  };
}

function generateRepliesTr(productName, productUrl, competitor) {
  const cleanName = productName || 'AI-CustomerHunter';
  const cleanUrl = productUrl || 'https://appcook.store';
  const comp = competitor || 'eski araçlar';

  return {
    helpful: `Birkaç ay önce ekibimizde iş akışını karmaşıklaştırmadan hızlandırmaya çalışırken birebir aynı darboğazı yaşadık.\n\nBizde en iyi sonuç veren adımlar:\n1. Ağır kurumsal yazılımlara para ödemek yerine ekibin her gün tekrarladığı 2-3 temel ihtiyaca odaklanmak.\n2. Taleplerin sohbetlerde kaybolmaması için tek bir düzenli akış kurmak.\n3. Biz bu süreci otomatikleştirmek için ${cleanName} (${cleanUrl}) kullanmaya başladık. İşinize yararsa kurulum adımlarımızı memnuniyetle paylaşırım!`,
    founder: `Merhaba! Şeffaf olayım — ${comp} gibi araçların gereksiz karmaşıklığı ve yüksek maliyetinden bunaldığım için ${cleanName} (${cleanUrl}) uygulamasını kendim geliştirdim.\n\nKarmaşık kurulum gerektirmeden tam olarak bu iş akışını sade biçimde çözmek için tasarlandı.\n\nKendi senaryonuzda denemek isterseniz samimi geri bildiriminizi duymayı çok isterim.`,
    comparison: `Şu an seçenekleri karşılaştırıyorsanız testlerimizden kısa bir özet:\n\n• **${comp}**: Bilinen bir çözüm ancak ekip büyüdükçe ağırlaşıyor ve maliyeti hızla artıyor.\n• **Manuel / Parçalı Araçlar**: Başlangıçta ücretsiz ama her hafta saatlerce zaman kaybettiriyor.\n• **${cleanName}** (${cleanUrl}): Doğrudan bu ihtiyaca yönelik, hafif ve dakikalar içinde devreye alınabilir.\n\nÖnceliğiniz kurumsal yük olmadan hızlı sonuç almaksa ${cleanName} göz atmaya değer.`
  };
}

const APPCOOK_PORTFOLIO_CAMPAIGNS = [
  {
    id: 'camp-ai-task',
    name: 'AI-Task (Telegram & Kanban Team Task Manager)',
    url: 'https://task.appcook.store',
    category: 'Project & Task Management / Team Kanban',
    audience: 'Startup Teams, Agencies, Remote Engineering & Operations Teams, Project Managers',
    valueProp: 'Assign tasks via Telegram in natural language or drop them into a shared team pool with one-click invite links and person/column Kanban boards',
    keywords: [
      'trello alternative',
      'jira too complex',
      'lightweight kanban tool',
      'telegram task manager',
      'team task tracker'
    ],
    competitors: ['Trello', 'Jira', 'Asana', 'ClickUp', 'Monday.com', 'Linear'],
    subreddits: ['r/projectmanagement', 'r/SaaS', 'r/entrepreneur', 'r/smallbusiness', 'r/productivity'],
    dealValue: 390,
    active: true,
    createdAt: new Date(Date.now() - 86400000 * 8).toISOString()
  },
  {
    id: 'camp-ai-transcript',
    name: 'AI-Transcript (Speech, Video & Meeting Minutes AI)',
    url: 'https://transkript.appcook.store',
    category: 'AI Transcription, Meeting Minutes & Presentation Generator',
    audience: 'Consultants, Executives, Podcasters, Journalists, Remote Teams, Content Creators',
    valueProp: 'Transcribe audio, video, and YouTube links in 20+ languages with speaker diarization, automated meeting minutes, action tables, and instant PowerPoint deck generation',
    keywords: [
      'otter ai alternative',
      'meeting transcription tool',
      'speaker diarization whisper',
      'automated meeting minutes',
      'audio to text summarize'
    ],
    competitors: ['Otter.ai', 'Fireflies.ai', 'Descript', 'Sonix', 'Trint'],
    subreddits: ['r/productivity', 'r/SaaS', 'r/podcasting', 'r/entrepreneur', 'r/journalism'],
    dealValue: 450,
    active: false,
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString()
  },
  {
    id: 'camp-ai-draw',
    name: 'AI-Draw (Whiteboard & Natural Language to draw.io)',
    url: 'https://diyagram.appcook.store',
    category: 'AI Architecture Diagramming & Visual Documentation',
    audience: 'Cloud Architects, DevOps Engineers, System Designers, Backend Developers, Technical Writers',
    valueProp: 'Convert whiteboard photos, legacy screenshots, or plain text prompts directly into editable draw.io architecture and network topology diagrams',
    keywords: [
      'lucidchart alternative',
      'text to architecture diagram',
      'whiteboard photo to drawio',
      'ai diagram generator',
      'network topology tool'
    ],
    competitors: ['Lucidchart', 'Miro', 'Microsoft Visio', 'Eraser.io', 'Whimsical'],
    subreddits: ['r/devops', 'r/softwarearchitecture', 'r/sysadmin', 'r/aws', 'r/webdev'],
    dealValue: 420,
    active: false,
    createdAt: new Date(Date.now() - 86400000 * 6).toISOString()
  },
  {
    id: 'camp-ai-colab',
    name: 'AI-Colab (Collaborative Office Suite + Document AI & OCR)',
    url: 'https://office.appcook.store',
    category: 'Collaborative Document Editing, OCR & AI Knowledge Workspace',
    audience: 'Law Firms, Operations Teams, Privacy-Conscious Businesses, Research Groups, Enterprises',
    valueProp: 'Edit Word, Excel, and PowerPoint files collaboratively in the browser with version history, full-text OCR for scanned PDFs, and a built-in AI document assistant',
    keywords: [
      'google workspace alternative',
      'collaborative document editing ai',
      'chat with pdf and word',
      'ocr searchable pdf tool',
      'onlyoffice cloud'
    ],
    competitors: ['Google Workspace', 'Microsoft 365', 'Notion', 'Dropbox Paper', 'CryptPad'],
    subreddits: ['r/selfhosted', 'r/SaaS', 'r/smallbusiness', 'r/productivity', 'r/privacy'],
    dealValue: 580,
    active: false,
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString()
  },
  {
    id: 'camp-ai-analysis',
    name: 'AI-Analysis (Malware, YARA & Static File Security Scanner)',
    url: 'https://malware.appcook.store',
    category: 'Cybersecurity, Malware Triage & Static Threat Analysis',
    audience: 'SOC Analysts, Blue Teams, CISOs, IT Security Engineers, Incident Responders',
    valueProp: 'Scan suspicious PE, Office, PDF, and ZIP files with ClamAV, YARA rules, static risk scoring, VirusTotal IOC lookups, and Claude AI threat assessment',
    keywords: [
      'malware analysis tool',
      'automated yara scanner',
      'scan suspicious pdf attachment',
      'static malware triage',
      'hybrid analysis alternative'
    ],
    competitors: ['VirusTotal Enterprise', 'Hybrid Analysis', 'Any.Run', 'Joe Sandbox', 'Cuckoo'],
    subreddits: ['r/cybersecurity', 'r/netsec', 'r/BlueTeamSec', 'r/sysadmin', 'r/msp'],
    dealValue: 690,
    active: false,
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString()
  },
  {
    id: 'camp-ai-coach',
    name: 'AI-Coach (Personalized AI Exam Tutor & Study Planner)',
    url: 'https://sinavkocu.appcook.store',
    category: 'EdTech / AI Exam Coaching & Adaptive Study Platform',
    audience: 'High School Students, Parents, Tutoring Centers, Teachers, Exam Candidates',
    valueProp: 'Generate personalized study schedules, voice-enabled AI lessons, flashcards and quizzes from photos of handwritten notes, with parent and teacher progress dashboards',
    keywords: [
      'ai study planner',
      'notes photo to flashcards quiz',
      'ai exam tutor app',
      'quizlet alternative ai',
      'student progress tracker'
    ],
    competitors: ['Quizlet Plus', 'Khanmigo', 'Duolingo Max', 'AnkiPro', 'StudyFetch'],
    subreddits: ['r/GetStudying', 'r/studytips', 'r/EdTech', 'r/teachers', 'r/SaaS'],
    dealValue: 290,
    active: false,
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  {
    id: 'camp-ai-servicedesk',
    name: 'AI-ServiceDesk (Autonomous IT Helpdesk & Jira/Confluence Agent)',
    url: 'https://aiassistant.appcook.store',
    category: 'ITSM / AI Service Desk & Enterprise Knowledge Automation',
    audience: 'IT Directors, Helpdesk Managers, MSPs, Enterprise Operations Teams',
    valueProp: 'Resolve employee IT tickets automatically with cited answers from PDF, Office, and Confluence knowledge bases, automated account unlocks, and smart Jira ticket escalation',
    keywords: [
      'ai helpdesk automation',
      'reduce it support tickets',
      'confluence jira ai bot',
      'moveworks alternative',
      'internal it support assistant'
    ],
    competitors: ['Moveworks', 'Zendesk AI', 'Intercom Fin', 'Freshservice', 'Jira Service Management'],
    subreddits: ['r/sysadmin', 'r/ITManagers', 'r/msp', 'r/devops', 'r/SaaS'],
    dealValue: 790,
    active: false,
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    id: 'camp-ai-shop',
    name: 'AI-Shop (Smart Supermarket Price Comparison & GPS Route Optimizer)',
    url: 'https://market.appcook.store',
    category: 'Consumer FinTech & Smart Grocery Basket Optimization',
    audience: 'Smart Shoppers, Families, Budget-Conscious Households, Retail Analysts',
    valueProp: 'Compare live prices across major supermarket chains, optimize single-store vs multi-store baskets, and navigate via GPS multi-stop Google Maps routing',
    keywords: [
      'grocery price comparison app',
      'supermarket basket optimizer',
      'cheapest grocery route planner',
      'flipp alternative',
      'smart shopping list app'
    ],
    competitors: ['Flipp', 'Instacart', 'Cimri Market', 'Basket Savings', 'TooGoodToGo'],
    subreddits: ['r/frugal', 'r/apps', 'r/PersonalFinance', 'r/SaaS', 'r/entrepreneur'],
    dealValue: 240,
    active: false,
    createdAt: new Date(Date.now() - 86400000 * 1).toISOString()
  }
];

function withStaticI18n(lead, trData, productName, productUrl, competitor) {
  const repliesEn = generateReplies(productName, productUrl, lead.title, competitor);
  const repliesTr = generateRepliesTr(productName, productUrl, competitor);
  const nowIso = new Date().toISOString();
  return {
    ...lead,
    replies: repliesEn,
    i18n: {
      en: {
        title: lead.title,
        snippet: lead.snippet,
        whyHot: lead.whyHot,
        intentLabel: lead.intentLabel,
        replies: repliesEn,
        provider: 'static',
        translatedAt: nowIso
      },
      tr: {
        title: trData.title,
        snippet: trData.snippet,
        whyHot: trData.whyHot,
        intentLabel: trData.intentLabel,
        replies: repliesTr,
        provider: 'static',
        translatedAt: nowIso
      }
    }
  };
}

const INITIAL_LEADS = [
  withStaticI18n(
    {
      id: 'lead-appcook-task-1',
      campaignId: 'camp-ai-task',
      platform: 'reddit',
      community: 'r/projectmanagement',
      author: 'u/agency_ops_lead',
      title: 'Jira is way too bloated and Trello gets messy with 15 people — is there a lightweight Kanban tool that integrates directly with Telegram?',
      snippet: 'Our 15-person remote agency already lives in Telegram all day. Nobody opens Jira to update tickets. We want a simple team task pool where we can assign tasks in natural language from Telegram, let the first available person claim it, and view progress on a clean Kanban board by person or column.',
      url: 'https://www.reddit.com/r/projectmanagement/search/?q=lightweight+kanban+trello+alternative&restrict_sr=1&sort=new',
      intentScore: 98,
      intentType: 'competitor_churn',
      intentLabel: 'Jira/Trello Churn + Telegram Workflow',
      matchedKeywords: ['trello alternative', 'jira too complex', 'telegram task manager'],
      competitorMentioned: 'Jira / Trello',
      estimatedValue: 390,
      banRisk: 'Low (3%)',
      whyHot: '15-person remote team actively ditching Jira/Trello specifically asking for Telegram task assignment + team pool Kanban.',
      status: 'new',
      postedAt: '12m ago',
      createdAt: new Date(Date.now() - 12 * 60000).toISOString()
    },
    {
      title: 'Jira çok ağır, Trello ise 15 kişide dağılıyor — doğrudan Telegram ile çalışan hafif bir Kanban aracı var mı?',
      snippet: '15 kişilik uzaktan çalışan ajansımız tüm gün Telegram’da. Kimse Jira açıp görev güncellemiyor. Telegram’dan doğal dille görev atayabileceğimiz, müsait olan ilk kişinin havuzdan üstlenebileceği ve kişi/sütun bazlı sade bir Kanban panosu arıyoruz.',
      whyHot: '15 kişilik uzaktan ekip Jira/Trello’yu bırakıp doğrudan Telegram görev atama + ortak havuz Kanban aracı arıyor.',
      intentLabel: 'Jira/Trello Değişimi + Telegram İş Akışı'
    },
    'AI-Task',
    'https://task.appcook.store',
    'Jira & Trello'
  ),
  withStaticI18n(
    {
      id: 'lead-appcook-task-2',
      campaignId: 'camp-ai-task',
      platform: 'hackernews',
      community: 'Ask HN',
      author: 'dev_founder_berlin',
      title: 'Ask HN: What lightweight task tracker are small engineering teams using after outgrowing Trello?',
      snippet: 'ClickUp and Monday feel overly complex and slow, while Linear does not fit our non-technical operations folks. Looking for a fast Kanban board with one-click invite links, sprint tracking, and instant chat notifications.',
      url: 'https://news.ycombinator.com/from?site=ycombinator.com',
      intentScore: 94,
      intentType: 'active_buyer',
      intentLabel: 'Active Team Kanban Buyer',
      matchedKeywords: ['lightweight kanban tool', 'team task tracker'],
      competitorMentioned: 'ClickUp / Linear',
      estimatedValue: 390,
      banRisk: 'Low (3%)',
      whyHot: 'Founder looking for a lightweight cross-functional Kanban tracker with quick onboarding and chat alerts.',
      status: 'new',
      postedAt: '35m ago',
      createdAt: new Date(Date.now() - 35 * 60000).toISOString()
    },
    {
      title: 'Ask HN: Küçük yazılım ekipleri Trello yetersiz kalınca hangi hafif görev takip aracına geçiyor?',
      snippet: 'ClickUp ve Monday aşırı karmaşık ve yavaş geliyor; Linear ise teknik olmayan operasyon ekibimize uymuyor. Tek tıkla davet bağlantısı, hızlı Kanban panosu ve anlık sohbet bildirimleri sunan sade bir araç arıyoruz.',
      whyHot: 'Kurucu, hızlı kurulum ve anlık bildirimli hafif bir ortak Kanban görev takip aracı arıyor.',
      intentLabel: 'Aktif Ekip Kanban Alıcısı'
    },
    'AI-Task',
    'https://task.appcook.store',
    'ClickUp & Trello'
  ),
  withStaticI18n(
    {
      id: 'lead-appcook-transcript-1',
      campaignId: 'camp-ai-transcript',
      platform: 'reddit',
      community: 'r/productivity',
      author: 'u/exec_consultant_uk',
      title: 'Best Otter.ai alternative that supports 20+ languages, speaker separation, and turns meeting transcripts directly into PowerPoint slides?',
      snippet: 'Otter cut off our monthly minutes and struggles whenever our European clients switch languages mid-call. We need accurate Whisper-based transcription from files, YouTube links, or live audio that automatically generates formal meeting minutes, action tables, and a client-ready PPTX summary.',
      url: 'https://www.reddit.com/r/productivity/search/?q=otter+ai+alternative+meeting+minutes&restrict_sr=1&sort=new',
      intentScore: 97,
      intentType: 'competitor_churn',
      intentLabel: 'Otter.ai Switcher + PPTX Need',
      matchedKeywords: ['otter ai alternative', 'speaker diarization whisper', 'automated meeting minutes'],
      competitorMentioned: 'Otter.ai / Fireflies.ai',
      estimatedValue: 450,
      banRisk: 'Low (3%)',
      whyHot: 'Consulting team replacing Otter.ai, explicitly requesting multi-language Whisper diarization + automated minutes & PowerPoint generation.',
      status: 'new',
      postedAt: '24m ago',
      createdAt: new Date(Date.now() - 24 * 60000).toISOString()
    },
    {
      title: '20+ dil destekleyen, konuşmacı ayıran ve toplantı dökümünü doğrudan PowerPoint sunumuna çeviren en iyi Otter.ai alternatifi hangisi?',
      snippet: 'Otter aylık dakikamızı kesti ve Avrupalı müşterilerimiz görüşme ortasında dil değiştirdiğinde zorlanıyor. Dosya, YouTube veya canlı sesten doğru döküm çıkarıp otomatik toplantı tutanağı, aksiyon tablosu ve müşteriye hazır PPTX özeti üreten bir araç arıyoruz.',
      whyHot: 'Danışmanlık ekibi Otter.ai’yi bırakıyor; çok dilli konuşmacı ayrımı, otomatik tutanak ve PowerPoint üretimi istiyor.',
      intentLabel: 'Otter.ai Değişimi + Sunum İhtiyacı'
    },
    'AI-Transcript',
    'https://transkript.appcook.store',
    'Otter.ai'
  ),
  withStaticI18n(
    {
      id: 'lead-appcook-draw-1',
      campaignId: 'camp-ai-draw',
      platform: 'reddit',
      community: 'r/softwarearchitecture',
      author: 'u/cloud_arch_aws',
      title: 'Tool to convert whiteboard architecture photos or plain text prompts into editable draw.io diagrams?',
      snippet: 'After every architecture review we waste 2 hours redrawing whiteboard sketches of servers, firewalls, and VPC topologies into draw.io / Lucidchart. Is there an AI tool that recognizes network components from a photo or natural language prompt and opens directly in an embedded draw.io editor?',
      url: 'https://www.reddit.com/r/softwarearchitecture/search/?q=whiteboard+to+draw.io+ai+diagram&restrict_sr=1&sort=new',
      intentScore: 96,
      intentType: 'active_buyer',
      intentLabel: 'Architecture Diagram Buyer',
      matchedKeywords: ['whiteboard photo to drawio', 'text to architecture diagram', 'lucidchart alternative'],
      competitorMentioned: 'Lucidchart / Visio',
      estimatedValue: 420,
      banRisk: 'Low (2%)',
      whyHot: 'Cloud architect looking for exact whiteboard photo + natural language to editable draw.io conversion.',
      status: 'new',
      postedAt: '48m ago',
      createdAt: new Date(Date.now() - 48 * 60000).toISOString()
    },
    {
      title: 'Beyaz tahta mimari fotoğraflarını veya düz metin açıklamalarını düzenlenebilir draw.io diyagramına çeviren bir araç var mı?',
      snippet: 'Her mimari toplantı sonrası sunucu, güvenlik duvarı ve VPC çizimlerini draw.io / Lucidchart’ta yeniden çizmek için 2 saat harcıyoruz. Fotoğraftan veya metinden ağ bileşenlerini tanıyıp doğrudan düzenlenebilir draw.io çıktısı veren bir yapay zekâ aracı arıyorum.',
      whyHot: 'Bulut mimarı, beyaz tahta fotoğrafı ve metinden doğrudan düzenlenebilir draw.io diyagramı üreten araç arıyor.',
      intentLabel: 'Mimari Diyagram Alıcısı'
    },
    'AI-Draw',
    'https://diyagram.appcook.store',
    'Lucidchart'
  ),
  withStaticI18n(
    {
      id: 'lead-appcook-colab-1',
      campaignId: 'camp-ai-colab',
      platform: 'reddit',
      community: 'r/selfhosted',
      author: 'u/legal_ops_director',
      title: 'Looking for a collaborative browser Office suite (Word/Excel/PPT) with built-in OCR for scanned PDFs and an AI document assistant',
      snippet: 'Our team handles thousands of scanned contracts and Word/Excel files. Switching between Google Docs, standalone OCR tools, and ChatGPT is painful. We want one workspace where we can co-edit Office documents in the browser, run OCR for full-text search, and ask AI questions across our PDFs.',
      url: 'https://www.reddit.com/r/selfhosted/search/?q=collaborative+office+ocr+ai+pdf&restrict_sr=1&sort=new',
      intentScore: 95,
      intentType: 'active_buyer',
      intentLabel: 'Workspace + Document AI Buyer',
      matchedKeywords: ['collaborative document editing ai', 'ocr searchable pdf tool', 'chat with pdf and word'],
      competitorMentioned: 'Google Workspace / Notion',
      estimatedValue: 580,
      banRisk: 'Low (3%)',
      whyHot: 'Operations director seeking browser co-editing for Word/Excel/PPT combined with OCR and AI document Q&A.',
      status: 'saved',
      postedAt: '1h ago',
      createdAt: new Date(Date.now() - 65 * 60000).toISOString()
    },
    {
      title: 'Tarayıcıda ortak Word/Excel/PPT düzenleme, taranmış PDF için OCR ve yapay zekâ doküman asistanı sunan bir ofis paketi arıyoruz',
      snippet: 'Ekibimiz binlerce taranmış sözleşme ve Word/Excel dosyasıyla çalışıyor. Google Docs, ayrı OCR araçları ve ChatGPT arasında gidip gelmek çok yorucu. Belgeleri birlikte düzenleyip OCR ile arayabileceğimiz ve PDF’lere yapay zekâyla soru sorabileceğimiz tek bir alan arıyoruz.',
      whyHot: 'Operasyon direktörü tarayıcıda ortak ofis düzenleme, OCR ve yapay zekâ doküman asistanını tek yerde arıyor.',
      intentLabel: 'Ofis + Doküman YZ Alıcısı'
    },
    'AI-Colab',
    'https://office.appcook.store',
    'Google Workspace'
  ),
  withStaticI18n(
    {
      id: 'lead-appcook-analysis-1',
      campaignId: 'camp-ai-analysis',
      platform: 'reddit',
      community: 'r/cybersecurity',
      author: 'u/soc_analyst_tier2',
      title: 'Fastest web scanner to triage suspicious PE, Office, and PDF attachments with ClamAV, YARA rules, VirusTotal IOCs, and AI assessment?',
      snippet: 'Our SOC analysts need a clean triage portal where employees or tier-1 analysts can upload a suspicious attachment, get instant ClamAV + YARA rule hits, static risk scoring, VirusTotal hash reputation, and an AI explanation — with automatic file deletion after scan.',
      url: 'https://www.reddit.com/r/cybersecurity/search/?q=yara+clamav+malware+triage+scanner&restrict_sr=1&sort=new',
      intentScore: 96,
      intentType: 'active_buyer',
      intentLabel: 'SOC Malware Triage Buyer',
      matchedKeywords: ['automated yara scanner', 'static malware triage', 'malware analysis tool'],
      competitorMentioned: 'Hybrid Analysis / Any.Run',
      estimatedValue: 690,
      banRisk: 'Low (3%)',
      whyHot: 'SOC team looking for combined ClamAV + YARA + static analysis + VirusTotal + Claude AI threat triage with zero-retention privacy.',
      status: 'new',
      postedAt: '2h ago',
      createdAt: new Date(Date.now() - 120 * 60000).toISOString()
    },
    {
      title: 'Şüpheli PE, Office ve PDF eklerini ClamAV, YARA kuralları, VirusTotal ve yapay zekâ değerlendirmesiyle en hızlı tarayan web aracı hangisi?',
      snippet: 'SOC analistlerimiz şüpheli ekleri yükleyip anında ClamAV + YARA eşleşmeleri, statik risk puanı, VirusTotal itibarı ve yapay zekâ açıklaması alabilecekleri — tarama sonrası dosyayı otomatik silen — sade bir triyaj portalı arıyor.',
      whyHot: 'SOC ekibi ClamAV + YARA + statik analiz + VirusTotal + yapay zekâ tehdit triyajını gizlilik odaklı tek portalda arıyor.',
      intentLabel: 'SOC Zararlı Analiz Alıcısı'
    },
    'AI-Analysis',
    'https://malware.appcook.store',
    'Hybrid Analysis'
  ),
  withStaticI18n(
    {
      id: 'lead-appcook-coach-1',
      campaignId: 'camp-ai-coach',
      platform: 'reddit',
      community: 'r/GetStudying',
      author: 'u/exam_prep_parent',
      title: 'Best AI exam coach app that turns photos of class notes into summaries & quizzes and builds a daily study schedule?',
      snippet: 'Preparing for national entrance exams (LGS/YKS). Quizlet takes too much manual typing. Looking for an AI study coach that creates a personalized curriculum by grade, lets students listen to voice lessons, generates flashcards from notebook photos, and gives parents/teachers a progress dashboard.',
      url: 'https://www.reddit.com/r/GetStudying/search/?q=ai+study+planner+notes+photo+quiz&restrict_sr=1&sort=new',
      intentScore: 93,
      intentType: 'competitor_churn',
      intentLabel: 'EdTech Study Coach Buyer',
      matchedKeywords: ['ai study planner', 'notes photo to flashcards quiz', 'quizlet alternative ai'],
      competitorMentioned: 'Quizlet Plus',
      estimatedValue: 290,
      banRisk: 'Low (2%)',
      whyHot: 'Parent/student seeking adaptive exam study plan, note-photo to quiz generation, voice AI tutor, and parent dashboard.',
      status: 'replied',
      postedAt: '3h ago',
      createdAt: new Date(Date.now() - 180 * 60000).toISOString()
    },
    {
      title: 'Ders notu fotoğraflarını özet ve teste çeviren, günlük çalışma programı çıkaran en iyi yapay zekâ sınav koçu uygulaması hangisi?',
      snippet: 'LGS/YKS hazırlığındayız. Quizlet’te her şeyi elle yazmak çok zaman alıyor. Sınıfa göre kişiselleştirilmiş program çıkaran, sesli ders dinleten, defter fotoğrafından kart/test üreten ve veli/öğretmen takip paneli sunan bir yapay zekâ sınav koçu arıyoruz.',
      whyHot: 'Veli/öğrenci uyarlanabilir sınav programı, not fotoğrafından test üretimi, sesli anlatım ve veli paneli arıyor.',
      intentLabel: 'Eğitim / Sınav Koçu Alıcısı'
    },
    'AI-Coach',
    'https://sinavkocu.appcook.store',
    'Quizlet Plus'
  ),
  withStaticI18n(
    {
      id: 'lead-appcook-servicedesk-1',
      campaignId: 'camp-ai-servicedesk',
      platform: 'reddit',
      community: 'r/sysadmin',
      author: 'u/it_director_enterprise',
      title: 'How are you deflecting repetitive Tier-1 IT tickets using Confluence/PDF knowledge bases + automated Jira escalation?',
      snippet: 'Moveworks quoted us an enterprise contract that is way over budget. We need an AI service desk agent that answers employee IT questions citing our internal PDFs, Office docs, and Confluence pages, runs approved automations like account unlocks, and opens a summarized Jira ticket when human help is needed.',
      url: 'https://www.reddit.com/r/sysadmin/search/?q=ai+service+desk+confluence+jira+ticket+deflection&restrict_sr=1&sort=new',
      intentScore: 97,
      intentType: 'budget_ready',
      intentLabel: 'Moveworks Alternative Buyer',
      matchedKeywords: ['moveworks alternative', 'confluence jira ai bot', 'ai helpdesk automation'],
      competitorMentioned: 'Moveworks / Zendesk AI',
      estimatedValue: 790,
      banRisk: 'Low (3%)',
      whyHot: 'IT Director priced out of Moveworks, looking for RAG knowledge base answers + account unlock automation + Jira integration.',
      status: 'converted',
      postedAt: '4h ago',
      createdAt: new Date(Date.now() - 240 * 60000).toISOString()
    },
    {
      title: 'Tekrarlayan 1. seviye BT taleplerini Confluence/PDF bilgi tabanı ve otomatik Jira aktarımıyla nasıl azaltıyorsunuz?',
      snippet: 'Moveworks bütçemizi çok aşan kurumsal bir teklif verdi. Şirket içi PDF, Office ve Confluence sayfalarına kaynak göstererek yanıt veren, hesap kilidi açma gibi onaylı otomasyonları çalıştıran ve gerektiğinde özetli Jira kaydı açan bir yapay zekâ destek asistanı arıyoruz.',
      whyHot: 'BT Direktörü Moveworks fiyatını yüksek buluyor; kaynaklı bilgi tabanı yanıtları, hesap açma otomasyonu ve Jira entegrasyonu arıyor.',
      intentLabel: 'Moveworks Alternatifi Alıcısı'
    },
    'AI-ServiceDesk',
    'https://aiassistant.appcook.store',
    'Moveworks'
  ),
  withStaticI18n(
    {
      id: 'lead-appcook-shop-1',
      campaignId: 'camp-ai-shop',
      platform: 'reddit',
      community: 'r/frugal',
      author: 'u/smart_family_budget',
      title: 'Is there an app that compares live grocery prices across supermarkets and calculates the cheapest single-store vs multi-store GPS route?',
      snippet: 'Grocery prices vary by 30% between chains in the same neighborhood. I want to build my weekly shopping basket once, see which single supermarket is cheapest overall OR split the basket across 2 nearby stores with a multi-stop Google Maps GPS route.',
      url: 'https://www.reddit.com/r/frugal/search/?q=grocery+price+comparison+basket+optimizer+app&restrict_sr=1&sort=new',
      intentScore: 92,
      intentType: 'active_buyer',
      intentLabel: 'Smart Grocery Optimizer User',
      matchedKeywords: ['grocery price comparison app', 'supermarket basket optimizer', 'cheapest grocery route planner'],
      competitorMentioned: 'Flipp / Manual Flyers',
      estimatedValue: 240,
      banRisk: 'Low (2%)',
      whyHot: 'High-engagement consumer request for multi-store supermarket basket comparison + GPS route optimization.',
      status: 'new',
      postedAt: '5h ago',
      createdAt: new Date(Date.now() - 300 * 60000).toISOString()
    },
    {
      title: 'Zincir marketlerdeki güncel fiyatları karşılaştırıp en ucuz tek marketi veya çok duraklı GPS alışveriş rotasını hesaplayan bir uygulama var mı?',
      snippet: 'Aynı mahalledeki zincir marketler arasında fiyatlar %30’a kadar oynuyor. Haftalık alışveriş listemi bir kez girip en ucuz tek marketi görmek ya da sepeti yakındaki 2 markete bölerek Google Haritalar rotasıyla alışveriş yapmak istiyorum.',
      whyHot: 'Çoklu market sepet karşılaştırması ve GPS rota optimizasyonu için yüksek etkileşimli kullanıcı talebi.',
      intentLabel: 'Akıllı Market Sepeti Kullanıcısı'
    },
    'AI-Shop',
    'https://market.appcook.store',
    'Flipp'
  )
];

module.exports = {
  APPCOOK_PORTFOLIO_CAMPAIGNS,
  INITIAL_LEADS,
  generateReplies,
  generateRepliesTr
};
