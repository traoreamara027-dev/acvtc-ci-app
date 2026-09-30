// ACVTC-CI V6 — chargeur du frontal V6.
// La branche v6-development conserve app.js et les modules historiques,
// puis charge v6.js après tous les correctifs présents dans index.html.

(function () {
  function chargerV6() {
    if (document.getElementById('acvtc-v6-script')) return;
    const script = document.createElement('script');
    script.id = 'acvtc-v6-script';
    script.src = '/v6.js?v=6.0.0';
    script.async = false;
    document.body.appendChild(script);
  }

  if (document.readyState === 'complete') chargerV6();
  else window.addEventListener('load', chargerV6, { once: true });
})();
