// Guide d'installation de l'application ACVTC-CI sur iPhone.
(function () {
  'use strict';
  const agent = navigator.userAgent || '';
  const iphone = /iPad|iPhone|iPod/i.test(agent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /Safari/i.test(agent) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA|Instagram|FBAN|FBAV|WhatsApp|Line/i.test(agent);
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
    el('iphone-install-coach').hidden = true;
    el('iphone-install-link').value = installLink.toString();
    el('iphone-install-browser-advice').hidden = iphone && safari;
    const inSafari = iphone && safari;
    el('iphone-install-start').textContent = inSafari ? 'Commencer l’installation' : 'Copier le lien pour Safari';
    el('iphone-install-start-help').textContent = inSafari ? 'Le guide se ferme pour vous laisser utiliser les boutons de Safari.' : 'Ouvrez ensuite Safari et collez le lien dans la barre d’adresse.';
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
        feedback('Lien copié. Ouvrez Safari, collez le lien dans la barre d’adresse et validez.');
        return;
      } catch (_) {}
    }
    const input = el('iphone-install-link');
    input.closest('details').open = true;
    input.focus(); input.select(); input.setSelectionRange(0, input.value.length);
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
  async function commencer() {
    if (!(iphone && safari)) { await copier(); return; }
    fermer();
    // Safari owns Add to Home Screen. Keep the browser toolbar accessible.
    const coach = el('iphone-install-coach');
    coach.hidden = false;
    el('iphone-install-coach-guide').focus();
  }
  function init() {
    if (iphone && !installed) document.querySelectorAll('[data-iphone-install-trigger]').forEach(node => { node.hidden = false; });
    if (installed) return;
    const close = el('iphone-install-close'), dialog = el('iphone-install-dialog');
    if (!close || !dialog) return;
    close.addEventListener('click', fermer);
    el('iphone-install-start').addEventListener('click', commencer);
    el('iphone-install-coach-close').addEventListener('click', () => { el('iphone-install-coach').hidden = true; });
    el('iphone-install-coach-guide').addEventListener('click', () => { ouvrir(); el('iphone-install-full-guide').open = true; });
    el('iphone-install-copy').addEventListener('click', copier);
    el('iphone-install-share').addEventListener('click', partager);
    dialog.addEventListener('click', event => { if (event.target === dialog) fermer(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') fermer(); });
    if (new URLSearchParams(window.location.search).get('installer') === 'iphone') ouvrir();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
