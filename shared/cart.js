// 2AM shared cart. Expects CONFIG (BACKEND_URL) to already be defined
// inline on the page before this script runs. Persists to localStorage
// under '2am_cart' so the cart carries across index/catalog/studio.

// Printify variant titles are usually "Size / Color" but some products
// reverse the order — detect the size token instead of trusting position.
const SIZE_TOKEN_RE=/^(xxs|xs|s|m|l|xl|xxl|xxxl|[2-6]xl|one size|os|\d{1,2}(\.\d)?)$/i;
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

function updateCart(){
  saveCart();
  const n=cart.length;
  const countEl=document.getElementById('cartCount');
  if(countEl)countEl.textContent=n;
  const totalEl=document.getElementById('cartTotal');
  if(totalEl)totalEl.textContent='$'+cart.reduce((s,i)=>s+Number(i.price),0).toFixed(2);
  const proceedBtn=document.getElementById('btnProceed');
  if(proceedBtn)proceedBtn.disabled=!n;
  const el=document.getElementById('cartItems');
  if(!el)return;
  el.innerHTML=n?cart.map(i=>`
    <div class="cart-item">
      <img class="ci-img" src="${i.img}" alt="${i.name}">
      <div class="ci-info">
        <p class="ci-name">${i.name}${i.type==='clikey'?' <span class="ci-type-tag">· Clikey</span>':''}</p>
        <p class="ci-var">${i.size}${i.color&&i.color!=='—'?' / '+i.color:''}</p>
        ${i.notes?`<p class="ci-note">"${i.notes}"</p>`:''}
        ${i.preorder?`<p class="ci-fulfill pre">🕐 Preorder${i.shipsAt?` — ships ~${i.shipsAt}`:''}</p>`:i.fulfillment?`<p class="ci-fulfill ${i.fulfillment==='tapstitch'?'t':'p'}">${i.fulfillment==='tapstitch'?'🧵 TapStitch':'⚡ Printify'}</p>`:''}
        <p class="ci-price">$${Number(i.price).toFixed(2)}</p>
      </div>
      <button class="ci-rm" onclick="removeFromCart(${i.cartId})" aria-label="Remove ${i.name} from cart">✕</button>
    </div>`).join('')
  :'<div class="cart-empty"><div class="cart-empty-icon">○</div><p>Your bag is empty</p></div>';
}

function toggleCart(){
  const d=document.getElementById('cartDrawer');
  if(!d)return;
  d.classList.toggle('open');
  if(!d.classList.contains('open')&&typeof goToStep==='function')goToStep('cart');
}

// This script tag is placed after the cart drawer markup on every page,
// so the elements it needs already exist — no need to wait for DOMContentLoaded.
const cartToggleEl=document.getElementById('cartToggle');
if(cartToggleEl)cartToggleEl.addEventListener('click',e=>{e.preventDefault();toggleCart();});
updateCart();

function showCartPop(p,el){
  const pop=document.getElementById('cartPop');
  if(!pop)return;
  document.getElementById('cpImg').src=p.img;
  document.getElementById('cpName').textContent=p.name;
  if(el){
    const r=el.getBoundingClientRect();
    pop.style.left=Math.min(Math.max(r.left,8),window.innerWidth-220)+'px';
    pop.style.top=Math.max(r.top-70,8)+'px';
    pop.style.transform='none';
  }else{
    pop.style.left='50%';
    pop.style.top=(window.innerHeight-140)+'px';
    pop.style.transform='translateX(-50%)';
  }
  pop.classList.remove('fly');
  void pop.offsetWidth;
  pop.classList.add('fly');
  setTimeout(()=>pop.classList.remove('fly'),900);
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
  if(!email.includes('@')){
    status.textContent='Enter a valid email';status.className='signup-status err';
    return false;
  }
  btn.disabled=true;
  try{
    const r=await fetch(`${CONFIG.BACKEND_URL}/api/drop-signup`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email}),
    });
    const d=await r.json();
    if(!d.success)throw new Error(d.error||'Could not sign up');
    status.textContent="You're on the list ✦";status.className='signup-status ok';
    input.value='';
  }catch(err){
    status.textContent=err.message;status.className='signup-status err';
  }
  btn.disabled=false;
  return false;
}

// ── LOYALTY REWARDS LOOKUP ────────────────────────────
async function checkRewards(e){
  e.preventDefault();
  const input=document.getElementById('rewardsEmail');
  const status=document.getElementById('rewardsStatus');
  const btn=e.target.querySelector('button');
  const email=input.value.trim();
  if(!email.includes('@')){
    status.textContent='Enter a valid email';status.className='signup-status err';
    return false;
  }
  btn.disabled=true;
  status.textContent='Checking...';status.className='signup-status';
  try{
    const r=await fetch(`${CONFIG.BACKEND_URL}/api/loyalty/lookup?email=${encodeURIComponent(email)}`);
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Could not check rewards');
    const pts=`${d.points_balance} point${d.points_balance!==1?'s':''}`;
    status.textContent=d.next_tier
      ?`${pts} — ${d.next_tier.points_remaining} more to unlock ${d.next_tier.label} ($${d.next_tier.discount} off)`
      :`${pts} — you've unlocked every tier ✦`;
    status.className='signup-status ok';
  }catch(err){
    status.textContent=err.message;status.className='signup-status err';
  }
  btn.disabled=false;
  return false;
}
