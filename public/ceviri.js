/* AppCook 7 Dilli Çeviri Motoru (tr, en, de, es, fr, zh, ja)
 * - URL ?lang=xx > localStorage("appcook_lang") > Cookie("appcook_lang") > "tr"
 * - Üst çubuğa kompakt <select id="appcookDilSec" class="dil-secici"> yerleştirir
 * - Kaynak DOM İngilizce (en); lang !== "en" iken /ceviri/{lang}.js sözlüğünü yükleyip DOM + MutationObserver ile çevirir
 */
(function () {
  "use strict";

  var DILLER = ["tr", "en", "de", "es", "fr", "zh", "ja"];
  var ANAHTAR = "appcook_lang";
  var ATLA_ETIKET = {
    SCRIPT: 1,
    STYLE: 1,
    TEXTAREA: 1,
    CODE: 1,
    PRE: 1,
    NOSCRIPT: 1,
    SVG: 1,
  };
  var NITELIKLER = ["placeholder", "title", "aria-label"];

  function gecerliDil(v) {
    if (!v) return "";
    var s = String(v).trim().toLowerCase().slice(0, 2);
    return DILLER.indexOf(s) !== -1 ? s : "";
  }

  function cerezOku(ad) {
    try {
      var m = document.cookie.match(new RegExp("(?:^|;\\s*)" + ad + "=([^;]+)"));
      return m ? decodeURIComponent(m[1]) : "";
    } catch (_e) {
      return "";
    }
  }

  function dilKaydet(lang) {
    try {
      localStorage.setItem(ANAHTAR, lang);
    } catch (_e) {}
    try {
      document.cookie = ANAHTAR + "=" + encodeURIComponent(lang) + ";path=/;max-age=31536000;SameSite=Lax";
    } catch (_e) {}
  }

  function dilBelirle() {
    try {
      var qs = new URLSearchParams(window.location.search);
      var qLang = gecerliDil(qs.get("lang"));
      if (qLang) {
        dilKaydet(qLang);
        return qLang;
      }
    } catch (_e) {}

    try {
      var lsLang = gecerliDil(localStorage.getItem(ANAHTAR));
      if (lsLang) return lsLang;
    } catch (_e) {}

    var cLang = gecerliDil(cerezOku(ANAHTAR));
    if (cLang) return cLang;

    return "tr";
  }

  var aktifDil = dilBelirle();
  document.documentElement.lang = aktifDil;
  window.__appcookLang = aktifDil;

  function dilSeciciYerlestir() {
    if (document.getElementById("appcookDilSec")) return;

    var sel = document.createElement("select");
    sel.id = "appcookDilSec";
    sel.className = "dil-secici";
    sel.setAttribute("aria-label", "Language");
    sel.setAttribute("title", "Language");
    sel.setAttribute("data-ceviri-yok", "");

    for (var i = 0; i < DILLER.length; i++) {
      var kod = DILLER[i];
      var opt = document.createElement("option");
      opt.value = kod;
      opt.textContent = kod.toUpperCase();
      if (kod === aktifDil) opt.selected = true;
      sel.appendChild(opt);
    }

    sel.addEventListener("change", function () {
      var yeni = gecerliDil(sel.value) || "tr";
      dilKaydet(yeni);
      try {
        var u = new URL(window.location.href);
        u.searchParams.set("lang", yeni);
        window.location.href = u.toString();
      } catch (_e) {
        window.location.reload();
      }
    });

    var topScanBtn = document.getElementById("topScanBtn");
    if (topScanBtn && topScanBtn.parentNode) {
      topScanBtn.parentNode.insertBefore(sel, topScanBtn);
      return;
    }
    var temaBtn = document.querySelector("[data-tema-dugme]");
    if (temaBtn && temaBtn.parentNode) {
      temaBtn.parentNode.insertBefore(sel, temaBtn);
      return;
    }
    var ustSag =
      document.querySelector(".nav-actions") ||
      document.querySelector(".ust-sag") ||
      document.querySelector(".ac-ust-sag") ||
      document.querySelector(".ust-ic");
    if (ustSag) {
      ustSag.appendChild(sel);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", dilSeciciYerlestir);
  } else {
    dilSeciciYerlestir();
  }

  // Kaynak HTML/JS İngilizce olduğu için "en" dilinde ek sözlük veya gözlemci gerekmez.
  if (aktifDil === "en") {
    window.__appcookCeviriUygula = function () {};
    return;
  }

  var derliDesenler = null;
  var sonSozluk = null;
  var gozlemci = null;
  var uygulaniyor = false;

  function sade(s) {
    return String(s).replace(/\s+/g, " ").trim();
  }

  function desenleriHazirla(sozluk) {
    if (sonSozluk === sozluk && derliDesenler) return derliDesenler;
    sonSozluk = sozluk;
    derliDesenler = [];
    var liste = (sozluk && Array.isArray(sozluk.desen)) ? sozluk.desen : [];
    for (var i = 0; i < liste.length; i++) {
      var cift = liste[i];
      if (!cift || cift.length < 2) continue;
      try {
        derliDesenler.push([cift[0] instanceof RegExp ? cift[0] : new RegExp(cift[0]), cift[1]]);
      } catch (_e) {}
    }
    return derliDesenler;
  }

  function cevirParca(temiz, sozluk) {
    if (!temiz) return temiz;
    var metin = sozluk.metin;
    if (metin && Object.prototype.hasOwnProperty.call(metin, temiz)) {
      return metin[temiz];
    }
    var desenler = desenleriHazirla(sozluk);
    for (var i = 0; i < desenler.length; i++) {
      var re = desenler[i][0];
      if (re.test(temiz)) {
        return temiz.replace(re, desenler[i][1]);
      }
    }
    return temiz;
  }

  function cevirAyiricili(temiz, ayirici, sozluk) {
    if (temiz.indexOf(ayirici) === -1) return null;
    var parcalar = temiz.split(ayirici);
    var degisti = false;
    for (var i = 0; i < parcalar.length; i++) {
      var p = parcalar[i];
      var cev = cevirParca(p, sozluk);
      if (cev !== p) {
        parcalar[i] = cev;
        degisti = true;
      }
    }
    return degisti ? parcalar.join(ayirici) : null;
  }

  function cevirMetin(ham) {
    var sozluk = window.CEVIRI;
    if (!sozluk || typeof ham !== "string" || !ham) return ham;
    var eslesme = ham.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!eslesme) return ham;
    var bas = eslesme[1];
    var ic = eslesme[2];
    var son = eslesme[3];
    if (!ic) return ham;

    var temiz = sade(ic);
    if (!temiz) return ham;

    var sonuc = cevirParca(temiz, sozluk);
    if (sonuc !== temiz) {
      return bas + sonuc + son;
    }

    // " · " veya " • " ile birleşmiş parçaları ayrı ayrı çevirmeyi dene
    var ayiricilar = [" · ", " • "];
    for (var k = 0; k < ayiricilar.length; k++) {
      var birlesik = cevirAyiricili(temiz, ayiricilar[k], sozluk);
      if (birlesik !== null) {
        return bas + birlesik + son;
      }
    }

    return ham;
  }

  function atlanacakMi(el) {
    if (!el || el.nodeType !== 1) return false;
    if (ATLA_ETIKET[el.tagName]) return true;
    if (el.hasAttribute && el.hasAttribute("data-ceviri-yok")) return true;
    if (el.closest && el.closest("[data-ceviri-yok]")) return true;
    return false;
  }

  function nitelikCevir(el) {
    if (atlanacakMi(el)) return;
    for (var i = 0; i < NITELIKLER.length; i++) {
      var ad = NITELIKLER[i];
      if (!el.hasAttribute(ad)) continue;
      var eski = el.getAttribute(ad);
      if (!eski) continue;
      var yeni = cevirMetin(eski);
      if (yeni !== eski) {
        el.setAttribute(ad, yeni);
      }
    }
  }

  function dugumCevir(dugum) {
    if (!dugum) return;
    if (dugum.nodeType === 3) {
      var p = dugum.parentElement;
      if (p && atlanacakMi(p)) return;
      var eski = dugum.nodeValue;
      if (!eski || !eski.trim()) return;
      var yeni = cevirMetin(eski);
      if (yeni !== eski) {
        dugum.nodeValue = yeni;
      }
      return;
    }
    if (dugum.nodeType !== 1) return;
    if (atlanacakMi(dugum)) return;

    nitelikCevir(dugum);
    var cocuk = dugum.firstChild;
    while (cocuk) {
      dugumCevir(cocuk);
      cocuk = cocuk.nextSibling;
    }
  }

  function gozlemciBagla() {
    if (!gozlemci || !document.body) return;
    gozlemci.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: NITELIKLER,
    });
  }

  function uygula(kok) {
    if (!window.CEVIRI || uygulaniyor) return;
    uygulaniyor = true;
    if (gozlemci) gozlemci.disconnect();
    try {
      if (document.title) {
        var yeniBaslik = cevirMetin(document.title);
        if (yeniBaslik !== document.title) document.title = yeniBaslik;
      }
      var hedef = kok || document.body;
      if (hedef) dugumCevir(hedef);
    } finally {
      uygulaniyor = false;
      gozlemciBagla();
    }
  }

  window.__appcookCeviriUygula = uygula;

  function gozlemciBaslat() {
    if (gozlemci || !window.MutationObserver || !document.body) return;
    gozlemci = new MutationObserver(function (mutasyonlar) {
      if (!window.CEVIRI || uygulaniyor) return;
      uygulaniyor = true;
      gozlemci.disconnect();
      try {
        for (var i = 0; i < mutasyonlar.length; i++) {
          var m = mutasyonlar[i];
          if (m.type === "characterData") {
            dugumCevir(m.target);
          } else if (m.type === "attributes") {
            nitelikCevir(m.target);
          } else if (m.type === "childList") {
            for (var j = 0; j < m.addedNodes.length; j++) {
              dugumCevir(m.addedNodes[j]);
            }
          }
        }
      } finally {
        uygulaniyor = false;
        gozlemciBagla();
      }
    });
    gozlemciBagla();
  }

  function baslat() {
    gozlemciBaslat();
    if (window.CEVIRI) uygula();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", baslat);
  } else {
    baslat();
  }
  window.addEventListener("load", function () {
    if (window.CEVIRI) uygula();
  });

  // Sözlük dosyasını yükle
  var s = document.createElement("script");
  s.src = "/ceviri/" + aktifDil + ".js";
  s.async = false;
  s.onload = function () {
    uygula();
  };
  (document.head || document.documentElement).appendChild(s);
})();
