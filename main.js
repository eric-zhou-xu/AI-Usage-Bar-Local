// AI Usage Bar Local 2.3.1. Native AppKit UI; no web views or downloaded UI dependencies.
ObjC.import('AppKit');
ObjC.import('Foundation');
var base=ObjC.unwrap($.NSBundle.mainBundle.resourcePath);
var stateDir=ObjC.unwrap($.NSHomeDirectory())+'/Library/Application Support/AI Usage Bar Local';
var app=$.NSApplication.sharedApplication;
var status,menu,window,delegate,root,ticker,task=null,pipe=null;
var snapshot=null,lastError='',nextFetch=0,started=0,lastDraw=0;
var W=860,H=660;
var palette={bg:'#15152F',surface:'#292846',ink:'#F7F5FF',muted:'#BBB9D6',line:'#535071',green:'#50F2BE',blue:'#9686EE',orange:'#FFD18A',red:'#FF839D'};
function col(hex){var n=parseInt(hex.slice(1),16);return $.NSColor.colorWithSRGBRedGreenBlueAlpha(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255,1);}
function rect(x,y,w,h){return $.NSMakeRect(x,H-y-h,w,h);}
function panel(x,y,w,h,bg,radius,border){var v=$.NSBox.alloc.initWithFrame(rect(x,y,w,h));v.boxType=$.NSBoxCustom;v.titlePosition=$.NSNoTitle;v.borderType=border?$.NSLineBorder:$.NSNoBorder;v.fillColor=col(bg).colorWithAlphaComponent(bg==='#514B7B'?0.45:bg==='#696496'?0.65:bg==='#191927'?0.90:bg==='#24243E'?0.85:1);v.cornerRadius=radius||0;v.borderWidth=border?1:0;if(border)v.borderColor=col(border);root.addSubview(v);return v;}
function label(text,x,y,w,h,size,weight,color){var t=$.NSTextField.alloc.initWithFrame(rect(x,y,w,h));t.stringValue=$(String(text));t.bezeled=false;t.drawsBackground=false;t.editable=false;t.selectable=true;t.font=$.NSFont.systemFontOfSizeWeight(size,weight||0);t.textColor=col(color||palette.ink);root.addSubview(t);return t;}
function button(title,x,y,w,h,action){panel(x,y,w,h,action==='refresh:'?palette.blue:palette.surface,18,action==='refresh:'?null:palette.line);var t=label(title,x+8,y+7,w-16,h-8,13,0.2,action==='refresh:'?'#FFFFFF':palette.ink);t.alignment=1;t.selectable=false;var b=$.NSButton.alloc.initWithFrame(rect(x,y,w,h));b.title=$(title);b.transparent=true;b.target=delegate;b.action=action;b.setAccessibilityLabel($(title));root.addSubview(b);return b;}
function writePrivate(name,value){var p=stateDir+'/'+name;$(JSON.stringify(value,null,2)).writeToFileAtomicallyEncodingError(p,true,$.NSUTF8StringEncoding,null);$.NSFileManager.defaultManager.setAttributesOfItemAtPathError($({NSFilePosixPermissions:384}),p,null);}
function fmtDate(seconds){var d=new Date(seconds*1000);function p(n){return String(n).padStart(2,'0');}return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());}
function countdown(seconds){if(!seconds)return '尚无重置时间';var n=Math.max(0,Math.floor(seconds-Date.now()/1000));if(!n)return '等待服务端更新';var d=Math.floor(n/86400),h=Math.floor(n%86400/3600),m=Math.floor(n%3600/60);return (d?d+'天 ':'')+(h?h+'小时 ':'')+m+'分';}
function pctColor(used){return used<75?palette.green:used<90?palette.orange:palette.red;}
// Pure status logic: the tightest returned Codex window determines the light.
function indicatorState(windows,stale){
 var usable=windows.filter(function(w){return w.label==='Codex'&&typeof w.used==='number'&&Number.isFinite(w.used)&&w.used>=0&&w.used<=100;});
 if(stale||!usable.length)return {level:'unknown',lit:0,color:'#A3A0AC',label:stale?'数据已过期，请刷新':'等待额度数据'};
 var used=Math.max.apply(null,usable.map(function(w){return w.used;}));
 return {level:used>=90?'low':used>=75?'warning':'normal',lit:Math.ceil((100-used)/20),color:used>=90?'#FF6488':used>=75?'#FFC46B':'#50E9B5',label:used>=90?'额度接近用尽':used>=75?'额度偏低':'额度充足'};
}
function indicatorImage(info){
 var image=$.NSImage.alloc.initWithSize($.NSMakeSize(35,18));image.lockFocus;
 for(var i=0;i<5;i++){
  var cell=$.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius($.NSMakeRect(2+i*6.5,4,4.5,10),2,2);
  col(info.color).colorWithAlphaComponent(info.level==='unknown'?0.65:i<info.lit?1:0.22).setFill;cell.fill;
  // Keep empty slots outlined, including the fully exhausted state.
  col(info.color).colorWithAlphaComponent(0.75).setStroke;cell.lineWidth=0.5;cell.stroke;
 }
 image.unlockFocus;image.template=false;return image;
}
function showWindow(){window.makeKeyAndOrderFront(null);app.activateIgnoringOtherApps(true);}
function startFetch(){if(task)return;task=$.NSTask.alloc.init;task.executableURL=$.NSURL.fileURLWithPath('/usr/local/bin/python3');task.arguments=$(['-I','-B',base+'/collector.py']);task.environment=$({HOME:ObjC.unwrap($.NSHomeDirectory()),PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8',PYTHONUTF8:'1'});pipe=$.NSPipe.pipe;task.standardOutput=pipe;task.standardError=$.NSFileHandle.fileHandleWithNullDevice;task.launch;started=Date.now();nextFetch=started+60000;}
function addItem(title,action){var item=$.NSMenuItem.alloc.initWithTitleActionKeyEquivalent($(title),action||null,$(''));if(action)item.target=delegate;menu.addItem(item);}
function symbol(name,x,y,size,tint){var im=$.NSImage.imageWithSystemSymbolNameAccessibilityDescription($(name),$(name));if(!im)return;var v=$.NSImageView.alloc.initWithFrame(rect(x,y,size||22,size||22));v.image=im;v.imageScaling=3;v.contentTintColor=col(tint||palette.muted);root.addSubview(v);}
// Native drawing keeps the gauges sharp at every display scale.
function atmosphereView(){
 var img=$.NSImage.alloc.initWithSize($.NSMakeSize(W,H));img.lockFocus;
 var g=$.NSGradient.alloc.initWithColors($([col('#DB655B'),col('#382563'),col('#293877'),col('#777086')]));g.drawInRectAngle($.NSMakeRect(0,0,W,H),75);
 img.unlockFocus;var v=$.NSImageView.alloc.initWithFrame($.NSMakeRect(0,0,W,H));v.image=img;return v;
}
function ring(x,y,used){
 var size=90,img=$.NSImage.alloc.initWithSize($.NSMakeSize(size,size));img.lockFocus;
 var track=$.NSBezierPath.bezierPathWithOvalInRect($.NSMakeRect(9,9,72,72));track.lineWidth=6;col('#47465F').setStroke;track.stroke;
 if(used!==null && used<100){
  var arc=$.NSBezierPath.bezierPath;arc.lineWidth=6;arc.lineCapStyle=1;
  arc.appendBezierPathWithArcWithCenterRadiusStartAngleEndAngleClockwise($.NSMakePoint(45,45),36,90,90-(100-used)*3.6,true);
  col(pctColor(used)).setStroke;arc.stroke;
 }
 img.unlockFocus;var view=$.NSImageView.alloc.initWithFrame(rect(x,y,size,size));view.image=img;root.addSubview(view);
 var t=label(used===null?'—':String(Math.round((100-used)*10)/10)+'%',x,y+30,90,32,21,0.4);t.alignment=1;
}
function quotaCard(x,title,data,dark){
 panel(x,179,122,338,dark?'#191927':'#696496',60,dark?'#625C80':'#C1B7EB');
 symbol(dark?'calendar':'clock',x+46,205,30,'#E0DBF6');
 var t=label(title,x+8,256,106,26,15,0.3);t.alignment=1;
 symbol('chart.bar.xaxis',x+46,309,30,dark?'#72B8FF':'#E8C8FF');
 ring(x+16,365,data?data.used:null);
 var caption=label(data?'剩余':'未提供',x+8,462,106,25,12,0,palette.muted);caption.alignment=1;
}
function timing(y,title,data){
 label(title,405,y,350,27,16,0.35);
 label(data?'已用 '+data.used+'% · 剩余 '+Math.round((100-data.used)*10)/10+'%':snapshot?'当前账户未返回此额度窗口':'正在读取账户额度…',405,y+34,350,26,15,0,palette.muted);
 label(data&&data.reset?countdown(data.reset):'重置时间暂未提供',405,y+68,350,38,26,0.4);
 label(data&&data.reset?fmtDate(data.reset)+' 重置':'缺失额度不代表零或无限',405,y+112,350,24,12,0,palette.muted);
}
function draw(){
 var views=root.subviews;for(var i=Number(views.count)-1;i>=0;i--)views.objectAtIndex(i).removeFromSuperview;
 window.backgroundColor=col(palette.bg);
 var atmosphere=atmosphereView();root.addSubview(atmosphere);
 label('Codex',38,22,370,80,64,0.65);panel(42,111,118,1,'#DCD6F0',0);label('用量条',176,93,170,34,24,0.35);
 button(task?'正在刷新…':'刷新额度',586,42,128,38,'refresh:');button('详情',728,42,90,38,'details:');
 var stale=!!lastError||!!(snapshot&&Date.now()/1000-snapshot.fetched_at>150);
 var windows=snapshot?snapshot.windows:[];
 var five=windows.find(function(w){return w.label==='Codex'&&w.seconds===18000;})||null;
 var week=windows.find(function(w){return w.label==='Codex'&&w.seconds===604800;})||null;
 panel(40,163,292,370,'#514B7B',68,'#9086B4');
 quotaCard(52,'5 小时',five,false);quotaCard(198,'7 天',week,true);
 panel(378,164,440,369,'#24243E',28,'#625A7E');
 timing(187,'短期额度',five);panel(404,353,385,1,palette.line,0);timing(374,'每周额度',week);
 var credit=snapshot&&snapshot.credits!==null?Number(snapshot.credits):NaN;
 var creditText=Number.isFinite(credit)?credit.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
 var resetCount=snapshot&&snapshot.reset_credits!==null?snapshot.reset_credits:'—';
 panel(40,554,778,1,'#9D7C99',0);
 label('Credits 余额',42,570,170,24,13,0,palette.ink);label(creditText,42,597,230,37,27,0.4);
 label('可用重置券',313,570,170,24,13,0,palette.ink);label(String(resetCount),313,597,170,37,27,0.4);
 label(stale?'上次数据 · '+(lastError||'等待刷新'):snapshot?'更新于 '+new Date(snapshot.fetched_at*1000).toLocaleTimeString('zh-CN',{hour12:false}):'正在连接本机账户…',518,573,295,25,12,0,stale?palette.orange:palette.ink);
 label('每 60 秒刷新 · 环形表示剩余额度',518,605,295,24,12,0,palette.ink);
 var schedule=[{name:'5 小时重置',date:five&&five.reset?fmtDate(five.reset):'未提供'},{name:'7 天重置',date:week&&week.reset?fmtDate(week.reset):'未提供'}];
 var lead=week||five||windows[0];
 var title=(stale?'⚠ ': '')+(lead?(lead===week?'周 ':'')+(100-lead.used)+'%余':'Codex')+(Number.isFinite(credit)?' · '+Math.floor(credit).toLocaleString('en-US')+'点':'');
 var indicator=indicatorState(windows,stale);status.button.image=indicatorImage(indicator);status.button.imagePosition=$.NSImageLeft;status.button.title=$(title);status.button.toolTip=$(indicator.label+' · 每格约 20% 剩余额度，按最紧张的 Codex 窗口显示；灰色表示数据不可用。点击查看详情');status.button.setAccessibilityLabel($(indicator.label+'，'+title));
 menu.removeAllItems;addItem('指示灯：'+indicator.label);addItem('打开额度总览','show:');addItem('立即刷新','refresh:');menu.addItem($.NSMenuItem.separatorItem);
 addItem('5 小时：'+(five?(100-five.used)+'%剩余':'当前账户未提供'));
 addItem('7 天：'+(week?(100-week.used)+'%剩余':'当前账户未提供'));
 addItem('加购余额：'+creditText+' Credits');
 menu.addItem($.NSMenuItem.separatorItem);addItem('官方用量页面','official:');addItem('额度详情','details:');addItem('退出','stop:');
 writePrivate('display.json',{version:'2.3.1',rendered_at:Date.now()/1000,title:title,five_hour:five,seven_day:week,credits:creditText,schedule:schedule,reset_pass_count:resetCount,stale:stale,indicator:indicator});
 if(snapshot&&window.isVisible&&!$.NSFileManager.defaultManager.fileExistsAtPath(stateDir+'/window-2.3.1.png')){
  var rep=root.bitmapImageRepForCachingDisplayInRect(root.bounds);root.cacheDisplayInRectToBitmapImageRep(root.bounds,rep);rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG,$({})).writeToFileAtomically(stateDir+'/window-2.3.1.png',true);$.NSFileManager.defaultManager.setAttributesOfItemAtPathError($({NSFilePosixPermissions:384}),stateDir+'/window-2.3.1.png',null);
 }
 lastDraw=Date.now();
}
function details(){
 var rows=['每 60 秒自动刷新。环形进度表示剩余比例。',''];
 if(snapshot){
  rows.push('Credits 精确余额：'+(snapshot.credits===null?'未提供':snapshot.credits));
  rows.push('当前接口不区分购买与赠送，不提供累计购买额与到期明细。');
  snapshot.windows.forEach(function(w){rows.push(w.label+' · '+(w.seconds?w.seconds/3600+'小时':'未知窗口')+'：已用 '+w.used+'%'+(w.reset?'；重置于 '+fmtDate(w.reset):''));});
  (snapshot.models||[]).forEach(function(m){rows.push(m.name+'：'+(m.available?'可用':'暂不可用'));});
  var e=snapshot.message_estimates||{};
  if(e.approx_local_messages)rows.push('本地消息估算：'+e.approx_local_messages.join('–'));
  if(e.approx_cloud_messages)rows.push('云端消息估算：'+e.approx_cloud_messages.join('–'));
  rows.push('消息数为估算范围，不是精确剩余次数。');
  (snapshot.reset_passes||[]).forEach(function(p,i){rows.push('重置券 '+(i+1)+' 到期：'+(p.expires_at?fmtDate(p.expires_at):'未提供'));});
 }
 rows.push('','5 小时窗口未返回时，不代表额度为零或无限。','独立 ChatGPT 聊天限额未由此接口提供。');
 var a=$.NSAlert.alloc.init;a.messageText=$('额度详情');a.informativeText=$(rows.join('\n'));a.addButtonWithTitle('知道了');a.runModal;
}
ObjC.registerSubclass({name:'AIUsageLocalDelegate',superclass:'NSObject',methods:{
 'tick:':{types:['void',['id']],implementation:function(){idle();}},
 'show:':{types:['void',['id']],implementation:function(){showWindow();}},
 'refresh:':{types:['void',['id']],implementation:function(){startFetch();draw();}},
 'details:':{types:['void',['id']],implementation:function(){details();}},
 'official:':{types:['void',['id']],implementation:function(){$.NSWorkspace.sharedWorkspace.openURL($.NSURL.URLWithString('https://chatgpt.com/codex/settings/usage'));}},
 'stop:':{types:['void',['id']],implementation:function(){if(task)task.terminate;app.terminate(null);}}
}});
function startUI(){app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);app.applicationIconImage=$.NSImage.alloc.initWithContentsOfFile(base+'/AppIcon.icns');$.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(stateDir,true,$({NSFilePosixPermissions:448}),null);delegate=$.AIUsageLocalDelegate.alloc.init;status=$.NSStatusBar.systemStatusBar.statusItemWithLength($.NSVariableStatusItemLength);menu=$.NSMenu.alloc.initWithTitle($('Codex 额度'));status.menu=menu;window=$.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(0,0,W,H),1|2|4,$.NSBackingStoreBuffered,false);window.title=$('AI Usage Bar');window.releasedWhenClosed=false;window.appearance=$.NSAppearance.appearanceNamed($.NSAppearanceNameDarkAqua);root=window.contentView;window.center;draw();showWindow();startFetch();ticker=$.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(1,delegate,'tick:',null,true);}
function idle(){if(!root)return 1;try{if(task&&!task.isRunning){var bytes=pipe.fileHandleForReading.readDataToEndOfFile;var result=JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding(bytes,$.NSUTF8StringEncoding)));task=null;pipe=null;if(result.ok){snapshot=result;lastError='';writePrivate('usage.json',snapshot);}else lastError=result.error||'读取失败';draw();}if(task&&Date.now()-started>27000){task.terminate;task=null;pipe=null;lastError='请求超时';draw();}if(!task&&Date.now()>=nextFetch)startFetch();if(Date.now()-lastDraw>15000)draw();}catch(e){task=null;pipe=null;lastError='同步或显示失败，稍后重试';nextFetch=Date.now()+60000;writePrivate('ui-error.json',{version:'2.3.1',at:Date.now()/1000,message:String(e).slice(0,250)});}return 1;}
function reopen(){showWindow();}

function run(){try{startUI();}catch(e){writePrivate("startup-error-2.3.1.json",{message:String(e),stack:e.stack||""});}}
