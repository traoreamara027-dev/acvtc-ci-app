// Guide d'installation de l'application ACVTC-CI sur iPhone.
(function () {
  'use strict';
  const agent = navigator.userAgent || '';
  const iphone = /iPad|iPhone|iPod/i.test(agent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /Safari/i.test(agent) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA|Instagram|FBAN|FBAV/i.test(agent);
  const installed = navigator.standalone === true ||
    Boolean(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  const installLink = new URL('/', window.location.origin);
  installLink.searchParams.set('installer', 'iphone');
  const el = id => document.getElementById(id);
  let previousFocus = null;

  function feedback(message) { const zone = el('iphone-install-feedback'); if (zone) zone.textContent = message; }
  function ouvrir() {
    if (installed) return;
    const dialog = el('iphone-install-dialog');
    if (!dialog) return;
    previousFocus = document.activeElement;
    el('iphone-install-link').value = installLink.toString();
    el('iphone-install-browser-advice').hidden = iphone && safari;
    feedback('');
    dialog.hidden = false;
    document.body.style.overflow = 'hidden';
    el('iphone-install-close').focus();
  }
  function fermer() {
    const dialog = el('iphone-install-dialog');
    if (!dialog || dialog.hidden) return;
    dialog.hidden = true;
    document.body.style.overflow = '';
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  }
  window.ouvrirGuideInstallationIphone = ouvrir;

  async function copier() {
    const link = installLink.toString();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(link);
        feedback('Lien copié : vous pouvez l’envoyer sur WhatsApp.');
        return;
      } catch (_) {}
    }
    const input = el('iphone-install-link');
    input.focus(); input.select();
    feedback('Lien sélectionné : touchez « Copier » dans le menu.');
  }
  async function partager() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Installer ACVTC-CI sur iPhone',
          text: 'Voici le lien et les étapes pour installer l’application ACVTC-CI sur iPhone.',
          url: installLink.toString()
        });
        return;
      } catch (error) { if (error && error.name === 'AbortError') return; }
    }
    await copier();
  }
  function init() {
    if (iphone && !installed) document.querySelectorAll('[data-iphone-install-trigger]').forEach(node => { node.hidden = false; });
    if (installed) return;
    const close = el('iphone-install-close'), dialog = el('iphone-install-dialog');
    if (!close || !dialog) return;
    close.addEventListener('click', fermer);
    el('iphone-install-copy').addEventListener('click', copier);
    el('iphone-install-share').addEventListener('click', partager);
    dialog.addEventListener('click', event => { if (event.target === dialog) fermer(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') fermer(); });
    if (new URLSearchParams(window.location.search).get('installer') === 'iphone') ouvrir();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
