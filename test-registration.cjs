const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('app.js', 'utf8');
const backend = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
new vm.Script(source);
new vm.Script(backend);
const context = vm.createContext({});
vm.runInContext(fs.readFileSync('taiwan-counties.js', 'utf8'), context);
vm.runInContext(`const LINE_ICON=''; const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));` +
  source.slice(source.indexOf('const TAIWAN_COUNTIES ='), source.indexOf('let memberEditing =')), context);
const run = code => vm.runInContext(code, context);
assert.equal(run('TAIWAN_COUNTY_PATHS.length'), 22);
assert.equal(run('new Set(TAIWAN_COUNTY_PATHS.map(p=>p.name)).size'), 22);
assert.ok(run('TAIWAN_COUNTIES.every(name=>TAIWAN_COUNTY_PATHS.some(p=>p.name===name))'));
assert.match(run('renderSignup({name:"測試"})'), />確認抓取<\/button>/);
assert.doesNotMatch(run('renderSignup({name:"測試"})'), /continue-signup|下一步：填寫會員資料/);
assert.doesNotMatch(run('renderSignup({name:"測試"})'), /id="signup-form"/);
assert.match(run('renderSignup({name:"測試",county:"臺北市"})'), /class="county-catch-result" hidden/);
assert.match(run('renderSignup({name:"測試",county:"臺北市",detailsStep:true})'), /id="signup-form"/);
assert.match(run('renderSignup({name:"測試",county:"不存在",detailsStep:true})'), /先點地圖上的縣市/);
assert.doesNotMatch(run('renderSignup({name:"測試"})'), /county-options|county-option"/);
assert.equal(run('COUNTY_MAP_LABELS.length'), 22);
assert.ok(run('TAIWAN_COUNTIES.every(name => COUNTY_MAP_LABELS.some(label => label[0] === name))'));
assert.ok(run('COUNTY_CLAW_DURATION >= 2000'));
const reducedMotionRules = [...fs.readFileSync('style.css', 'utf8').matchAll(/@media \(prefers-reduced-motion: reduce\)[^\n]*/g)].map(match => match[0]);
for (const rule of reducedMotionRules.filter(rule => /county-claw|claw-finger/.test(rule))) {
  assert.doesNotMatch(rule, /display:\s*none|animation:\s*none/, '主動點選的爪子不得因減少動態而隱藏或停播');
}
for (const box of [{x:360,y:20,width:18,height:25},{x:430,y:570,width:10,height:20},{x:20,y:40,width:100,height:80}]) {
  context.box = box;
  const [x,y,w,h] = run('countyZoomBox(box)');
  assert.ok(x >= 0 && y+w*100/460 >= -.001 && x+w <= 460.001 && y+h <= 620.001);
  assert.ok(w < 460 && w >= 160);
  context.view = [x,y,w,h];
  const dock = run('countyClawDock(view)');
  assert.ok(dock.x < x+w/4, '爪子停在左側四分之一內');
  assert.ok(dock.y+30*dock.scale < y+w*100/460, '待機爪子必須完整留在地圖上方滑軌區');
}
for (const box of [{width:18,height:25},{width:250,height:100},{width:30,height:260}]) {
  context.payloadBox = box;
  const fit = run('countyPayloadFit(payloadBox, .5)');
  assert.equal(fit.startScale, 2, '拾取時抵銷爪子縮放，圖形與原縣市大小一致');
  assert.ok(fit.endScale * box.width <= 44.001 && fit.endScale * box.height <= 24.001, '帶回左上時圖形應完整夾在爪子內');
}
context.overview = [0,-100,460,720];
context.focused = [200,-35,160,250];
assert.equal(run('countyCatchView(overview, focused, .1)[2]'),460);
assert.ok(run('countyCatchView(overview, focused, .4)[2]') < 460, '下爪期間逐步放大');
assert.equal(run('countyCatchView(overview, focused, .6)[2]'),160, '合爪時維持放大');
assert.ok(run('countyCatchView(overview, focused, .8)[2]') > 160, '提起後逐步縮小');
assert.equal(run('countyCatchView(overview, focused, 1)[2]'),460, '回左上後回到全台');
assert.ok(run('countyCatchFocus({x:200,y:200,width:100,height:100},[180,100,100,160])[2]') < 100, '手動放大後下爪仍會靠近目標');
assert.match(run('renderSignup({name:"測試",county:"臺北市",detailsStep:true,draft:{name:"<script>",phone:"0912345678"}})'), /&lt;script&gt;/);
assert.match(run('renderSignup({name:"測試",county:"臺北市",detailsStep:true,draft:{phone:"0912345678"}})'), /value="0912345678"/);

let stored = null, removed = false;
const ctx = vm.createContext({
  CacheService: {getScriptCache:()=>({get:()=>JSON.stringify({lineId:'test-line',lineName:'測試'}),remove:()=>{removed=true;}})},
  LockService: {getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  Utilities: {formatDate:()=> '2026-11-04'},
});
vm.runInContext(backend + `
const originalMemberSheet = memberSheet;
findMember=()=>null;
memberSheet=()=>({appendRow:row=>capture(row)});
nextMemberCode=()=> 'TEST-0001';
createSession=()=> 'test-session';
`, ctx);
ctx.capture = row => { stored = row; };
const payload = {name:'測試會員',phone:'0900000000',email:'test@example.com',ticket:'test-only',county:'金門縣'};
ctx.payload = payload;
const result = vm.runInContext('signup(payload)',ctx);
assert.equal(stored.length,11);
assert.equal(stored[10],"'金門縣"); // 與原有欄位一致，使用 Sheets 純文字寫入。
assert.equal(result.member.county,'金門縣');
assert.ok(removed);
for (const county of ['', '不存在', '=IMPORTDATA("x")']) {
  ctx.payload = {...payload, county}; stored=null;
  assert.throws(()=>vm.runInContext('signup(payload)',ctx), /請先選擇所在縣市/);
  assert.equal(stored,null);
}
assert.equal(vm.runInContext("toMember(['id','LINE','舊會員','0900000000','a@b.co',12,new Date(),new Date(),'OLD','shop']).county",ctx),'');
// 核對正式資料升級只補 K1；已有其他欄位時不得覆寫。
let headerWrite = [];
let headers = ['LINE ID','LINE 名稱','姓名','手機','Email','點數','加入時間','最後登入時間','會員編號','蝦皮帳號',''];
const sheet = {getMaxColumns:()=>26,getName:()=> '會員',getRange:(row,col,height,width)=>({
  getValues:()=>[headers.slice(0,width)],setValue:value=>{headerWrite.push([row,col,value]);headers[col-1]=value;}
})};
ctx.SpreadsheetApp = {openById:()=>({getSheetByName:()=>sheet})};
vm.runInContext('originalMemberSheet()',ctx);
assert.deepEqual(headerWrite,[[1,11,'所在縣市']]);
vm.runInContext('originalMemberSheet()',ctx);
assert.equal(headerWrite.length,1);
headers[10]='其他用途';headerWrite=[];
assert.throws(()=>vm.runInContext('originalMemberSheet()',ctx),/欄位不符/);
assert.equal(headerWrite.length,0);
console.log('通過：22 縣市及地圖標籤、縮放邊界、移除方格、兩步分流、非法縣市拒絕、草稿保留、文字轉義、K 欄儲存、舊會員相容；未呼叫正式 API。');

// 可本機檢視的獨立測試頁；不載入登入憑證、不連正式會員 API。
if (process.argv.includes('--preview')) {
  // 不覆寫系統動態偏好，確保預覽能重現正式頁面的顯示問題。
  const ui = source.slice(source.indexOf('const TAIWAN_COUNTIES ='), source.indexOf('let memberEditing ='));
  const escape = `const LINE_ICON='';const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));`;
  fs.writeFileSync('registration-preview.html', `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>會員註冊地圖測試</title><link rel="stylesheet" href="style.css"><body><main id="page-member" style="max-width:430px;margin:20px auto;padding:12px"></main><script src="taiwan-counties.js"></script><script>${escape}
  const state={pendingSignup:{name:'測試會員'}};
  const $=s=>document.querySelector(s);
  ${ui}
  function renderMember(){$('#page-member').innerHTML=renderSignup(state.pendingSignup);}
  renderMember();
  document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset.action;if(a==='select-county')selectSignupCounty(el);if(a==='confirm-signup-county')confirmSignupCounty();if(a==='replay-county-claw')replaySignupCountyClaw();if(a==='county-map-reset')resetSignupCountyMap();if(a==='county-map-zoom-in')zoomSignupCountyMap(.7);if(a==='county-map-zoom-out')zoomSignupCountyMap(1.4);if(a==='change-signup-county'){const f=$('#signup-form');state.pendingSignup.draft=Object.fromEntries(['name','phone','email','shopee'].map(k=>[k,f.elements[k].value]));state.pendingSignup.detailsStep=false;renderMember();}if(a==='cancel-signup')location.reload();});
  document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.county-region,.county-map-name')){e.preventDefault();selectSignupCounty(e.target);}});
  document.addEventListener('submit',e=>{e.preventDefault();alert('此頁僅為預覽，不會建立會員');});</script></body></html>`);
}
