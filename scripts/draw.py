#!/usr/bin/env python3
# 画一张图: python3 /opt/qq-cs/draw.py "描述" [--size=1024x1024] → 打印保存路径
import sys, os, json, time, re, base64, urllib.request

def get_key():
    k = os.environ.get("DASHSCOPE_API_KEY")
    if k: return k
    try:
        for line in open("/root/.dsh/secrets.env"):
            if line.startswith("DASHSCOPE_API_KEY="):
                return line.strip().split("=", 1)[1]
    except Exception:
        pass
    sys.exit("没有 DASHSCOPE_API_KEY")

args = sys.argv[1:]
size = "1024x1024"
words = []
for a in args:
    m = re.match(r"^--size=(\d{3,4}x\d{3,4})$", a)
    if m: size = m.group(1)
    else: words.append(a)
prompt = " ".join(words).strip() or "a cute cartoon blue whale"
STYLE = ("风格", "卡通", "写实", "动漫", "贴纸", "水彩", "油画", "像素", "手绘", "style", "3D", "3d")
if not any(w in prompt for w in STYLE):
    prompt = "可爱卡通贴纸风格，线条干净，色彩明快，Q版造型，搞笑夸张，白色背景，非写实非真人：" + prompt

body = json.dumps({"model": "qwen-image-2.1-pro", "prompt": prompt, "size": size, "n": 1}).encode()
req = urllib.request.Request(
    "https://maas.qianwenaiapi.com/compatible-mode/v1/images/generations",
    data=body, headers={"Authorization": "Bearer " + get_key(), "Content-Type": "application/json"})
try:
    r = json.load(urllib.request.urlopen(req, timeout=240))
except Exception as e:
    sys.exit("画图失败: %s" % e)
d = (r.get("data") or [{}])[0]
outdir = "/root/dsh-workspace/stickers/gen"
os.makedirs(outdir, exist_ok=True)
path = os.path.join(outdir, time.strftime("%m%d-%H%M%S") + ".png")
if d.get("b64_json"):
    open(path, "wb").write(base64.b64decode(d["b64_json"]))
elif d.get("url"):
    urllib.request.urlretrieve(d["url"], path)
else:
    sys.exit("响应里没有图: %s" % json.dumps(r)[:200])
print(path)