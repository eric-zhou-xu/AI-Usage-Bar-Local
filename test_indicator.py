"""Exercise pure menu state using the app JavaScript, without launching UI or reading accounts."""
import json
import subprocess
import unittest
from pathlib import Path

class IndicatorTests(unittest.TestCase):
    def test_remaining_boundaries_and_fractional_fills(self):
        text = Path(__file__).with_name('main.js').read_text()
        palette = text[text.index('var palette='):text.index('function finiteNumber')]
        functions = text[text.index('function finiteNumber'):text.index('function col(')]
        values = [0, 24.9, 25, 49.9, 50, 95, 100]
        script = palette + functions + '\nJSON.stringify(' + json.dumps(values) + '.map(function(r){return indicatorState({remaining:r,stale:false});}).concat([indicatorState({remaining:null,stale:false}),indicatorState({remaining:50,stale:true})]));'
        result = json.loads(subprocess.check_output(['/usr/bin/osascript', '-l', 'JavaScript', '-e', script], text=True))
        self.assertEqual([r['color'] for r in result[:7]], ['#FF3B30', '#FF3B30', '#007AFF', '#007AFF', '#34C759', '#34C759', '#34C759'])
        for remaining, state in zip(values, result):
            self.assertAlmostEqual(sum(state['fills']) * 20, remaining)
        self.assertEqual(result[0]['fills'], [0,0,0,0,0])
        self.assertEqual(result[5]['fills'], [1,1,1,1,0.75])
        for state in result[7:]:
            self.assertEqual(state['level'], 'unknown')
            self.assertIsNone(state['fills'])

if __name__ == '__main__':
    unittest.main()
