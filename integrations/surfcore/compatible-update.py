#!/usr/bin/env python3
"""Guarded upstream updates for an already installed whale overlay.

Never installs dependencies, changes DSH/QQ, reads chat bodies, or sends messages.
Run with a private JSON config: root, work, testRepo, node, service (dsh).
Conflicts/dependency changes retain the current deployment for review.
"""
import concurrent.futures
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tarfile
import time

OFFICIAL = 'https://github.com/Mieksido/surfcore.git'
FIELDS = ('dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'engines', 'scripts', 'type')


def run(args, cwd=None, env=None, timeout=90, check=True):
    p = subprocess.run([str(a) for a in args], cwd=str(cwd) if cwd else None,
                       env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if check and p.returncode:
        raise RuntimeError('command_failed:' + Path(str(args[0])).name)
    return p


def digest(data):
    return hashlib.sha256(data).hexdigest()


def atomic(file, data):
    file.parent.mkdir(parents=True, exist_ok=True)
    temporary = file.with_name(file.name + '.new-update')
    with temporary.open('wb') as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.chmod(str(temporary), 0o600)
    os.replace(str(temporary), str(file))


def selected(name):
    p = PurePosixPath(name)
    return (not p.is_absolute() and '..' not in p.parts and
            (name in ('package.json', 'package-lock.json', 'whale-native-images/package.json', 'whale-native-images/package-lock.json') or
             name.startswith(('src/', 'plugins/', 'dsh/', 'scripts/'))))


def snapshot(cache, commit):
    data = run(['git', '--git-dir', cache, 'archive', commit], timeout=120).stdout
    out = {}
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        for member in archive:
            if selected(member.name):
                if not member.isfile():
                    if member.isdir():
                        continue
                    raise RuntimeError('upstream_symlink_or_special_file')
                if member.size > 16 * 1024 * 1024:
                    raise RuntimeError('upstream_file_too_large')
                out[member.name] = archive.extractfile(member).read()
    return out


def merge_tree(base, current, latest, scratch):
    result = dict(current)
    conflicts = []
    for name in sorted(set(base) | set(latest)):
        before, ours, theirs = base.get(name), current.get(name), latest.get(name)
        if theirs == before:
            continue
        if ours == before or ours == theirs:
            if theirs is None:
                result.pop(name, None)
            else:
                result[name] = theirs
            continue
        if before is None or ours is None or theirs is None or any(b'\0' in b for b in (before, ours, theirs)):
            conflicts.append(name)
            continue
        parts = [scratch / ('merge-' + n) for n in ('ours', 'base', 'theirs')]
        for f, value in zip(parts, (ours, before, theirs)):
            f.write_bytes(value)
        p = run(['git', 'merge-file', '-p'] + parts, check=False)
        if p.returncode:
            conflicts.append(name)
        else:
            result[name] = p.stdout
    if conflicts:
        raise RuntimeError('merge_conflict:' + ','.join(conflicts))
    before, after = json.loads(current['package.json']), json.loads(result['package.json'])
    if any(before.get(k) != after.get(k) for k in FIELDS):
        raise RuntimeError('dependency_or_runtime_contract_changed')
    # A transitive lockfile upgrade can change runtime requirements even when
    # package.json ranges stay identical. We do not run npm during an update.
    def effective_lock(raw):
        value = json.loads(raw)
        value.pop('name', None)
        value.pop('version', None)
        first = value.get('packages', {}).get('', {})
        first.pop('name', None)
        first.pop('version', None)
        return value
    if current.get('package-lock.json') or result.get('package-lock.json'):
        if not current.get('package-lock.json') or not result.get('package-lock.json') or effective_lock(current['package-lock.json']) != effective_lock(result['package-lock.json']):
            raise RuntimeError('dependency_lock_changed')
    for name in ('whale-native-images/package.json', 'whale-native-images/package-lock.json'):
        if current.get(name) != result.get(name):
            raise RuntimeError('native_image_dependency_changed')
    # Startup files, new tools, installers and permissions require review even
    # when a textual merge succeeds. They must never silently expand access.
    for name in result:
        if name not in current and name.startswith(('dsh/', 'plugins/')):
            raise RuntimeError('new_plugin_or_preset_requires_review:' + name)
    return result


def native_quiet(cfg):
    script = r"""import fs from'node:fs';import z from'node:zlib';import{discoverDshSessionCookie}from'./src/dsh-client.js';const c=JSON.parse(fs.readFileSync('config.json')),stream=crypto.randomUUID(),u=new URL('/api/remote.mux',c.dsh.baseUrl);u.protocol='ws:';const ws=new WebSocket(u,{headers:{cookie:discoverDshSessionCookie(c.dsh.baseUrl)}}),b=await new Promise((yes,no)=>{const t=setTimeout(()=>{ws.close();no(Error('timeout'))},10000);ws.addEventListener('open',()=>ws.send(JSON.stringify({type:'open',streamId:stream,endpoint:'session/control',payload:{args:{}}})));ws.addEventListener('message',e=>{const x=JSON.parse(e.data);if(x.streamId===stream&&x.type==='item'&&x.value?.type==='baseline'){clearTimeout(t);ws.close();yes(x.value.value.projections)}});ws.addEventListener('error',()=>no(Error('connection')))}),files=fs.readdirSync('/root/.dsh/sessions',{recursive:true});let quiet=Object.keys(b).length>0;for(const[sid,p]of Object.entries(b)){const f=files.filter(n=>n.includes(sid)&&n.endsWith('session.v4.jsonl.zstd')).sort((a,b)=>fs.statSync('/root/.dsh/sessions/'+b).mtimeMs-fs.statSync('/root/.dsh/sessions/'+a).mtimeMs)[0];if(!f){quiet=false;continue;}const ev=z.zstdDecompressSync(fs.readFileSync('/root/.dsh/sessions/'+f)).toString().split('\n').flatMap(l=>{try{return[JSON.parse(l)]}catch{return[]}});if(ev.findLast(e=>/^(turn\/start|turn\/end)$/.test(e.type))?.type!=='turn/end'||Object.values(p.values?.inbox||{}).some(x=>Array.isArray(x)&&x.length))quiet=false;}const s=JSON.parse(fs.readFileSync('state/social-v2.json')),latest=Math.max(0,...Object.values(s.conversations||{}).map(x=>Number(x.lastIncomingAt)||0));console.log(JSON.stringify({quiet:quiet&&Date.now()-latest>120000,latest}));"""
    return json.loads(run([cfg['node'], '--input-type=module', '-e', script], cfg['root'], timeout=20).stdout)


def validate(cfg, stage, work):
    home = work / 'test-home'
    home.mkdir(exist_ok=True)
    env = dict(os.environ, HOME=str(home), USERPROFILE=str(home), DSH_HOME=str(home / '.dsh'),
               SURFCORE_SOURCE=str(stage), TMPDIR=str(home))
    if cfg.get('imageDeps'):
        env['WHALE_IMAGE_DEPENDENCIES'] = cfg['imageDeps']
    env['WHALE_NATIVE_IMAGE_DEPENDENCIES'] = str(stage / 'whale-native-images/package.json')
    for name in ('dsh/agent-presets/qq-chat-v2/agent.cordis.yml', 'plugins/surfcore/presets/qq-chat-v2.patch.yml'):
        text = (stage / name).read_text()
        if any(s in text for s in ('装唐装傻', '已读乱回', '离谱/没用的答案', 'coding agent powered')):
            raise RuntimeError('persona_regression')
    repo = Path(cfg['testRepo']) / 'integrations/surfcore'
    # Tests import actual staged code and use fake DSH/OneBot peers. No account
    # config, native sessions, notifications or real tool endpoints are loaded.
    suites = [[repo / 'tests/bridge-integration.test.mjs', stage],
              [repo / 'tests/runtime.test.mjs'], [repo / 'tests/personal-journal.test.mjs'],
              [repo / 'tests/journal-ranking.test.mjs'], [repo / 'tests/legacy-reader-payload.test.mjs'],
              [repo / 'tests/model-image.test.mjs'], [repo / 'tests/image-delivery.test.mjs', stage], [repo / 'tests/prompt-preferences.test.mjs'],
              [repo / 'tests/bili-style.test.mjs', stage]]
    for i, args in enumerate(suites):
        p = run([cfg['node']] + args, env=env, timeout=100, check=False)
        (work / ('suite-' + str(i) + '.private.log')).write_bytes(p.stdout + p.stderr)
        if p.returncode:
            raise RuntimeError('isolated_suite_failed:' + str(i))
    js = list(stage.rglob('*.mjs')) + list(stage.rglob('*.js')) + list(stage.rglob('*.cjs'))
    js = [p for p in js if 'node_modules' not in p.parts]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        codes = list(pool.map(lambda p: run([cfg['node'], '--check', p], check=False).returncode, js))
    if any(codes):
        raise RuntimeError('syntax_check_failed')


def activate(cfg, stage, manifest, current_manifest, work):
    root = Path(cfg['root'])
    proof = native_quiet(cfg)
    if not proof['quiet']:
        return {'status': 'deferred-busy', 'activated': False}
    backup = work / 'backup'
    backup.mkdir()
    names = set(manifest['sums']) | set(current_manifest['sums']) | {'whale-overlay-manifest.json'}
    for name in names:
        if (root / name).exists():
            dest = backup / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(str(root / name), str(dest))
    marker = Path(cfg['work']) / 'in-progress.json'
    atomic(marker, json.dumps({'work': str(work), 'at': time.time(), 'files': sorted(names)}).encode())
    stopped = False
    try:
        if not native_quiet(cfg)['quiet']:
            marker.unlink()
            return {'status': 'deferred-busy', 'activated': False}
        p = run([cfg['node'], '--input-type=module', '-e', "import{stop}from'./plugins/surfcore/lib/bridge.js';console.log(JSON.stringify(await stop()));"], root)
        if not json.loads(p.stdout).get('ok'):
            raise RuntimeError('bridge_stop_failed')
        run(['systemctl', 'stop', cfg['service']], timeout=40)
        stopped = True
        for name in names:
            if (stage / name).is_file():
                atomic(root / name, (stage / name).read_bytes())
            elif name in current_manifest['sums'] and (root / name).is_file():
                # Only known old source files absent upstream, preserved in backup.
                (root / name).unlink()
        run(['systemctl', 'start', cfg['service']], timeout=40)
        with (work / 'start.private.log').open('wb') as log:
            subprocess.Popen([cfg['node'], '--input-type=module', '-e', "import{start}from'./plugins/surfcore/lib/bridge.js';await start();"], cwd=str(root), stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        script = r"""import fs from'node:fs';import crypto from'node:crypto';const c=JSON.parse(fs.readFileSync('config.json')),h=async p=>{const r=await fetch('http://127.0.0.1:'+c.consolePort+p,{headers:{'x-console-token':c.consoleToken},signal:AbortSignal.timeout(5000)});return r.json();},[s,w]=await Promise.all([h('/api/status'),h('/api/whale-status')]),m=JSON.parse(fs.readFileSync('whale-overlay-manifest.json')),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');console.log(JSON.stringify({ok:s.dshReady&&s.snowluma?.accountOnline&&s.snowluma?.connected&&w.healthy&&w.ready&&w.build?.upstream===m.upstream&&Object.entries(m.sums).every(([p,h])=>sha(p)===h)&&Object.entries(w.build?.sources||{}).every(([p,h])=>sha(p)===h)}));"""
        for unused in range(18):
            time.sleep(3)
            try:
                if json.loads(run([cfg['node'], '--input-type=module', '-e', script], root, timeout=12).stdout).get('ok'):
                    marker.unlink()
                    return {'status': 'updated', 'activated': True, 'upstream': manifest['upstream']}
            except Exception:
                pass
        raise RuntimeError('loaded_verification_failed')
    except Exception:
        if stopped:
            # Explicitly stop the candidate bridge before restoring source, too.
            run([cfg['node'], '--input-type=module', '-e', "import{stop}from'./plugins/surfcore/lib/bridge.js';await stop();"], root, check=False)
            run(['systemctl', 'stop', cfg['service']], check=False)
            for name in names:
                if (backup / name).exists():
                    atomic(root / name, (backup / name).read_bytes())
                elif name in manifest['sums'] and (root / name).is_file():
                    (root / name).unlink()
            run(['systemctl', 'start', cfg['service']])
            with (work / 'rollback.private.log').open('wb') as log:
                subprocess.Popen([cfg['node'], '--input-type=module', '-e', "import{start}from'./plugins/surfcore/lib/bridge.js';await start();"], cwd=str(root), stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        # Keep transaction marker after failure; never loop deployments/restarts.
        raise


def main():
    cfg = json.loads(Path(sys.argv[1]).read_text())
    if cfg.get('service') != 'dsh':
        raise RuntimeError('unexpected_service')
    root, work = Path(cfg['root']).resolve(), Path(cfg['work']).resolve()
    work.mkdir(parents=True, exist_ok=True)
    os.chmod(str(work), 0o700)
    # Kernel lock releases even if the process crashes. Never steal a live lock.
    import fcntl
    lock = (work / 'lock').open('a')
    try:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return {'status': 'already-running', 'activated': False}
    if (work / 'in-progress.json').exists():
        raise RuntimeError('unfinished_transaction_requires_review')
    manifest = json.loads((root / 'whale-overlay-manifest.json').read_text())
    for name, sha in manifest['sums'].items():
        p = PurePosixPath(name)
        if p.is_absolute() or '..' in p.parts or (not selected(name) and not name.startswith('whale-compat/')):
            raise RuntimeError('manifest_path_rejected')
        if digest((root / name).read_bytes()) != sha:
            raise RuntimeError('local_source_drift')
    cache = work / 'official.git'
    if not cache.exists():
        run(['git', 'init', '--bare', cache])
    run(['git', '--git-dir', cache, 'fetch', '--no-tags', '--depth=80', OFFICIAL, '+refs/heads/main:refs/remotes/origin/main'], timeout=120)
    latest = run(['git', '--git-dir', cache, 'rev-parse', 'refs/remotes/origin/main']).stdout.decode().strip()
    if latest == manifest['upstream']:
        return {'status': 'current', 'activated': False, 'upstream': latest}
    # A backwards or divergent branch is never an automatic update.
    run(['git', '--git-dir', cache, 'fetch', '--no-tags', OFFICIAL, manifest['upstream']], timeout=120)
    if run(['git', '--git-dir', cache, 'merge-base', '--is-ancestor', manifest['upstream'], latest], check=False).returncode:
        raise RuntimeError('upstream_not_verified_descendant')
    base, new = snapshot(cache, manifest['upstream']), snapshot(cache, latest)
    current = {n: (root / n).read_bytes() for n in manifest['sums']}
    attempt = work / ('candidate-' + latest[:12] + '-' + str(int(time.time())))
    attempt.mkdir()
    merged = merge_tree(base, current, new, attempt)
    stage = attempt / 'source'
    stage.mkdir()
    for name, value in merged.items():
        atomic(stage / name, value)
    next_manifest = dict(manifest, upstream=latest, sums={n: digest(v) for n, v in merged.items()})
    atomic(stage / 'whale-overlay-manifest.json', json.dumps(next_manifest, indent=2).encode())
    # No install or install scripts. Existing dependencies have been checked equal.
    if (root / 'node_modules').exists():
        os.symlink(str(root / 'node_modules'), str(stage / 'node_modules'))
    native = root / 'whale-native-images/node_modules'
    if native.exists():
        (stage / 'whale-native-images').mkdir(exist_ok=True)
        os.symlink(str(native.resolve()), str(stage / 'whale-native-images/node_modules'))
    validate(cfg, stage, attempt)
    if cfg.get('dryRun'):
        return {'status': 'validated-only', 'activated': False, 'upstream': latest}
    return activate(cfg, stage, next_manifest, manifest, attempt)


if __name__ == '__main__':
    result = {'ok': True, 'modelCalls': 0, 'testSends': 0}
    try:
        result.update(main())
    except Exception as error:
        result.update(ok=False, status='held', activated=False,
                      reason=str(error) if isinstance(error, RuntimeError) else type(error).__name__)
    if len(sys.argv) > 1:
        try:
            config = json.loads(Path(sys.argv[1]).read_text())
            result['at'] = time.time()
            atomic(Path(config['work']) / 'status.json', json.dumps(result, indent=2).encode())
        except Exception:
            pass
    print(json.dumps(result))
    sys.exit(0 if result['ok'] else 1)
