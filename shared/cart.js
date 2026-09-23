// Last edited: 2026-08-23
// 2AM shared cart. Expects CONFIG (BACKEND_URL) to already be defined
// inline on the page before this script runs. Persists to localStorage
// under '2am_cart' so the cart carries across every page.

// Printify variant titles are usually "Size / Color" but some products
// reverse the order — detect the size token instead of trusting position.
const SIZE_TOKEN_RE=/^(xxs|xs|s|m|l|xl|xxl|xxxl|[2-6]xl|one size|os|\d{1,2}(\.\d)?)$/i;
// FORM VALIDATION FIX (2026-09-08, rotation 1 branding audit, item #17):
// submitSignup/checkRewards below both only checked `.includes('@')` —
// real strings like "@" alone or "a@" pass that, get sent to the backend,
// and either bounce silently later or waste a drop_signups row. Not a
// strict RFC 5322 validator on purpose (that rejects real addresses too
// often to be worth it for a marketing signup) — just requires a real
// local part, an @, a domain with a dot, and no whitespace.
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Anything that reaches innerHTML gets escaped first. The cart interpolates
// product names and the free-text "notes" field (personalisation) straight into
// markup — notes is typed by the customer, so without this a quote-and-tag in
// that box injects into the cart drawer and again on the confirmation page.
//
// Today it only reflects back to the same browser, but the same notes text is
// carried into order emails and the owner's order view, and those are somebody
// else's screen.
function escHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

// TapStitch items are made to order and shipped on TapStitch's own schedule: its
// stated production is 1–3 business days, and Standard Shipping is 30 days at the
// 95th percentile — so up to 5 weeks is the honest ceiling, not the old "3–5 days".
// One constant so the product page, modals and cart all say the same thing.
const TAPSTITCH_LEAD='allow up to 5 weeks';

function splitVariantTitle(title){
  const parts=(title||'').split(' / ').map(p=>p.trim());
  if(parts.length<2)return{size:parts[0]||'',color:''};
  const isSize0=SIZE_TOKEN_RE.test(parts[0]),isSize1=SIZE_TOKEN_RE.test(parts[1]);
  if(isSize1&&!isSize0)return{size:parts[1],color:parts[0]};
  return{size:parts[0],color:parts[1]};
}

let cart=[];
function loadCart(){try{cart=JSON.parse(localStorage.getItem('2am_cart')||'[]');}catch(e){cart=[];}}
function saveCart(){try{localStorage.setItem('2am_cart',JSON.stringify(cart));}catch(e){}}
loadCart();

function removeFromCart(id){cart=cart.filter(i=>i.cartId!==id);updateCart();}

// ── STOCK VALIDATION (added 2026-08-27) ────────────────
// The real incident this fixes: a cart can sit in localStorage for weeks —
// an item added while in stock silently goes sold-out on Printify's side,
// and the first the customer hears about it used to be a generic checkout
// error deep in the shipping step (see checkout.js). This re-checks every
// cart item against the live catalog whenever the cart is actually opened,
// so a sold-out item is visible — and removable — right in the bag, not
// discovered after filling in an address.
//
// Best-effort: if the stock check itself fails (network blip), _stockMap
// stays whatever it last was (often null) and the cart renders normally,
// unblocked — a stock-check outage must never be the thing that stops
// someone from checking out.
let _stockMap=null; // productId -> Set of currently-enabled variantIds
async function refreshStock(){
  try{
    const r=await fetch(`${CONFIG.BACKEND_URL}/api/products`,{signal:AbortSignal.timeout(10000)});
    const d=await r.json();
    const list=Array.isArray(d)?d:(d.products||[]);
    // Both real Printify stock flags, matching the backend's own gate in
    // priceItems() — is_enabled (merchant chose to sell it) and
    // is_available (the print provider actually has stock).
    _stockMap=new Map(list.map(p=>[String(p.id),new Set((p.variants||[]).filter(v=>v.is_enabled!==false&&v.is_available!==false).map(v=>String(v.id)))]));
  }catch(e){ /* best-effort — see note above */ }
  updateCart();
}
function isSoldOut(item){
  if(item.type==='clikey'||item.type==='hardware')return false; // not stock-tracked this way
  if(!_stockMap)return false; // haven't checked yet — never block on an unknown
  const variants=_stockMap.get(String(item.id));
  if(!variants)return false; // product itself not found in the check — don't guess sold-out from that alone
  return !variants.has(String(item.variantId));
}

