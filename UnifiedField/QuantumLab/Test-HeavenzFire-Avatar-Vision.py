import json
import urllib.request
import cv2
import numpy as np

image = np.zeros((240, 320, 3), dtype=np.uint8)
ok, encoded = cv2.imencode(".jpg", image)
assert ok
request = urllib.request.Request(
    "http://127.0.0.1:11802/analyze",
    data=encoded.tobytes(),
    headers={"Content-Type": "image/jpeg"},
    method="POST",
)
with urllib.request.urlopen(request, timeout=5) as response:
    result = json.loads(response.read().decode("utf-8"))
assert result.get("ok") is True, result
assert result.get("face_count") == 0, result
assert result.get("person_count") == 0, result
assert result.get("stores_frames") is False, result
print(json.dumps({"ok": True, "synthetic_frame": "accepted", "face_count": result["face_count"],
                  "frame_storage": result["stores_frames"], "dimensions": [result["width"], result["height"]], "person_count": result["person_count"]}))