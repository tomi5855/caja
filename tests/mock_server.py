"""Servidor de pruebas: sirve la app y simula la API de contenidos de GitHub (solo lo que usa Caja).
Uso: python3 -I mock_server.py <carpeta_app> <puerto> <volcado.json>
Admin: /mockadmin/down?on=1|0 (corta la red), /mockadmin/bump?path=... (simula otro dispositivo),
       /mockadmin/log (commits recibidos)."""
import base64, hashlib, http.server, json, sys, time, urllib.parse

ROOT, PORT, DUMP = sys.argv[1], int(sys.argv[2]), sys.argv[3]
TOKEN, REPO = 'prueba-local', 'tomi5855/caja-datos'
store, log, state = {}, [], {'down': False}


def dump():
    with open(DUMP, 'w', encoding='utf-8') as fh:
        json.dump({k: v['content'].decode('utf-8') for k, v in store.items()}, fh, ensure_ascii=False, indent=1)


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def _json(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _route(self):
        u = urllib.parse.urlparse(self.path)
        if u.path.startswith('/mockadmin/'):
            return ('admin', u.path[len('/mockadmin/'):], urllib.parse.parse_qs(u.query))
        if not u.path.startswith('/mockgh/repos/'):
            return None
        if state['down']:
            return ('down',)
        parts = u.path[len('/mockgh/repos/'):].split('/')
        if self.headers.get('Authorization') != 'Bearer ' + TOKEN:
            return ('auth',)
        if '/'.join(parts[:2]) != REPO:
            return ('nf',)
        if len(parts) == 2:
            return ('repo',)
        if parts[2] != 'contents':
            return ('nf',)
        return ('contents', urllib.parse.unquote('/'.join(parts[3:])))

    def _admin(self, cmd, q):
        if cmd == 'down':
            state['down'] = q.get('on', ['1'])[0] == '1'
            return self._json(200, {'down': state['down']})
        if cmd == 'bump':
            p = q['path'][0]
            store[p]['sha'] = hashlib.sha1(str(time.time()).encode()).hexdigest()
            return self._json(200, {'sha': store[p]['sha']})
        if cmd == 'log':
            return self._json(200, log)
        return self._json(404, {})

    def do_GET(self):
        r = self._route()
        if r is None:
            return super().do_GET()
        if r[0] == 'admin':
            return self._admin(r[1], r[2])
        if r[0] == 'down':
            self.close_connection = True
            return
        if r[0] == 'auth':
            return self._json(401, {'message': 'Bad credentials'})
        if r[0] == 'nf':
            return self._json(404, {'message': 'Not Found'})
        if r[0] == 'repo':
            return self._json(200, {'full_name': REPO, 'private': True})
        p = r[1]
        if p in store:
            f = store[p]
            return self._json(200, {'type': 'file', 'name': p.split('/')[-1], 'path': p, 'sha': f['sha'],
                                    'encoding': 'base64', 'content': base64.b64encode(f['content']).decode()})
        kids = sorted(k for k in store if k.startswith(p + '/'))
        if kids:
            return self._json(200, [{'type': 'file', 'name': k.split('/')[-1], 'path': k, 'sha': store[k]['sha']} for k in kids])
        return self._json(404, {'message': 'Not Found'})

    def do_PUT(self):
        r = self._route()
        if r is None:
            return self._json(405, {})
        if r[0] == 'down':
            self.close_connection = True
            return
        if r[0] == 'auth':
            return self._json(401, {'message': 'Bad credentials'})
        if r[0] != 'contents':
            return self._json(404, {'message': 'Not Found'})
        p = r[1]
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0'))) or b'{}')
        cur = store.get(p)
        if cur and not body.get('sha'):
            return self._json(422, {'message': '"sha" wasn\'t supplied.'})
        if cur and body.get('sha') != cur['sha']:
            return self._json(409, {'message': 'sha does not match'})
        content = base64.b64decode(body['content'])
        sha = hashlib.sha1(content + str(time.time()).encode()).hexdigest()
        store[p] = {'content': content, 'sha': sha}
        log.append({'path': p, 'message': body.get('message'), 'had_sha': bool(body.get('sha'))})
        dump()
        return self._json(200 if cur else 201, {'content': {'path': p, 'sha': sha}, 'commit': {'message': body.get('message')}})


http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