function updateCart(){
  saveCart();
  const n=cart.length;
  const soldOutCount=cart.filter(isSoldOut).length;
  const countEl=document.getElementById('cartCount');
  if(countEl)countEl.textContent=n;
  const totalEl=document.getElementById('cartTotal');
  if(totalEl)totalEl.textContent='$'+cart.reduce((s,i)=>s+Number(i.price),0).toFixed(2);
  const proceedBtn=document.getElementById('btnProceed');
  if(proceedBtn)proceedBtn.disabled=!n||soldOutCount>0;
  // Real fix, 2026-09-15 (added alongside the undergarment category):
  // '.cart-trust' was static markup on every page, always claiming
  // "Ships in 3-5 days" — true for the rest of the catalog but not for
  // undergarments, which print through a different real provider
  // (Artsadd) with a genuine 14-21 day window. A cart holding an
  // undergarment showed the wrong number at the exact moment a customer
  // is deciding whether to check out. cart.push() already spreads the
  // whole product object (...p) into each cart item, so i.category is
  // already there — this just has to check it, not add new state.
  const trustEl=document.querySelector('.cart-trust');
  if(trustEl){
    const hasUndergarment=cart.some(i=>i.category==='undergarment');
    const hasTapstitch=cart.some(i=>i.fulfillment==='tapstitch');
    trustEl.innerHTML=hasTapstitch
      ?`Made-to-order items: ${TAPSTITCH_LEAD} · <a href="refunds.html">30-day defect cover</a>`
      :hasUndergarment
      ?'Ships in 3–5 days (undergarments: 14–21 days) · <a href="refunds.html">30-day defect cover</a>'
      :'Ships in 3–5 days · <a href="refunds.html">30-day defect cover</a>';
  }
  const el=document.getElementById('cartItems');
  if(!el)return;
  el.innerHTML=n?cart.map(i=>{
    const soldOut=isSoldOut(i);
    return `
    <div class="cart-item${soldOut?' sold-out':''}">
      <img class="ci-img" src="${escHtml(i.img)}" alt="${escHtml(i.name)}">
      <div class="ci-info">
        <p class="ci-name">${escHtml(i.name)}${i.type==='clikey'?' <span class="ci-type-tag">· Clikey</span>':''}</p>
        <p class="ci-var">${escHtml(i.size)}${i.color&&i.color!=='—'?' / '+escHtml(i.color):''}</p>
        ${i.notes?`<p class="ci-note">"${escHtml(i.notes)}"</p>`:''}
        ${soldOut?'<p class="ci-soldout">Sold out — please remove to continue</p>':i.preorder?`<p class="ci-fulfill pre"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg> Preorder${i.shipsAt?` — ships ~${escHtml(i.shipsAt)}`:''}</p>`:i.fulfillment?`<p class="ci-fulfill ${i.fulfillment==='tapstitch'?'t':'p'}">${i.fulfillment==='tapstitch'?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><ellipse cx="12" cy="5" rx="7" ry="2.2"/><ellipse cx="12" cy="19" rx="7" ry="2.2"/><path d="M5 5v14M19 5v14"/></svg> TapStitch':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg> Printify'}</p>`:''}
        <p class="ci-price">$${Number(i.price).toFixed(2)}</p>
      </div>
      <button class="ci-rm" onclick="removeFromCart(${i.cartId})" aria-label="Remove ${escHtml(i.name)} from cart">✕</button>
    </div>`;
  }).join('')
  :'<div class="cart-empty"><div class="cart-empty-icon">○</div><p>Your bag is empty</p></div>';
}

function toggleCart(){
  const d=document.getElementById('cartDrawer');
  if(!d)return;
  d.classList.toggle('open');
  if(d.classList.contains('open'))refreshStock();
  if(!d.classList.contains('open')&&typeof goToStep==='function')goToStep('cart');
}

// This script tag is placed after the cart drawer markup on every page,
// so the elements it needs already exist — no need to wait for DOMContentLoaded.
const cartToggleEl=document.getElementById('cartToggle');
if(cartToggleEl)cartToggleEl.addEventListener('click',e=>{e.preventDefault();toggleCart();});
updateCart();

