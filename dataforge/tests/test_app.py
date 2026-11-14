import copy
import json
import sys
import tempfile
import threading
import time
import unittest
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


def fixture():
    chapters = [dict(id='a', title='Basics', track='Python', order=1, summary='Start here.',
                     lesson='Learn values.', exercise='Try a value.', objectives=['Understand values']),
                dict(id='b', title='Next steps', track='Python', order=2, summary='Continue here.',
                     lesson='Learn functions.', exercise='Try a function.', objectives=['Understand functions'])]
    questions = [dict(id=f'q{i}', chapter='a' if i < 4 else 'b', difficulty='beginner', kind='concept',
                      prompt=f'Fixture question {i}?', choices=['one','two','three','four'], answer=i%4,
                      explanation='A fixture explanation.', source='https://docs.python.org/3.11/',
                      version='Python 3.11+', revision=1) for i in range(8)]
    return dict(schema_version=1, bank_version='test', chapters=chapters, questions=questions)


class AppTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.old_root, cls.old_data, cls.old_db = server.ROOT, server.DATA, server.DB
        server.ROOT = Path(cls.temp.name)
        server.DATA = server.ROOT/'data'
        server.DB = server.DATA/'test.sqlite3'
        (server.ROOT/'bank.json').write_text(json.dumps(fixture()), encoding='utf-8')
        server.initialize()
        cls.http = server.ThreadingHTTPServer(('127.0.0.1',0), server.Handler)
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = 'http://127.0.0.1:'+str(cls.http.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.thread.join()
        server.ROOT, server.DATA, server.DB = cls.old_root, cls.old_data, cls.old_db
        cls.temp.cleanup()

    def setUp(self):
        with server.connect() as c:
            for table in ('attempts','progress','bookmarks','choice_orders','questions','chapters'):
                c.execute('DELETE FROM '+table)
        server.import_bank(fixture(),True)

    def request(self,path,body=None,csrf=True,headers=None):
        h=headers or {}
        if body is not None:
            h['Content-Type']='application/json'
            if csrf:h['X-CSRF-Token']=server.TOKEN
        req=Request(self.base+'/api'+path,data=json.dumps(body).encode() if body is not None else None,headers=h)
        try:
            with urlopen(req,timeout=5) as r:return r.status,json.loads(r.read())
        except HTTPError as e:
            with e:return e.code,json.loads(e.read())

    def start(self,**kwargs):
        body=dict(count=8,minutes=0,mode='practice',chapters=[],difficulty='all',pool='all')
        body.update(kwargs)
        status,a=self.request('/attempts',body)
        self.assertEqual(status,201,a)
        return a

    def act(self,a,action,**body):
        return self.request('/attempts/'+a['id']+'/'+action,body)

    def test_bootstrap_and_no_duplicate_sampling(self):
        status,d=self.request('/bootstrap')
        self.assertEqual(d['total'],8)
        a=self.start(count=6)
        self.assertEqual(len({q['id'] for q in a['questions']}),6)
        self.assertEqual({q['chapter'] for q in a['questions']},{'a','b'})
        self.assertTrue(all('correct' not in q and 'explanation' not in q for q in a['questions']))

    def test_scoring_uses_stable_choice_ids_after_shuffling(self):
        a=self.start()
        expected={q['id']:str(q['answer']) for q in fixture()['questions']}
        for q in a['questions']:
            self.act(a,'answer',qid=q['id'],choice=expected[q['id']])
        _,result=self.act(a,'submit')
        self.assertEqual(result['score'],8)
        _,again=self.act(a,'submit')
        self.assertEqual(again['score'],8)
        with server.connect() as c:
            self.assertEqual(c.execute('SELECT sum(seen) FROM progress').fetchone()[0],8)

    def test_choice_orders_change_on_new_attempt(self):
        a=self.start()
        before={q['id']:[c['id'] for c in q['choices']] for q in a['questions']}
        self.act(a,'submit')
        b=self.start()
        self.assertTrue(all(before[q['id']] != [c['id'] for c in q['choices']] for q in b['questions']))

    def test_practice_check_locks_and_reveals_only_that_answer(self):
        a=self.start(count=2)
        q=a['questions'][0]
        self.act(a,'answer',qid=q['id'],choice='0')
        _,checked=self.act(a,'check',qid=q['id'])
        self.assertIn('correct',checked['questions'][0])
        self.assertNotIn('correct',checked['questions'][1])
        status,_=self.act(a,'answer',qid=q['id'],choice='1')
        self.assertEqual(status,400)

    def test_exam_hides_feedback_and_saves_navigation(self):
        a=self.start(mode='exam',minutes=10)
        q=a['questions'][0]
        self.act(a,'answer',qid=q['id'],choice='2')
        self.assertEqual(self.act(a,'check',qid=q['id'])[0],400)
        self.act(a,'navigate',index=3)
        self.act(a,'flag',qid=q['id'])
        _,restored=self.request('/attempts/'+a['id'])
        self.assertEqual(restored['current'],3)
        self.assertEqual(restored['answers'][q['id']],'2')
        self.assertIn(q['id'],restored['flags'])
        self.assertEqual(restored['deadline'],a['deadline'])
        self.assertNotIn('correct',restored['questions'][0])

    def test_deadline_rejects_late_answer_and_auto_submits(self):
        a=self.start(mode='exam',minutes=1)
        with server.connect() as c:
            raw=server.load_attempt(c,a['id']);raw['deadline']=time.time()-1;server.save_attempt(c,raw)
        _,result=self.act(a,'answer',qid=a['questions'][0]['id'],choice='0')
        self.assertEqual(result['status'],'finished')
        self.assertEqual(result['end_reason'],'timeout')
        self.assertEqual(result['answers'],{})
        self.assertEqual(result['score'],0)

    def test_one_active_attempt_and_input_bounds(self):
        a=self.start(count=1)
        self.assertEqual(self.request('/attempts',dict(count=1,minutes=0,mode='practice'))[0],400)
        self.act(a,'submit')
        for values in [dict(count=9),dict(count=True),dict(minutes=-1),dict(mode='exam',minutes=0),dict(count=0),dict(chapters='a')]:
            body=dict(count=1,minutes=0,mode='practice');body.update(values)
            self.assertEqual(self.request('/attempts',body)[0],400)

    def test_import_validation_is_atomic_and_revision_aware(self):
        bad=fixture();bad['questions'][0]['revision']=2;bad['questions'][0]['prompt']='Updated prompt'
        bad['questions'][1]['choices']=['x','x','y','z']
        self.assertEqual(self.request('/import/commit',bad)[0],400)
        _,bank=self.request('/export')
        self.assertNotEqual(bank['questions'][0]['prompt'],'Updated prompt')
        valid=fixture();valid['questions'][0]['prompt']='Updated prompt'
        self.assertEqual(self.request('/import/commit',valid)[0],400)
        valid['questions'][0]['revision']=2
        _,preview=self.request('/import/preview',valid)
        self.assertEqual(preview['updated'],1)
        _,before=self.request('/export');self.assertNotEqual(before['questions'][0]['prompt'],'Updated prompt')
        self.assertEqual(self.request('/import/commit',valid)[0],200)
        self.assertEqual(self.request('/import/commit',valid)[1]['unchanged'],8)

    def test_bank_update_preserves_attempt_snapshot(self):
        a=self.start()
        old={q['id']:q['prompt'] for q in a['questions']}
        bank=fixture();bank['questions'][0].update(prompt='Revised question',revision=2)
        self.request('/import/commit',bank)
        _,saved=self.request('/attempts/'+a['id'])
        self.assertEqual(old,{q['id']:q['prompt'] for q in saved['questions']})

    def test_mistakes_unseen_and_bookmark_filters(self):
        a=self.start(count=1,chapters=['a']);self.act(a,'submit')
        q=a['questions'][0]
        b=self.start(count=1,pool='mistakes');self.assertEqual(b['questions'][0]['id'],q['id']);self.act(b,'submit')
        self.request('/bookmarks',dict(id='q7',saved=True))
        d=self.start(count=1,pool='bookmarks');self.assertEqual(d['questions'][0]['id'],'q7');self.act(d,'submit')
        e=self.start(count=6,pool='unseen');self.assertNotIn(q['id'],[i['id'] for i in e['questions']]);self.assertNotIn('q7',[i['id'] for i in e['questions']])

    def test_csrf_origin_and_malicious_links_rejected(self):
        body=dict(count=1,minutes=0,mode='practice')
        self.assertEqual(self.request('/attempts',body,csrf=False)[0],400)
        self.assertEqual(self.request('/attempts',body,headers={'Origin':'https://example.com'})[0],400)
        self.assertEqual(self.request('/bootstrap',headers={'Host':'attacker.test'})[0],400)
        bad=fixture();bad['questions'][0]['source']='javascript:alert(1)'
        self.assertEqual(self.request('/import/commit',bad)[0],400)

    def test_simultaneous_submission_grades_once(self):
        a=self.start()
        with ThreadPoolExecutor(max_workers=4) as pool:
            results=list(pool.map(lambda _:self.act(a,'submit'),range(4)))
        self.assertTrue(all(status==200 for status,_ in results))
        with server.connect() as c:
            self.assertEqual(c.execute('SELECT sum(seen) FROM progress').fetchone()[0],8)

    def test_database_backup_is_valid(self):
        self.start(count=2)
        with urlopen(self.base+'/api/backup',timeout=5) as response:
            data=response.read()
        self.assertTrue(data.startswith(b'SQLite format 3'))
        target=Path(self.temp.name)/'backup.sqlite3';target.write_bytes(data)
        import sqlite3
        with closing(sqlite3.connect(target)) as c:
            self.assertEqual(c.execute('PRAGMA integrity_check').fetchone()[0],'ok')
            self.assertEqual(c.execute('SELECT count(*) FROM attempts').fetchone()[0],1)

    def test_new_tracks_import_without_resetting_learning_state(self):
        a=self.start(count=1)
        self.act(a,'submit')
        self.request('/bookmarks',dict(id='q0',saved=True))
        _,before=self.request('/bootstrap')
        addon=fixture()
        addon['bank_version']='2.0.0'
        addon['chapters'][0].update(id='pd-01',track='pandas',order=3)
        addon['chapters'][1].update(id='np-01',track='NumPy',order=4)
        for i,q in enumerate(addon['questions']):
            q.update(id=f'new{i}',chapter='pd-01' if i<4 else 'np-01',prompt=f'New track question {i}?')
        status,result=self.request('/import/commit',addon)
        self.assertEqual(status,200,result)
        self.assertEqual(result['added'],8)
        _,after=self.request('/bootstrap')
        self.assertEqual(after['total'],16)
        self.assertEqual(after['tracks'],['Python','pandas','NumPy'])
        self.assertEqual(after['progress'],before['progress'])
        self.assertEqual(after['bookmarks'],before['bookmarks'])
        self.assertEqual(after['history'],before['history'])
        for track,cid in [('pandas','pd-01'),('NumPy','np-01')]:
            chapter=next(c for c in after['chapters'] if c['id']==cid)
            self.assertEqual(chapter['levels']['beginner'],4)
            session=self.start(count=4,chapters=[cid])
            self.assertTrue(all(q['chapter']==cid for q in session['questions']))
            self.act(session,'submit')

    def test_choice_case_and_significant_whitespace_are_preserved(self):
        bank=fixture()
        bank['questions'][0].update(revision=2,choices=['etl','ETL',' etl','etl '])
        status,result=self.request('/import/commit',bank)
        self.assertEqual(status,200,result)
        _,export=self.request('/export')
        self.assertEqual(export['questions'][0]['choices'],['etl','ETL',' etl','etl '])

    def test_content_extension_preserves_active_snapshot_and_deadline(self):
        a=self.start(count=2,mode='exam',minutes=10)
        self.act(a,'answer',qid=a['questions'][0]['id'],choice='1')
        with server.connect() as c:
            before=server.load_attempt(c,a['id'])
        addon=fixture()
        for chapter in addon['chapters']:
            chapter['track']='NumPy'
            chapter['order']+=20
        self.assertEqual(self.request('/import/commit',addon)[0],200)
        with server.connect() as c:
            after=server.load_attempt(c,a['id'])
        self.assertEqual(after,before)


if __name__=='__main__':
    unittest.main(verbosity=2)
