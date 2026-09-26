"""AI Usage Bar Local 1.0.0. Derived from liamlai88/ai-usage-bar (MIT).
Read-only Codex usage; credentials remain in memory, sent only to the fixed HTTPS origin.
"""
import json
import math
import os
from pathlib import Path
import ssl
import stat
import time
import urllib.error
import urllib.request
from datetime import datetime

URL = "https://chatgpt.com/backend-api/wham/usage"
RESET_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def reset_details(data):
    passes = []
    for item in (data.get('credits') or [])[:100]:
        if not isinstance(item, dict) or item.get('status') != 'available':
            continue
        try:
            expiry = datetime.fromisoformat(item['expires_at'].replace('Z', '+00:00')).timestamp()
        except (KeyError, ValueError, TypeError, AttributeError):
            expiry = None
        if expiry is None or expiry > time.time():
            passes.append({'expires_at': expiry})
    return sorted(passes, key=lambda p: p['expires_at'] or float('inf'))


def normalize(data):
    """Allowlist display fields. Never persist raw responses, identities, or tokens."""
    if not isinstance(data, dict):
        raise ValueError("invalid response")
    rows = []

    def add(label, limit):
        if not isinstance(limit, dict):
            return
        for key in ("primary_window", "secondary_window"):
            window = limit.get(key)
            if not isinstance(window, dict):
                continue
            pct = window.get("used_percent")
            duration = window.get("limit_window_seconds")
            reset = window.get("reset_at")
            if not number(pct) or not 0 <= pct <= 100:
                continue
            rows.append({"label": label, "used": pct,
                         "seconds": duration if number(duration) and duration > 0 else None,
                         "reset": reset if number(reset) and reset > 0 else None})

    add("Codex", data.get("rate_limit"))
    add("代码审查", data.get("code_review_rate_limit"))
    for item in (data.get("additional_rate_limits") or [])[:30]:
        if isinstance(item, dict):
            label = str(item.get("limit_name") or item.get("limit_id") or "附加额度")[:70]
            add(label, item.get("rate_limit") or item)
    credits = data.get("credits") or {}
    balance = credits.get("balance")
    if not isinstance(balance, (str, int, float)):
        balance = None
    models = []
    for name, model in (data.get("model_usage") or {}).items():
        if isinstance(model, dict):
            models.append({"name": str(name)[:60], "available": model.get("available") is True,
                           "available_at": model.get("available_at") if number(model.get("available_at")) else None})
    reset_credits = (data.get("rate_limit_reset_credits") or {}).get("available_count")
    result = {"ok": True, "fetched_at": time.time(), "plan": str(data.get("plan_type") or "未知")[:40],
              "windows": rows, "credits": str(balance)[:50] if balance is not None else None,
              "reset_credits": reset_credits if number(reset_credits) else None, "models": models,
              "message_estimates": {}, "reset_passes": [], "reset_details_available": False,
              "credits_expire_at": None}
    for key in ("approx_local_messages", "approx_cloud_messages"):
        value = credits.get(key)
        if isinstance(value, list) and len(value) == 2 and all(number(x) and x >= 0 for x in value):
            result["message_estimates"][key] = value
    return result


def fetch():
    path = Path.home() / ".codex" / "auth.json"
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, "r") as stream:
            info = os.fstat(stream.fileno())
            if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077 or not stat.S_ISREG(info.st_mode):
                return {"ok": False, "error": "凭证文件权限不安全，已停止读取"}
            auth = json.loads(stream.read(1024 * 1024))
        token = (auth.get("tokens") or {}).get("access_token")
        if not isinstance(token, str) or not token:
            return {"ok": False, "error": "Codex 当前没有可用登录状态"}
        request = urllib.request.Request(URL, headers={
            "Authorization": "Bearer " + token, "Accept": "application/json",
            "User-Agent": "codex_cli/0", "Originator": "codex_cli"})
        context = ssl.create_default_context(cafile="/etc/ssl/cert.pem")
        opener = urllib.request.build_opener(NoRedirect, urllib.request.HTTPSHandler(context=context))
        with opener.open(request, timeout=15) as response:
            if response.geturl() != URL:
                raise ValueError("unexpected origin")
            payload = response.read(1024 * 1024 + 1)
            if len(payload) > 1024 * 1024:
                raise ValueError("response too large")
            result = normalize(json.loads(payload))
        # Separate read-only endpoint; never redeem or consume reset passes.
        try:
            reset_request = urllib.request.Request(RESET_URL, headers={
                'Authorization': 'Bearer ' + token, 'Accept': 'application/json',
                'User-Agent': 'codex_cli/0', 'Originator': 'codex_cli'})
            with opener.open(reset_request, timeout=6) as response:
                if response.geturl() != RESET_URL:
                    raise ValueError('unexpected origin')
                body = response.read(1024 * 1024 + 1)
                if len(body) > 1024 * 1024:
                    raise ValueError('response too large')
                details = json.loads(body)
            result['reset_passes'] = reset_details(details)
            result['reset_details_available'] = True
            count = details.get('available_count')
            if number(count):
                result['reset_credits'] = count
        except Exception:
            pass  # Main quota remains usable; missing details are not reported as zero.
        return result
    except urllib.error.HTTPError as error:
        message = "登录已过期；请在 ChatGPT/Codex 中恢复登录" if error.code == 401 else "额度服务暂不可用（HTTP %d）" % error.code
        return {"ok": False, "error": message}
    except FileNotFoundError:
        return {"ok": False, "error": "未找到 Codex 登录文件"}
    except Exception:
        return {"ok": False, "error": "读取失败，稍后自动重试（未保存任何凭证）"}


if __name__ == "__main__":
    os.umask(0o077)
    print(json.dumps(fetch(), ensure_ascii=False))
