#!/usr/bin/env python3
"""Install the optional Linux/systemd update schedule, without running it.

python3 deploy/install-compatible-updater.py /absolute/private-settings.json
Settings: root, work, node, service='dsh'; optional imageDeps, cron='10 9 * * *'.
"""
import json
import os
from pathlib import Path
import shlex
import shutil
import sys

settings = json.loads(Path(sys.argv[1]).read_text())
repo = Path(__file__).resolve().parents[1]
root, work = Path(settings['root']), Path(settings['work'])
node = Path(settings['node'])
if not root.is_absolute() or not work.is_absolute() or not node.is_absolute():
    raise SystemExit('Use absolute paths')
if any(c in str(p) for p in (root, work, node) for c in ('\n', '\r', '%')):
    raise SystemExit('Unsupported path characters for cron')
if settings.get('service', 'dsh') != 'dsh':
    raise SystemExit('Only the existing dsh service is supported')
manifest = json.loads((root / 'whale-overlay-manifest.json').read_text())
if manifest.get('patch', 0) < 187:
    raise SystemExit('Install the latest overlay first')
schedule = settings.get('cron', '10 9 * * *')
if len(schedule.split()) != 5 or any(c not in '0123456789 */,-' for c in schedule):
    raise SystemExit('Invalid schedule')
cron = Path('/etc/cron.d/whale-surfcore-compatible-update')
if work.exists() or cron.exists():
    raise SystemExit('Existing updater is preserved; review it before changing')
work.mkdir(mode=0o700, parents=True)
dest = work / 'test-repo/integrations/surfcore'
for directory in ('compat', 'tests', 'live-mirror/dsh/agent-presets/qq-chat-v2', 'live-mirror/plugins/surfcore/presets'):
    shutil.copytree(str(repo / 'integrations/surfcore' / directory), str(dest / directory), ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
shutil.copy2(str(repo / 'integrations/surfcore/compatible-update.py'), str(work / 'compatible-update.py'))
shutil.copy2(str(repo / 'integrations/surfcore/compatible-update.py'), str(dest / 'compatible-update.py'))
cfg = dict(settings, root=str(root), work=str(work), node=str(node), service='dsh', testRepo=str(work / 'test-repo'))
cfg.pop('cron', None)
config = work / 'config.json'
config.write_text(json.dumps(cfg, indent=2))
os.chmod(str(config), 0o600)
command = ' '.join(shlex.quote(str(p)) for p in ('/usr/bin/python3', work / 'compatible-update.py', config))
log = shlex.quote(str(work / 'check.log'))
cron.write_text('SHELL=/bin/sh\nPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\n' + schedule + ' root ' + command + ' >> ' + log + ' 2>&1\n')
os.chmod(str(cron), 0o644)
print(json.dumps({'installed': True, 'activated': False, 'modelCalls': 0, 'testSends': 0, 'scheduleTimezone': 'server-local'}))
