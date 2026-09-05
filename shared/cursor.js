// 2AM shared nav/footer helpers. Also still holds window.bindCur() as a
// harmless no-op (see below) since every page calls it in a dozen places.
// Last edited: 2026-09-03 11:12 PM EDT
//
// Fixed 2026-09-03: this file used to track the mouse every frame forever
// (a `mousemove` listener + an uncancelled `requestAnimationFrame` loop) to
// drive a custom cursor (#cur/#curRing). The old-money pass retired that
// cursor visually — base.css now sets `.cur,.cur-ring{display:none}` and
// `cursor:auto` sitewide — but nobody stopped the JS that was animating it,
// so every visitor's browser was burning a per-frame loop, forever, on
// every page load, positioning two elements nobody could ever see. Real
// setback, not a style nit: that's wasted CPU/battery on every visit with
// zero visual effect. Removed the tracking/RAF loop and the hover
// width/height binding (also pointless on invisible elements) — kept
// `bindCur()` itself as a callable no-op so the many call sites across
// about.html/product.html/catalog.html/index.html (re-invoked after modals
// render) don't need to change.
(function(){
  window.bindCur=function bindCur(){};

  const nav=document.getElementById('nav')||document.querySelector('nav');
  if(nav){
    window.addEventListener('scroll',()=>nav.classList.toggle('scrolled',window.scrollY>20));
  }

  const yearEl=document.getElementById('fyear');
  if(yearEl)yearEl.textContent=new Date().getFullYear();
})();
