// AI Usage Bar Local 2.2.0. Native AppKit UI; no web views or downloaded UI dependencies.
ObjC.import('AppKit');
ObjC.import('Foundation');
var base=ObjC.unwrap($.NSBundle.mainBundle.resourcePath);
var stateDir=ObjC.unwrap($.NSHomeDirectory())+'/Library/Application Support/AI Usage Bar Local';
var app=$.NSApplication.sharedApplication;
var status,menu,window,delegate,root,ticker,task=null,pipe=null;
var snapshot=null,lastError='',nextFetch=0,started=0,lastDraw=0;
var W=1100,H=740;
var palette={bg:'#FCFDFE',surface:'#FFFFFF',ink:'#1D1D1F',muted:'#6E6E73',line:'#E5E5EA',green:'#248A3D',greenBg:'#F0F8F1',blue:'#1685FF',blueBg:'#F2F7FF',neutral:'#EBEBEF',orange:'#AC6811',red:'#D70015'};
function col(hex){var n=parseInt(hex.slice(1),16);return $.NSColor.colorWithSRGBRedGreenBlueAlpha(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255,1);}
function rect(x,y,w,h){return $.NSMakeRect(x,H-y-h,w,h);}
function panel(x,y,w,h,bg,radius,border){var v=$.NSBox.alloc.initWithFrame(rect(x,y,w,h));v.boxType=$.NSBoxCustom;v.titlePosition=$.NSNoTitle;v.borderType=border?$.NSLineBorder:$.NSNoBorder;v.fillColor=col(bg);v.cornerRadius=radius||0;v.borderWidth=border?1:0;if(border)v.borderColor=col(border);root.addSubview(v);return v;}
function label(text,x,y,w,h,size,weight,color){var t=$.NSTextField.alloc.initWithFrame(rect(x,y,w,h));t.stringValue=$(String(text));t.bezeled=false;t.drawsBackground=false;t.editable=false;t.selectable=true;t.font=$.NSFont.systemFontOfSizeWeight(size,weight||0);t.textColor=col(color||palette.ink);root.addSubview(t);return t;}
function button(title,x,y,w,h,action){panel(x,y,w,h,action==='refresh:'?palette.blue:palette.surface,18,action==='refresh:'?null:palette.line);var t=label(title,x+8,y+7,w-16,h-8,13,0.2,action==='refresh:'?'#FFFFFF':palette.ink);t.alignment=1;t.selectable=false;var b=$.NSButton.alloc.initWithFrame(rect(x,y,w,h));b.title=$(title);b.transparent=true;b.target=delegate;b.action=action;b.setAccessibilityLabel($(title));root.addSubview(b);return b;}
function writePrivate(name,value){var p=stateDir+'/'+name;$(JSON.stringify(value,null,2)).writeToFileAtomicallyEncodingError(p,true,$.NSUTF8StringEncoding,null);$.NSFileManager.defaultManager.setAttributesOfItemAtPathError($({NSFilePosixPermissions:384}),p,null);}
function fmtDate(seconds){var d=new Date(seconds*1000);function p(n){return String(n).padStart(2,'0');}return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());}
function countdown(seconds){if(!seconds)return '尚无重置时间';var n=Math.max(0,Math.floor(seconds-Date.now()/1000));if(!n)return '等待服务端更新';var d=Math.floor(n/86400),h=Math.floor(n%86400/3600),m=Math.floor(n%3600/60);return (d?d+'天 ':'')+(h?h+'小时 ':'')+m+'分';}
function pctColor(used){return used<75?palette.green:used<90?palette.orange:palette.red;}
function lights(x,y,w,used,accent){var gap=4,count=20,cell=(w-gap*(count-1))/count;var remaining=used===null?0:Math.round((100-used)/100*count);panel(x-5,y-5,w+10,30,'#F7FAFA',15,'#DBE4E7');for(var i=0;i<count;i++)panel(x+i*(cell+gap),y,cell,20,i<remaining?(used>=90?palette.red:used>=75?palette.orange:accent):'#D9E1E6',6);}
function showWindow(){window.makeKeyAndOrderFront(null);app.activateIgnoringOtherApps(true);}
function startFetch(){if(task)return;task=$.NSTask.alloc.init;task.executableURL=$.NSURL.fileURLWithPath('/usr/local/bin/python3');task.arguments=$(['-I','-B',base+'/collector.py']);task.environment=$({HOME:ObjC.unwrap($.NSHomeDirectory()),PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8',PYTHONUTF8:'1'});pipe=$.NSPipe.pipe;task.standardOutput=pipe;task.standardError=$.NSFileHandle.fileHandleWithNullDevice;task.launch;started=Date.now();nextFetch=started+60000;}
function addItem(title,action){var item=$.NSMenuItem.alloc.initWithTitleActionKeyEquivalent($(title),action||null,$(''));if(action)item.target=delegate;menu.addItem(item);}
function symbol(name,x,y,size,tint){var im=$.NSImage.imageWithSystemSymbolNameAccessibilityDescription($(name),$(name));if(!im)return;var v=$.NSImageView.alloc.initWithFrame(rect(x,y,size||22,size||22));v.image=im;v.imageScaling=3;v.contentTintColor=col(tint||palette.muted);root.addSubview(v);}
function quotaCard(x,title,subtitle,data,isWeek){
 var width=512,accent=isWeek?'#1685FF':'#A3EE36';
 panel(x,177,width,328,isWeek?'#F7FCF2':'#F2FAFE',20,isWeek?'#E0EED6':'#D9EEF9');
 panel(x+24,199,48,48,isWeek?'#E1F8C9':'#D6EDFF',15);
 symbol(isWeek?'calendar':'clock',x+35,210,26,'#142D47');
 label(title,x+88,200,225,28,20,0.4);label(subtitle,x+88,229,240,22,12,0,palette.muted);
 if(data){
  label('已用 '+data.used+'%',x+385,215,113,27,15,0.2,palette.muted);
  label('剩余',x+24,291,70,36,24,0.4);label(String(100-data.used)+'%',x+100,264,380,82,66,0.55);
 }else{label(snapshot?'暂未提供':'读取中',x+24,278,456,70,44,0.3,palette.muted);}
 lights(x+30,352,452,data?data.used:null,accent);
 panel(x+24,397,464,1,'#DDE7EA',0);
 label(data&&data.reset?fmtDate(data.reset)+' 重置':data?'重置时间暂未提供':'当前账户未返回此窗口',x+24,412,464,25,16,0,palette.muted);
 label(data&&data.reset?(data.reset>Date.now()/1000?'还有 ':'')+countdown(data.reset):'等待服务端提供',x+24,443,464,44,29,0.4,data&&data.reset?palette.ink:palette.muted);
}
function draw(){
 var views=root.subviews;for(var i=Number(views.count)-1;i>=0;i--)views.objectAtIndex(i).removeFromSuperview;
 window.backgroundColor=col(palette.bg);panel(0,0,W,H,palette.bg,0);
 panel(0,0,W,69,'#F0F7FB',0);
 symbol('gauge.with.dots.needle.67percent',28,21,28,palette.blue);label('AI Usage Bar',68,20,290,32,21,0.45);
 panel(442,16,216,38,'#E7EFF1',19);var account=label('Codex · 本机账户',450,24,200,24,14,0.2);account.alignment=1;
 button(task?'正在刷新…':'刷新额度',843,16,132,38,'refresh:');button('详情',987,16,85,38,'details:');
 label('剩余额度',28,87,650,46,36,0.55);
 label('实时查看 Codex 使用额度与重置时间',30,139,700,25,16,0,palette.muted);
 var stale=!!lastError||!!(snapshot&&Date.now()/1000-snapshot.fetched_at>150);
 var windows=snapshot?snapshot.windows:[];
 var five=windows.find(function(w){return w.label==='Codex'&&w.seconds===18000;})||null;
 var week=windows.find(function(w){return w.label==='Codex'&&w.seconds===604800;})||null;
 quotaCard(28,'5 小时额度','当前 5 小时使用额度',five,false);
 quotaCard(560,'7 天额度','当前 7 天使用额度',week,true);
 var credit=snapshot&&snapshot.credits!==null?Number(snapshot.credits):NaN;
 var creditText=Number.isFinite(credit)?credit.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
 var resetCount=snapshot&&snapshot.reset_credits!==null?snapshot.reset_credits:'—';
 var passes=snapshot?(snapshot.reset_passes||[]):[];
 var resetText=passes.length&&passes[0].expires_at?'最近到期 '+fmtDate(passes[0].expires_at):snapshot&&snapshot.reset_details_available?(resetCount===0?'暂无可用重置券':'已核实重置券明细'):'到期明细暂未提供';
 panel(28,524,1044,145,'#F2F4F7',20);
 panel(47,546,68,68,'#E6F1DE',34);symbol('externaldrive',65,564,32,'#386228');
 label('加购余额',133,547,425,26,18,0.4);
 var balanceLabel=label(creditText,133,577,425,50,38,0.4);var balanceWidth=Math.min(330,Number(balanceLabel.intrinsicContentSize.width));label('Credits',143+balanceWidth,596,100,26,18,0.2);
 label('余额可能含赠送额度 · 到期明细暂未提供',133,639,480,22,12,0,palette.muted);
 panel(634,548,1,99,'#DFE4E9',0);
 panel(664,546,68,68,'#DBEAFC',34);symbol('ticket',681,563,34,'#234583');
 label('可用重置券',752,547,290,26,18,0.4);label(resetCount,752,579,280,48,38,0.4);
 label(resetText,752,639,300,22,12,0,palette.muted);
 panel(28,686,1044,1,palette.line,0);
 label(stale?'上次数据 · '+(lastError||'等待刷新'):snapshot?'更新于 '+new Date(snapshot.fetched_at*1000).toLocaleTimeString('zh-CN',{hour12:false})+' · 每 60 秒刷新':'正在连接本机账户…',28,702,655,25,12,0,stale?palette.orange:palette.muted);
 label('ChatGPT 聊天限额暂未提供',824,702,250,25,12,0,palette.muted);
 var schedule=[{name:'5 小时重置',date:five&&five.reset?fmtDate(five.reset):'未提供'},{name:'7 天重置',date:week&&week.reset?fmtDate(week.reset):'未提供'}];
 var lead=week||five||windows[0];
 var title=(stale?'⚠ ': '')+(lead?(lead===week?'周 ':'')+(100-lead.used)+'%余':'Codex')+(Number.isFinite(credit)?' · '+Math.floor(credit).toLocaleString('en-US')+'点':'');
 status.button.title=$(title);status.button.toolTip=$('套餐剩余比例 · 加购 Credits 余额；点击查看额度总览');
 menu.removeAllItems;addItem('打开额度总览','show:');addItem('立即刷新','refresh:');menu.addItem($.NSMenuItem.separatorItem);
 addItem('5 小时：'+(five?(100-five.used)+'%剩余':'当前账户未提供'));
 addItem('7 天：'+(week?(100-week.used)+'%剩余':'当前账户未提供'));
 addItem('加购余额：'+creditText+' Credits');
 menu.addItem($.NSMenuItem.separatorItem);addItem('官方用量页面','official:');addItem('额度详情','details:');addItem('退出','stop:');
 writePrivate('display.json',{version:'2.2.0',rendered_at:Date.now()/1000,title:title,five_hour:five,seven_day:week,credits:creditText,schedule:schedule,reset_pass_count:resetCount,stale:stale});
 if(snapshot&&window.isVisible&&!$.NSFileManager.defaultManager.fileExistsAtPath(stateDir+'/window.png')){
  var rep=root.bitmapImageRepForCachingDisplayInRect(root.bounds);root.cacheDisplayInRectToBitmapImageRep(root.bounds,rep);rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG,$({})).writeToFileAtomically(stateDir+'/window.png',true);$.NSFileManager.defaultManager.setAttributesOfItemAtPathError($({NSFilePosixPermissions:384}),stateDir+'/window.png',null);
 }
 lastDraw=Date.now();
}
function details(){
 var rows=['每 60 秒自动刷新。彩色灯条表示剩余比例。',''];
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
function run(){app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);$.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(stateDir,true,$({NSFilePosixPermissions:448}),null);delegate=$.AIUsageLocalDelegate.alloc.init;status=$.NSStatusBar.systemStatusBar.statusItemWithLength($.NSVariableStatusItemLength);menu=$.NSMenu.alloc.initWithTitle($('Codex 额度'));status.menu=menu;window=$.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(0,0,W,H),1|2|4,$.NSBackingStoreBuffered,false);window.title=$('AI Usage Bar');window.releasedWhenClosed=false;window.appearance=$.NSAppearance.appearanceNamed($.NSAppearanceNameAqua);root=window.contentView;window.center;draw();showWindow();startFetch();ticker=$.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(1,delegate,'tick:',null,true);}
function idle(){try{if(task&&!task.isRunning){var bytes=pipe.fileHandleForReading.readDataToEndOfFile;var result=JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding(bytes,$.NSUTF8StringEncoding)));task=null;pipe=null;if(result.ok){snapshot=result;lastError='';writePrivate('usage.json',snapshot);}else lastError=result.error||'读取失败';draw();}if(task&&Date.now()-started>27000){task.terminate;task=null;pipe=null;lastError='请求超时';draw();}if(!task&&Date.now()>=nextFetch)startFetch();if(Date.now()-lastDraw>15000)draw();}catch(e){task=null;pipe=null;lastError='同步或显示失败，稍后重试';nextFetch=Date.now()+60000;writePrivate('ui-error.json',{message:String(e).slice(0,250)});}return 1;}
function reopen(){showWindow();}
