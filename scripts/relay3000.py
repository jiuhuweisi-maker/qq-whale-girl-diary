# -*- coding: utf-8 -*-
"""Loopback OneBot relay, Python 3.6+. No credentials in source or errors.
Explicit delivery IDs are durable idempotency keys. Unkeyed calls are audited,
never deduplicated by text: deliberate repetition is legitimate.
"""
import hashlib
import json
import os
import re
import sqlite3
import threading
import time
import urllib.parse
import urllib.request
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()

class DeliveryStore(object):
    def __init__(self, directory):
        os.makedirs(directory, mode=0o700, exist_ok=True)
        self.db = os.path.join(directory, 'relay-delivery.sqlite')
        self.journal = os.path.join(directory, 'relay-outbound.jsonl')
        self.lock = threading.Lock()
        with self.connect() as con:
            con.execute('CREATE TABLE IF NOT EXISTS delivery (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, state TEXT NOT NULL, body BLOB, code INTEGER, at REAL NOT NULL)')
        os.chmod(self.db, 0o600)

    def connect(self):
        con = sqlite3.connect(self.db, timeout=8)
        con.execute('PRAGMA synchronous=FULL')
        return con

    def reserve(self, delivery_id, fingerprint):
        with self.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            row = con.execute('SELECT fingerprint,state,body,code FROM delivery WHERE id=?', (delivery_id,)).fetchone()
            if row:
                if row[0] != fingerprint:
                    raise ValueError('delivery_id_conflict')
                return row
            con.execute('INSERT INTO delivery VALUES (?,?,?,NULL,NULL,?)', (delivery_id, fingerprint, 'pending', time.time()))
        return None

    def finish(self, delivery_id, body, code):
        if delivery_id:
            with self.connect() as con:
                con.execute('UPDATE delivery SET state=?,body=?,code=? WHERE id=?', ('complete', body, code, delivery_id))

    def record(self, entry):
        # No body, account number, URL, header or token is written here.
        data = (json.dumps(entry, ensure_ascii=True, sort_keys=True) + '\n').encode('utf-8')
        with self.lock:
            fd = os.open(self.journal, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
            try:
                os.write(fd, data)
                os.fsync(fd)
            finally:
                os.close(fd)

class Relay(object):
    def __init__(self, upstream, token, directory, opener=urllib.request.urlopen):
        parsed = urllib.parse.urlsplit(upstream)
        if parsed.scheme != 'http' or parsed.hostname not in ('127.0.0.1', 'localhost', '::1') or parsed.query or parsed.username:
            raise ValueError('OneBot upstream must be loopback HTTP')
        if not token or '\n' in token or '\r' in token:
            raise ValueError('OneBot token is missing or invalid')
        self.upstream, self.token, self.opener = upstream.rstrip('/'), token, opener
        self.store = DeliveryStore(directory)

    @staticmethod
    def error(reason, status):
        return status, json.dumps({'status':'failed','retcode':-1,'wording':reason}).encode('utf-8')

    def request(self, route, body=None, delivery_id='', origin='legacy'):
        parsed = urllib.parse.urlsplit(route)
        if parsed.scheme or parsed.netloc or not parsed.path.startswith('/'):
            return self.error('invalid_path', 400)
        query = [(k,v) for k,v in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True) if k not in ('access_token','token')]
        url = self.upstream + parsed.path + ('?' + urllib.parse.urlencode(query) if query else '')
        action = parsed.path.strip('/')
        outbound = bool(re.match(r'^(send_(group_msg|private_msg|msg)|set_group_(kick|ban)|delete_msg)$', action))
        params = dict(query)
        if body:
            try:
                value = json.loads(body.decode('utf-8'))
                if not isinstance(value, dict):
                    return self.error('invalid_body', 400)
                params.update(value)
            except (ValueError, UnicodeError):
                return self.error('invalid_body', 400)
        kind = 'group' if params.get('group_id') else 'private' if params.get('user_id') else 'other'
        scope = digest(kind + ':' + str(params.get('group_id') or params.get('user_id') or ''))[:16]
        fingerprint = digest(action + json.dumps(params, sort_keys=True, ensure_ascii=True))
        delivery_id = delivery_id if outbound else ''
        if delivery_id and not re.match(r'^[a-zA-Z0-9_.:-]{16,200}$', delivery_id):
            return self.error('invalid_delivery_id', 400)
        entry = {'at':time.time(),'action':action,'scope':kind,'conversation':scope,'fingerprint':fingerprint,
                 'origin':origin if re.match(r'^[a-zA-Z0-9_.-]{1,32}$', origin) else 'unknown','deliveryId':delivery_id or None}
        try:
            if delivery_id:
                old = self.store.reserve(delivery_id, fingerprint)
                if old:
                    if old[1] == 'complete':
                        return old[3], old[2]
                    return self.error('delivery_unconfirmed_do_not_retry', 409)
            if outbound:
                entry['status'] = 'attempt'
                self.store.record(entry)
            req = urllib.request.Request(url, data=body, headers={'content-type':'application/json','Authorization':'Bearer '+self.token})
            with self.opener(req, timeout=25) as response:
                raw, status = response.read(16 * 1024 * 1024), response.getcode()
            if outbound:
                result = json.loads(raw.decode('utf-8'))
                entry.update(status='confirmed' if result.get('retcode') == 0 else 'rejected',
                             retcode=result.get('retcode'),messageId=(result.get('data') or {}).get('message_id'))
                self.store.record(entry)
                self.store.finish(delivery_id, raw, status)
            return status, raw
        except ValueError as exc:
            if str(exc) == 'delivery_id_conflict':
                return self.error('delivery_id_conflict', 409)
        except Exception:
            pass
        if outbound:
            entry['status'] = 'uncertain'
            try:
                self.store.record(entry)
            except Exception:
                pass
        # Exceptions can contain credential-bearing request URLs. Never serialize them.
        return self.error('delivery_unconfirmed_do_not_retry' if outbound else 'onebot_temporarily_unavailable', 502)

def serve():
    token_file = os.environ.get('ONEBOT_TOKEN_FILE','/opt/qq-cs/.onebot-http-token')
    token = os.environ.get('ONEBOT_ACCESS_TOKEN')
    if not token:
        with open(token_file, encoding='utf-8') as stream:
            token = stream.read().strip()
    relay = Relay(os.environ.get('ONEBOT_UPSTREAM','http://127.0.0.1:3002'),token,
                  os.environ.get('WHALE_RELAY_STATE','/var/lib/whale-relay'))
    class Handler(BaseHTTPRequestHandler):
        def run_request(self):
            try:
                size = int(self.headers.get('Content-Length') or 0)
                if not 0 <= size <= 16 * 1024 * 1024:
                    raise ValueError('size')
                code,data = relay.request(self.path,self.rfile.read(size) if size else None,
                                          self.headers.get('X-Whale-Delivery-Id',''),self.headers.get('X-Whale-Origin','legacy'))
            except Exception:
                code,data = relay.error('invalid_request',400)
            self.send_response(code)
            self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Content-Length',str(len(data)))
            self.end_headers()
            try:
                self.wfile.write(data)
            except (BrokenPipeError,ConnectionResetError):
                pass
        do_GET = do_POST = run_request
        def log_message(self,*args):
            pass
    class Server(ThreadingMixIn,HTTPServer):
        daemon_threads = True
    Server(('127.0.0.1',int(os.environ.get('WHALE_RELAY_PORT','3000'))),Handler).serve_forever()

if __name__ == '__main__':
    serve()
