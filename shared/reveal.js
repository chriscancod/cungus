// Scroll-reveal — pairs with .reveal/.reveal.in in shared/base.css (DESIGN-SYSTEM.md #10a/#10b).
// Every element with class="reveal" starts hidden; the first time it crosses
// into the viewport this adds .in, which base.css transitions in. Unobserves
// after firing once, since these are entrances, not repeat-scroll effects —
// re-triggering every time someone scrolls back up would fight the "flat and
// clean" / "smooth & fluid" answers rather than support them.
//
// Load AFTER the page's own markup (or on DOMContentLoaded, handled below) so
// elements added dynamically (product grids rendered from a fetch) can call
// window.observeReveals() again once they're in the DOM.
(function(){
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries)=>{
        entries.forEach(entry=>{
          if(entry.isIntersecting){
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' })
    : null;

  function observeReveals(root){
    const scope = root || document;
    const els = scope.querySelectorAll('.reveal:not(.in)');
    if(!io){ els.forEach(el=>el.classList.add('in')); return; } // no IO support — just show them
    els.forEach(el=>io.observe(el));
  }

  window.observeReveals = observeReveals;
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>observeReveals());
  }else{
    observeReveals();
  }
})();
