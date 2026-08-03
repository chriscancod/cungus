// 2AM shared checkout — cart step navigation + Square Web Payments SDK.
// Expects CONFIG.BACKEND_URL, CONFIG.SQUARE_APPLICATION_ID, CONFIG.SQUARE_LOCATION_ID,
// and CONFIG.SQUARE_ENV ('sandbox'|'production') to be defined inline on the page
// before this script runs. Depends on shared/cart.js (cart, updateCart, showToast).

function goToStep(s){
  document.querySelectorAll('.cstep').forEach(el=>el.classList.remove('active'));
  document.getElementById('step-'+s).classList.add('active');
  document.getElementById('orderSuccess')?.classList.remove('show');
}

function goToShipping(){
  if(!cart.length){showToast('Add items first');return;}
  goToStep('shipping');
}

let calcTotal=null;
let appliedCoupon=null;

function buildShippingAddr(){
  return {firstName:document.getElementById('shipFirst').value,lastName:document.getElementById('shipLast').value,line1:document.getElementById('shipLine1').value,line2:document.getElementById('shipLine2').value,city:document.getElementById('shipCity').value,state:document.getElementById('shipState').value,zip:document.getElementById('shipZip').value,country:'US'};
}

// Previews a coupon's discount (doesn't consume the code's use — the real
// application + increment happens server-side in /api/payment at checkout).
async function applyCoupon(){
  const status=document.getElementById('couponStatus');
  const code=document.getElementById('couponCode').value.trim().toUpperCase();
  if(!code){status.textContent='Enter a code';status.className='pay-err';return;}
  if(!calcTotal){status.textContent='';return;}
  status.textContent='Checking...';status.className='';
  try{
    const r=await fetch(`${CONFIG.BACKEND_URL}/api/apply-coupon`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,items:cart,shippingAddress:buildShippingAddr()})});
    const d=await r.json();
    if(!d.success)throw new Error(d.error||'Invalid code');
    appliedCoupon={code,discount_amount:d.discount_amount};
    const newTotal=(Number(calcTotal.total)-Number(d.discount_amount)).toFixed(2);
    document.getElementById('osDiscountRow').style.display='';
    document.getElementById('osDiscount').textContent='-$'+d.discount_amount;
    document.getElementById('osTotal').textContent='$'+newTotal;
    status.textContent='Code applied';status.className='';
  }catch(e){
    appliedCoupon=null;
    document.getElementById('osDiscountRow').style.display='none';
    if(calcTotal)document.getElementById('osTotal').textContent='$'+calcTotal.total;
    status.textContent=e.message;status.className='pay-err';
  }
}

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
      body:JSON.stringify({token:result.token,idempotencyKey:checkoutAttemptKey,items:cart,email,shippingAddress:addr,couponCode:appliedCoupon?.code||undefined}),
    });
    const od=await or.json();
    if(!od.success){
      // Server already sends a customer-safe message (see friendlyPaymentError
      // in the backend) — never raw Square JSON — but route it to a real
      // decline page rather than inline text either way.
      sessionStorage.setItem('2am_decline',JSON.stringify({message:od.error||'Your payment could not be processed.',code:od.declineCode||null}));
      window.location.href='payment-declined.html';
      return;
    }
    checkoutAttemptKey=null;
    sessionStorage.setItem('2am_order',JSON.stringify({
      transactionId:od.transactionId,email,
      subtotal:od.subtotal,shipping:od.shipping,discount:od.discount,total:od.total,
      items:cart,wardrobeCodes:od.wardrobeCodes||[],preorder:od.preorder||null,
    }));
    // Persisted (not session-scoped) so "Recommended for You" has something
    // to personalize against on a LATER visit, not just this one.
    try{localStorage.setItem('2am_last_email',email);}catch(e){}
    cart=[];updateCart();calcTotal=null;appliedCoupon=null;
    window.location.href='order-confirmation.html';
  }catch(e){
    // Reached only for tokenize failures (bad card number/expiry, caught by
    // Square's SDK before anything is charged) or a network error reaching
    // our own backend — never a real decline (that's the branch above, which
    // navigates away). Keep these inline: the customer just needs to fix a
    // field and retry, and a full-page nav here would wipe their shipping
    // form for no reason. Square's own tokenize error messages are already
    // short and human ("Invalid card number"), safe to show directly.
    checkoutAttemptKey=null;
    st.textContent=e.message;st.className='pay-err';btnLabel.textContent='Place Order';btn.disabled=false;
  }
}
