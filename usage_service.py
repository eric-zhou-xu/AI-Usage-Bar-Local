"""Private, read-only quota observer. No model calls, sockets, login or daemon install.
Only initialize + account/rateLimits/read are sent to an owned stdio app-server.
Sparse events merge in memory; compensation reads every ten minutes.
"""
import copy,fcntl,json,math,os,select,signal,subprocess,sys,time,threading
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import collector
CLI=Path('/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex')
INTERVAL=600
STALE_AFTER=720

def number(v):return collector.number(v)
def safe_balance(v):
 if isinstance(v,bool) or v is None:return None
 try:return str(v) if math.isfinite(float(v)) and float(v)>=0 else None
 except (ValueError,TypeError):return None

def merge_bucket(old,new):
 out=copy.deepcopy(old or {})
 if not isinstance(new,dict):return out
 for key in ('limitId','limitName','planType'):
  if new.get(key) is not None:out[key]=new[key]
 for key in ('primary','secondary'):
  window=new.get(key)
  if not isinstance(window,dict):continue
  before=out.get(key) or {};pct=window.get('usedPercent')
  if not number(pct) or not 0<=pct<=100:continue
  value=dict(before);value['usedPercent']=pct
  for field in ('windowDurationMins','resetsAt'):
   v=window.get(field)
   if number(v) and v>0:value[field]=v
  out[key]=value
 credits=new.get('credits')
 if isinstance(credits,dict) and safe_balance(credits.get('balance')) is not None:
  out['credits']={'balance':safe_balance(credits['balance'])}
 return out

class State:
 def __init__(self):
  self.bucket={};self.data=None;self.event_at=0;self.full_at=0;self.error='';self.events=0;self.reads=0
 def update(self,bucket,now,full=False):
  if not isinstance(bucket,dict):raise ValueError('missing Codex bucket')
  if bucket.get('limitId') not in (None,'codex'):return False
  before=copy.deepcopy(self.data)
  self.bucket=merge_bucket(self.bucket,bucket)
  data=copy.deepcopy(self.data) if self.data else {'ok':True,'windows':[],'credits':None,'reset_credits':None,'reset_passes':[],'models':[],'message_estimates':{}}
  windows=[]
  for field in ('primary','secondary'):
   w=self.bucket.get(field) or {};pct=w.get('usedPercent');duration=w.get('windowDurationMins')
   if number(pct) and number(duration) and duration>0:windows.append({'label':'Codex','used':pct,'seconds':duration*60,'reset':w.get('resetsAt')})
  data['windows']=windows;credit=safe_balance((self.bucket.get('credits') or {}).get('balance'))
  if credit is not None:data['credits']=credit
  data['plan']=self.bucket.get('planType',data.get('plan','未知'));data['fetched_at']=now;data['source']='app-server';data['full_fetched_at']=self.full_at
  self.data=data
  return before is None or any(before.get(k)!=data.get(k) for k in ('windows','credits','plan'))
 def event(self,params,now):
  bucket=params.get('rateLimits') if isinstance(params,dict) else None
  if not isinstance(bucket,dict) or bucket.get('limitId') not in (None,'codex'):return False
  changed=self.update(bucket,now);self.event_at=now;self.events+=1
  return changed
 def full(self,result,now,request_started=0):
  if not isinstance(result,dict):raise ValueError('invalid snapshot')
  buckets=result.get('rateLimitsByLimitId')
  bucket=buckets.get('codex') if isinstance(buckets,dict) else result.get('rateLimits')
  if not isinstance(bucket,dict) or bucket.get('limitId') not in (None,'codex'):raise ValueError('Codex quota unavailable')
  if request_started and self.event_at>request_started:
   bucket={k:v for k,v in bucket.items() if k not in ('primary','secondary')}
  self.full_at=now;self.update(bucket,now,True);self.error='';self.reads+=1
  summary=result.get('rateLimitResetCredits')
  if isinstance(summary,dict):
   count=summary.get('availableCount')
   if number(count) and count>=0:self.data['reset_credits']=count
   details=summary.get('credits')
   if isinstance(details,list):
    self.data['reset_passes']=[{'expires_at':p.get('expiresAt')} for p in details if isinstance(p,dict) and p.get('status')=='available' and (p.get('expiresAt') is None or number(p.get('expiresAt')) and p['expiresAt']>now)]
    self.data['reset_details_available']=True
  return safe_balance((bucket.get('credits') or {}).get('balance')) is None or not isinstance(summary,dict) or not number(summary.get('availableCount'))
 def fallback(self,result,now,request_started):
  if not isinstance(result,dict) or not result.get('ok'):
   self.error=result.get('error','补查失败，请稍后重试') if isinstance(result,dict) else '补查失败，请稍后重试';return
  # An HTTP response started before a live event must not overwrite that event.
  result=copy.deepcopy(result)
  if self.data and self.event_at>request_started:result['windows']=copy.deepcopy(self.data['windows'])
  if self.data:
   for key in ('credits','reset_credits'):
    if result.get(key) is None:result[key]=self.data.get(key)
  self.data=result;self.full_at=now;self.data['full_fetched_at']=now;self.error='';self.reads+=1
  # Seed slots for later sparse events after an HTTP fallback.
  for field,w in zip(('primary','secondary'),[w for w in result.get('windows',[]) if w.get('label')=='Codex']):
   self.bucket[field]={'usedPercent':w['used'],'windowDurationMins':w['seconds']/60 if number(w.get('seconds')) else None,'resetsAt':w.get('reset')}
  if result.get('credits') is not None:self.bucket['credits']={'balance':result['credits']}

