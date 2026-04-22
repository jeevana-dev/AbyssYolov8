# 🚦 Smart Traffic Control System

Full-stack police traffic management dashboard with real-time AI detection.

---

## 📁 File Structure

```
smart-traffic-control/
├── login.html          ← Police login page
├── dashboard.html      ← Main command dashboard
├── server.js           ← Node.js backend (Express + WebSocket)
├── ai_detection.py     ← Python YOLO AI engine
├── package.json        ← Node dependencies
├── traffic.db          ← SQLite database (auto-created)
└── README.md
```

---

## 🚀 Quick Start

### Step 1 — Backend Server

```bash
# Install Node dependencies
npm install

# Start server
node server.js
# OR with auto-reload:
npm run dev
```

Server starts at `http://localhost:3000`

---

### Step 2 — AI Detection Engine

```bash
# Install Python dependencies
pip install ultralytics opencv-python requests numpy

# Start AI detection (runs alongside server)
python3 ai_detection.py
```

YOLOv8 model downloads automatically (~6MB for nano model) on first run.

---

### Step 3 — Open Frontend

Open `login.html` in your browser, or serve via the backend:
```
http://localhost:3000/login.html
http://localhost:3000/dashboard.html
```

---

## 🔑 Login Credentials (Demo)

Any name + batch number + area works. Data is stored per batch number.

Example:
- **Name:** Rajan Kumar
- **Batch:** TN-2024-001
- **Area:** Junction-A, Chennai

---

## 🎯 Features

### Login Page
- Officer name, batch number, area name login
- Animated dark theme with police aesthetics
- Session stored in localStorage

### Main Dashboard
- Live CCTV grid (4 cameras)
- Real-time system alerts
- Traffic signal status for all 4 directions
- AI detection log table
- Vehicle mix pie chart, density graph, speed meter

### Live Signal Page
- Click any camera → full-screen modal view
- **LED board** at top shows detection status
- **Traffic signal** (Red/Yellow/Green/Blue) on right
- **Ambulance**: Blue light + LED "AMBULANCE ON THE WAY"
- **Accident**: Rapid red blink + LED alert
- **Bus**: +15s green timer + LED notification
- **Normal**: Standard green with direction display

### Vehicle Count Page
- Animated real-time road intersection canvas
- Moving vehicle sprites in all 4 directions
- Live vehicle counts per direction
- Time-series flow chart (30-minute window)

### Profile Page
- Officer details from login
- Shift duration tracker
- Duty statistics
- Recent activity log

---

## 🚦 Signal Colors

| Color  | Meaning                        |
|--------|--------------------------------|
| 🔴 Red    | Stop / Hold                   |
| 🟡 Yellow | Caution / Transition          |
| 🟢 Green  | Go / Normal flow              |
| 🔵 Blue   | Emergency vehicle priority    |

---

## 🤖 AI Detection (YOLO)

Uses **YOLOv8 nano** for real-time object detection:

| Detected       | Signal Response         | LED Display                      |
|----------------|-------------------------|----------------------------------|
| Ambulance/Emergency | Blue light (that direction) | AMBULANCE ON THE WAY        |
| Accident       | Rapid red+yellow blink  | ⚠ ACCIDENT OCCURRED              |
| Bus/Public Transport | Green +15 seconds  | 🚌 PUBLIC TRANSPORT PRIORITY     |
| Normal traffic | Standard cycle          | Direction + vehicle count        |

---

## 🔌 API Endpoints

| Method | Endpoint                    | Description            |
|--------|-----------------------------|------------------------|
| POST   | /api/auth/login             | Officer login          |
| POST   | /api/auth/logout            | Officer logout         |
| GET    | /api/cameras                | List all cameras       |
| GET    | /api/cameras/:id            | Camera details         |
| GET    | /api/signals                | Current signal states  |
| PUT    | /api/signals/:direction     | Override signal        |
| POST   | /api/detections             | Log AI detection       |
| GET    | /api/detections             | Detection history      |
| GET    | /api/vehicle-counts         | Vehicle count data     |
| POST   | /api/vehicle-counts         | Update vehicle count   |
| GET    | /api/alerts                 | Active alerts          |
| GET    | /api/analytics/summary      | Dashboard stats        |

### WebSocket Events (Socket.io)

| Event           | Direction      | Payload                              |
|-----------------|----------------|--------------------------------------|
| detection       | Server→Client  | {camera_id, type, confidence, count} |
| signal_update   | Server→Client  | {direction, color, timer, mode}      |
| vehicle_count   | Server→Client  | {camera_id, direction, count}        |
| override_signal | Client→Server  | {direction, color, timer}            |

---

## 🗄️ Database Schema (SQLite)

- **officers** — Police officer records
- **sessions** — Login session tracking
- **cameras** — CCTV camera registry
- **detections** — AI detection event log
- **signal_states** — Current traffic signal state per direction
- **vehicle_counts** — Time-series vehicle count per camera
- **alerts** — System alert log

---

## 🔧 Production Deployment

1. Replace Pexels video URLs with actual RTSP/HLS camera streams:
   ```js
   // In server.js, update cameras table:
   stream_url: "rtsp://192.168.1.100:554/stream1"
   ```

2. Train custom YOLOv8 model on ambulance/emergency vehicle dataset:
   ```bash
   yolo train data=emergency_vehicles.yaml model=yolov8n.pt epochs=100
   ```

3. Add HTTPS/nginx reverse proxy for production

4. Replace localStorage auth with JWT tokens

---

## 📊 Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | HTML5, CSS3, Vanilla JS, Chart.js   |
| Backend   | Node.js, Express, Socket.io         |
| Database  | SQLite (better-sqlite3)             |
| AI Engine | Python, YOLOv8 (Ultralytics), OpenCV|
| Fonts     | Orbitron, Rajdhani, Share Tech Mono |
