import importlib.util
import json
import os
import tempfile
import time
import unittest

def load(name):
    spec=importlib.util.spec_from_file_location(name,os.path.join(os.path.dirname(__file__),name+'.py'))
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
report=load('daily_report_v2');archive=load('memory_archive')

class OperationsTests(unittest.TestCase):
    def test_only_completed_public_assistant_text_is_used(self):
        events=[{'type':'assistant/message','data':{'message':{'content':[{'type':'reasoning','text':'PRIVATE REASONING'},{'type':'text','text':'今天群里很热闹，先收工啦🐟'}]}}}, {'type':'turn/end','data':{}}]
        output=report.extract_final('\n'.join(json.dumps(e) for e in events))
        self.assertEqual('今天群里很热闹，先收工啦🐟',output)
        self.assertNotIn('PRIVATE',output)
        self.assertIsNone(report.extract_final('dsh: reasoning: 不应被当作报告的内容 123'))
        self.assertIsNone(report.extract_final(json.dumps(events[0])))
        events[-1]['data']={'reason':'error'}
        self.assertIsNone(report.extract_final('\n'.join(json.dumps(e) for e in events)))

    def test_rewrite_numbers_and_balance_must_be_grounded(self):
        material='今天200条，账户余额¥14.60'
        self.assertTrue(report.valid_rewrite('今天200条，剩¥14.60',material))
        self.assertFalse(report.valid_rewrite('今天201条，剩¥14.60',material))
        self.assertFalse(report.valid_rewrite('今天200条，剩¥14.6',material))

    def test_day_history_paginates_with_message_id_not_ignored_last_time(self):
        now=int(time.time());day=time.strftime('%Y-%m-%d',time.localtime(now));requests=[]
        pages=[[{'message_id':20,'time':now},{'message_id':19,'time':now-1}],[{'message_id':19,'time':now-1},{'message_id':18,'time':now-172800}]]
        def request(route,payload): requests.append(payload);return {'retcode':0,'data':{'messages':pages.pop(0)}}
        rows,complete=report.collect_day(17,day,request)
        self.assertTrue(complete);self.assertEqual([20,19],[r['message_id'] for r in rows]);self.assertEqual(19,requests[1]['message_id'])

    def test_archive_restart_dedup_reads_durable_monthly_files(self):
        with tempfile.TemporaryDirectory() as directory:
            row={'message_id':20,'time':int(time.time()),'user_id':18,'message':[{'type':'text','data':{'text':'hello'}}]}
            self.assertEqual(1,archive.archive_rows(directory,17,[row,row]))
            # Simulate a crash after append, before any watermark/seen checkpoint.
            again=load('memory_archive')
            self.assertEqual(0,again.archive_rows(directory,17,[row]))
            files=os.listdir(directory);self.assertEqual(1,len(files))
            with open(os.path.join(directory,files[0]),encoding='utf-8') as stream: self.assertEqual(1,len(stream.readlines()))

    def test_archive_partial_fetch_does_not_claim_complete(self):
        requests=[];now=int(time.time())
        def fetch(base,payload):
            requests.append(payload)
            if len(requests)>1: return {'retcode':-1}
            return {'retcode':0,'data':{'messages':[{'message_id':20,'time':now}]}}
        rows,complete=archive.collect_since('http://127.0.0.1',17,now-100,fetch)
        self.assertFalse(complete);self.assertEqual(1,len(rows));self.assertEqual(20,requests[1]['message_id'])

    def test_corrupt_archive_is_preserved_and_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            filename=os.path.join(directory,time.strftime('%Y-%m')+'.jsonl')
            with open(filename,'w') as stream: stream.write('bad existing record\n')
            with self.assertRaises(ValueError): archive.archive_rows(directory,17,[{'message_id':1,'time':int(time.time())}])
            with open(filename) as stream: self.assertEqual('bad existing record\n',stream.read())

if __name__=='__main__': unittest.main()
