"""DataForge: a private, dependency-free Python learning server."""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import secrets
import sqlite3
import tempfile
import threading
import time
import webbrowser
from contextlib import closing, contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
DB = DATA / 'dataforge.sqlite3'
TOKEN = secrets.token_urlsafe(32)
LOCK = threading.RLock()
RNG = random.SystemRandom()
MAX_BODY = 16 * 1024 * 1024
DIFFICULTIES = {'beginner', 'intermediate', 'advanced'}
KINDS = {'concept', 'code', 'scenario'}


class Invalid(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise Invalid(message)


def integer(value, low, high, label):
    require(type(value) is int and low <= value <= high,
            f'{label} must be a whole number from {low} to {high}.')
    return value


def text_field(obj, key, maximum=10000):
    value = obj.get(key)
    require(isinstance(value, str) and 0 < len(value.strip()) <= maximum,
            f'{key} must be nonempty text, at most {maximum} characters.')
    return value.strip()


def safe_url(value):
    require(isinstance(value, str), 'Source must be a URL.')
    parsed = urlparse(value)
    require(parsed.scheme == 'https' and bool(parsed.netloc) and not parsed.username,
            'Source links must be absolute HTTPS URLs.')
    return value


def validate_bank(bank):
    require(isinstance(bank, dict) and type(bank.get('schema_version')) is int and bank.get('schema_version') == 1,
            'Expected a bank object with schema_version: 1.')
    chapters, questions = bank.get('chapters'), bank.get('questions')
    require(isinstance(chapters, list) and 0 < len(chapters) <= 200, 'Supply 1–200 chapters.')
    require(isinstance(questions, list) and 0 < len(questions) <= 20000, 'Supply 1–20,000 questions.')
    chapter_ids, ids, prompts = set(), set(), set()
    normalized_chapters, normalized_questions = [], []
    for c in chapters:
        require(isinstance(c, dict), 'Each chapter must be an object.')
        cid = text_field(c, 'id', 80)
        require(re.fullmatch(r'[a-zA-Z0-9_-]+', cid) and cid not in chapter_ids, 'Invalid or duplicate chapter ID.')
        chapter_ids.add(cid)
        result = {k: text_field(c, k, 20000 if k == 'lesson' else 2000)
                  for k in ('title', 'track', 'summary', 'lesson', 'exercise')}
        require(len(result['track']) <= 80, 'Track names must be at most 80 characters.')
        objectives = c.get('objectives')
        require(isinstance(objectives, list) and 1 <= len(objectives) <= 10 and
                all(isinstance(x, str) and 0 < len(x) <= 1000 for x in objectives), 'Supply chapter objectives.')
        result.update(id=cid, order=integer(c.get('order'), 1, 10000, 'Chapter order'), objectives=objectives)
        normalized_chapters.append(result)
    for q in questions:
        require(isinstance(q, dict), 'Each question must be an object.')
        qid = text_field(q, 'id', 80)
        require(re.fullmatch(r'[a-zA-Z0-9_-]+', qid) and qid not in ids, 'Invalid or duplicate question ID: ' + qid)
        ids.add(qid)
        require(q.get('chapter') in chapter_ids, 'Every question must reference an included chapter.')
        require(q.get('difficulty') in DIFFICULTIES, 'Unknown difficulty in ' + qid)
        require(q.get('kind') in KINDS, 'Unknown question kind in ' + qid)
        prompt = text_field(q, 'prompt', 6000)
        code = q.get('code', '')
        require(isinstance(code, str) and len(code) <= 20000, 'Invalid code block.')
        identity = re.sub(r'\s+', ' ', prompt + ' ' + code).strip().casefold()
        require(identity not in prompts, 'Duplicate question prompt/code: ' + qid)
        prompts.add(identity)
        choices = q.get('choices')
        require(isinstance(choices, list) and len(choices) == 4 and
                all(isinstance(x, str) and 0 < len(x.strip()) <= 6000 for x in choices), 'Each question needs four text choices.')
        require(len(set(choices)) == 4, 'Choices must be distinct: ' + qid)
        normalized_questions.append(dict(id=qid, chapter=q['chapter'], difficulty=q['difficulty'],
            kind=q['kind'], prompt=prompt, code=code, choices=choices,
            answer=integer(q.get('answer'), 0, 3, 'Answer index'), explanation=text_field(q, 'explanation'),
            source=safe_url(q.get('source')), version=text_field(q, 'version', 200),
            revision=integer(q.get('revision', 1), 1, 1000000, 'Revision')))
    return dict(schema_version=1, bank_version=str(bank.get('bank_version', 'custom'))[:100],
                chapters=normalized_chapters, questions=normalized_questions)


@contextmanager
def connect():
    conn = sqlite3.connect(DB, timeout=20)
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def initialize():
    DATA.mkdir(parents=True, exist_ok=True)
    with connect() as c:
        c.executescript('''
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS chapters (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY, chapter TEXT NOT NULL, payload TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS question_chapter ON questions(chapter);
            CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, started REAL NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS progress (qid TEXT PRIMARY KEY, correct INTEGER NOT NULL, seen INTEGER NOT NULL, wins INTEGER NOT NULL, updated REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS bookmarks (qid TEXT PRIMARY KEY);
            CREATE TABLE IF NOT EXISTS choice_orders (qid TEXT PRIMARY KEY, ordering TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS imports (id INTEGER PRIMARY KEY, created REAL NOT NULL, summary TEXT NOT NULL);
        ''')
        empty = c.execute('SELECT count(*) FROM questions').fetchone()[0] == 0
    if empty:
        with (ROOT / 'bank.json').open(encoding='utf-8') as f:
            import_bank(json.load(f), commit=True)


def import_bank(raw, commit=False):
    bank = validate_bank(raw)
    with LOCK, connect() as c:
        existing = {row['id']: json.loads(row['payload']) for row in c.execute('SELECT * FROM questions')}
        add, update, skip = [], [], 0
        incoming_ids = {q['id'] for q in bank['questions']}
        other_prompts = {re.sub(r'\s+', ' ', q['prompt'] + ' ' + q.get('code', '')).strip().casefold()
                         for q in existing.values() if q['id'] not in incoming_ids}
        for q in bank['questions']:
            identity = re.sub(r'\s+', ' ', q['prompt'] + ' ' + q.get('code', '')).strip().casefold()
            require(identity not in other_prompts, 'Question already exists under another ID: ' + q['id'])
            old = existing.get(q['id'])
            if old == q:
                skip += 1
            elif old:
                require(q['revision'] > old.get('revision', 1), 'Increase revision to update ' + q['id'])
                update.append(q)
            else:
                add.append(q)
        summary = dict(added=len(add), updated=len(update), unchanged=skip,
                       total=len(existing) + len(add), bank_version=bank['bank_version'])
        if commit:
            for chapter in bank['chapters']:
                c.execute('INSERT OR REPLACE INTO chapters VALUES (?, ?)', (chapter['id'], json.dumps(chapter)))
            for q in add + update:
                c.execute('INSERT OR REPLACE INTO questions VALUES (?, ?, ?)', (q['id'], q['chapter'], json.dumps(q)))
            c.execute('INSERT OR REPLACE INTO meta VALUES (?, ?)', ('bank_version', bank['bank_version']))
            c.execute('INSERT INTO imports(created,summary) VALUES (?,?)', (time.time(), json.dumps(summary)))
        return summary


def questions(c):
    return [json.loads(r[0]) for r in c.execute('SELECT payload FROM questions ORDER BY id')]


def chapters(c):
    return sorted([json.loads(r[0]) for r in c.execute('SELECT payload FROM chapters')], key=lambda x: x['order'])


def load_attempt(c, aid):
    row = c.execute('SELECT payload FROM attempts WHERE id=?', (aid,)).fetchone()
    require(row is not None, 'Attempt not found.')
    attempt = json.loads(row[0])
    if attempt['status'] == 'active' and attempt['deadline'] and time.time() >= attempt['deadline']:
        finish(c, attempt, 'timeout')
    return attempt


def save_attempt(c, a):
    c.execute('INSERT OR REPLACE INTO attempts VALUES (?,?,?,?)', (a['id'], a['started'], a['status'], json.dumps(a)))


def grade(c, a, q):
    if q['id'] in a['graded']:
        return
    correct = int(a['answers'].get(q['id']) == q['correct'])
    c.execute('''INSERT INTO progress VALUES(?,?,1,?,?) ON CONFLICT(qid) DO UPDATE SET
        correct=excluded.correct, seen=progress.seen+1, wins=progress.wins+excluded.wins, updated=excluded.updated''',
        (q['id'], correct, correct, time.time()))
    a['graded'].append(q['id'])


def finish(c, a, reason='submitted'):
    if a['status'] != 'active':
        return
    for q in a['questions']:
        grade(c, a, q)
    a.update(status='finished', ended=time.time(), end_reason=reason)
    save_attempt(c, a)


def present_attempt(a):
    result = dict(a)
    result['server_time'] = time.time()
    result['questions'] = []
    for q in a['questions']:
        item = dict(q)
        if a['status'] == 'active' and q['id'] not in a['checked']:
            item.pop('correct', None)
            item.pop('explanation', None)
        result['questions'].append(item)
    if a['status'] == 'finished':
        result['score'] = sum(a['answers'].get(q['id']) == q['correct'] for q in a['questions'])
    return result


def eligible(c, filters):
    all_q = questions(c)
    chapter_ids = filters.get('chapters', [])
    require(isinstance(chapter_ids, list) and all(isinstance(x, str) for x in chapter_ids), 'Invalid chapters.')
    difficulty = filters.get('difficulty', 'all')
    require(difficulty in DIFFICULTIES | {'all'}, 'Invalid difficulty.')
    pool = filters.get('pool', 'all')
    require(pool in {'all', 'unseen', 'mistakes', 'bookmarks'}, 'Invalid question pool.')
    progress = {r['qid']: r['correct'] for r in c.execute('SELECT qid,correct FROM progress')}
    bookmarks = {r[0] for r in c.execute('SELECT qid FROM bookmarks')}
    return [q for q in all_q if
            (not chapter_ids or q['chapter'] in chapter_ids) and
            (difficulty == 'all' or q['difficulty'] == difficulty) and
            (pool == 'all' or pool == 'unseen' and q['id'] not in progress or
             pool == 'mistakes' and progress.get(q['id']) == 0 or
             pool == 'bookmarks' and q['id'] in bookmarks)]


def start_attempt(c, body):
    active = c.execute("SELECT id FROM attempts WHERE status='active'").fetchall()
    for row in active:
        a = load_attempt(c, row[0])
        require(a['status'] != 'active', 'Resume or submit your active session before starting another.')
    count = integer(body.get('count'), 1, 20000, 'Question count')
    minutes = integer(body.get('minutes'), 0, 240, 'Duration')
    mode = body.get('mode')
    require(mode in {'practice', 'exam'}, 'Choose practice or exam mode.')
    require(mode != 'exam' or minutes > 0, 'Timed exams need a duration of at least one minute.')
    candidates = eligible(c, body)
    require(count <= len(candidates), f'Only {len(candidates)} questions match these filters.')
    # Stratify across chapters, then randomize. Every eligible chapter gets a turn.
    groups = {}
    for q in candidates:
        groups.setdefault(q['chapter'], []).append(q)
    for group in groups.values():
        RNG.shuffle(group)
    selected = []
    while len(selected) < count:
        keys = [k for k, v in groups.items() if v]
        RNG.shuffle(keys)
        for key in keys:
            selected.append(groups[key].pop())
            if len(selected) == count:
                break
    RNG.shuffle(selected)
    snapshots = []
    for q in selected:
        prior = c.execute('SELECT ordering FROM choice_orders WHERE qid=?', (q['id'],)).fetchone()
        order = list(range(4))
        RNG.shuffle(order)
        while prior and json.dumps(order) == prior[0]:
            RNG.shuffle(order)
        c.execute('INSERT OR REPLACE INTO choice_orders VALUES (?,?)', (q['id'], json.dumps(order)))
        snapshot = {k: v for k, v in q.items() if k not in {'choices', 'answer'}}
        snapshot.update(choices=[dict(id=str(i), text=q['choices'][i]) for i in order], correct=str(q['answer']))
        snapshots.append(snapshot)
    now = time.time()
    attempt = dict(id=secrets.token_hex(12), started=now, deadline=now + minutes * 60 if minutes else None,
                   duration_minutes=minutes, mode=mode, status='active', questions=snapshots,
                   answers={}, checked=[], graded=[], flags=[], current=0, filters=body)
    save_attempt(c, attempt)
    return present_attempt(attempt)


def dashboard(c):
    all_q = questions(c)
    ch = chapters(c)
    progress = {r['qid']: dict(r) for r in c.execute('SELECT * FROM progress')}
    bookmarks = [r[0] for r in c.execute('SELECT qid FROM bookmarks')]
    history, active = [], None
    for row in c.execute('SELECT id FROM attempts ORDER BY started DESC').fetchall():
        a = load_attempt(c, row[0])
        if a['status'] == 'active':
            active = dict(id=a['id'], mode=a['mode'], count=len(a['questions']), answered=len(a['answers']))
        else:
            history.append(dict(id=a['id'], mode=a['mode'], started=a['started'], ended=a['ended'],
                count=len(a['questions']), score=sum(a['answers'].get(q['id']) == q['correct'] for q in a['questions']),
                reason=a['end_reason']))
    # Refresh after timeout grading during load_attempt.
    progress = {r['qid']: dict(r) for r in c.execute('SELECT * FROM progress')}
    for chapter in ch:
        qs = [q for q in all_q if q['chapter'] == chapter['id']]
        chapter['count'] = len(qs)
        chapter['seen'] = sum(q['id'] in progress for q in qs)
        chapter['mastered'] = sum(progress.get(q['id'], {}).get('correct', 0) for q in qs)
        chapter['levels'] = {level: sum(q['difficulty'] == level for q in qs)
                             for level in ('beginner', 'intermediate', 'advanced')}
    return dict(csrf=TOKEN, chapters=ch, tracks=list(dict.fromkeys(x['track'] for x in ch)),
                total=len(all_q), progress=progress, bookmarks=bookmarks,
                history=history[:100], history_total=len(history), active=active,
                bank_version=c.execute("SELECT value FROM meta WHERE key='bank_version'").fetchone()[0],
                index=[dict(id=q['id'], chapter=q['chapter'], difficulty=q['difficulty'], kind=q['kind']) for q in all_q])


class Handler(BaseHTTPRequestHandler):
    server_version = 'DataForge/1.0'

    def log_message(self, fmt, *args):
        # No submitted answers or imported contents in logs.
        pass

    def send(self, status, data, mime='application/json; charset=utf-8', filename=None):
        if not isinstance(data, bytes):
            data = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
        if filename:
            self.send_header('Content-Disposition', 'attachment; filename="' + filename + '"')
        self.end_headers()
        self.wfile.write(data)

    def host_ok(self):
        allowed = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
        require(self.headers.get('Host') in allowed, 'Local access only.')
        origin = self.headers.get('Origin')
        require(not origin or origin in {'http://' + x for x in allowed}, 'Cross-origin access denied.')
        require(self.headers.get('Sec-Fetch-Site') != 'cross-site', 'Cross-site access denied.')

    def send_db(self, c, status, data):
        # Durability precedes success: another tab/process may read immediately.
        c.commit()
        return self.send(status, data)

    def do_GET(self):
        try:
            self.host_ok()
            parsed = urlparse(self.path)
            path, params = parsed.path, parse_qs(parsed.query)
            if path == '/api/bootstrap':
                with LOCK, connect() as c:
                    return self.send_db(c, 200, dashboard(c))
            if path.startswith('/api/attempts/'):
                with LOCK, connect() as c:
                    return self.send_db(c, 200, present_attempt(load_attempt(c, path.split('/')[-1])))
            if path == '/api/questions':
                with connect() as c:
                    qs = questions(c)
                search = params.get('search', [''])[0].casefold()
                chapter = params.get('chapter', [''])[0]
                qs = [q for q in qs if (not chapter or q['chapter'] == chapter) and
                      (not search or search in (q['prompt'] + ' ' + q['code'] + ' ' + q['explanation']).casefold())]
                page = int(params.get('page', ['1'])[0])
                require(page >= 1, 'Invalid page.')
                return self.send(200, dict(total=len(qs), page=page, questions=qs[(page-1)*20:page*20]))
            if path == '/api/export':
                with connect() as c:
                    bank = dict(schema_version=1, bank_version=c.execute("SELECT value FROM meta WHERE key='bank_version'").fetchone()[0],
                                chapters=chapters(c), questions=questions(c))
                return self.send(200, bank, filename='dataforge-question-bank.json')
            if path == '/api/backup':
                with LOCK, tempfile.TemporaryDirectory() as temp:
                    target = Path(temp) / 'backup.sqlite3'
                    with connect() as c, closing(sqlite3.connect(target)) as backup:
                        c.backup(backup)
                    return self.send(200, target.read_bytes(), 'application/vnd.sqlite3', 'dataforge-backup.sqlite3')
            static = {'/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/favicon.svg': 'favicon.svg', '/import-example.json': 'import-example.json'}
            require(path in static, 'Page not found.')
            file = ROOT / 'static' / static[path]
            mime = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json'}[file.suffix]
            return self.send(200, file.read_bytes(), mime)
        except (Invalid, ValueError) as exc:
            self.send(400, dict(error=str(exc)))
        except Exception:
            self.send(500, dict(error='A local server error occurred. Your saved data is retained. Check the server terminal.'))
            import traceback
            traceback.print_exc()

    def do_POST(self):
        try:
            self.host_ok()
            require(secrets.compare_digest(self.headers.get('X-CSRF-Token', ''), TOKEN), 'Reload the page to renew your session token.')
            size = int(self.headers.get('Content-Length', '0'))
            require(0 < size <= MAX_BODY, 'JSON request must be at most 16 MB.')
            require(self.headers.get('Content-Type', '').split(';')[0] == 'application/json', 'JSON content type required.')
            body = json.loads(self.rfile.read(size))
            require(isinstance(body, dict), 'Expected a JSON object.')
            path = urlparse(self.path).path
            if path in {'/api/import/preview', '/api/import/commit'}:
                return self.send(200, import_bank(body, commit=path.endswith('commit')))
            with LOCK, connect() as c:
                if path == '/api/attempts':
                    return self.send_db(c, 201, start_attempt(c, body))
                if path == '/api/bookmarks':
                    qid = body.get('id')
                    require(isinstance(qid, str) and c.execute('SELECT 1 FROM questions WHERE id=?', (qid,)).fetchone(), 'Unknown question.')
                    require(type(body.get('saved')) is bool, 'saved must be true or false.')
                    if body['saved']:
                        c.execute('INSERT OR IGNORE INTO bookmarks VALUES (?)', (qid,))
                    else:
                        c.execute('DELETE FROM bookmarks WHERE qid=?', (qid,))
                    return self.send_db(c, 200, dict(ok=True))
                match = re.fullmatch(r'/api/attempts/([a-f0-9]{24})/(answer|check|navigate|flag|submit)', path)
                require(match, 'Unknown endpoint.')
                aid, action = match.groups()
                a = load_attempt(c, aid)
                if a['status'] == 'finished':
                    return self.send_db(c, 200, present_attempt(a))
                if action == 'submit':
                    finish(c, a)
                elif action == 'navigate':
                    a['current'] = integer(body.get('index'), 0, len(a['questions']) - 1, 'Question index')
                else:
                    q = next((q for q in a['questions'] if q['id'] == body.get('qid')), None)
                    require(q, 'Unknown question in this attempt.')
                    qid = q['id']
                    if action == 'flag':
                        a['flags'].remove(qid) if qid in a['flags'] else a['flags'].append(qid)
                    elif action == 'answer':
                        require(qid not in a['checked'], 'This practice answer is already checked.')
                        choice = body.get('choice')
                        require(choice in {'0', '1', '2', '3'}, 'Invalid answer.')
                        a['answers'][qid] = choice
                    elif action == 'check':
                        require(a['mode'] == 'practice', 'Answers are revealed after exam submission.')
                        require(qid in a['answers'], 'Choose an answer first.')
                        if qid not in a['checked']:
                            a['checked'].append(qid)
                            grade(c, a, q)
                save_attempt(c, a)
                return self.send_db(c, 200, present_attempt(a))
        except (Invalid, ValueError, json.JSONDecodeError) as exc:
            self.send(400, dict(error=str(exc)))
        except Exception:
            self.send(500, dict(error='The action could not be saved. Please retry.'))
            import traceback
            traceback.print_exc()


def main():
    parser = argparse.ArgumentParser(description='DataForge local learning app')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    initialize()
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    except OSError:
        parser.exit(1, f'Port {args.port} is unavailable. Try --port {args.port + 1}.\n')
    url = f'http://127.0.0.1:{server.server_port}'
    marker = DATA / 'runtime.json'
    marker.write_text(json.dumps(dict(pid=os.getpid(), port=server.server_port)), encoding='utf-8')
    print(f'DataForge is ready: {url}\nKeep this terminal open. Press Ctrl+C to stop.', flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        if marker.exists():
            runtime = json.loads(marker.read_text(encoding='utf-8'))
            if runtime.get('pid') == os.getpid():
                marker.unlink()


if __name__ == '__main__':
    main()
