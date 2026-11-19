// AppCook giriş kiti: .ac-vitrin[data-tur] içine uygulamaya özel canlı görseli çizer ve .ac-kutu öğelerinde
// imleci izleyen ışığın konumunu günceller. Beş uygulamada birebir aynı dosyadır (bkz. appcook-giris.css).
// Görsellerde metin yoktur (yalnızca dosya adı, yüzde gibi dilden bağımsız işaretler), çeviri gerektirmez.
(function () {
  "use strict";

  function el(etiket, sinif, metin) {
    var e = document.createElement(etiket);
    if (sinif) e.className = sinif;
    if (metin != null) e.textContent = metin;
    return e;
  }

  var CIZ = {
    ses: function (v) {
      v.appendChild(el("span", "ac-kayit", "REC 12:48"));
      var d = el("div", "ac-dalga");
      for (var i = 0; i < 44; i++) d.appendChild(el("i"));
      v.appendChild(d);
    },
    belge: function (v) {
      var d = el("div", "ac-belge");
      for (var i = 0; i < 7; i++) d.appendChild(el("i"));
      var a = el("span", "ac-imlec"); a.setAttribute("data-ad", "A");
      var b = el("span", "ac-imlec iki"); b.setAttribute("data-ad", "M");
      d.appendChild(a); d.appendChild(b);
      v.appendChild(d);
    },
    tarama: function (v) {
      var d = el("div", "ac-tarama");
      [["invoice.pdf", 3], ["setup.exe", 87], ["report.docx", 0], ["archive.zip", 12], ["photo.jpg", 1]].forEach(function (f) {
        var s = el("div", f[1] > 50 ? "riskli" : "");
        s.appendChild(el("span", null, f[0]));
        s.appendChild(el("span", null, f[1] + "/100"));
        s.appendChild(el("b"));
        d.appendChild(s);
      });
      v.appendChild(d);
    },
    sema: function (v) {
      v.innerHTML = '<svg class="ac-sema" viewBox="0 0 280 150" aria-hidden="true">' +
        '<path d="M70 38h70v74h60"/><path d="M70 38v74h40"/><path d="M200 112V38h-20"/>' +
        '<rect class="vurgu" x="20" y="18" width="70" height="40" rx="9"/><rect x="140" y="18" width="60" height="40" rx="9"/>' +
        '<rect x="110" y="92" width="60" height="40" rx="9"/><rect class="vurgu" x="200" y="92" width="60" height="40" rx="9"/></svg>';
    },
    ilerleme: function (v) {
      var d = el("div", "ac-ilerleme");
      [["∑ ∫", 82], ["⚛ ⚗", 64], ["Aa", 91]].forEach(function (s) {
        var satir = el("div");
        satir.appendChild(el("em", null, s[0]));
        satir.appendChild(el("strong", null, s[1] + "%"));
        satir.appendChild(el("span"));
        d.appendChild(satir);
      });
      v.appendChild(d);
    },
  };

  function kur() {
    Array.prototype.forEach.call(document.querySelectorAll(".ac-vitrin[data-tur]"), function (v) {
      var ciz = CIZ[v.getAttribute("data-tur")];
      if (ciz && !v.firstChild) { v.setAttribute("aria-hidden", "true"); v.setAttribute("data-ceviri-yok", ""); ciz(v); }
    });
    Array.prototype.forEach.call(document.querySelectorAll(".ac-kutu"), function (k, i) {
      k.style.setProperty("--gecikme", i * 70 + "ms");
      k.addEventListener("pointermove", function (e) {
        var r = k.getBoundingClientRect();
        k.style.setProperty("--mx", (e.clientX - r.left) + "px");
        k.style.setProperty("--my", (e.clientY - r.top) + "px");
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", kur);
  else kur();
})();
