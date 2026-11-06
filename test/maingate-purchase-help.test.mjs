import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../product.html',import.meta.url),'utf8');
const helper=html.slice(html.indexOf('function renderMaingatePurchaseHelp(p){'),html.indexOf('function renderContent(p){'));
function harness(){const block={hidden:true,innerHTML:''};const ctx=vm.createContext({document:{getElementById:id=>{assert.equal(id,'maingatePurchaseHelp');return block;}}});vm.runInContext(helper,ctx);return {block,render:p=>ctx.renderMaingatePurchaseHelp(p)};}
test('Maingate sizing help links existing chart and actual policy beside the size selector',()=>{
 const h=harness(),chart={rows:[['S','58 cm','62 cm']]},before=JSON.stringify(chart);h.render({id:'2am-the-maingate',content:{sizeChart:chart}});
 assert.equal(h.block.hidden,false);assert.match(h.block.innerHTML,/laid-flat/);assert.match(h.block.innerHTML,/#ppSizeGuide/);assert.match(h.block.innerHTML,/refunds.html/);assert.match(h.block.innerHTML,/No returns for size or change of mind/);assert.equal(JSON.stringify(chart),before);
 const start=html.indexOf('id="sizeBtns"'),fit=html.indexOf('id="maingatePurchaseHelp"'),end=html.indexOf('id="fulfillTag"');assert.ok(start<fit&&fit<end);
});
test('no measurement link is promised without a product chart',()=>{const h=harness();h.render({id:'2am-the-maingate'});assert.equal(h.block.hidden,false);assert.doesNotMatch(h.block.innerHTML,/#ppSizeGuide|laid-flat/);});
test('Stillhours pilot and all other product ids remain untouched by Maingate help',()=>{for(const id of ['2am-the-stillhours','legacy-test-tee','2am-the-virgil']){const h=harness();h.render({id});assert.equal(h.block.hidden,true);assert.equal(h.block.innerHTML,'');}});
test('rendering another product clears previous Maingate text',()=>{const h=harness();h.render({id:'2am-the-maingate'});h.render({id:'legacy-test-tee'});assert.equal(h.block.hidden,true);assert.equal(h.block.innerHTML,'');});
test('new copy adds no delivery maximum, fit guarantee or response SLA',()=>{assert.doesNotMatch(helper,/5 weeks|guarantee|same.day|size down|tracking/);});
test('executable inline scripts parse without running providers',()=>{for(const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){if(/src=|ld\+json/i.test(m[1])||!m[2].trim())continue;new vm.Script(m[2]);}});