// Rebuilt 2026-08-27 (Chris: "add to cart animation") — used to just float
// straight up and fade wherever it was triggered. Now it actually flies
// toward the real cart icon's on-screen position and shrinks into it, so
// "added to bag" reads as a real trip to the bag, not a generic toast.
// Falls back to the old float-up path if the cart icon can't be found for
// some reason (e.g. a future page without one).
function showCartPop(p,el){
  const pop=document.getElementById('cartPop');
  if(!pop)return;
  document.getElementById('cpImg').src=p.img;
  document.getElementById('cpName').textContent=p.name;
  const cartIcon=document.getElementById('cartToggle');
  const startRect=el?el.getBoundingClientRect():null;
  const endRect=cartIcon?cartIcon.getBoundingClientRect():null;

  if(el){
    el.classList.remove('btn-press');
    void el.offsetWidth;
    el.classList.add('btn-press');
  }

  pop.style.transition='none';
  if(startRect){
    pop.style.left=Math.min(Math.max(startRect.left,8),window.innerWidth-220)+'px';
    pop.style.top=Math.max(startRect.top-70,8)+'px';
  }else{
    pop.style.left='50%';
    pop.style.top=(window.innerHeight-140)+'px';
  }
  pop.style.transform='translateY(0) scale(.92)';
  pop.style.opacity='0';
  void pop.offsetWidth; // force reflow so the reset above isn't itself animated

  pop.style.transition='opacity .25s ease,transform .25s cubic-bezier(.22,.68,0,1.2)';
  pop.style.opacity='1';
  pop.style.transform='translateY(-10px) scale(1)';

  setTimeout(()=>{
    pop.style.transition='left .6s cubic-bezier(.4,0,.2,1),top .6s cubic-bezier(.4,0,.2,1),transform .6s cubic-bezier(.4,0,.2,1),opacity .6s ease-in';
    if(endRect){
      pop.style.left=(endRect.left+endRect.width/2-14)+'px';
      pop.style.top=(endRect.top+endRect.height/2-14)+'px';
    }else{
      pop.style.top=(parseFloat(pop.style.top)-70)+'px';
    }
    pop.style.transform='scale(.2)';
    pop.style.opacity='0';
  },500);

  // Land: pulse the bag count once the item visually "arrives."
  setTimeout(()=>{
    const pip=document.getElementById('cartCount');
    if(pip){pip.classList.remove('pulse');void pip.offsetWidth;pip.classList.add('pulse');}
  },1080);
}

function showToast(msg){
  const t=document.getElementById('toast');
  if(!t)return;
  document.getElementById('toastMsg').textContent=msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3000);
}

function copyCode(code,btn){
  navigator.clipboard.writeText(code).then(()=>{
    btn.textContent='✓';
    setTimeout(()=>btn.textContent='Copy',2000);
  }).catch(()=>showToast(code));
}

// ── NEWSLETTER SIGNUP ─────────────────────────────────
async function submitSignup(e){
  e.preventDefault();
  const input=document.getElementById('signupEmail');
  const status=document.getElementById('signupStatus');
  const btn=e.target.querySelector('button');
  const email=input.value.trim();
  if(!EMAIL_RE.test(email)){
    status.textContent='Enter a valid email — check for a typo';status.className='signup-status err';
    input.focus();
    return false;
  }
  // Marketing opt-in (2026-09-09, rotation 1 item #12). Enforced here, not
  // just rendered: an unticked box that the submit handler ignores is worse
  // than no box at all — it looks like a choice and isn't one. Optional
  // chaining so a page carrying the old markup without the checkbox still
  // submits rather than silently breaking.
  const consent=document.getElementById('signupConsent');
  if(consent&&!consent.checked){
    status.textContent='Tick the box to confirm you want drop emails';status.className='signup-status err';
    consent.focus();
    return false;
  }
  btn.disabled=true;
  status.textContent='Adding you…';status.className='signup-status';
  try{
    // Mega backend, not the storefront one: it writes to the drop_signups
    // Postgres table. The storefront's version appends to a JSON file inside
    // an ephemeral Railway container with no volume, so every signup was one
    // redeploy away from being gone.
    const r=await fetch(`${CONFIG.MEGA_BACKEND_URL||CONFIG.BACKEND_URL}/api/drop-signup`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email}),
    });
    const d=await r.json();
    if(!d.success)throw new Error(d.error||'Could not sign up');
    // Success message (2026-09-09, item #36). Was a four-word confirmation
    // with no indication of what actually happens next; a signup that
    // produces no visible consequence reads as "did that work?"
    status.textContent="You're on the list ✦ — you'll hear from us when the next piece drops.";
    status.className='signup-status ok';
    input.value='';
    if(consent)consent.checked=false;
  }catch(err){
    // Error message (2026-09-09, item #37). A raw network failure used to
    // surface as "Failed to fetch", which tells a customer nothing and looks
    // like their address was rejected. Distinguish "we couldn't reach the
    // server" from "the server said no."
    const offline=(err.name==='TypeError')||/fetch|network/i.test(err.message||'');
    status.textContent=offline
      ?"Couldn't reach the server — check your connection and try again."
      :(err.message||'Could not sign up — try again in a moment.');
    status.className='signup-status err';
  }
  btn.disabled=false;
  return false;
}