def atomic(path,value):
 tmp=path.with_name('.'+path.name+'.tmp')
 with open(tmp,'w') as f:os.chmod(tmp,0o600);json.dump(value,f,ensure_ascii=False);f.flush();os.fsync(f.fileno())
 tmp.replace(path)

class Service:
 def __init__(self,root,parent):
  self.root=root;self.parent=parent;self.state=State();self.process=None;self.buffer=b'';self.ready=False;self.pending={};self.seq=0;self.stopping=False
  self.next_read=0;self.next_connect=0;self.retry=2;self.supplement=0;self.last_supplement=0;self.last_tick=time.monotonic();self.last_wall=time.time();self.last_publish=0;self.fallback_thread=None;self.fallback_result=None;self.fallback_started=0;self.reason='startup';self.connections=0;self.event_error='正在连接额度通知';self.reset_checked=None;self.wake_checks=0
 def send(self,method,params=None):
  # Fixed allowlist, never honor or forward arbitrary requests from disk.
  if method not in ('initialize','initialized','account/rateLimits/read'):raise ValueError('method forbidden')
  request={'method':method}
  if method!='initialized':
   self.seq+=1;request['id']=self.seq;request['params']=params or {};self.pending[self.seq]=(method,time.time())
  self.process.stdin.write((json.dumps(request)+'\n').encode());self.process.stdin.flush()
 def disconnect(self):
  if self.process:
   try:self.process.terminate();self.process.wait(2)
   except (OSError,subprocess.TimeoutExpired):
    try:self.process.kill();self.process.wait(2)
    except (OSError,subprocess.TimeoutExpired):pass
   for stream in (self.process.stdin,self.process.stdout):
    if stream:stream.close()
  self.process=None;self.ready=False;self.pending={};self.buffer=b'';self.event_error='通知连接中断，仍会定时补查';self.next_connect=time.monotonic()+self.retry;self.retry=min(60,self.retry*2)
 def connect(self):
  try:
   # No TCP listener, remote control, auth creation, or installed daemon.
   self.process=subprocess.Popen([str(CLI),'app-server','--stdio'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,bufsize=0,start_new_session=True)
   self.connections+=1
   self.send('initialize',{'clientInfo':{'name':'ai_usage_bar_local','version':'2.4.4'},'capabilities':{'experimentalApi':False,'requestAttestation':False}})
  except (OSError,ValueError):self.disconnect()
 def frame(self,msg):
  now=time.time()
  if msg.get('method')=='account/rateLimits/updated':
   if self.state.event(msg.get('params'),now):
    # Quota immediately visible; delayed full read fills nullable credits/passes.
    self.supplement=max(now+2,self.last_supplement+20)
   self.publish(force=True);return
  req=self.pending.pop(msg.get('id'),None)
  if req:
   if 'error' in msg:
    if req[0]=='initialize':self.disconnect()
    else:self.state.error='额度核对失败，正在使用补查';self.start_fallback()
    return
   if req[0]=='initialize':
    self.send('initialized');self.ready=True;self.retry=2;self.event_error='';self.reason='connected';self.next_read=0
   else:
    try:
     missing=self.state.full(msg.get('result'),now,req[1]);self.next_read=now+INTERVAL
     if missing:self.start_fallback()
    except (ValueError,TypeError,KeyError):self.start_fallback()
    self.publish(force=True)
  elif msg.get('id') is not None and msg.get('method'):
   # The observer cannot perform login, attestation, tool, or approval requests.
   self.process.stdin.write((json.dumps({'id':msg['id'],'error':{'code':-32601,'message':'Read-only quota observer'}})+'\n').encode());self.process.stdin.flush()
 def start_fallback(self):
  if self.fallback_thread is not None:return
  self.fallback_started=time.time();self.fallback_result=None
  def run():self.fallback_result=collector.fetch()
  self.fallback_thread=threading.Thread(target=run,daemon=True);self.fallback_thread.start();self.next_read=time.time()+INTERVAL
 def request_read(self,reason):
  self.reason=reason
  if any(v[0]=='account/rateLimits/read' for v in self.pending.values()) or self.fallback_thread:return
  if any(v[0]=='initialize' for v in self.pending.values()):return
  if self.ready:
   try:self.send('account/rateLimits/read');self.next_read=time.time()+INTERVAL
   except (OSError,BrokenPipeError):self.disconnect();self.start_fallback()
  else:self.start_fallback()
 def publish(self,force=False):
  if not force and time.monotonic()-self.last_publish<3:return
  self.last_publish=time.monotonic()
  if self.state.data:atomic(self.root/'usage.json',self.state.data)
  atomic(self.root/'transport.json',{'version':'2.4.4','heartbeat':time.time(),'connected':self.ready,'error':self.state.error,'event_warning':self.event_error,'event_count':self.state.events,'full_reads':self.state.reads,'connections':self.connections,'last_event_at':self.state.event_at,'full_fetched_at':self.state.full_at,'next_read':self.next_read,'reason':self.reason,'busy':bool(self.pending or self.fallback_thread),'wake_checks':self.wake_checks,'stale_after':STALE_AFTER,'service_pid':os.getpid()})
 def step(self):
  now=time.time();mono=time.monotonic();gap=max(mono-self.last_tick,now-self.last_wall);self.last_tick=mono;self.last_wall=now
  # Covers suspension even when the UI's NSWorkspace wake event was missed.
  if gap>30:self.next_read=0;self.wake_checks+=1;self.reason='wake';self.reset_checked=None
  if self.process and self.process.poll() is not None:self.disconnect()
  if not self.process and mono>=self.next_connect:self.connect()
  if self.process and select.select([self.process.stdout],[],[],.15)[0]:
   data=os.read(self.process.stdout.fileno(),65536)
   if not data:self.disconnect()
   else:
    self.buffer+=data
    if len(self.buffer)>2_000_000:self.disconnect()
    while b'\n' in self.buffer:
     line,self.buffer=self.buffer.split(b'\n',1)
     try:self.frame(json.loads(line))
     except (ValueError,TypeError,KeyError):pass
  for ident,(method,started) in list(self.pending.items()):
   if now-started>30:
    self.disconnect();self.start_fallback();break
  if self.fallback_thread and not self.fallback_thread.is_alive():
   self.state.fallback(self.fallback_result,now,self.fallback_started);self.fallback_thread=None;self.publish(force=True)
  for name in ('refresh','wake'):
   marker=self.root/('.'+name)
   if marker.exists():
    marker.unlink(missing_ok=True);self.next_read=0;self.reason=name
    if name=='wake':self.wake_checks+=1
  if self.state.data:
   week=next((w for w in self.state.data.get('windows',[]) if w.get('label')=='Codex' and w.get('seconds')==604800),{})
   reset=week.get('reset')
   if number(reset) and reset<=now and reset!=self.reset_checked:self.reset_checked=reset;self.next_read=0;self.reason='reset'
  if self.supplement and now>=self.supplement:
   self.supplement=0;self.last_supplement=now;self.request_read('event-details')
  if now>=self.next_read:self.request_read(self.reason if self.next_read==0 else 'ten-minute')
  self.publish()
 def run(self):
  while not self.stopping:
   try:os.kill(self.parent,0)
   except ProcessLookupError:break
   self.step();time.sleep(.2)
  self.disconnect();atomic(self.root/'transport.json',{'version':'2.4.4','heartbeat':time.time(),'connected':False,'error':'额度观察器已停止'})

def main():
 os.umask(0o077);root=Path.home()/'Library/Application Support/AI Usage Bar Local';root.mkdir(parents=True,exist_ok=True,mode=0o700)
 lock=open(root/'.observer.lock','a')
 try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 except BlockingIOError:return
 parent=int(sys.argv[1]);service=Service(root,parent)
 def stop(*_):service.stopping=True
 signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
 try:service.run()
 finally:service.disconnect();lock.close()
if __name__=='__main__':main()
