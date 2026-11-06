// 2AM cookie/consent notice — added 2026-09-08, rotation 1 branding audit,
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

  // OPTION A (owner decision 2026-11-06): the notice sits IN the page, just above the footer. It is never fixed, so it can never
  // cover Checkout, Add to Bag, the support button or anything else. The price: it is only seen at the bottom of a page, so fewer
  // visitors answer and fewer visits are counted (the dashboard shows the counted share). It hides while the bag is open and comes
  // back unanswered when the bag closes. Esc never chooses for the visitor.
  function build(){
    const bar=document.createElement('section');
    bar.id='consentBar';
    bar.setAttribute('role','region');
    bar.setAttribute('aria-label','Cookie notice');
    bar.style.cssText='position:static;max-width:720px;margin:32px auto;padding:16px;box-sizing:border-box;background:var(--card,#e7d9ba);border:1px solid var(--border-hi,rgba(42,36,25,.32));display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;font-family:var(--d,serif)';
    bar.innerHTML=
      '<p style="flex:1;min-width:220px;font-size:14px;line-height:1.5;color:var(--muted,#2a2419);letter-spacing:.01em;margin:0">'
      +'We store your cart on your device so it works. That\'s always on. '
      +'We\'d like your OK to use optional analytics. '
      +'<a href="privacy.html" style="display:inline-flex;align-items:center;min-height:44px;min-width:44px;color:var(--white,#2a2419);text-decoration:underline;text-underline-offset:3px">Privacy Policy</a>'
      +'</p>'
      +'<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;min-width:0;max-width:100%">'
      +'<button type="button" id="consentDecline" class="btn-line" style="font-size:12px;min-height:44px;min-width:44px;padding:12px 16px;flex:1 1 140px">Decline optional</button>'
      +'<button type="button" id="consentAccept" class="btn-line" style="font-size:12px;min-height:44px;min-width:44px;padding:12px 16px;flex:1 1 140px">Accept optional</button>'
      +'</div>';
    const footer=document.querySelector('footer');
    if(footer && footer.parentNode) footer.parentNode.insertBefore(bar,footer);
    else document.body.appendChild(bar);
    // Hide while the bag drawer is open (the choice stays unanswered); show again when it closes.
    const drawer=document.getElementById('cartDrawer');
    const sync=function(){
      const b=document.getElementById('consentBar');
      if(!b) return;
      b.style.display=(drawer && drawer.classList.contains('open'))?'none':'flex';
    };
    if(drawer) new MutationObserver(sync).observe(drawer,{attributes:true,attributeFilter:['class']});
    sync();
    document.getElementById('consentAccept').addEventListener('click',()=>setChoice('accepted'));
    document.getElementById('consentDecline').addEventListener('click',()=>setChoice('declined'));
  }

  if(document.body) build();
  else document.addEventListener('DOMContentLoaded',build);
})();