// ── SUPPORT CHAT WIDGET ───────────────────────────────
// Talks to the mega backend directly (not proxied through this page's own
// CONFIG.BACKEND_URL like coupons/loyalty are) so each real visitor keeps
// their own per-IP rate limit — proxying server-to-server would collapse
// every visitor onto this server's one IP.
function toggleSupport(){
  const panel=document.getElementById('supportPanel');
  if(!panel)return;
  panel.classList.toggle('open');
  if(panel.classList.contains('open'))document.getElementById('supportInput')?.focus();
}
function appendSupportMsg(text,cls){
  const box=document.getElementById('supportMessages');
  if(!box)return;
  const div=document.createElement('div');
  div.className='support-msg '+cls;
  div.textContent=text;
  box.appendChild(div);
  box.scrollTop=box.scrollHeight;
}
async function sendSupportMessage(){
  const input=document.getElementById('supportInput');
  const codeInput=document.getElementById('supportCode');
  if(!input)return;
  const message=input.value.trim();
  if(!message)return;
  appendSupportMsg(message,'user');
  input.value='';
  input.disabled=true;
  const FALLBACK='Support chat is temporarily unavailable — email chrisclm713@gmail.com and we\'ll get back to you.';
  try{
    const r=await fetch(`${CONFIG.MEGA_BACKEND_URL}/api/support/chat`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message,wardrobeCode:codeInput?.value.trim()||undefined}),
    });
    // A non-JSON response (e.g. a proxy/host error page) means something is
    // wrong upstream, not with this specific request — show the same safe
    // fallback rather than a raw parse error.
    let d;
    try{ d=await r.json(); }catch(parseErr){ throw new Error(FALLBACK); }
    if(!r.ok)throw new Error(d.error||FALLBACK);
    appendSupportMsg(d.reply,'bot');
  }catch(err){
    appendSupportMsg(err.message,'err');
  }
  input.disabled=false;
  input.focus();
}

// ── RECOMMENDED FOR YOU ────────────────────────────────
// Silent no-op if the page has no #recsSection (or there's nothing to show)
// — this is a purely additive enhancement, never a broken-looking empty state.
async function loadRecommendations(){
  const section=document.getElementById('recsSection');
  const grid=document.getElementById('recsGrid');
  if(!section||!grid)return;
  const email=(()=>{try{return localStorage.getItem('2am_last_email');}catch(e){return null;}})();
  try{
    const url=`${CONFIG.BACKEND_URL}/api/recommendations?limit=4${email?`&email=${encodeURIComponent(email)}`:''}`;
    const r=await fetch(url);
    const d=await r.json();
    if(!d.products||!d.products.length){section.style.display='none';return;}
    grid.innerHTML=d.products.map(p=>`
      <div class="rec-card" onclick="location.href='product.html?id=${encodeURIComponent(p.id)}'">
        <img class="rec-img" src="${escHtml(p.img)}" alt="${escHtml(p.name)}" loading="lazy">
        <p class="rec-name">${escHtml(p.name)}</p>
        <p class="rec-price">$${escHtml(p.price)}</p>
      </div>
    `).join('');
    section.style.display='';
  }catch(e){
    section.style.display='none';
  }
}
loadRecommendations();

// ── LOYALTY REWARDS LOOKUP ────────────────────────────
async function checkRewards(e){
  e.preventDefault();
  const input=document.getElementById('rewardsEmail');
  const status=document.getElementById('rewardsStatus');
  const btn=e.target.querySelector('button');
  const email=input.value.trim();
  if(!EMAIL_RE.test(email)){
    status.textContent='Enter a valid email — check for a typo';status.className='signup-status err';
    input.focus();
    return false;
  }
  btn.disabled=true;
  status.textContent='Checking…';status.className='signup-status';
  try{
    const r=await fetch(`${CONFIG.BACKEND_URL}/api/loyalty/lookup?email=${encodeURIComponent(email)}`,{signal:AbortSignal.timeout(12000)});
    const d=await r.json();
    // A 404 here means "no Rewards account for that address," which is a
    // normal answer, not an error — surfacing the raw backend string made a
    // first-time visitor think something had broken. Added 2026-09-09 (#37).
    if(r.status===404){
      status.textContent="No Rewards yet for that email — points start on your first order.";
      status.className='signup-status';
      btn.disabled=false;
      return false;
    }
    if(!r.ok)throw new Error(d.error||'Could not check rewards');
    const pts=`${d.points_balance} point${d.points_balance!==1?'s':''}`;
    status.textContent=d.next_tier
      ?`${pts} — ${d.next_tier.points_remaining} more to unlock ${d.next_tier.label} ($${d.next_tier.discount} off)`
      :`${pts} — you've unlocked every tier ✦`;
    status.className='signup-status ok';
  }catch(err){
    const offline=(err.name==='TypeError')||(err.name==='TimeoutError')||/fetch|network|abort/i.test(err.message||'');
    status.textContent=offline
      ?"Couldn't reach the server — check your connection and try again."
      :(err.message||'Could not check rewards — try again in a moment.');
    status.className='signup-status err';
  }
  btn.disabled=false;
  return false;
}
