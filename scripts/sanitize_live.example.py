# -*- coding: utf-8 -*-
# live 备份脱敏：把 "<真值>" 换成新机上真实值再启用（服务器上原件叫 sanitize_live.py）
import re, sys
MAP = {
  "<服务器IP>": "<服务器IP>",
  "<服务器密码>": "<服务器密码>",
  "<群号>": "<群号>",
  "<她的QQ>": "<她的QQ>",
  "<主人QQ>": "<主人QQ>",
  "<webui-token>": "<webui-token>",
  # …群友号按需补
}
src, dst = sys.argv[1], sys.argv[2]
t = open(src, encoding="utf-8").read()
for k, v in MAP.items():
    t = t.replace(k, v)
# 兜底：9~11 位、以 2/3 开头的裸数字一律视为 QQ 号
t = re.sub(r"(?<![\d.])[23][0-9]{9}(?![\d.])", "<QQ>", t)
open(dst, "w", encoding="utf-8").write(t)
