// 2AM analytics, added 2026-09-26. Follows the promise in cookies.html: nothing
// optional runs until the visitor accepts the consent notice, and declining
// really blocks it. Counts page visits only. No cookies, no local storage, no
// IP address stored (the server keeps a code that changes every day and can't
// be traced back). Also silent when Do Not Track / Global Privacy Control is on.
// Server side: mambru-backend routes/analytics.js.
(function () {
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  var URL = 'https://mega-backend-production.up.railway.app/api/analytics/event';
  var started = false;

  function send(event, name) {
    var body = JSON.stringify({ source: '2am-store', event: event, name: name || location.pathname, referrer: document.referrer });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(URL, new Blob([body], { type: 'application/json' }));
      else fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body, keepalive: true });
    } catch (e) { /* analytics must never break the shop */ }
  }
  function start() {
    if (started) return;
    started = true;
    send('pageview');
    window.trackEvent = send; // trackEvent('add_to_bag', 'product-12')
  }

  if (typeof window.hasAnalyticsConsent === 'function' && window.hasAnalyticsConsent()) start();
  else window.addEventListener('2am-consent-accepted', start);
})();
