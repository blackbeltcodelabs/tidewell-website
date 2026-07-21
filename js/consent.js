/* Tidewell cookie consent — loads Google Analytics only after the visitor accepts.
   Choice is remembered in localStorage: 'granted' loads GA on every visit,
   'denied' never loads it, absent shows the banner. */
(function () {
  var GA_ID = 'G-KSCCPSGEJD';
  var KEY = 'tw-analytics-consent';

  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) {}

  function loadGA() {
    if (window.__twGALoaded) return;
    window.__twGALoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID, { anonymize_ip: true });
  }

  function remember(value) {
    try { localStorage.setItem(KEY, value); } catch (e) {}
    var el = document.getElementById('tw-consent');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // Already decided.
  if (stored === 'granted') { loadGA(); return; }
  if (stored === 'denied') { return; }

  // Undecided — show the banner once the body is ready.
  function showBanner() {
    if (!document.body || document.getElementById('tw-consent')) return;

    var style = document.createElement('style');
    style.textContent =
      '#tw-consent{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;display:flex;justify-content:center;padding:16px;pointer-events:none}' +
      '#tw-consent .tw-cc-card{pointer-events:auto;max-width:720px;width:100%;background:#fff;border:1px solid #DCE9F4;border-radius:16px;box-shadow:0 18px 48px -18px rgba(13,30,48,.32);padding:18px 20px;display:flex;gap:18px;align-items:center;flex-wrap:wrap;font-family:"Hanken Grotesk",system-ui,-apple-system,sans-serif}' +
      '#tw-consent .tw-cc-text{flex:1;min-width:240px;font-size:14px;line-height:1.55;color:#3E5266}' +
      '#tw-consent .tw-cc-text strong{color:#0D1E30}' +
      '#tw-consent .tw-cc-text a{color:#1E5FBE;text-decoration:none}' +
      '#tw-consent .tw-cc-text a:hover{text-decoration:underline}' +
      '#tw-consent .tw-cc-actions{display:flex;gap:10px;flex-shrink:0}' +
      '#tw-consent button{font-family:inherit;font-size:14px;font-weight:600;border-radius:100px;padding:10px 22px;cursor:pointer;border:1px solid transparent;transition:background .15s,border-color .15s,color .15s}' +
      '#tw-consent .tw-cc-accept{background:#0D1E30;color:#fff}' +
      '#tw-consent .tw-cc-accept:hover{background:#1E5FBE}' +
      '#tw-consent .tw-cc-decline{background:#fff;color:#0D1E30;border-color:#DCE9F4}' +
      '#tw-consent .tw-cc-decline:hover{border-color:#B9D3EE;color:#1E5FBE}' +
      '@media (max-width:560px){#tw-consent .tw-cc-actions{width:100%}#tw-consent .tw-cc-actions button{flex:1}}';
    document.head.appendChild(style);

    var bar = document.createElement('div');
    bar.id = 'tw-consent';
    bar.innerHTML =
      '<div class="tw-cc-card" role="dialog" aria-label="Cookie consent" aria-live="polite">' +
        '<div class="tw-cc-text">We use cookies for <strong>Google Analytics</strong> to understand how visitors use Tidewell and improve the site. Nothing is loaded until you choose. See our <a href="/privacy">Privacy Policy</a>.</div>' +
        '<div class="tw-cc-actions">' +
          '<button type="button" class="tw-cc-decline" id="tw-cc-decline">Decline</button>' +
          '<button type="button" class="tw-cc-accept" id="tw-cc-accept">Accept</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(bar);

    document.getElementById('tw-cc-accept').addEventListener('click', function () { remember('granted'); loadGA(); });
    document.getElementById('tw-cc-decline').addEventListener('click', function () { remember('denied'); });
  }

  if (document.body) showBanner();
  else document.addEventListener('DOMContentLoaded', showBanner);
})();
