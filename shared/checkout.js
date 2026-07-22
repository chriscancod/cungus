// 2AM shared checkout — cart step navigation + Square Web Payments SDK.
// Expects CONFIG.BACKEND_URL, CONFIG.SQUARE_APPLICATION_ID, CONFIG.SQUARE_LOCATION_ID,
// and CONFIG.SQUARE_ENV ('sandbox'|'production') to be defined inline on the page
// before this script runs. Depends on shared/cart.js (cart, updateCart, showToast).

function goToStep(s){
  document.querySelectorAll('.cstep').forEach(el=>el.classList.remove('active'));
  document.getElementById('step-'+s).classList.add('active');
  document.getElementById('orderSuccess').classList.remove('show');
}

function goToShipping(){
  if(!cart.length){showToast('Add items first');return;}
  goToStep('shipping');
}

let calcTotal=null;
async function goToPayment(){
  const v=id=>document.getElementById(id).value.trim();
  if(!v('shipFirst')||!v('shipLast')||!v('shipEmail')||!v('shipLine1')||!v('shipCity')||!v('shipState')||!v('shipZip')){showToast('Fill in all shipping fields');return;}
  if(!v('shipEmail').includes('@')){showToast('Enter a valid email');return;}
  const addr={firstName:v('shipFirst'),lastName:v('shipLast'),line1:v('shipLine1'),line2:document.getElementById('shipLine2').value,city:v('shipCity'),state:v('shipState'),zip:v('shipZip'),country:'US'};
  try{
    const r=await fetch(`${CONFIG.BACKEND_URL}/api/calculate-shipping`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:cart,shippingAddress:addr})});
    const d=await r.json();if(d.error)throw new Error(d.error);
    calcTotal=d;
    document.getElementById('osSub').textContent='$'+d.subtotal;
    document.getElementById('osShip').textContent='$'+d.shipping;
    document.getElementById('osTax').textContent='$'+d.tax;
    document.getElementById('osTotal').textContent='$'+d.total;
    document.getElementById('orderSummary').classList.add('show');
    document.getElementById('cartTotalRow').style.display='none';
  }catch(e){showToast('Could not calculate shipping');return;}
  goToStep('payment');
  initSquare();
}

// ── SQUARE ───────────────────────────────────────────
let squarePayments=null,squareCard=null,squareReady=false;
function loadSquareSdk(){
  return new Promise((resolve,reject)=>{
    if(window.Square){resolve();return;}
    const src=CONFIG.SQUARE_ENV==='production'
      ?'https://web.squarecdn.com/v1/square.js'
      :'https://sandbox.web.squarecdn.com/v1/square.js';
    const s=document.createElement('script');
    s.src=src;s.onload=()=>resolve();s.onerror=()=>reject(new Error('Could not load Square SDK'));
    document.head.appendChild(s);
  });
}
async function initSquare(){
  if(squareReady)return;
  const status=document.getElementById('pay-status');
  try{
    await loadSquareSdk();
    squarePayments=window.Square.payments(CONFIG.SQUARE_APPLICATION_ID,CONFIG.SQUARE_LOCATION_ID);
    squareCard=await squarePayments.card();
    await squareCard.attach('#square-card-element');
    squareReady=true;
  }catch(e){
    if(status){status.textContent='Payment form unavailable — '+e.message;status.className='pay-err';}
  }
}

let checkoutAttemptKey=null;
async function processPayment(){
  if(!squareReady||!squareCard){showToast('Payment not ready');return;}
  const btn=document.getElementById('payBtn'),st=document.getElementById('pay-status');
  const btnLabel=btn.querySelector('span')||btn;
  btnLabel.textContent='Processing...';btn.disabled=true;st.textContent='';
  const email=document.getElementById('shipEmail').value;
  const addr={firstName:document.getElementById('shipFirst').value,lastName:document.getElementById('shipLast').value,line1:document.getElementById('shipLine1').value,line2:document.getElementById('shipLine2').value,city:document.getElementById('shipCity').value,state:document.getElementById('shipState').value,zip:document.getElementById('shipZip').value,country:'US'};
  try{
    const result=await squareCard.tokenize();
    if(result.status!=='OK'){
      throw new Error(result.errors?.[0]?.message||'Card details invalid');
    }
    // Reuse the same idempotency key across retries of the SAME attempt so a
    // network retry doesn't double-charge; a fresh attempt after a real
    // failure below gets a new key.
    if(!checkoutAttemptKey)checkoutAttemptKey=crypto.randomUUID();
    const or=await fetch(`${CONFIG.BACKEND_URL}/api/payment`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token:result.token,idempotencyKey:checkoutAttemptKey,items:cart,email,shippingAddress:addr}),
    });
    const od=await or.json();
    if(!od.success)throw new Error(od.error||'Order failed');
    checkoutAttemptKey=null;
    if(od.total)document.getElementById('osTotal').textContent='$'+od.total;
    document.querySelectorAll('.cstep').forEach(s=>s.classList.remove('active'));
    document.getElementById('orderSuccess').classList.add('show');
    showToast('Order confirmed!');
    if(od.wardrobeCodes?.length){
      document.getElementById('wcList').innerHTML=od.wardrobeCodes.map(c=>`
        <div class="wc-card">
          <img class="wc-img" src="${c.productImg||''}" alt="${c.productName}">
          <div class="wc-info"><p class="wc-name">${c.productName}</p><p class="wc-code">${c.code}</p></div>
          <button class="wc-copy" onclick="copyCode('${c.code}',this)">Copy</button>
        </div>`).join('');
      document.getElementById('wcSection').style.display='block';
    }
    cart=[];updateCart();calcTotal=null;
    squareReady=false;squareCard=null;squarePayments=null;
    document.getElementById('orderSummary').classList.remove('show');
    document.getElementById('cartTotalRow').style.display='';
    setTimeout(()=>{
      toggleCart();
      document.getElementById('orderSuccess').classList.remove('show');
      const wcSection=document.getElementById('wcSection');
      if(wcSection){wcSection.style.display='none';document.getElementById('wcList').innerHTML='';}
      goToStep('cart');
      document.getElementById('square-card-element').innerHTML='';
      btnLabel.textContent='Place Order';btn.disabled=false;st.textContent='';
    },12000);
  }catch(e){
    // A genuine failure (not a retry) — next attempt gets a fresh idempotency key.
    checkoutAttemptKey=null;
    st.textContent=e.message;st.className='pay-err';btnLabel.textContent='Place Order';btn.disabled=false;
  }
}
