# -*- coding: utf-8 -*-
"""Crash-safe legacy group archive. Original monthly JSONL files stay in place."""
import json
import os
import time
import urllib.request

def request(base,payload):
    req=urllib.request.Request(base.rstrip('/')+'/get_group_msg_history',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=12) as response: return json.loads(response.read().decode('utf-8'))

def collect_since(base,gid,water,fetch=request,max_pages=20):
    rows=[];seen=set();cursor=None
    for _ in range(max_pages if water else 1):
        payload={'group_id':int(gid),'count':200}
        if cursor is not None: payload['message_id']=cursor
        result=fetch(base,payload)
        if result.get('retcode')!=0: return rows,False
        page=(result.get('data') or {}).get('messages') or []
        if not page: return rows,True
        fresh=[]
        for row in page:
            mid=str(row.get('message_id') or '')
            if not mid or mid in seen: continue
            seen.add(mid);fresh.append(row)
            if int(row.get('time') or 0)>=water: rows.append(row)
        oldest=min(page,key=lambda m:int(m.get('time') or 0))
        if not water or int(oldest.get('time') or 0)<water: return rows,True
        if not fresh: return rows,False
        cursor=oldest['message_id']
    return rows,False

def archive_rows(directory,gid,rows):
    os.makedirs(directory,mode=0o700,exist_ok=True)
    months={time.strftime('%Y-%m',time.localtime(int(m.get('time') or 0))) for m in rows}
    existing=set()
    for month in months:
        try:
            with open(os.path.join(directory,month+'.jsonl'),encoding='utf-8') as stream:
                for line in stream:
                    if not line.strip(): continue
                    record=json.loads(line)
                    existing.add((str(record.get('group_id') or gid),str(record['mid'])))
        except FileNotFoundError: pass
        # A corrupt existing archive is not silently rewritten or discarded.
    added=0
    for row in sorted(rows,key=lambda m:(int(m.get('time') or 0),str(m.get('message_id')))):
        mid=str(row.get('message_id') or '')
        if not mid or (str(gid),mid) in existing: continue
        parts=row.get('message') or [];text='';images=0
        if isinstance(parts,str): text=parts
        else:
            for item in parts:
                if not isinstance(item,dict): continue
                data=item.get('data') or {};kind=item.get('type')
                if kind=='text': text+=str(data.get('text') or '')
                elif kind=='at': text+='@'+str(data.get('name') or data.get('qq') or '')+' '
                elif kind in ('image','mface','face'): images+=1
        text=text.strip().replace('\n',' ')[:300]
        if not text and not images: continue
        at=int(row.get('time') or 0);sender=row.get('sender') or {}
        record={'mid':mid,'t':at,'uid':row.get('user_id') or sender.get('user_id'),'nick':sender.get('card') or sender.get('nickname') or '',
                'text':text,'group_id':str(gid)}
        if images: record['imgs']=images
        month=time.strftime('%Y-%m',time.localtime(at));file=os.path.join(directory,month+'.jsonl')
        fd=os.open(file,os.O_WRONLY|os.O_CREAT|os.O_APPEND,0o600)
        try:
            os.write(fd,(json.dumps(record,ensure_ascii=False)+'\n').encode('utf-8'));os.fsync(fd)
        finally: os.close(fd)
        existing.add((str(gid),mid));added+=1
    return added

def main():
    import fcntl
    root=os.environ.get('WHALE_OPS_DIR','/opt/qq-cs');lock=open(os.path.join(root,'.memory_store.lock'),'a')
    try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except IOError: print('archive already running');return 0
    with open(os.environ.get('WHALE_CONFIG','/root/.dsh/qq-bridge-config.json'),encoding='utf-8') as stream: cfg=json.load(stream)
    base=cfg['NapCat'];base=base if isinstance(base,str) else base['base'];gid=cfg['群号'];water_file=os.path.join(root,'.mem_water.txt')
    try:
        with open(water_file) as stream: water=int(stream.read().strip())
    except FileNotFoundError: water=0
    rows,complete=collect_since(base,gid,water)
    added=archive_rows(os.path.join(root,'memory'),gid,rows)
    if complete and rows:
        value=max([water]+[int(m.get('time') or 0) for m in rows]);temp=water_file+'.tmp'
        with open(temp,'w') as stream: stream.write(str(value));stream.flush();os.fsync(stream.fileno())
        os.replace(temp,water_file)
    print(json.dumps({'added':added,'complete':complete,'checkpointAdvanced':bool(complete and rows)}));return 0 if complete else 1

if __name__=='__main__':
    try: raise SystemExit(main())
    except Exception:
        print('archive unavailable; checkpoint preserved');raise SystemExit(1)
