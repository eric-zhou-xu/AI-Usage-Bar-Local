import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('collector.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class CollectorTests(unittest.TestCase):
    def test_reset_pass_expiries_without_identifiers(self):
        result = collector.reset_details({'credits': [
            {'id': 'private-pass-id', 'status': 'available', 'expires_at': '2099-01-01T00:00:00Z'},
            {'status': 'available', 'expires_at': '2020-01-01T00:00:00Z'},
            {'status': 'consumed', 'expires_at': '2099-01-01T00:00:00Z'}]})
        self.assertEqual(len(result), 1)
        self.assertNotIn('private-pass-id', json.dumps(result))
        self.assertGreater(result[0]['expires_at'], 4000000000)

    def test_missing_short_window_is_not_created(self):
        result = collector.normalize({'rate_limit': {'primary_window': {'used_percent': 10, 'limit_window_seconds': 604800}}})
        self.assertFalse(any(w['seconds'] == 18000 for w in result['windows']))
        self.assertIsNone(result['credits_expire_at'])
        self.assertFalse(result['reset_details_available'])

    def test_primary_week_is_not_five_hours(self):
        data = collector.normalize({'rate_limit': {'primary_window': {'used_percent': 6,
                                   'limit_window_seconds': 604800, 'reset_at': 1790835102}}})
        self.assertEqual(data['windows'][0]['seconds'], 604800)
        self.assertEqual(data['windows'][0]['used'], 6)
        self.assertEqual(len(data['windows']), 1)

    def test_multiple_windows_and_unknown_fields(self):
        w = {'used_percent': 50, 'limit_window_seconds': 18000, 'reset_at': 1790835102}
        data = collector.normalize({'email': 'private@example.invalid', 'account_id': 'private-id',
            'access_token': 'never-save', 'rate_limit': {'primary_window': w, 'secondary_window': w},
            'code_review_rate_limit': {'primary_window': w},
            'additional_rate_limits': [{'limit_name': 'Extra', 'rate_limit': {'primary_window': w}}]})
        self.assertEqual(len(data['windows']), 4)
        serialized = json.dumps(data)
        for forbidden in ['private@example.invalid', 'private-id', 'never-save']:
            self.assertNotIn(forbidden, serialized)

    def test_unknown_credits_and_reset_not_zero(self):
        result = collector.normalize({})
        self.assertIsNone(result['credits'])
        self.assertIsNone(result['reset_credits'])
        self.assertEqual(result['windows'], [])

    def test_invalid_numeric_fields(self):
        for bad in [float('nan'), -1, 101, True, '4']:
            result = collector.normalize({'rate_limit': {'primary_window': {'used_percent': bad}}})
            self.assertEqual(result['windows'], [])

    def test_no_redirect(self):
        self.assertIsNone(collector.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.invalid'))

    def test_credentials_are_read_only_and_errors_redacted(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root/'.codex').mkdir()
            auth = root/'.codex/auth.json'; auth.write_text(json.dumps({'tokens': {'access_token': 'DUMMY'}})); auth.chmod(0o600)
            before = auth.read_bytes(); before_stat = auth.stat()
            with patch.object(collector.Path, 'home', return_value=root), patch.object(collector.urllib.request, 'build_opener') as build:
                build.return_value.open.side_effect = Exception('DUMMY secret error')
                result = collector.fetch()
                request = build.return_value.open.call_args.args[0]
                self.assertEqual(request.full_url, collector.URL)
                self.assertEqual(request.get_method(), 'GET')
                self.assertEqual(request.get_header('Authorization'), 'Bearer DUMMY')
                self.assertNotIn('DUMMY', json.dumps(result))
            self.assertEqual(auth.read_bytes(), before)
            self.assertEqual(auth.stat().st_mtime_ns, before_stat.st_mtime_ns)
            self.assertEqual(auth.stat().st_mode, before_stat.st_mode)

    def test_unsafe_permissions_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root/'.codex').mkdir(); p=root/'.codex/auth.json'
            p.write_text('{}'); p.chmod(0o644)
            with patch.object(collector.Path, 'home', return_value=root), patch.object(collector.urllib.request, 'build_opener') as build:
                self.assertFalse(collector.fetch()['ok'])
                build.assert_not_called()


if __name__ == '__main__':
    unittest.main()
