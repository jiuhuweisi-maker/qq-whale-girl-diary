"""Rotate SnowLuma's OneBot HTTP token without restarting its container.

Run on the server as root. Read the WebUI password from stdin. This script
prints status only; it writes the new token to a root-only recovery file so
the off-server secrets inventory can be updated after live verification.
"""

import copy
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request


CONFIG_DIR = "/var/lib/docker/volumes/snowluma-data/_data/config"
RELAY = "/opt/qq-cs/relay3000.py"
RECOVERY = "/root/.dsh/.onebot-ticket-recovery"
BASE = "http://127.0.0.1:5099"


def request(path, payload=None, bearer=None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if bearer:
        headers["Authorization"] = "Bearer " + bearer
    req = urllib.request.Request(BASE + path, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def onebot(port, ticket=None):
    headers = {} if ticket is None else {"Authorization": "Bearer " + ticket}
    req = urllib.request.Request("http://127.0.0.1:%d/get_login_info" % port, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            body = json.loads(response.read().decode("utf-8"))
            return response.status, body.get("retcode")
    except urllib.error.HTTPError as error:
        return error.code, None


def wait_onebot(port, ticket=None):
    for attempt in range(12):
        try:
            return onebot(port, ticket)
        except urllib.error.URLError:
            if attempt == 11:
                raise
            time.sleep(1)


def replace_tokens(config, old, new):
    count = 0
    for item in config["networks"]["httpServers"]:
        if item.get("accessToken") != old:
            raise RuntimeError("unexpected HTTP token in config")
        item["accessToken"] = new
        count += 1
    if not count:
        raise RuntimeError("no HTTP servers in config")
    return count


def atomic_bytes(path, data, mode):
    temporary = path + ".codex-tmp"
    with open(temporary, "wb") as output:
        output.write(data)
        output.flush()
        os.fsync(output.fileno())
    os.chmod(temporary, mode)
    os.replace(temporary, path)


def main():
    password = sys.stdin.readline().strip()
    if not password:
        raise RuntimeError("WebUI password missing")
    account_names = [name for name in os.listdir(CONFIG_DIR)
                     if re.match(r"^onebot_[0-9]+\.json$", name)]
    if len(account_names) != 1:
        raise RuntimeError("expected exactly one account config")
    account_name = account_names[0]
    uin = account_name[len("onebot_"):-len(".json")]
    account_path = os.path.join(CONFIG_DIR, account_name)
    global_path = os.path.join(CONFIG_DIR, "onebot.json")
    with open(account_path, "rb") as source:
        account_bytes = source.read()
    with open(global_path, "rb") as source:
        global_bytes = source.read()
    with open(RELAY, "rb") as source:
        relay_bytes = source.read()
    account = json.loads(account_bytes.decode("utf-8"))
    global_config = json.loads(global_bytes.decode("utf-8"))
    old = account["networks"]["httpServers"][0]["accessToken"]
    if not old or any(item.get("accessToken") != old for item in global_config["networks"]["httpServers"]):
        raise RuntimeError("current account/global HTTP tokens disagree")
    relay_pattern = ("TOK = " + json.dumps(old)).encode("utf-8")
    if relay_bytes.count(relay_pattern) != 1:
        raise RuntimeError("relay token assignment differs from config")

    login = request("/api/login", {"password": password})
    if not login.get("success") or not login.get("token"):
        raise RuntimeError("WebUI login failed")
    bearer = login["token"]
    remote_config = request("/api/config/" + uin, bearer=bearer)["config"]
    # The API omits the legacy top-level `mode` field present on disk.
    if remote_config != {key: value for key, value in account.items() if key != "mode"}:
        raise RuntimeError("WebUI account config differs from disk")

    new = "v1_" + secrets.token_urlsafe(36)
    next_account = copy.deepcopy(account)
    next_global = copy.deepcopy(global_config)
    replace_tokens(next_account, old, new)
    replace_tokens(next_global, old, new)
    suffix = ".bak-rotate-" + time.strftime("%Y%m%d%H%M%S")
    for path in (account_path, global_path, RELAY):
        shutil.copy2(path, path + suffix)
    atomic_bytes(RECOVERY, (new + "\n").encode("ascii"), 0o600)

    account_write_attempted = False
    global_changed = False
    relay_changed = False
    try:
        account_write_attempted = True
        result = request("/api/config/" + uin, next_account, bearer)
        if not (result.get("success") and result.get("saved") and result.get("applied") and result.get("online")):
            raise RuntimeError("account config was not hot-applied")
        atomic_bytes(global_path, json.dumps(next_global, ensure_ascii=False, indent=2).encode("utf-8") + b"\n", os.stat(global_path).st_mode & 0o777)
        global_changed = True
        atomic_bytes(RELAY, relay_bytes.replace(relay_pattern, ("TOK = " + json.dumps(new)).encode("ascii")), os.stat(RELAY).st_mode & 0o777)
        relay_changed = True
        subprocess.check_call(["systemctl", "restart", "whale-relay"], timeout=30)
        if subprocess.check_output(["systemctl", "is-active", "whale-relay"], timeout=10).strip() != b"active":
            raise RuntimeError("relay inactive")
        new_code, new_retcode = onebot(3002, new)
        old_code, _ = onebot(3002, old)
        relay_code, relay_retcode = wait_onebot(3000)
        if (new_code, new_retcode) != (200, 0) or (relay_code, relay_retcode) != (200, 0) or old_code not in (401, 403):
            raise RuntimeError("post-rotation OneBot probe failed")
        print("ROTATED=True")
        print("SNOWLUMA_HOT_APPLIED=True")
        print("RELAY_ACTIVE=True")
        print("NEW_DIRECT_RETCODE=0")
        print("OLD_DIRECT_REJECTED=True")
        print("RELAY_RETCODE=0")
    except Exception:
        if account_write_attempted:
            try:
                request("/api/config/" + uin, account, bearer)
            except Exception:
                pass
        if global_changed:
            atomic_bytes(global_path, global_bytes, os.stat(global_path).st_mode & 0o777)
        if relay_changed:
            atomic_bytes(RELAY, relay_bytes, os.stat(RELAY).st_mode & 0o777)
            subprocess.call(["systemctl", "restart", "whale-relay"], timeout=30)
        print("ROTATED=False")
        raise


if __name__ == "__main__":
    main()
