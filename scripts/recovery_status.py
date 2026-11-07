# -*- coding: utf-8 -*-
"""Read-only post-reboot / incident triage for the SurfCore QQ bridge.

Safe by construction: this script NEVER restarts a service, writes a file,
sends a message, or prints a credential. The console token is read from the
local config.json and used only as an in-memory request header.

Usage (on the server):
    python3 recovery_status.py
    python3 recovery_status.py --watch 3 --interval 20

A single green sample is not recovery: on a memory-starved host the bridge
flaps between ready and unavailable. Always use --watch 3 and require three
consecutive `healthy` verdicts. Exit code 0 = stable, 2 = not stable yet.
See docs/RECOVERY-RUNBOOK-2026-11-07.md.

Python 3.6 compatible (no walrus, no capture_output).
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

ROOT = os.environ.get('WHALE_SURFCORE_ROOT', '/opt/whale-surfcore/staging-c174ed0')
OPS = os.environ.get('WHALE_OPS_DIR', '/opt/qq-cs')
SERVICES = ('dsh', 'whale-relay', 'whale-ws', 'docker')


def sh(cmd, timeout=10):
    try:
        proc = subprocess.run(['bash', '-lc', cmd], stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, universal_newlines=True,
                              timeout=timeout)
        return (proc.stdout or '').strip()
    except Exception as exc:
        return 'ERR:' + type(exc).__name__


def scrub(text):
    """Drop any long numeric run so log excerpts never carry account ids."""
    text = re.sub(r'[?&]token=[A-Za-z0-9_.\-]+', '?<redacted>', text)
    text = re.sub(r'sk-[A-Za-z0-9_-]{12,}', 'sk-<redacted>', text)
    text = re.sub(r'\b\d{5,}\b', '<id>', text)
    return text[:260]


def meminfo():
    values = {}
    try:
        with open('/proc/meminfo') as stream:
            for line in stream:
                key, _, rest = line.partition(':')
                parts = rest.split()
                if parts and parts[0].isdigit():
                    values[key] = int(parts[0]) // 1024  # kB -> MB
    except IOError:
        pass
    total = values.get('SwapTotal', 0)
    return {
        'availableMB': values.get('MemAvailable'),
        'anonPagesMB': values.get('AnonPages'),
        'swapTotalMB': total,
        'swapUsedMB': total - values.get('SwapFree', total) if total else 0,
        'free': sh('free -m | head -3'),
    }


def uptime_seconds():
    try:
        with open('/proc/uptime') as stream:
            return float(stream.read().split()[0])
    except (IOError, ValueError, IndexError):
        return -1


def console():
    """Status only. The console token never leaves this function."""
    try:
        with open(os.path.join(ROOT, 'config.json'), encoding='utf-8') as stream:
            cfg = json.load(stream)
        base = 'http://127.0.0.1:' + str(cfg.get('consolePort', 13100))
        headers = {'X-Console-Token': cfg['consoleToken']}

        def get(route):
            request = urllib.request.Request(base + route, headers=headers)
            with urllib.request.urlopen(request, timeout=8) as response:
                return json.loads(response.read().decode('utf-8'))

        status = get('/api/status')
        safety = get('/api/whale-status')
        snowluma = status.get('snowluma') or {}
        fields = {
            'dshReady': status.get('dshReady') is True,
            'qqOnline': snowluma.get('accountOnline') is True,
            'wsConnected': snowluma.get('connected') is True,
            'deliveryHealthy': safety.get('healthy') is True,
            'deliveryReady': safety.get('ready') is True,
            'pending': int(safety.get('pendingIncoming') or 0),
        }
        fields['ok'] = all(fields[key] for key in (
            'dshReady', 'qqOnline', 'wsConnected', 'deliveryHealthy', 'deliveryReady'))
        return fields
    except Exception as exc:
        return {'ok': False, 'err': type(exc).__name__}


def probe():
    path = os.path.join(OPS, 'runtime_health.py')
    if not os.path.exists(path):
        return {'available': False}
    try:
        proc = subprocess.run(['python3', path], stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, universal_newlines=True,
                              timeout=18)
        text = (proc.stdout or '').strip().splitlines()
        payload = json.loads(text[0]) if text else {}
        return {'available': True, 'exitCode': proc.returncode, 'fields': payload}
    except Exception as exc:
        return {'available': True, 'err': type(exc).__name__}


def dsh_process():
    # Bracket trick: pgrep -f would otherwise match the bash -lc wrapper itself.
    pids = sh("pgrep -f '[d]sh web' | head -1")
    if not pids or pids.startswith('ERR:') or not pids.split()[0].isdigit():
        return {'running': False}
    pid = pids.split()[0]
    detail = {}
    try:
        with open('/proc/' + pid + '/status') as stream:
            for line in stream:
                if line.startswith(('State:', 'VmRSS:', 'VmSwap:')):
                    key, _, value = line.partition(':')
                    detail[key] = value.strip()
    except IOError:
        pass
    return {'running': True, 'stat': detail.get('State'),
            'vmRss': detail.get('VmRSS'), 'vmSwap': detail.get('VmSwap'),
            'inDiskWait': detail.get('State', '').startswith('D')}


def onebot():
    try:
        payload = json.dumps({}).encode('utf-8')
        request = urllib.request.Request('http://127.0.0.1:3000/get_login_info',
                                         data=payload,
                                         headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=5) as response:
            body = json.loads(response.read().decode('utf-8'))
            return {'retcode': body.get('retcode'), 'reachable': True}
    except Exception as exc:
        return {'reachable': False, 'err': type(exc).__name__}


def logs():
    result = {}
    bridge = os.path.join(ROOT, 'state', 'bridge.log')
    activity = os.path.join(ROOT, 'state', 'qq-activity.log')
    result['bridgeTail'] = [scrub(line) for line in sh(
        'tail -n 12 ' + bridge).splitlines()[-12:]]
    result['recentSends'] = [scrub(line) for line in sh(
        "grep -aE '补唤醒|status:sent|工具统一发送|迟到回复' " + activity +
        ' | tail -8').splitlines()]
    return result


def verdict(snapshot):
    uptime = snapshot['uptimeSeconds']
    health = snapshot['console']
    services = snapshot['services']
    mem = snapshot['memory']
    dsh = snapshot['dsh']
    ports = snapshot['ports']

    if uptime >= 0 and uptime < 90:
        return 'booting', '刚开机，先确认 systemd 与容器，不要做任何抢救动作。'
    if any(services.get(name) != 'active' for name in SERVICES):
        return 'degraded', '有基础服务未 active，先查 systemctl，别动 QQ。'
    if not ports['dshListening']:
        if dsh.get('inDiskWait'):
            return 'waiting_dsh', 'DSH 卡在磁盘等待且未绑 3080，等冷启动读盘；此时重启 dsh 只会重新排队。'
        return 'waiting_dsh', '3080 未监听，先看 DSH 启动日志，不要反复重启。'
    if not snapshot['bridge']['running']:
        return 'waiting_bridge', '桥未运行；插件 autoStartBridge 加载即执行并每 120 秒兜底，等一个周期，不要手工拉第二个桥。'
    if health.get('err'):
        return 'degraded', '控制台接口不可达，先确认桥进程与 consolePort；这不能当成 QQ 掉线，更不要重登。'
    if not health.get('qqOnline') or not health.get('wsConnected'):
        if uptime < 900:
            return 'waiting_qq', 'QQ 冷启动通常需要约 6 分钟；3000 返回 502 / WS 1006 属正常，不要扫码、不要重启容器。'
        return 'check_login', '开机超过 15 分钟仍无 QQ/WS，查容器日志是否有 login identity；只有明确要求扫码才需主人本人操作。'
    if health.get('ok') and health.get('pending') == 0:
        return 'healthy', '全绿。仍需连续三次 healthy 才算稳定。'
    if (mem.get('availableMB') is not None and mem['availableMB'] < 200
            and mem.get('swapUsedMB', 0) > 500):
        return 'memory_pressure', '内存死局：drop_caches 无效、重启 dsh 治标不治本，按手册做备份后整机重启。'
    if not health.get('dshReady'):
        return 'upstream_suspect', 'DSH 未就绪但其余链路在，查官方上游状态页与 DSH 超时日志，先区分本地与上游。'
    if health.get('pending', 0) > 0:
        return 'upstream_suspect', '有积压未读但没发出，查会话创建超时与上游状态；护栏会拒绝降级，不要手工重发。'
    return 'degraded', '未满足全绿条件，按手册 §6 分级排查。'


def snapshot():
    services = {}
    for name in SERVICES:
        services[name] = sh('systemctl is-active ' + name + ' 2>/dev/null') or 'unknown'
    bridge_pids = sh("pgrep -f '[s]rc/bridge.js' | head -3").split()
    data = {
        'at': sh('date "+%F %T"'),
        'boot': sh('uptime -s'),
        'uptimeSeconds': uptime_seconds(),
        'services': services,
        'container': sh("docker ps --format '{{.Names}} {{.Status}}' | head -5", 12),
        'bridge': {'running': bool(bridge_pids), 'pidCount': len(bridge_pids)},
        'dsh': dsh_process(),
        'ports': {
            'dshListening': bool(sh("ss -ltn 2>/dev/null | grep ':3080'")),
            'dshConnections': sh("ss -tn 2>/dev/null | grep ':3080' | wc -l"),
            'onebot': onebot(),
        },
        'memory': meminfo(),
        'console': console(),
        'probe': probe(),
        'git': {
            'changedCount': sh('git -C ' + ROOT + ' status --porcelain=v1 -uall | wc -l'),
            'head': sh('git -C ' + ROOT + ' rev-parse --short HEAD'),
        },
        'logs': logs(),
    }
    state, hint = verdict(data)
    data['verdict'] = state
    data['hint'] = hint
    return data


def main():
    parser = argparse.ArgumentParser(description='Read-only SurfCore recovery triage')
    parser.add_argument('--watch', type=int, default=1,
                        help='number of samples (3 recommended)')
    parser.add_argument('--interval', type=int, default=20,
                        help='seconds between samples')
    parser.add_argument('--brief', action='store_true',
                        help='omit raw log excerpts')
    args = parser.parse_args()
    samples = []
    for index in range(max(1, args.watch)):
        item = snapshot()
        if args.brief:
            item.pop('logs', None)
        samples.append(item)
        if index + 1 < max(1, args.watch):
            time.sleep(max(1, args.interval))
    stable = len(samples) >= 3 and all(
        item['verdict'] == 'healthy' for item in samples[-3:])
    if len(samples) == 1:
        output = samples[0]
        output['stable'] = stable
    else:
        output = {'samples': samples, 'stable': stable,
                  'note': 'stable=true requires three consecutive healthy samples'}
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0 if stable or (len(samples) == 1 and samples[0]['verdict'] == 'healthy') else 2


if __name__ == '__main__':
    sys.exit(main())
