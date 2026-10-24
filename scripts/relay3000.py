# -*- coding: utf-8 -*-
# 3000→3002 中转：老地址裸奔脚本零改动复活（自动补access_token）。NapCat已停，3000空出。
import json, urllib.request, sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
UP = "http://127.0.0.1:3002"
TOK = "<新家HTTP票>"
class H(BaseHTTPRequestHandler):
    def _go(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n) if n else None
        url = UP + self.path + ("&" if "?" in self.path else "?") + "access_token=" + TOK
        try:
            req = urllib.request.Request(url, data=body, headers={"content-type": self.headers.get("content-type") or "application/json"})
            r = urllib.request.urlopen(req, timeout=25)
            data = r.read(); code = r.getcode()
        except Exception as e:
            data = json.dumps({"status":"failed","retcode":-1,"wording":"relay fail "+str(e)[:80]}).encode(); code = 502
        self.send_response(code); self.send_header("content-type","application/json"); self.end_headers()
        self.wfile.write(data)
    do_GET = do_POST = _go
    def log_message(self, *a): pass
class S(ThreadingMixIn, HTTPServer): daemon_threads = True
S(("127.0.0.1", 3000), H).serve_forever()
