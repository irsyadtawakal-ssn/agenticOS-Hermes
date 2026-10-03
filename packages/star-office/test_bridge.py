import unittest
from unittest.mock import patch
import run

class CoreBridgeTests(unittest.TestCase):
    def test_live_mapping_and_pending_approval(self):
        roster = [{'name': 'chief'}, {'name': 'dev'}, {'name': 'content'}]
        agents = [{'profile': 'chief', 'state': 'thinking'}, {'profile': 'dev', 'state': 'working'}]
        result = run.roster_snapshot(roster, agents, [{'profile': 'dev', 'status': 'pending'}], True)
        self.assertEqual(result[0]['state'], 'researching')
        self.assertTrue(result[0]['isMain'])
        self.assertEqual(result[1]['aosStatus'], 'Needs approval')
        self.assertEqual(result[1]['area'], 'error')
        self.assertEqual(result[2]['aosStatus'], 'Offline')

    def test_disconnection_clears_stale_activity(self):
        result = run.roster_snapshot([{'name': 'chief'}], [{'profile': 'chief', 'state': 'working', 'detail': 'old task'}], [], False)
        self.assertEqual(result[0]['detail'], 'Offline')
        self.assertFalse(result[0]['connected'])

    def test_complete_native_app_and_editor_auth(self):
        with patch.object(run.threading.Thread, 'start'):
            app = run.create_app()
        client = app.test_client()
        page = client.get('/')
        self.assertEqual(page.status_code, 200)
        self.assertIn(b'phaser-3.80.1.min.js', page.data)
        self.assertIn(b'aos:star-office:chat', page.data)
        self.assertEqual(len(client.get('/agents').json), 10)
        self.assertEqual(client.post('/set_state', json={'state': 'writing'}).status_code, 409)
        self.assertEqual(client.post('/leave-agent', json={'agentId': 'dev'}).status_code, 409)
        self.assertFalse(client.get('/assets/auth/status').json.get('authed'))
        self.assertEqual(client.post('/assets/positions', json={}).status_code, 401)
        with client.get('/static/guest_anim_1.webp') as asset:
            self.assertEqual(asset.status_code, 200)
        self.assertEqual(client.get('/assets/list').status_code, 200)
        self.assertEqual(client.post('/assets/auth', json={'password': 'incorrect'}).status_code, 401)
        self.assertEqual(client.post('/assets/auth', json={'password': run.os.environ['ASSET_DRAWER_PASS']}).status_code, 200)
        self.assertTrue(client.get('/assets/auth/status').json['authed'])
        self.assertEqual(client.get('/assets/positions').status_code, 200)

if __name__ == '__main__':
    unittest.main()
