"""Exercise menu-bar classification with the same JavaScript used by the app."""
import json,subprocess,unittest
from pathlib import Path
class IndicatorTests(unittest.TestCase):
 def test_boundaries_missing_and_tightest_window(self):
  text=Path(__file__).with_name('main.js').read_text()
  fn=text[text.index('function indicatorState('):text.index('function indicatorImage(')]
  cases=[([{'label':'Codex','used':u}],False) for u in [0,74.9,75,89.9,90,100]]
  cases += [([],False),([{'label':'Codex','used':10}],True),([{'label':'Codex','used':5},{'label':'Codex','used':95}],False),([{'label':'Other','used':100},{'label':'Codex','used':1}],False)]
  script=fn+'\nJSON.stringify('+json.dumps(cases)+'.map(function(c){return indicatorState(c[0],c[1]);}));'
  result=json.loads(subprocess.check_output(['osascript','-l','JavaScript','-e',script],text=True))
  self.assertEqual([r['level'] for r in result],['normal','normal','warning','warning','low','low','unknown','unknown','low','normal'])
  self.assertEqual([r['lit'] for r in result],[5,2,2,1,1,0,0,0,1,5])
if __name__=='__main__':unittest.main()
