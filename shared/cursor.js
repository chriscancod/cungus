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

  // ── SKIP LINK (2026-09-09, rotation 1 item #22) ────────
  // nav is fixed and comes first in the DOM on every page, so reaching the
  // actual content by keyboard meant tabbing past the logo, the nav links
  // and the bag — on every page, every time. Injected here rather than
  // hand-added to fourteen HTML files, which is fourteen chances to drift.
  // The target is nav's next element sibling, given tabindex="-1" so it can
  // actually receive programmatic focus (without it the browser moves the
  // scroll position but leaves focus stranded back on the link, and the
  // next Tab press returns you to the nav you just skipped).
  if(nav&&document.body){
    const main=nav.nextElementSibling;
    if(main){
      if(!main.id)main.id='main-content';
      main.setAttribute('tabindex','-1');
      const skip=document.createElement('a');
      skip.className='skip-link';
      skip.href='#'+main.id;
      skip.textContent='Skip to content';
      skip.addEventListener('click',e=>{e.preventDefault();main.focus();main.scrollIntoView();});
      document.body.insertBefore(skip,document.body.firstChild);
    }
  }

  // Auto-updating copyright year. querySelectorAll, not getElementById —
  // the id appears once per page today, but a second footer on any future
  // page would silently render a blank year with the single-element version.
  const year=new Date().getFullYear();
  document.querySelectorAll('#fyear').forEach(el=>{el.textContent=year;});

  // ── MOBILE MENU (2026-09-09, item 34) ──────────────────
  // base.css turns .nav-center into a full-screen panel below 900px; this is
  // the toggle behind it. Progressive: a page without a .nav-toggle button
  // just no-ops, so nothing breaks on order-confirmation/payment-declined,
  // which have their own minimal logo-only nav.
  const toggle=document.querySelector('.nav-toggle');
  const menu=document.querySelector('.nav-center');
  if(toggle&&menu){
    const setOpen=(open)=>{
      document.body.classList.toggle('nav-open',open);
      toggle.setAttribute('aria-expanded',String(open));
      toggle.setAttribute('aria-label',open?'Close menu':'Open menu');
    };
    setOpen(false);
    toggle.addEventListener('click',()=>{
      setOpen(!document.body.classList.contains('nav-open'));
    });
    // Any link inside the panel closes it. Needed for the same-page anchors
    // (#shipping, #returns) which don't navigate away and would otherwise
    // scroll behind a menu that's still covering the screen.
    menu.addEventListener('click',e=>{ if(e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&document.body.classList.contains('nav-open')){
        setOpen(false);
        toggle.focus();
      }
    });
    // Crossing back above the breakpoint while open would otherwise leave
    // body.nav-open (and its overflow:hidden) stuck on the desktop layout.
    const mq=window.matchMedia('(min-width:901px)');
    const onChange=e=>{ if(e.matches) setOpen(false); };
    mq.addEventListener?mq.addEventListener('change',onChange):mq.addListener(onChange);
  }
})();
