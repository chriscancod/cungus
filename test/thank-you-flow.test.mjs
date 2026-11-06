import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const NOW = 1793988000000;
const read = p => fs.readFileSync(new URL('../'+p, import.meta.url),'utf8');
const inline = p => [...read(p).matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
function harness(initial={},blocked=false){
  const nodes=new Map(),values=new Map(Object.entries(initial)), requests=[];
  const node=id=>{if(!nodes.has(id)){const hidden=new Set(['hidden']);nodes.set(id,{textContent:'',innerHTML:'',value:'person@example.com',checked:true,disabled:false,focus(){this.focused=true;},classList:{add:x=>hidden.add(x),remove:x=>hidden.delete(x),contains:x=>hidden.has(x)}});}return nodes.get(id);};
  const ctx=vm.createContext({Date:{now:()=>NOW},document:{getElementById:node},sessionStorage:{getItem:k=>{if(blocked)throw Error('blocked');return values.get(k)??null;},removeItem:k=>values.delete(k),setItem:(k,v)=>{if(blocked)throw Error('blocked');values.set(k,v);}},window:{location:{href:''}},navigator:{clipboard:{writeText:async()=>{}}},setTimeout:()=>{},fetch:async(...args)=>{requests.push(args);throw Error('Network forbidden in offline tests');},CONFIG:{MEGA_BACKEND_URL:'https://offline.invalid'},console});
  return {ctx,node,values,requests};
}
const cart=read('shared/cart.js');
const signupSource='const EMAIL_RE=/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;\n'+cart.slice(cart.indexOf('async function submitSignup('),cart.indexOf('// ── SUPPORT CHAT WIDGET'));
async function signup(reply,options={}){
 const h=harness({},options.blocked);h.node('signupEmail').value=options.email??'person@example.com';h.node('signupConsent').checked=options.consent??true;
 h.ctx.fetch=async(...args)=>{h.requests.push(args);if(reply instanceof Error)throw reply;return reply;};vm.runInContext(signupSource,h.ctx);
 const button={disabled:false};await h.ctx.submitSignup({preventDefault(){},target:{querySelector:()=>button}});return {...h,button};
}
test('signup redirects only on HTTP success and strict true, with no email in URL or storage',async()=>{
 const h=await signup({ok:true,json:async()=>({success:true})});assert.equal(h.ctx.window.location.href,'signup-thank-you.html');assert.deepEqual(JSON.parse(h.values.get('2am_signup_complete')),{at:NOW});assert.equal(h.values.size,1);assert.equal(h.node('signupEmail').value,'');assert.equal(h.requests.length,1);assert.equal(h.button.disabled,false);
 const payload=JSON.parse(h.requests[0][1].body);assert.equal(payload.email,'person@example.com');
});
for(const [label,reply] of Object.entries({httpFailure:{ok:false,json:async()=>({success:true})},apiFailure:{ok:true,json:async()=>({success:false})},truthy:{ok:true,json:async()=>({success:'true'})},nullBody:{ok:true,json:async()=>null},invalidJson:{ok:true,json:async()=>{throw SyntaxError('Invalid JSON');}},network:new TypeError('fetch failed')})){
 test(`signup stays on form for ${label}`,async()=>{const h=await signup(reply);assert.equal(h.ctx.window.location.href,'');assert.equal(h.values.size,0);assert.equal(h.node('signupStatus').className,'signup-status err');assert.equal(h.node('signupEmail').value,'person@example.com');assert.equal(h.node('signupConsent').checked,true);assert.equal(h.button.disabled,false);});
}
test('invalid email and absent consent never request',async()=>{for(const options of [{email:'bad'}, {consent:false}]){const h=await signup(null,options);assert.equal(h.requests.length,0);assert.equal(h.ctx.window.location.href,'');}});
test('blocked storage preserves inline verified success without redirect',async()=>{const h=await signup({ok:true,json:async()=>({success:true})},{blocked:true});assert.equal(h.ctx.window.location.href,'');assert.equal(h.node('signupStatus').className,'signup-status ok');});
for(const [label,marker,success] of [
 ['direct',undefined,false],['malformed','yes',false],['legacy true','true',false],
 ['null','null',false],['empty object','{}',false],['string timestamp',JSON.stringify({at:String(NOW)}),false],
 ['success',JSON.stringify({at:NOW}),true],['within TTL',JSON.stringify({at:NOW-299999}),true],
 ['TTL boundary',JSON.stringify({at:NOW-300000}),true],['expired',JSON.stringify({at:NOW-300001}),false],
 ['future',JSON.stringify({at:NOW+1}),false]
])test(`signup page ${label}`,()=>{
 const h=harness(marker===undefined?{}:{'2am_signup_complete':marker});
 vm.runInContext(inline('signup-thank-you.html'),h.ctx);
 assert.equal(h.node('signup-title').textContent,success?"You're on the list.":'');
 assert.equal(h.requests.length,0);assert.equal(h.values.size,0);
});
test('signup marker is one-use and refresh starts neutral',()=>{
 const h=harness({'2am_signup_complete':JSON.stringify({at:NOW})});
 vm.runInContext(inline('signup-thank-you.html'),h.ctx);
 assert.equal(h.node('signup-title').textContent,"You're on the list.");
 h.node('signup-title').textContent='';
 vm.runInContext(inline('signup-thank-you.html'),h.ctx);
 assert.equal(h.node('signup-title').textContent,'');assert.equal(h.values.size,0);
});
test('signup page blocked storage remains neutral',()=>{const h=harness({},true);vm.runInContext(inline('signup-thank-you.html'),h.ctx);assert.equal(h.node('signup-title').textContent,'');});
const receipt={transactionId:'tx-123',email:'person@example.com',total:0,items:[{name:'The Maingate',price:0}],wardrobeCodes:[],customerEmailed:false};
function order(value,blocked=false){const h=harness(value===undefined?{}:{'2am_order':typeof value==='string'?value:JSON.stringify(value)},blocked);vm.runInContext(inline('order-confirmation.html'),h.ctx);return h;}
for(const [label,value] of [['missing',undefined],['bad JSON','{'],['null','null'],['empty',{}],['false total',{...receipt,total:false}],['negative total',{...receipt,total:-1}],['missing ID',{...receipt,transactionId:''}],['malformed items',{...receipt,items:[null]}],['invalid codes',{...receipt,wardrobeCodes:[null]}]])test(`receipt ${label} shows neutral state without success`,()=>{const h=order(value);assert.equal(h.node('order-content').classList.contains('hidden'),true);assert.equal(h.node('error-state').classList.contains('hidden'),false);assert.equal(h.requests.length,0);});
test('blocked receipt storage shows neutral state',()=>{const h=order(undefined,true);assert.equal(h.node('error-state').classList.contains('hidden'),false);});
test('valid zero-total receipt is displayed and consumed; refresh is neutral',()=>{const h=order(receipt);assert.equal(h.node('order-content').classList.contains('hidden'),false);assert.equal(h.node('order-total').textContent,'$0.00');assert.equal(h.node('codes-section').innerHTML,'');assert.equal(h.values.size,0);assert.equal(h.requests.length,0);h.ctx.loadOrder();assert.equal(h.node('error-state').classList.contains('hidden'),false);});
test('email sent language requires strict customerEmailed true',()=>{for(const flag of [false,undefined,'true',true]){const h=order({...receipt,customerEmailed:flag});assert.equal(h.node('confirm-sub').textContent.includes('Confirmation sent'),flag===true);}});
test('receipt product, preorder and code HTML is escaped; copy handler contains index only',()=>{const attack=`'"><img src=x onerror=alert(1)>`;const h=order({...receipt,items:[{name:attack,price:5}],preorder:{note:attack},wardrobeCodes:[{code:attack,product:{name:attack}}]});for(const id of ['items-list','codes-section','preorder-note']){assert.ok(!h.node(id).innerHTML.includes('<img'));assert.ok(h.node(id).innerHTML.includes('&lt;img'));}assert.match(h.node('codes-section').innerHTML,/onclick="copyCode\(0\)"/);});
test('receipt HTML has no unconditional shipment or future activation-email promise',()=>{const text=read('order-confirmation.html');assert.ok(!text.includes('on its way'));assert.ok(!text.includes('will be emailed shortly'));assert.ok(!text.includes('your order went through'));});
const checkoutSource=read('shared/checkout.js').slice(read('shared/checkout.js').indexOf('let checkoutAttemptKey=null;'));
async function checkout(response,tokenResult={status:'OK',token:'offline-token'}){
 const h=harness(),button={textContent:'',disabled:false,querySelector(){return null;}};
 const baseGet=h.ctx.document.getElementById;h.ctx.document.getElementById=id=>id==='payBtn'?button:baseGet(id);
 Object.assign(h.ctx,{squareReady:true,squareCard:{tokenize:async()=>tokenResult},crypto:{randomUUID:()=> 'offline-key'},cart:receipt.items,appliedCoupon:null,calcTotal:null,updateCart:()=>{},showToast:()=>{},localStorage:{setItem:()=>{}}});
 h.ctx.fetch=async(...args)=>{h.requests.push(args);if(response instanceof Error)throw response;return {json:async()=>response};};
 vm.runInContext(checkoutSource,h.ctx);await h.ctx.processPayment();return {...h,button};
}
test('existing checkout success stashes receipt then routes to existing confirmation',async()=>{const h=await checkout({success:true,transactionId:'tx-123',total:0,customerEmailed:true});assert.equal(h.ctx.window.location.href,'order-confirmation.html');const saved=JSON.parse(h.values.get('2am_order'));assert.equal(saved.transactionId,'tx-123');assert.equal(saved.total,0);assert.equal(saved.customerEmailed,true);assert.equal(h.requests.length,1);const request=JSON.parse(h.requests[0][1].body);assert.equal(request.token,'offline-token');assert.equal(request.idempotencyKey,'offline-key');});
test('existing checkout API decline never stores success receipt',async()=>{const h=await checkout({success:false,error:'Declined'});assert.equal(h.ctx.window.location.href,'payment-declined.html');assert.equal(h.values.has('2am_order'),false);});
test('existing checkout tokenize failure makes no request or success navigation',async()=>{const h=await checkout(null,{status:'ERROR',errors:[{message:'Card invalid'}]});assert.equal(h.requests.length,0);assert.equal(h.ctx.window.location.href,'');assert.equal(h.values.has('2am_order'),false);assert.equal(h.button.disabled,false);});
test('existing checkout network failure stays inline without success receipt',async()=>{const h=await checkout(new TypeError('offline'));assert.equal(h.ctx.window.location.href,'');assert.equal(h.values.has('2am_order'),false);assert.equal(h.button.disabled,false);});
