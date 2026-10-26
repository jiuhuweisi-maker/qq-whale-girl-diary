"""Execute the production Python jobs against virtual time, virtual files and local HTTP fixtures."""
import builtins,collections,datetime as realdt,hashlib,io,json,pathlib,random as realrandom,sys,types,urllib.request as realurl
def run(source_dir,days=28,traffic='busy'):
    root=pathlib.Path(source_dir); plans=json.loads((root/'cron.json').read_text(encoding='utf-8')); plans=[p for p in plans if p['script'].endswith('.py')]
    sources={p['script']:(root/p['script']).read_text(encoding='utf-8') for p in plans};codes={n:compile(s,n,'exec') for n,s in sources.items()}
    now=[realdt.datetime(2026,10,26)];disk={'/root/.dsh/qq-bridge-config.json':json.dumps({'群号':'7001','她的QQ':1004,'私聊QQ':'1001'})};events=[];denied=[];rng=realrandom.Random(342)
    class SimDate(realdt.datetime):
        @classmethod
        def now(cls,tz=None):return cls.fromisoformat(now[0].isoformat())
        def timestamp(self):return (self-realdt.datetime(1970,1,1)).total_seconds()-8*3600
    datemod=types.ModuleType('datetime');datemod.datetime=SimDate;datemod.timedelta=realdt.timedelta
    randmod=types.ModuleType('random')
    for name in ('random','choice','randint'):setattr(randmod,name,getattr(rng,name))
    randmod.Random=realrandom.Random
    timemod=types.ModuleType('time');timemod.sleep=lambda seconds:now.__setitem__(0,now[0]+realdt.timedelta(seconds=seconds))
    class VirtualFile(io.StringIO):
        def __init__(self,name,mode):
            self.name=name;self.mode=mode
            if name not in disk and mode.startswith('r'):raise FileNotFoundError(name)
            super().__init__('' if mode.startswith('w') else disk.get(name,''))
            if mode.startswith('a'):self.seek(0,2)
        def write(self,text):
            n=super().write(text);disk[self.name]=self.getvalue()[-65536:];return n
        def close(self):
            if not self.closed and not self.mode.startswith('r'):disk[self.name]=self.getvalue()[-65536:]
            super().close()
    def vopen(name,mode='r',*a,**kw):return VirtualFile(str(name),mode)
    def check_output(args,*a,**kw):
        if args[:3]==['journalctl','-u','dsh']:return b'token=offline-auth'
        denied.append({'command':args});raise RuntimeError('offline subprocess denied')
    submod=types.ModuleType('subprocess');submod.check_output=check_output
    current_script=['']
    def urlopen(req,timeout=None):
        u=req.full_url if hasattr(req,'full_url') else str(req)
        if 'get_group_msg_history' in u or 'get_friend_msg_history' in u:
            ago=1800 if traffic=='quiet' else 60
            payload={'data':{'messages':[{'time':int(SimDate.now().timestamp())-ago,'sender':{'user_id':1002,'nickname':'虚拟群友'},'message':[{'type':'text','data':{'text':'虚拟旧话题'}}]}]}}
        elif u.startswith('http://127.0.0.1:3080/dsh-qq-bridge/nudge'):
            b=json.loads(req.data);events.append({'at':now[0].isoformat(),'script':current_script[0],'channel':b.get('channel','group'),'text':b.get('text','')});payload={'ok':True}
        else:denied.append({'url':u});raise RuntimeError('offline network denied')
        return io.BytesIO(json.dumps(payload).encode())
    urlmod=types.ModuleType('urllib.request');urlmod.Request=realurl.Request;urlmod.urlopen=urlopen
    urllibmod=types.ModuleType('urllib');urllibmod.request=urlmod
    sysmod=types.ModuleType('sys');sysmod.argv=[]
    modules={'random':randmod,'datetime':datemod,'time':timemod,'subprocess':submod,'urllib':urllibmod,'urllib.request':urlmod,'json':json,'re':__import__('re'),'sys':sysmod,'_strptime':__import__('_strptime')}
    def import_hook(name,globals=None,locals=None,fromlist=(),level=0):
        if name not in modules:denied.append({'import':name});raise RuntimeError('offline import denied:'+name)
        return modules[name] if fromlist or '.' not in name else modules[name.split('.')[0]]
    safe=dict(vars(builtins));safe.update({'open':vopen,'__import__':import_hook})
    def field(value,n,lo,hi):
        for term in value.split(','):
            main,_,step=term.partition('/');step=int(step or 1)
            if main=='*':start,end=lo,hi
            elif '-' in main:start,end=map(int,main.split('-'))
            else:start=end=int(main)
            if start<=n<=end and (n-start)%step==0:return True
        return False
    def due(schedule,t):return all(field(v,n,*bounds) for v,n,bounds in zip(schedule,[t.minute,t.hour,t.day,t.month,(t.weekday()+1)%7],[(0,59),(0,23),(1,31),(1,12),(0,6)]))
    start=now[0];errors=[]
    for minute in range(days*1440):
        tick=start+realdt.timedelta(minutes=minute);now[0]=tick
        disk['/opt/qq-cs/late_flag.txt']=(tick-realdt.timedelta(days=1)).strftime('%Y-%m-%d')+' 02:11'
        for plan in plans:
            if not due(plan['schedule'],tick):continue
            current_script[0]=plan['script'];sysmod.argv=[plan['script']]+([plan['mode']] if plan.get('mode') else [])
            try:exec(codes[plan['script']],{'__builtins__':safe,'__name__':'__main__'})
            except SystemExit:pass
            except Exception as e:errors.append({'script':plan['script'],'at':tick.isoformat(),'error':type(e).__name__+':'+str(e)})
    minutes=collections.Counter(realdt.datetime.fromisoformat(e['at']).minute for e in events if e['channel']=='group')
    hours=collections.Counter(realdt.datetime.fromisoformat(e['at']).hour for e in events if e['channel']=='group')
    dnd=[e for e in events if e['channel']=='group' and (realdt.datetime.fromisoformat(e['at']).hour<10 or realdt.datetime.fromisoformat(e['at']).hour>21)]
    return {'days':days,'traffic':traffic,'sourceSHA256':{n:hashlib.sha256(s.encode()).hexdigest() for n,s in sources.items()},'cron':plans,'events':events,'errors':errors,'blockedSideEffects':denied,'groupMinuteHistogram':dict(minutes),'groupHourHistogram':dict(hours),'groupMinuteMaxShare':max(minutes.values())/sum(minutes.values()) if minutes else None,'dndViolations':dnd,'realSleepSeconds':0,'noRealNetwork':True,'productionWrites':False,'passed':not errors and not denied and not dnd and len(minutes)>5,'limits':['Injected prompts are measured, not model reply times','Cron window concentration by hour is reported; jitter cannot remove deliberately configured daytime windows']}
if __name__=='__main__':
    result={'busy':run(sys.argv[1],int(sys.argv[3]) if len(sys.argv)>3 else 28,'busy'),'quiet':run(sys.argv[1],int(sys.argv[3]) if len(sys.argv)>3 else 28,'quiet')}
    pathlib.Path(sys.argv[2]).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:{'passed':v['passed'],'events':len(v['events']),'errors':v['errors'][:3],'dndViolations':len(v['dndViolations']),'distinctMinutes':len(v['groupMinuteHistogram']),'minuteMaxShare':v['groupMinuteMaxShare']} for k,v in result.items()},ensure_ascii=False))
