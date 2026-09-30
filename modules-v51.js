// ACVTC-CI V6 — chargeur du frontal V6 et de ses modules complémentaires.
(function () {
  function chargerExtras() {
    if (document.getElementById('acvtc-v6-extras-script')) return;
    const extra = document.createElement('script');
    extra.id = 'acvtc-v6-extras-script';
    extra.src = '/v6-extras.js?v=6.1.0';
    extra.async = false;
    document.body.appendChild(extra);
  }

  function chargerV6() {
    if (document.getElementById('acvtc-v6-script')) {
      chargerExtras();
      return;
    }
    const script = document.createElement('script');
    script.id = 'acvtc-v6-script';
    script.src = '/v6.js?v=6.1.0';
    script.async = false;
    script.onload = chargerExtras;
    document.body.appendChild(script);
  }

  if (document.readyState === 'complete') chargerV6();
  else window.addEventListener('load', chargerV6, { once: true });
})();
