"""Fixed read-only actions. Never accepts arbitrary shell command text."""
import json
import subprocess
from datetime import datetime, timezone

ACTIONS = {
    "windows_time": {
        "label": "Read Windows date/time",
        "risk": "read-only",
        "description": "Returns the local Windows clock using PowerShell."
    },
    "windows_disk_summary": {
        "label": "Read fixed-drive free space",
        "risk": "read-only",
        "description": "Reports fixed-drive size and free bytes; changes no files."
    },
    "ollama_health": {
        "label": "Check local Ollama",
        "risk": "read-only",
        "description": "Checks the local Ollama API at 127.0.0.1:11434."
    }
}

def run_action(action_id):
    if action_id not in ACTIONS:
        raise ValueError("Unknown action identifier")
    if action_id == "windows_time":
        return _powershell("$ErrorActionPreference='Stop'; Get-Date -Format o", action_id)
    if action_id == "windows_disk_summary":
        script = ('$ErrorActionPreference=\'Stop\'; '
                  'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | '
                  'Select-Object DeviceID,Size,FreeSpace | ConvertTo-Json -Compress')
        return _powershell(script, action_id)
    if action_id == "ollama_health":
        try:
            from urllib.request import urlopen
            with urlopen("http://127.0.0.1:11434/api/tags", timeout=2) as response:
                payload = json.loads(response.read().decode("utf-8"))
            return {"ok": True, "action": action_id,
                    "models": [m.get("name", "unknown") for m in payload.get("models", [])],
                    "checked_at": datetime.now(timezone.utc).isoformat()}
        except Exception as exc:
            return {"ok": False, "action": action_id, "error": type(exc).__name__,
                    "message": "Ollama did not respond on loopback:11434."}
    raise ValueError("Registered action has no implementation")

def _powershell(script, action_id):
    try:
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True, text=True, timeout=8, check=False)
        return {"ok": result.returncode == 0, "action": action_id,
                "exit_code": result.returncode, "stdout": result.stdout[-8000:],
                "stderr": result.stderr[-2000:],
                "checked_at": datetime.now(timezone.utc).isoformat()}
    except subprocess.TimeoutExpired:
        return {"ok": False, "action": action_id, "error": "timeout"}
    except FileNotFoundError:
        return {"ok": False, "action": action_id,
                "error": "powershell.exe not found; this action requires Windows"}
