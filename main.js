// AI Usage Bar Local 2.4.1 — native weekly quota utility.
ObjC.import('AppKit');
ObjC.import('Foundation');
var APP_VERSION='2.4.1';
var base=ObjC.unwrap($.NSBundle.mainBundle.resourcePath);
var stateDir=ObjC.unwrap($.NSHomeDirectory())+'/Library/Application Support/AI Usage Bar Local';
var app=$.NSApplication.sharedApplication;
var status,menu,window,delegate,root,ticker,task=null,pipe=null;
var snapshot=null,lastError='',nextFetch=0,started=0,lastDraw=0;
var W=320,H=300;
var palette={bg:'#FAFAFC',ink:'#1D1D1F',muted:'#6E6E73',line:'#E0E0E5',green:'#34C759',blue:'#007AFF',red:'#FF3B30',unknown:'#8E8E93'};

function finiteNumber(v){return typeof v==='number'&&Number.isFinite(v);}
function remainingColor(remaining){
 if(!finiteNumber(remaining)||remaining<0||remaining>100)return palette.unknown;
 return remaining>=50?palette.green:remaining>=25?palette.blue:palette.red;
}
function fmtDate(seconds){
 if(!finiteNumber(seconds)||seconds<=0)return '未提供';
 // Display dates in the user's current Asia/Shanghai context, independently of host TZ.
 var d=new Date((seconds+8*3600)*1000);
 function p(n){return String(n).padStart(2,'0');}
 return d.getUTCFullYear()+'-'+p(d.getUTCMonth()+1)+'-'+p(d.getUTCDate())+' '+p(d.getUTCHours())+':'+p(d.getUTCMinutes());
}
function fmtTime(seconds){var date=fmtDate(seconds);return date==='未提供'?date:date.slice(11)+':'+String(new Date(seconds*1000).getUTCSeconds()).padStart(2,'0');}
function creditText(value){
 if(value===null||value===undefined||value===''||typeof value==='boolean')return '—';
 var n=Number(value);
 return Number.isFinite(n)?n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
}
function viewModel(data,error,now){
 var windows=data&&Array.isArray(data.windows)?data.windows:[];
 var week=windows.find(function(w){return w.label==='Codex'&&w.seconds===604800&&finiteNumber(w.used)&&w.used>=0&&w.used<=100;})||null;
 var timestamp=data&&finiteNumber(data.fetched_at)?data.fetched_at:null;
 var stale=!!error||!!(data&&(timestamp===null||now-timestamp>150));
 var remaining=week?Math.round((100-week.used)*1e10)/1e10:null;
 var reset=week&&finiteNumber(week.reset)&&week.reset>0?week.reset:null;
 var passes=data&&finiteNumber(data.reset_credits)&&data.reset_credits>=0?data.reset_credits:null;
 return {week:week,remaining:remaining,reset:reset,stale:stale,color:stale?palette.unknown:remainingColor(remaining),
  percent:remaining===null?'—':remaining+'%',used:week?'已用 '+week.used+'%':data?'每周额度暂未提供':'正在读取额度…',
  caption:stale&&week?'本周剩余 · 上次数据':'本周剩余',resetText:reset?fmtDate(reset):data?'重置时间暂未提供':'正在读取重置时间…',
  credits:creditText(data?data.credits:null),passes:passes===null?'—':String(passes),
  updated:timestamp?(stale?'上次更新 ':'更新于 ')+fmtTime(timestamp):'尚未获取额度',
  notice:error||(stale?'数据已过期，请刷新':'')};
}
function layout(width,height){
 var inset=15,ringSize=116;
 return {width:width,height:height,inset:inset,inner:width-2*inset,ringSize:ringSize,ringX:(width-ringSize)/2,ringY:47,
  refreshX:width-116,detailsX:width-59,creditWidth:width/2-inset-12,creditX:inset,passesX:width/2+21,footerY:height-30};
}
function indicatorState(vm){
 if(vm.stale||vm.remaining===null)return {level:'unknown',lit:null,fills:null,color:palette.unknown,label:vm.stale?'上次数据，请刷新':'每周额度未提供'};
 var fills=[0,1,2,3,4].map(function(i){return Math.max(0,Math.min(1,vm.remaining/20-i));});
 return {level:vm.remaining>=50?'normal':vm.remaining>=25?'warning':'low',lit:Math.ceil(vm.remaining/20),fills:fills,color:remainingColor(vm.remaining),
  label:vm.remaining>=50?'每周额度充足':vm.remaining>=25?'每周额度偏低':'每周额度较少'};
}
function col(hex){var n=parseInt(hex.slice(1),16);return $.NSColor.colorWithSRGBRedGreenBlueAlpha(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255,1);}
function rect(x,y,w,h){return $.NSMakeRect(x,H-y-h,w,h);}
function label(text,x,y,w,h,size,weight,color,center){
 var t=$.NSTextField.alloc.initWithFrame(rect(x,y,w,h));t.stringValue=$(String(text));t.bezeled=false;t.drawsBackground=false;t.editable=false;t.selectable=true;
 t.font=$.NSFont.systemFontOfSizeWeight(size,weight||0);t.textColor=col(color||palette.ink);if(center)t.alignment=1;root.addSubview(t);return t;
}
function divider(x,y,w,h){var v=$.NSBox.alloc.initWithFrame(rect(x,y,w,h||1));v.boxType=$.NSBoxCustom;v.borderType=$.NSNoBorder;v.titlePosition=$.NSNoTitle;v.fillColor=col(palette.line);root.addSubview(v);}
function button(title,x,y,w,action,primary){
 var b=$.NSButton.alloc.initWithFrame(rect(x,y,w,24));b.title=$(title);b.bezelStyle=$.NSBezelStyleRounded;b.font=$.NSFont.systemFontOfSizeWeight(11,0.2);b.target=delegate;b.action=action;
 if(primary)b.bezelColor=col(palette.blue);b.enabled=!(primary&&task);b.setAccessibilityLabel($(title));root.addSubview(b);return b;
}
function writePrivate(name,value){var p=stateDir+'/'+name;$(JSON.stringify(value,null,2)).writeToFileAtomicallyEncodingError(p,true,$.NSUTF8StringEncoding,null);$.NSFileManager.defaultManager.setAttributesOfItemAtPathError($({NSFilePosixPermissions:384}),p,null);}
function exportOwnView(view,path){
 var rep=view.bitmapImageRepForCachingDisplayInRect(view.bounds);view.cacheDisplayInRectToBitmapImageRep(view.bounds,rep);
 rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG,$({})).writeToFileAtomically(path,true);
 $.NSFileManager.defaultManager.setAttributesOfItemAtPathError($({NSFilePosixPermissions:384}),path,null);
}
function indicatorImage(info){
 var image=$.NSImage.alloc.initWithSize($.NSMakeSize(35,18));image.lockFocus;
 for(var i=0;i<5;i++){var x=2+i*6.5,cell=$.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius($.NSMakeRect(x,4,4.5,10),2,2);
  col(palette.unknown).colorWithAlphaComponent(info.level==='unknown'?0.35:0.15).setFill;cell.fill;
  if(info.fills&&info.fills[i]>0){$.NSGraphicsContext.saveGraphicsState;cell.addClip;col(info.color).setFill;$.NSBezierPath.bezierPathWithRect($.NSMakeRect(x,4,4.5,10*info.fills[i])).fill;$.NSGraphicsContext.restoreGraphicsState;}
  col(palette.unknown).colorWithAlphaComponent(0.65).setStroke;cell.lineWidth=0.5;cell.stroke;}
 image.unlockFocus;image.template=false;return image;
}
function ring(l,vm){
 var size=l.ringSize,mid=size/2,radius=mid-5,img=$.NSImage.alloc.initWithSize($.NSMakeSize(size,size));img.lockFocus;
 var track=$.NSBezierPath.bezierPathWithOvalInRect($.NSMakeRect(5,5,size-10,size-10));track.lineWidth=5;col('#E8E8ED').setStroke;track.stroke;
 if(vm.remaining!==null&&vm.remaining>0){var arc=$.NSBezierPath.bezierPath;arc.lineWidth=5;arc.lineCapStyle=1;
  arc.appendBezierPathWithArcWithCenterRadiusStartAngleEndAngleClockwise($.NSMakePoint(mid,mid),radius,90,90-vm.remaining*3.6,true);col(vm.color).setStroke;arc.stroke;}
 img.unlockFocus;var view=$.NSImageView.alloc.initWithFrame(rect(l.ringX,l.ringY,size,size));view.image=img;root.addSubview(view);
 label(vm.percent,l.ringX,l.ringY+24,size,36,28,0.6,vm.color,true);
 label(vm.caption,l.ringX-24,l.ringY+61,size+48,19,12,0.25,palette.ink,true);
 label(vm.used,l.ringX-16,l.ringY+86,size+32,16,11,0,palette.muted,true);
}
function draw(){
 if(!root)return;W=Number(root.bounds.size.width);H=Number(root.bounds.size.height);
 var views=root.subviews;for(var i=Number(views.count)-1;i>=0;i--)views.objectAtIndex(i).removeFromSuperview;
 var l=layout(W,H),vm=viewModel(snapshot,lastError,Date.now()/1000);window.backgroundColor=col(palette.bg);
 // The content itself paints its opaque background, including in native view captures.
 var background=$.NSBox.alloc.initWithFrame(root.bounds);background.boxType=$.NSBoxCustom;background.borderType=$.NSNoBorder;background.titlePosition=$.NSNoTitle;background.fillColor=col(palette.bg);root.addSubview(background);
 label('Codex 用量',15,12,116,23,15,0.55);
 button(task?'刷新中…':'刷新',l.refreshX,10,52,'refresh:',true);button('详情',l.detailsX,10,44,'details:',false);divider(0,41,W);
 ring(l,vm);
 label('下次重置',W/2-48,169,96,17,11,0,palette.muted,true);divider(35,177,W/2-92);divider(W/2+57,177,W/2-92);
 label(vm.resetText,15,188,W-30,23,15,0.45,vm.reset?palette.ink:palette.muted,true);
 divider(15,214,W-30);
 label('Credits 余额',l.creditX,220,l.creditWidth,17,11,0,palette.muted);
 label(vm.credits,l.creditX,239,l.creditWidth,25,18,0.5);
 divider(W/2,221,1,39);
 label('可用重置券',l.passesX,220,W/2-36,17,11,0,palette.muted);
 label(vm.passes,l.passesX,239,W/2-36,25,18,0.5);
 divider(15,H-36,W-30);
 label(vm.updated,15,l.footerY,W-117,14,10,0,vm.stale?'#9A5A00':palette.muted);
 label('每 60 秒刷新',W-93,l.footerY,78,14,10,0,palette.muted);
 if(vm.notice)label(vm.notice,15,H-14,W-30,13,10,0,'#9A5A00');
 var indicator=indicatorState(vm);
 var title=(vm.stale?'⚠ ':'')+(vm.remaining===null?'Codex':'周 '+vm.remaining+'%余')+(vm.credits==='—'?'':' · '+Math.floor(Number(snapshot.credits)).toLocaleString('en-US')+'点');
 status.button.image=indicatorImage(indicator);status.button.imagePosition=$.NSImageLeft;status.button.title=$(title);
 status.button.toolTip=$(indicator.label+' · 点击查看每周额度');status.button.setAccessibilityLabel($(indicator.label+'，'+title));
 menu.removeAllItems;addItem('每周：'+(vm.remaining===null?'未提供':vm.remaining+'%剩余'));addItem('Credits：'+vm.credits);addItem('可用重置券：'+vm.passes);
 menu.addItem($.NSMenuItem.separatorItem);addItem('打开额度总览','show:');addItem('立即刷新','refresh:');addItem('额度详情','details:');addItem('官方用量页面','official:');menu.addItem($.NSMenuItem.separatorItem);addItem('退出','stop:');
 writePrivate('display.json',{version:APP_VERSION,rendered_at:Date.now()/1000,title:title,seven_day:vm.week,remaining:vm.remaining,quota_color:vm.color,credits:vm.credits,reset_pass_count:vm.passes,reset_time:vm.resetText,updated:vm.updated,stale:vm.stale,notice:vm.notice,indicator:indicator,layout:l});
 // Export this app's own content for release verification; no other windows are captured.
 if(snapshot&&window.isVisible&&!$.NSFileManager.defaultManager.fileExistsAtPath(stateDir+'/window-'+APP_VERSION+'.png')){
  exportOwnView(root,stateDir+'/window-'+APP_VERSION+'.png');
 }
 if(snapshot&&!vm.stale&&!task&&Number(status.button.bounds.size.width)>35&&!$.NSFileManager.defaultManager.fileExistsAtPath(stateDir+'/menu-bar-'+APP_VERSION+'.png'))exportOwnView(status.button,stateDir+'/menu-bar-'+APP_VERSION+'.png');
 lastDraw=Date.now();
}
function addItem(title,action){var item=$.NSMenuItem.alloc.initWithTitleActionKeyEquivalent($(title),action||null,$(''));if(action)item.target=delegate;menu.addItem(item);}
function showWindow(){window.makeKeyAndOrderFront(null);app.activateIgnoringOtherApps(true);}
function details(){
 var vm=viewModel(snapshot,lastError,Date.now()/1000),rows=['每 60 秒自动刷新。圆环表示每周剩余比例。',''];
 if(snapshot){rows.push(vm.stale?'以下为上次成功获取的数据。':'更新时间：'+fmtDate(snapshot.fetched_at));rows.push(vm.week?'每周额度：'+vm.used+' · 剩余 '+vm.percent:'每周额度：未提供');rows.push('下次重置：'+vm.resetText,'Credits 精确余额：'+(snapshot.credits===null?'未提供':snapshot.credits),'可用重置券：'+vm.passes);
  rows.push('当前接口不区分购买与赠送，不提供累计购买额与到期明细。');
  (snapshot.models||[]).forEach(function(m){rows.push(m.name+'：'+(m.available?'可用':'暂不可用'));});
  var e=snapshot.message_estimates||{};if(e.approx_local_messages)rows.push('本地消息估算：'+e.approx_local_messages.join('–'));if(e.approx_cloud_messages)rows.push('云端消息估算：'+e.approx_cloud_messages.join('–'));rows.push('消息数为估算范围，不是精确剩余次数。');
  (snapshot.reset_passes||[]).forEach(function(p,i){rows.push('重置券 '+(i+1)+' 到期：'+(p.expires_at?fmtDate(p.expires_at):'未提供'));});
 }else rows.push('尚未获取额度数据。');if(vm.notice)rows.push('',vm.notice);rows.push('','独立 ChatGPT 聊天限额未由此接口提供。');
 var a=$.NSAlert.alloc.init;a.messageText=$('额度详情');a.informativeText=$(rows.join('\n'));a.addButtonWithTitle('知道了');a.runModal;
}
function startFetch(){
 if(task)return;
 try{var nextTask=$.NSTask.alloc.init;if(!nextTask)throw new Error('无法创建刷新任务');var nextPipe=$.NSPipe.pipe;
  nextTask.executableURL=$.NSURL.fileURLWithPath('/usr/local/bin/python3');nextTask.arguments=$(['-I','-B',base+'/collector.py']);nextTask.environment=$({HOME:ObjC.unwrap($.NSHomeDirectory()),PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8',PYTHONUTF8:'1'});
  nextTask.standardOutput=nextPipe;nextTask.standardError=$.NSFileHandle.fileHandleWithNullDevice;nextTask.launch;task=nextTask;pipe=nextPipe;started=Date.now();nextFetch=started+60000;
 }catch(e){task=null;pipe=null;lastError='刷新失败，稍后自动重试';nextFetch=Date.now()+60000;draw();}
}
function acceptResult(result){if(result&&result.ok){snapshot=result;lastError='';writePrivate('usage.json',snapshot);}else lastError=result&&result.error?result.error:'读取失败，稍后重试';}
ObjC.registerSubclass({name:'AIUsageLocalDelegate',superclass:'NSObject',methods:{
 'tick:':{types:['void',['id']],implementation:function(){idle();}},
 'windowDidResize:':{types:['void',['id']],implementation:function(){if(root)draw();}},
 'show:':{types:['void',['id']],implementation:function(){showWindow();}},
 'refresh:':{types:['void',['id']],implementation:function(){startFetch();draw();}},
 'details:':{types:['void',['id']],implementation:function(){details();}},
 'official:':{types:['void',['id']],implementation:function(){$.NSWorkspace.sharedWorkspace.openURL($.NSURL.URLWithString('https://chatgpt.com/codex/settings/usage'));}},
 'stop:':{types:['void',['id']],implementation:function(){if(task)task.terminate;app.terminate(null);}}
}});
function startUI(){
 app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);app.applicationIconImage=$.NSImage.alloc.initWithContentsOfFile(base+'/AppIcon.icns');$.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(stateDir,true,$({NSFilePosixPermissions:448}),null);
 delegate=$.AIUsageLocalDelegate.alloc.init;status=$.NSStatusBar.systemStatusBar.statusItemWithLength($.NSVariableStatusItemLength);menu=$.NSMenu.alloc.initWithTitle($('Codex 额度'));status.menu=menu;
 window=$.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(0,0,W,H),1|2|4|8,$.NSBackingStoreBuffered,false);window.title=$('Codex 用量');window.titleVisibility=1;window.titlebarAppearsTransparent=true;window.releasedWhenClosed=false;window.appearance=$.NSAppearance.appearanceNamed($.NSAppearanceNameAqua);window.minSize=$.NSMakeSize(320,332);
 root=window.contentView;window.delegate=delegate;window.center;draw();showWindow();startFetch();draw();ticker=$.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(1,delegate,'tick:',null,true);
}
function idle(){
 if(!root)return 1;
 try{
  if(task&&!task.isRunning){var bytes=pipe.fileHandleForReading.readDataToEndOfFile;var result=JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding(bytes,$.NSUTF8StringEncoding)));task=null;pipe=null;acceptResult(result);draw();}
  if(task&&Date.now()-started>27000){task.terminate;task=null;pipe=null;lastError='请求超时，稍后自动重试';draw();}
  if(!task&&Date.now()>=nextFetch)startFetch();
  if(Number(root.bounds.size.width)!==W||Number(root.bounds.size.height)!==H||Date.now()-lastDraw>15000)draw();
 }catch(e){task=null;pipe=null;lastError='同步或显示失败，稍后重试';nextFetch=Date.now()+60000;writePrivate('ui-error-'+APP_VERSION+'.json',{version:APP_VERSION,at:Date.now()/1000,message:String(e).slice(0,250)});}
 return 1;
}
function reopen(){showWindow();}
function run(){try{startUI();}catch(e){writePrivate('startup-error-'+APP_VERSION+'.json',{message:String(e),stack:e.stack||''});}}
