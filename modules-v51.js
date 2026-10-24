// ACVTC-CI V6 — chargeur du frontal V6 et de ses modules complémentaires.
(function () {
  function chargerNotifications() {
    if (document.getElementById('acvtc-v6-notifications-script')) return;
    const notif = document.createElement('script');
    notif.id = 'acvtc-v6-notifications-script';
    notif.src = '/v6-notifications.js?v=20261024-v7';
    notif.async = false;
    document.body.appendChild(notif);
  }

  function chargerExtras() {
    if (document.getElementById('acvtc-v6-extras-script')) {
      chargerNotifications();
      return;
    }
    const extra = document.createElement('script');
    extra.id = 'acvtc-v6-extras-script';
    extra.src = '/v6-extras.js?v=20261024-v7';
    extra.async = false;
    extra.onload = function () {
      const finance = document.createElement('script');
      finance.src = '/finance-sections.js?v=20261024-v7';
      finance.onload = function () {
        const v7 = document.createElement('script');
        v7.src = '/v7.js?v=20261024-v7';
        v7.onload = chargerNotifications;
        document.body.appendChild(v7);
      };
      document.body.appendChild(finance);
    };
    document.body.appendChild(extra);
  }

  function chargerV6() {
    if (document.getElementById('acvtc-v6-script')) {
      chargerExtras();
      return;
    }
    const script = document.createElement('script');
    script.id = 'acvtc-v6-script';
    script.src = '/v6.js?v=20261024-v7';
    script.async = false;
    script.onload = chargerExtras;
    document.body.appendChild(script);
  }

  if (document.readyState === 'complete') chargerV6();
  else window.addEventListener('load', chargerV6, { once: true });
})();
