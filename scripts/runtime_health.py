# -*- coding: utf-8 -*-
"""Read-only backend-aware health probe. Never logs credentials or restarts QQ."""
import json
import os
import sys
import hashlib
import time
import urllib.parse
import urllib.request

def backend():
    with open(os.environ.get('WHALE_CONFIG','/root/.dsh/qq-bridge-config.json'),encoding='utf-8') as stream:
        value=json.load(stream).get('聊天后端','legacy')
    if value not in ('surfcore','legacy'): raise ValueError('unknown backend')
    return value

def probe(root=None):
    root=root or os.environ.get('SURFCORE_ROOT','/opt/whale-surfcore/staging-c174ed0')
    with open(os.path.join(root,'config.json'),encoding='utf-8') as stream: cfg=json.load(stream)
    base=os.environ.get('SURFCORE_CONSOLE_BASE','http://127.0.0.1:13100').rstrip('/')
    if urllib.parse.urlsplit(base).hostname not in ('127.0.0.1','localhost','::1'): raise ValueError('console must be loopback')
    def get(route):
        req=urllib.request.Request(base+route,headers={'X-Console-Token':cfg['consoleToken']})
        with urllib.request.urlopen(req,timeout=8) as response: return json.loads(response.read().decode('utf-8'))
    status,safety=get('/api/status'),get('/api/whale-status')
    onebot=status.get('snowluma') or {}
    fields={'dshReady':status.get('dshReady') is True,'qqOnline':onebot.get('accountOnline') is True,
            'wsConnected':onebot.get('connected') is True,'deliveryHealthy':safety.get('healthy') is True,
            'deliveryReady':safety.get('ready') is True,'uncertain':int(safety.get('uncertain') or 0)}
    fields['ok']=all(fields[k] for k in ['dshReady','qqOnline','wsConnected','deliveryHealthy','deliveryReady'])
    return fields

def notify_if_persistent(result):
    root=os.environ.get('WHALE_OPS_DIR','/opt/qq-cs');file=os.path.join(root,'.watchdog-health.json')
    try:
        with open(file) as stream: state=json.load(stream)
    except (IOError,ValueError): state={}
    now=time.time();state['failures']=0 if result.get('ok') else int(state.get('failures') or 0)+1
    send=state['failures']>=2 and now-float(state.get('lastAlert') or 0)>3600
    if send: state['lastAlert']=now
    temp=file+'.tmp'
    with open(temp,'w') as stream: json.dump(state,stream);stream.flush();os.fsync(stream.fileno())
    os.replace(temp,file)
    if not send: return
    with open(os.environ.get('WHALE_CONFIG','/root/.dsh/qq-bridge-config.json'),encoding='utf-8') as stream: cfg=json.load(stream)
    owner=int(cfg['私聊QQ']);key=hashlib.sha256(('health:'+str(int(now//3600))+':'+str(owner)).encode()).hexdigest()
    message='【系统巡检】SurfCore连续两次未就绪，需要检查服务或鉴权；没有把它当作QQ掉线，也没有重登QQ。'
    req=urllib.request.Request('http://127.0.0.1:3000/send_private_msg',data=json.dumps({'user_id':owner,'message':message}).encode(),
                               headers={'Content-Type':'application/json','X-Whale-Origin':'watchdog','X-Whale-Delivery-Id':key})
    # Reserve alert cooldown before the side effect; a lost receipt is not retried.
    with urllib.request.urlopen(req,timeout=12) as response: response.read()

def main():
    try:
        if '--backend' in sys.argv:
            print(backend());return 0
        result=probe()
        if '--notify' in sys.argv: notify_if_persistent(result)
        print(json.dumps(result,sort_keys=True));return 0 if result['ok'] else 2
    except Exception as exc:
        failure={'ok':False,'reason':'auth_unavailable' if getattr(exc,'code',None) in (401,403) else 'probe_unavailable'}
        if '--notify' in sys.argv:
            try: notify_if_persistent(failure)
            except Exception: failure['alert']='unconfirmed_no_retry'
        print(json.dumps(failure));return 3

if __name__=='__main__': sys.exit(main())
