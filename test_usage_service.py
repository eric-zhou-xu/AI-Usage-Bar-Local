import unittest,tempfile,time,json
from pathlib import Path
from unittest.mock import patch
import usage_service as m

def bucket(pct=20):return {'limitId':'codex','secondary':{'usedPercent':pct,'windowDurationMins':10080,'resetsAt':20000},'credits':{'balance':'123.45'}}
def full():return {'rateLimitsByLimitId':{'codex':bucket()},'rateLimitResetCredits':{'availableCount':2,'credits':None}}
class StateTest(unittest.TestCase):
 def setUp(self):self.s=m.State();self.s.full(full(),100)
 def test_sparse_event(self):
  self.assertTrue(self.s.event({'rateLimits':{'secondary':{'usedPercent':25,'windowDurationMins':None,'resetsAt':None},'credits':None}},110));w=self.s.data['windows'][0];self.assertEqual(w['used'],25);self.assertEqual(w['seconds'],604800);self.assertEqual(w['reset'],20000);self.assertEqual(self.s.data['credits'],'123.45');self.assertEqual(self.s.data['reset_credits'],2)
 def test_no_zero_from_null(self):
  self.s.event({'rateLimits':{'credits':{'balance':None},'secondary':None}},200);self.assertEqual(self.s.data['windows'][0]['used'],20);self.assertEqual(self.s.data['credits'],'123.45')
 def test_zero_valid(self):self.s.event({'rateLimits':{'secondary':{'usedPercent':0},'credits':{'balance':'0'}}},110);self.assertEqual(self.s.data['windows'][0]['used'],0);self.assertEqual(self.s.data['credits'],'0')
 def test_other_bucket_ignored(self):self.assertFalse(self.s.event({'rateLimits':{'limitId':'review','secondary':{'usedPercent':100}}},110));self.assertEqual(self.s.event_at,0)
 def test_invalid_event(self):self.s.event({'rateLimits':{'secondary':{'usedPercent':False},'credits':{'balance':'NaN'}}},110);self.assertEqual(self.s.data['windows'][0]['used'],20)
 def test_old_read_does_not_overwrite_event(self):self.s.event({'rateLimits':bucket(30)},200);self.s.full(full(),210,190);self.assertEqual(self.s.data['windows'][0]['used'],30)
 def test_old_http_does_not_overwrite_event(self):self.s.event({'rateLimits':bucket(30)},200);self.s.fallback({'ok':True,'windows':[{'label':'Codex','used':1,'seconds':604800,'reset':20000}],'credits':None,'reset_credits':None},210,190);self.assertEqual(self.s.data['windows'][0]['used'],30);self.assertEqual(self.s.data['credits'],'123.45')
 def test_reset_passes(self):r=full();r['rateLimitResetCredits']['credits']=[{'status':'available','expiresAt':500},{'status':'used','expiresAt':500},{'status':'available','expiresAt':90}];self.s.full(r,110);self.assertEqual(self.s.data['reset_passes'],[{'expires_at':500}])
 def test_missing_full_details_requests_fallback(self):
  r=full();r['rateLimitsByLimitId']['codex']['credits']=None;r['rateLimitResetCredits']=None;self.assertTrue(self.s.full(r,110));self.assertEqual(self.s.data['credits'],'123.45');self.assertEqual(self.s.data['reset_credits'],2)
 def test_silence_preserves_freshness(self):self.assertEqual(self.s.full_at,100);self.assertEqual(m.STALE_AFTER,720);self.assertEqual(m.INTERVAL,600)
class ServiceTest(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.service=m.Service(Path(self.tmp.name),1);self.service.next_connect=float('inf');self.service.ready=True
 def tearDown(self):self.tmp.cleanup()
 def step(self):
  with patch.object(self.service,'request_read') as read:
   self.service.step();return read.call_args_list
 def test_ten_minute_due(self):self.service.next_read=time.time()+599;self.assertEqual(self.step(),[]);self.service.next_read=time.time()-1;self.assertEqual(self.step()[0].args,('ten-minute',))
 def test_wake(self):(self.service.root/'.wake').touch();self.service.next_read=time.time()+600;self.assertEqual(self.step()[0].args,('wake',));self.assertEqual(self.service.wake_checks,1)
 def test_suspend_gap(self):self.service.last_tick=time.monotonic()-60;self.service.next_read=time.time()+600;self.assertEqual(self.step()[0].args,('wake',))
 def test_reset_boundary(self):self.service.state.full(full(),100);self.service.state.data['windows'][0]['reset']=time.time()-1;self.service.next_read=time.time()+600;self.assertEqual(self.step()[0].args,('reset',))
 def test_initial_and_reconnect_read(self):self.service.next_read=0;self.service.reason='connected';self.assertEqual(self.step()[0].args,('connected',))
 def test_read_coalescing(self):self.service.pending={1:('account/rateLimits/read',time.time())};self.service.request_read('manual');self.assertEqual(len(self.service.pending),1)
 def test_method_allowlist(self):
  with self.assertRaises(ValueError):self.service.send('account/login/start')
 def test_event_immediate_and_supplement(self):self.service.state.full(full(),100);self.service.frame({'method':'account/rateLimits/updated','params':{'rateLimits':bucket(30)}});v=json.loads((self.service.root/'usage.json').read_text());self.assertEqual(v['windows'][0]['used'],30);self.assertGreater(self.service.supplement,time.time());self.assertEqual(self.service.state.events,1)
if __name__=='__main__':unittest.main()
