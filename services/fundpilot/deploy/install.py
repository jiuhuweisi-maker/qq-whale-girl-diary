import base64, hashlib, json, os, pathlib, pwd, shutil, subprocess, time, urllib.request

RESULT = {'protocol':'codex-whale-ops-v1','ok':False,'live_orders':0,'broker_connected':False}
ROOT = pathlib.Path('/opt/fundpilot')
PROFILE = pathlib.Path('/root/.dsh/profiles/fundpilot')
DATA = pathlib.Path('/var/lib/fundpilot')
GLOBAL = pathlib.Path('/opt/node/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai')

def run(args, timeout=25):
    return subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True, timeout=timeout)

def state(service):
    return run(['systemctl','is-active',service]).stdout.strip()

def qq_online():
    try:
        request = urllib.request.Request('http://127.0.0.1:3000/get_login_info',data=b'{}',headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(request, timeout=6) as response:
            return json.load(response).get('retcode') == 0
    except Exception:
        return False

def existing_profile_hashes():
    return {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in [pathlib.Path('/root/.dsh/profiles/web/package.json'),pathlib.Path('/root/.dsh/profiles/web/cordis.yml'),pathlib.Path('/root/.dsh/profiles/web/cordis.patch.yml')]}

def install():
    if os.getuid() != 0:
        raise RuntimeError('ROOT_REQUIRED_FOR_NEW_SERVICE')
    if not GLOBAL.is_dir():
        raise RuntimeError('EXISTING_DSH_NOT_FOUND')
    RESULT['baseline'] = {'services':{s:state(s) for s in ['dsh','whale-relay','whale-ws']},'qq_online':qq_online()}
    before = existing_profile_hashes()
    marker = ROOT/'.fundpilot-owned'
    if ROOT.exists() and (not marker.is_file() or marker.read_text().strip() != 'fundpilot-dsh-paper'):
        raise RuntimeError('TARGET_EXISTS_WITHOUT_OWNERSHIP_MARKER')
    ROOT.mkdir(mode=0o755, exist_ok=True)
    marker.write_text('fundpilot-dsh-paper\n')
    hashes = {}
    for relative, item in BUNDLE['files'].items():
        parts = pathlib.PurePosixPath(relative)
        if parts.is_absolute() or '..' in parts.parts or not parts.parts:
            raise RuntimeError('UNSAFE_ARCHIVE_PATH')
        destination = ROOT.joinpath(*parts.parts)
        if not str(destination.resolve()).startswith(str(ROOT.resolve())+'/'):
            raise RuntimeError('TARGET_PATH_ESCAPE')
        content = base64.b64decode(item['base64'])
        digest = hashlib.sha256(content).hexdigest()
        if digest != item['sha256']:
            raise RuntimeError('PAYLOAD_HASH_MISMATCH')
        destination.parent.mkdir(parents=True,mode=0o755,exist_ok=True)
        if destination.exists() and destination.read_bytes() != content:
            backup = ROOT/'backups'/time.strftime('%Y%m%d%H%M%S', time.gmtime())/relative
            backup.parent.mkdir(parents=True,exist_ok=True)
            backup.write_bytes(destination.read_bytes())
        temporary = destination.with_name(destination.name+'.install-tmp')
        temporary.write_bytes(content)
        os.chmod(str(temporary),0o644)
        os.replace(str(temporary),str(destination))
        hashes[relative] = digest
    (ROOT/'manifest.json').write_text(json.dumps({'name':'fundpilot-dsh-paper','version':BUNDLE['version'],'sha256':hashes},ensure_ascii=False,indent=2))
    plugin_scope = ROOT/'dsh-plugin/node_modules/@deepseek-ai'
    plugin_scope.parent.mkdir(parents=True,exist_ok=True)
    if not plugin_scope.exists():
        plugin_scope.symlink_to(GLOBAL,target_is_directory=True)

    node = shutil.which('node')
    tests = run([node,'--test']+[str(p) for p in sorted((ROOT/'tests').glob('*.test.mjs'))],45)
    RESULT['linux_tests_exit'] = tests.returncode
    RESULT['linux_tests_summary'] = tests.stdout[-1600:]
    if tests.returncode:
        RESULT['linux_tests_error'] = tests.stderr[-1000:]
        raise RuntimeError('LINUX_TESTS_FAILED')

    if PROFILE.exists():
        tag = PROFILE/'.fundpilot-owned'
        if not tag.is_file() or tag.read_text().strip() != 'fundpilot-dsh-paper':
            raise RuntimeError('PROFILE_EXISTS_WITHOUT_OWNERSHIP_MARKER')
    PROFILE.mkdir(mode=0o700,parents=True,exist_ok=True)
    (PROFILE/'.fundpilot-owned').write_text('fundpilot-dsh-paper\n')
    (PROFILE/'node_modules').mkdir(exist_ok=True)
    for name, destination in [('@deepseek-ai',GLOBAL),('dsh-fundpilot',ROOT/'dsh-plugin')]:
        link = PROFILE/'node_modules'/name
        if link.is_symlink() and link.resolve() != destination.resolve():
            raise RuntimeError('UNEXPECTED_PROFILE_SYMLINK')
        if not link.exists():
            link.symlink_to(destination,target_is_directory=True)
    (PROFILE/'package.json').write_text(json.dumps({'name':'fundpilot-paper-profile','private':True,'dsh':{'profile':{'bundles':['@deepseek-ai/dsh-base','@deepseek-ai/dsh-headless','dsh-fundpilot']}}},indent=2))
    (PROFILE/'cordis.yml').write_text('[]\n')
    (PROFILE/'cordis.patch.yml').write_text('[]\n')
    dump = run([shutil.which('dsh'),'--profile','fundpilot','--dump-config'],35)
    RESULT['dsh_profile_dump_exit'] = dump.returncode
    RESULT['dsh_profile_includes_plugin'] = 'fundpilot' in dump.stdout
    if dump.returncode or not RESULT['dsh_profile_includes_plugin']:
        raise RuntimeError('DSH_PROFILE_COMPOSITION_FAILED')

    try:
        owner = pwd.getpwnam('fundpilot')
    except KeyError:
        created = run(['useradd','--system','--home-dir',str(DATA),'--shell',shutil.which('nologin') or '/sbin/nologin','fundpilot'])
        if created.returncode:
            raise RuntimeError('SERVICE_USER_CREATE_FAILED')
        owner = pwd.getpwnam('fundpilot')
    DATA.mkdir(mode=0o700,exist_ok=True)
    os.chown(str(DATA),owner.pw_uid,owner.pw_gid)
    os.chmod(str(DATA),0o700)
    token_file = DATA/'service.token'
    if not token_file.exists():
        token_file.write_text(os.urandom(32).hex()+'\n')
    os.chown(str(token_file),owner.pw_uid,owner.pw_gid)
    os.chmod(str(token_file),0o600)
    unit = pathlib.Path('/etc/systemd/system/fundpilot-paper.service')
    if unit.exists() and b'FundPilot isolated paper trading service' not in unit.read_bytes():
        raise RuntimeError('UNEXPECTED_SERVICE_FILE')
    unit.write_bytes((ROOT/'deploy/fundpilot-paper.service').read_bytes())
    if run(['systemctl','daemon-reload']).returncode:
        raise RuntimeError('DAEMON_RELOAD_FAILED')
    if run(['systemctl','enable','fundpilot-paper.service']).returncode:
        raise RuntimeError('NEW_SERVICE_ENABLE_FAILED')
    start = run(['systemctl','restart','fundpilot-paper.service'],30)
    if start.returncode:
        RESULT['service_start_error'] = start.stderr[-1500:]
        raise RuntimeError('NEW_SERVICE_START_FAILED')
    token = token_file.read_text().strip()
    status = None
    for attempt in range(24):
        try:
            request = urllib.request.Request('http://127.0.0.1:3092/status',headers={'Authorization':'Bearer '+token})
            with urllib.request.urlopen(request,timeout=3) as response:
                status = json.load(response)
            if status.get('market',{}).get('status') != 'starting':
                break
        except Exception:
            pass
        time.sleep(1)
    RESULT['service_active'] = state('fundpilot-paper')
    RESULT['service_status'] = status
    if status is None or status.get('mode') != 'paper' or status.get('liveTrading') is not False:
        raise RuntimeError('PAPER_SERVICE_VERIFICATION_FAILED')
    contract = run([node,str(ROOT/'scripts/verify-dsh.mjs'),str(ROOT)],25)
    RESULT['native_plugin_exit'] = contract.returncode
    RESULT['native_plugin_result'] = contract.stdout.strip()[-1000:]
    if contract.returncode:
        RESULT['native_plugin_error'] = contract.stderr[-1500:]
        raise RuntimeError('NATIVE_PLUGIN_CONTRACT_FAILED')
    RESULT['existing_dsh_profiles_unchanged'] = before == existing_profile_hashes()
    RESULT['after'] = {'services':{s:state(s) for s in ['dsh','whale-relay','whale-ws']},'qq_online':qq_online()}
    RESULT['installed_file_count'] = len(hashes)
    RESULT['ok'] = RESULT['existing_dsh_profiles_unchanged'] and all(v=='active' for v in RESULT['after']['services'].values()) and RESULT['after']['qq_online']

try:
    install()
except Exception as exc:
    RESULT['error'] = str(exc) if isinstance(exc,RuntimeError) else type(exc).__name__
print(json.dumps(RESULT,ensure_ascii=False))
