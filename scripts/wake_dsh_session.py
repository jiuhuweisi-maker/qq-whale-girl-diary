"""Load the existing QQ DSH session through its authenticated Remote API.

No new session is created. The intentionally unavailable model is rejected
after DSH resolves the target agent, so it wakes the agent without changing
the selected model. This relies on the observed dsh 0.2.1-rc.2 call order.
"""

import http.cookiejar
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


BASE = "http://127.0.0.1:3080"
CONFIG = "/root/.dsh/qq-bridge-config.json"
COOLDOWN = "/opt/qq-cs/.dsh-session-wake-attempt"


def gui_token():
    journal = subprocess.check_output(["journalctl", "-u", "dsh", "--no-pager"])
    matches = re.findall(rb"token=([A-Za-z0-9_-]+)", journal)
    if not matches:
        raise RuntimeError("DSH GUI token missing")
    return matches[-1].decode("ascii")


def probe(token):
    url = BASE + "/dsh-qq-bridge/sess-alive?token=" + urllib.parse.quote(token)
    with urllib.request.urlopen(url, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def main():
    token = gui_token()
    before = probe(token)
    if before.get("ok") and before.get("状") == "alive":
        print("SESSION_ALREADY_ALIVE=True")
        return 0
    if before.get("状") != "dead":
        raise RuntimeError("bridge state is not a dead session")
    if os.path.exists(COOLDOWN) and time.time() - os.path.getmtime(COOLDOWN) < 600:
        print("WAKE_COOLDOWN=True")
        return 1
    with open(COOLDOWN, "w") as marker:
        marker.write(str(int(time.time())) + "\n")

    with open(CONFIG, encoding="utf-8") as source:
        session = json.load(source)["目标会话"]
    if not re.fullmatch(r"session-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", session):
        raise RuntimeError("configured target is not a valid stored session identity")
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    with opener.open(BASE + "/?token=" + urllib.parse.quote(token), timeout=10) as response:
        response.read(128)
    listing = {"type": "client-request", "rpcId": "qq-wake-existing", "method": "session/list", "payload": {"args": {"_request": {}}}}
    request = urllib.request.Request(BASE + "/api/session/list", data=json.dumps(listing).encode("utf-8"), headers={"Content-Type": "application/json"})
    with opener.open(request, timeout=10) as response:
        data = json.load(response)
    def contains(value):
        if isinstance(value, dict):
            return value.get("id", value.get("sessionId")) == session or any(contains(x) for x in value.values())
        return isinstance(value, list) and any(contains(x) for x in value)
    if not contains(data):
        raise RuntimeError("configured target does not exist; refusing implicit creation")
    envelope = {
        "type": "client-request",
        "rpcId": "qq-wake-%d" % int(time.time()),
        "method": "session/selectModel",
        "payload": {"args": {"request": {
            "sessionId": session,
            "provider": "__codex_wake_probe__",
            "model": "__invalid__",
        }}},
    }
    request = urllib.request.Request(
        BASE + "/api/session/selectModel",
        data=json.dumps(envelope).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with opener.open(request, timeout=20) as response:
            result = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        result = error.read().decode("utf-8")
    if "session/model-unavailable" not in result:
        raise RuntimeError("DSH did not reject the intentionally unavailable model")
    for attempt in range(8):
        if probe(token).get("状") == "alive":
            os.unlink(COOLDOWN)
            print("SESSION_WAKE_SUCCESS=True")
            return 0
        time.sleep(1)
    raise RuntimeError("original session still dead after Remote request")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print("SESSION_WAKE_SUCCESS=False")
        print("WAKE_ERROR_TYPE=" + type(error).__name__)
        sys.exit(1)
