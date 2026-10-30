import concurrent.futures
import importlib.util
import json
import os
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('relay3000', os.path.join(os.path.dirname(__file__), 'relay3000.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class Reply(object):
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self, *args): return b'{"retcode":0,"data":{"message_id":42}}'
    def getcode(self): return 200

class RelayTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.calls = []
        def opener(req, **kwargs):
            self.calls.append(req)
            return Reply()
        self.relay = module.Relay('http://127.0.0.1:3002','fixture-token',self.tmp.name,opener)
        self.body = json.dumps({'group_id':17,'message':'same text'}).encode()
        self.key = 'test-intent-aaaaaaaa'

    def test_confirmed_replay_and_restart(self):
        first = self.relay.request('/send_group_msg',self.body,self.key)
        again = module.Relay('http://127.0.0.1:3002','fixture-token',self.tmp.name,self.relay.opener)
        self.assertEqual(first,again.request('/send_group_msg',self.body,self.key))
        self.assertEqual(1,len(self.calls))

    def test_uncertain_replay_does_not_send_again(self):
        def timeout(req, **kwargs):
            self.calls.append(req)
            raise TimeoutError('https://invalid/?access_token=fixture-token')
        self.relay.opener = timeout
        code, data = self.relay.request('/send_group_msg',self.body,self.key)
        self.assertEqual(502,code)
        self.assertNotIn(b'fixture-token',data)
        again = module.Relay('http://127.0.0.1:3002','fixture-token',self.tmp.name,timeout)
        self.assertEqual(409,again.request('/send_group_msg',self.body,self.key)[0])
        self.assertEqual(1,len(self.calls))

    def test_concurrent_same_intent(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            result = list(pool.map(lambda _:self.relay.request('/send_group_msg',self.body,self.key)[0],range(8)))
        self.assertEqual(1,len(self.calls))
        self.assertTrue(all(c in (200,409) for c in result))

    def test_same_text_distinct_intents_and_unkeyed_are_preserved(self):
        for key in [self.key,'test-intent-bbbbbbbb','','']:
            self.assertEqual(200,self.relay.request('/send_group_msg',self.body,key)[0])
        self.assertEqual(4,len(self.calls))

    def test_conflicting_body_same_identity_is_refused(self):
        self.relay.request('/send_group_msg',self.body,self.key)
        self.assertEqual(409,self.relay.request('/send_private_msg',b'{"user_id":18,"message":"other"}',self.key)[0])
        self.assertEqual(1,len(self.calls))

    def test_token_only_in_authorization_and_journal_is_metadata(self):
        self.relay.request('/send_group_msg?access_token=other',self.body,self.key,'surfcore')
        self.assertNotIn('token',self.calls[0].full_url)
        self.assertEqual('Bearer fixture-token',self.calls[0].get_header('Authorization'))
        with open(self.relay.store.journal) as stream: journal=stream.read()
        self.assertNotIn('fixture-token',journal)
        self.assertNotIn('same text',journal)
        self.assertEqual('confirmed',json.loads(journal.splitlines()[-1])['status'])

    def test_external_route_rejected(self):
        self.assertEqual(400,self.relay.request('http://elsewhere/send_group_msg',self.body)[0])
        self.assertEqual([],self.calls)

if __name__ == '__main__': unittest.main()
