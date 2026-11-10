#!/usr/bin/env python3
# caption.py: 给 whale 库全部表情包打语义标题 -> INDEX.tsv（可断点续跑）
import os, json, base64, urllib.request, threading, time
DIR = "/root/dsh-workspace/stickers/whale"
OUT = os.path.join(DIR, "INDEX.tsv")
key = None
for line in open("/root/.dsh/secrets.env"):
    if line.startswith("DASHSCOPE_API_KEY="): key = line.strip().split("=", 1)[1]
exts = (".webp", ".jpg", ".jpeg", ".png")
mime = {".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}
files = sorted(f for f in os.listdir(DIR) if f.lower().endswith(exts))
done = {}
if os.path.exists(OUT):
    for l in open(OUT, encoding="utf-8"):
        if "\t" in l:
            fn, t = l.strip().split("\t", 1)
            if t: done[fn] = t
todo = [f for f in files if f not in done]
print("total=%d done=%d todo=%d" % (len(files), len(done), len(todo)), flush=True)
lock = threading.Lock()
def cap(fn):
    ext = os.path.splitext(fn)[1].lower()
    try:
        img = base64.b64encode(open(os.path.join(DIR, fn), "rb").read()).decode()
    except Exception:
        return ""
    body = json.dumps({"model": "qwen3-vl-plus", "messages": [{"role": "user", "content": [
        {"type": "image_url", "image_url": {"url": "data:%s;base64,%s" % (mime.get(ext, "image/jpeg"), img)}},
        {"type": "text", "text": "给这个表情包写索引标题：不超过10个字，格式=画面主体+情绪/用途（例：震惊尖叫 / 躺平摆烂 / 可爱卖萌 / 打招呼嗨）。只输出标题，不要标点。"}]}], "max_tokens": 40}).encode()
    for a in range(3):
        try:
            req = urllib.request.Request("https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions",
                data=body, headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
            r = json.load(urllib.request.urlopen(req, timeout=60))
            t = r["choices"][0]["message"]["content"].strip().replace("\t", " ").replace("\n", " ")[:20]
            if t: return t
        except Exception:
            time.sleep(2 + a * 4)
    return ""
def save():
    with open(OUT, "w", encoding="utf-8") as f:
        for k in sorted(done):
            if done[k]: f.write(k + "\t" + done[k] + "\n")
def worker():
    while True:
        with lock:
            if not todo: break
            fn = todo.pop(0)
        t = cap(fn)
        with lock:
            if t: done[fn] = t
            if len(done) % 10 == 0: save()
    with lock: save()
ths = [threading.Thread(target=worker) for _ in range(3)]
for t in ths: t.start()
for t in ths: t.join()
print("DONE titled=%d/%d" % (len([1 for v in done.values() if v]), len(files)), flush=True)