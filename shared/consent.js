// 2AM cookie/consent banner — added 2026-09-08, rotation 1 branding audit,
// item #5. Real, not theater: the site has zero non-essential
// cookies/trackers today (checked — cart/checkout only ever use
// localStorage/sessionStorage, which are functionally required and never
// gated), so there's nothing to actually block yet. This banner exists so
// that's still true the day analytics (item #19) gets added: any future
// analytics snippet should check window.hasAnalyticsConsent() (or listen
// for the '2am-consent-accepted' event) before it loads anything, instead
// of firing unconditionally. Choice is remembered in localStorage so it
// only asks once per browser.
(function(){
  const KEY='2am_consent';

  window.hasAnalyticsConsent=function hasAnalyticsConsent(){
    try{ return localStorage.getItem(KEY)==='accepted'; }catch(e){ return false; }
  };

  let existing;
  try{ existing=localStorage.getItem(KEY); }catch(e){ existing=null; }
  if(existing) return; // already answered on this browser

  function setChoice(val){
    try{ localStorage.setItem(KEY,val); }catch(e){}
    if(val==='accepted') window.dispatchEvent(new Event('2am-consent-accepted'));
    const bar=document.getElementById('consentBar');
    if(bar) bar.remove();
  }

  function build(){
    const bar=document.createElement('div');
    bar.id='consentBar';
    bar.setAttribute('role','region');
    bar.setAttribute('aria-label','Cookie notice');
    bar.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:900;background:var(--card,#e7d9ba);border-top:1px solid var(--border-hi,rgba(42,36,25,.32));padding:16px 24px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:16px;font-family:var(--d,serif)';
    bar.innerHTML=
      '<p style="flex:1;min-width:220px;max-width:560px;font-size:12px;line-height:1.6;color:var(--muted,#2a2419);letter-spacing:.01em;margin:0">'
      +'We use local storage to keep your cart working — that always runs. '
      +'We\'d also like your OK before using any optional analytics. '
      +'<a href="privacy.html" style="color:var(--white,#2a2419);border-bottom:1px solid var(--border-hi,rgba(42,36,25,.32));text-decoration:none">Privacy Policy</a>'
      +'</p>'
      +'<div style="display:flex;gap:10px;flex-shrink:0">'
      +'<button type="button" id="consentDecline" class="btn-line" style="font-size:9px">Decline</button>'
      +'<button type="button" id="consentAccept" class="btn-fill" style="font-size:9px">Accept</button>'
      +'</div>';
    document.body.appendChild(bar);
    document.getElementById('consentAccept').addEventListener('click',()=>setChoice('accepted'));
    document.getElementById('consentDecline').addEventListener('click',()=>setChoice('declined'));
  }

  if(document.body) build();
  else document.addEventListener('DOMContentLoaded',build);
})();
