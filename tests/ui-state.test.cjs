const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
const context = vm.createContext({console});
const palette = source.match(/var palette=.*?;\n/)[0];
const pure = source.slice(source.indexOf('function finiteNumber'), source.indexOf('function col('));
vm.runInContext(palette + pure, context);
const states = [
 [0, '#FF3B30', [0,0,0,0,0]],
 [24.9, '#FF3B30', [1,.245,0,0,0]],
 [25, '#007AFF', [1,.25,0,0,0]],
 [49.9, '#007AFF', [1,1,.495,0,0]],
 [50, '#34C759', [1,1,.5,0,0]],
 [95, '#34C759', [1,1,1,1,.75]],
 [100, '#34C759', [1,1,1,1,1]],
];
function snapshot(remaining, reset=1893456000) {
 return {ok:true,fetched_at:1000,windows:[{label:'Codex',used:100-remaining,seconds:604800,reset}],credits:'1234.5600000000',reset_credits:2};
}
let cases = 0;
for(const [remaining,color,fills] of states) {
 const model = context.viewModel(snapshot(remaining),'',1001);
 const indicator = context.indicatorState(model);
 assert.equal(model.remaining,remaining);
 assert.equal(model.color,color);
 assert.equal(indicator.color,color);
 assert.equal(indicator.fills.length,5);
 indicator.fills.forEach((value,index)=>assert.ok(Math.abs(value-fills[index])<1e-10));
 assert.ok(Math.abs(indicator.fills.reduce((a,b)=>a+b,0)*20-remaining)<1e-10);
 cases++;
}
// Decimal boundaries must use real remaining quota, not rounded display values.
assert.equal(context.viewModel(snapshot(49.95),'',1001).color,'#007AFF');
assert.equal(context.viewModel(snapshot(24.99),'',1001).color,'#FF3B30');
cases+=2;
const fresh=context.viewModel(snapshot(96),'',1001);
assert.equal(fresh.percent,'96%');assert.equal(fresh.used,'已用 4%');
assert.equal(fresh.credits,'1,234.56');assert.equal(fresh.passes,'2');
assert.equal(fresh.resetText,'2030-01-01 08:00');assert.equal(fresh.stale,false);cases++;
for(const data of [null,{fetched_at:1000,windows:[],credits:null,reset_credits:null},snapshot(NaN),snapshot(-1),snapshot(101)]){
 const model=context.viewModel(data,'',1001);
 assert.equal(model.remaining,null);assert.equal(model.percent,'—');
 assert.equal(context.indicatorState(model).fills,null);cases++;
}
const noData=context.viewModel(null,'请求超时',1001);
assert.equal(noData.stale,true);assert.equal(noData.remaining,null);assert.equal(noData.credits,'—');cases++;
for(const error of ['读取失败','请求超时','登录已过期']){
 const failed=context.viewModel(snapshot(96),error,1001);
 assert.equal(failed.remaining,96);assert.equal(failed.stale,true);
 assert.equal(failed.color,'#8E8E93');assert.equal(context.indicatorState(failed).fills,null);
 assert.match(failed.caption,/上次数据/);assert.equal(failed.notice,error);cases++;
}
const expired=context.viewModel(snapshot(96),'',1151);
assert.equal(expired.stale,true);assert.equal(context.indicatorState(expired).fills,null);cases++;
const missingReset=context.viewModel(snapshot(96,null),'',1001);
assert.equal(missingReset.reset,null);assert.equal(missingReset.resetText,'重置时间暂未提供');cases++;
for(const value of [null,undefined,'',true,'garbage'])assert.equal(context.creditText(value),'—');
assert.equal(context.creditText(0),'0.00');cases++;
for(const width of [320,400,640]){
 const l=context.layout(width,300);
 assert.ok(l.ringX>=l.inset&&l.ringX+l.ringSize<=width-l.inset);
 assert.ok(l.refreshX>=131&&l.detailsX+44<=width-l.inset);
 assert.ok(l.creditWidth>=133&&l.passesX+width/2-36<=width-15);
 assert.ok(l.footerY===270);cases++;
}
context.snapshot=snapshot(96);context.lastError='';context.writePrivate=()=>{};
vm.runInContext(source.slice(source.indexOf('function acceptResult('),source.indexOf('ObjC.registerSubclass')),context);
context.acceptResult({ok:false,error:'请求失败'});
assert.equal(context.snapshot.windows[0].used,4);assert.equal(context.lastError,'请求失败');
context.acceptResult(snapshot(95));assert.equal(context.snapshot.windows[0].used,5);assert.equal(context.lastError,'');cases++;
assert.ok(!/5\s*小时|短期额度|five_hour|18000|设计预览|示例数据/.test(source));cases++;
assert.ok(source.includes('1|2|4,$.NSBackingStoreBuffered'));
assert.ok(source.includes('window.minSize=$.NSMakeSize(320,332);window.maxSize=$.NSMakeSize(320,332);window.setContentSize($.NSMakeSize(320,300))'));
assert.ok(!source.includes('setFrameAutosaveName'));cases++;
console.log(JSON.stringify({passed:true,cases,coverage:'quota colors and fractional bars; exact 50/25 boundaries; missing/invalid data; success/failure/stale; reset timezone; narrow layout; no short-term UI'},null,2));
