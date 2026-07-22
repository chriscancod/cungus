// 2AM shared custom cursor. Expects #cur / #curRing elements and a
// `nav` element in the DOM. Exposes window.bindCur() so pages can
// re-bind after dynamically rendering new interactive elements.
(function(){
  const cur=document.getElementById('cur'),crn=document.getElementById('curRing');
  if(!cur||!crn)return;
  let mx=0,my=0,rx=0,ry=0;
  document.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;});
  (function tick(){
    cur.style.left=mx+'px';cur.style.top=my+'px';
    rx+=(mx-rx)*.1;ry+=(my-ry)*.1;
    crn.style.left=rx+'px';crn.style.top=ry+'px';
    requestAnimationFrame(tick);
  })();
  window.bindCur=function bindCur(){
    document.querySelectorAll('a,button,input,textarea,select').forEach(el=>{
      el.addEventListener('mouseenter',()=>{cur.style.width='20px';cur.style.height='20px';crn.style.width='0';crn.style.height='0';});
      el.addEventListener('mouseleave',()=>{cur.style.width='6px';cur.style.height='6px';crn.style.width='28px';crn.style.height='28px';});
    });
  };
  window.bindCur();

  const nav=document.getElementById('nav')||document.querySelector('nav');
  if(nav){
    window.addEventListener('scroll',()=>nav.classList.toggle('scrolled',window.scrollY>20));
  }

  const yearEl=document.getElementById('fyear');
  if(yearEl)yearEl.textContent=new Date().getFullYear();
})();
