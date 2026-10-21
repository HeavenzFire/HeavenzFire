"""Loopback-only OpenCV perception for the HeavenzFire embodied avatar.
Processes low-resolution camera frames in memory; never stores images or contacts the network.
"""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import cv2
import numpy as np

HOST, PORT = "127.0.0.1", 11802
CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
PEOPLE = cv2.HOGDescriptor()
PEOPLE.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
if CASCADE.empty():
    raise RuntimeError("OpenCV frontal-face cascade unavailable")

class Handler(BaseHTTPRequestHandler):
    server_version = "HeavenzFireVision/0.1"
    def log_message(self, *_):
        return
    def _send(self, status, payload):
        raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:8797")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', 'http://127.0.0.1:8797')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '600')
        self.end_headers()
    def do_GET(self):
        if self.path == "/health":
            self._send(200, {"ok": True, "service": "local-opencv-avatar-vision",
                             "face_detector": "Haar cascade", "person_detector": "OpenCV HOG people detector", "host": HOST, "port": PORT,
                             "stores_frames": False, "external_network": False})
        else:
            self._send(404, {"ok": False, "error": "not found"})
    def do_POST(self):
        if self.path != "/analyze":
            return self._send(404, {"ok": False, "error": "not found"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 1 or size > 262144:
                return self._send(413, {"ok": False, "error": "frame must be 1-262144 bytes"})
            frame = np.frombuffer(self.rfile.read(size), dtype=np.uint8)
            image = cv2.imdecode(frame, cv2.IMREAD_COLOR)
            if image is None:
                return self._send(400, {"ok": False, "error": "invalid image"})
            h, w = image.shape[:2]
            if w > 320:
                scale = 320.0 / w
                image = cv2.resize(image, (320, max(1, int(h * scale))))
                h, w = image.shape[:2]
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            faces = CASCADE.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4,
                                             minSize=(18, 18), flags=cv2.CASCADE_SCALE_IMAGE)
            boxes = [{"x": int(x), "y": int(y), "w": int(fw), "h": int(fh)}
                     for x, y, fw, fh in faces]
            person_boxes = []
            if h >= 128 and w >= 64:
                people, _weights = PEOPLE.detectMultiScale(image, winStride=(8, 8), padding=(8, 8), scale=1.05)
                person_boxes = [{"x": int(x), "y": int(y), "w": int(pw), "h": int(ph)}
                                for x, y, pw, ph in people[:8]]
            center = None
            if len(boxes):
                f = max(boxes, key=lambda z: z["w"] * z["h"])
                center = {"x": round((f["x"] + f["w"] / 2) / w, 3),
                          "y": round((f["y"] + f["h"] / 2) / h, 3)}
            self._send(200, {"ok": True, "width": w, "height": h,
                             "brightness": round(float(np.mean(gray)) / 255, 3),
                             "face_count": len(boxes), "faces": boxes, "person_count": len(person_boxes),
                             "people": person_boxes, "primary_face_center": center, "stores_frames": False})
        except (ValueError, OSError) as exc:
            self._send(400, {"ok": False, "error": str(exc)[:160]})

if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()