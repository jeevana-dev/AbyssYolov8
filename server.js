// server.js — Smart Traffic Control Backend
// Run: npm install && node server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── DATABASE SETUP ───────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'traffic.db');
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS officers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    batch_number TEXT UNIQUE NOT NULL,
    area_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    officer_id INTEGER NOT NULL,
    login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    logout_time DATETIME,
    ip_address TEXT,
    FOREIGN KEY (officer_id) REFERENCES officers(id)
  );

  CREATE TABLE IF NOT EXISTS cameras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_name TEXT NOT NULL,
    location TEXT NOT NULL,
    direction TEXT NOT NULL,
    status TEXT DEFAULT 'online',
    stream_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS detections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_id INTEGER NOT NULL,
    detection_type TEXT NOT NULL,
    confidence REAL,
    vehicle_count INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    action_taken TEXT,
    FOREIGN KEY (camera_id) REFERENCES cameras(id)
  );

  CREATE TABLE IF NOT EXISTS signal_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    direction TEXT NOT NULL,
    current_color TEXT NOT NULL,
    timer_seconds INTEGER DEFAULT 30,
    mode TEXT DEFAULT 'normal',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vehicle_counts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_id INTEGER NOT NULL,
    direction TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    car_count INTEGER DEFAULT 0,
    bike_count INTEGER DEFAULT 0,
    heavy_count INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (camera_id) REFERENCES cameras(id)
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_type TEXT NOT NULL,
    severity TEXT DEFAULT 'info',
    message TEXT NOT NULL,
    camera_id INTEGER,
    acknowledged INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (camera_id) REFERENCES cameras(id)
  );
`);

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const camCount = db.prepare('SELECT COUNT(*) as c FROM cameras').get().c;
if (camCount === 0) {
  const insertCam = db.prepare(`INSERT INTO cameras (camera_name, location, direction, stream_url) VALUES (?,?,?,?)`);
  insertCam.run('NORTH GATEWAY 01', 'Junction-A North', 'NORTH', 'https://videos.pexels.com/video-files/3195394/3195394-uhd_2732_1440_25fps.mp4');
  insertCam.run('SOUTH INTERSECTION 02', 'Junction-A South', 'SOUTH', 'https://videos.pexels.com/video-files/2103099/2103099-uhd_2560_1440_30fps.mp4');
  insertCam.run('EAST AVENUE 03', 'Junction-A East', 'EAST', 'https://videos.pexels.com/video-files/4582596/4582596-uhd_2732_1440_25fps.mp4');
  insertCam.run('WEST ROAD 04', 'Junction-A West', 'WEST', 'https://videos.pexels.com/video-files/1849327/1849327-hd_1920_1080_30fps.mp4');

  const insertSig = db.prepare(`INSERT INTO signal_states (direction, current_color, timer_seconds, mode) VALUES (?,?,?,?)`);
  insertSig.run('NORTH', 'blue', 18, 'ambulance');
  insertSig.run('SOUTH', 'red', 18, 'normal');
  insertSig.run('EAST', 'red', 22, 'accident');
  insertSig.run('WEST', 'green', 45, 'bus');

  const insertAlert = db.prepare(`INSERT INTO alerts (alert_type, severity, message, camera_id) VALUES (?,?,?,?)`);
  insertAlert.run('ambulance', 'critical', 'AMBULANCE DETECTED · NORTH GATEWAY 01 · BLUE SIGNAL ACTIVE', 1);
  insertAlert.run('accident', 'critical', 'ACCIDENT DETECTED · EAST AVENUE 03 · EMERGENCY SERVICES ALERTED', 3);
  insertAlert.run('bus', 'warning', 'PUBLIC TRANSPORT · WEST ROAD 04 · +15s GREEN EXTENDED', 4);
}

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
// Login
app.post('/api/auth/login', (req, res) => {
  const { name, batch_number, area_name } = req.body;
  if (!name || !batch_number || !area_name) {
    return res.status(400).json({ success: false, message: 'All fields required' });
  }

  let officer = db.prepare('SELECT * FROM officers WHERE batch_number = ?').get(batch_number);

  if (!officer) {
    db.prepare('INSERT INTO officers (name, batch_number, area_name, last_login) VALUES (?,?,?,CURRENT_TIMESTAMP)').run(name, batch_number, area_name);
    officer = db.prepare('SELECT * FROM officers WHERE batch_number = ?').get(batch_number);
  } else {
    db.prepare('UPDATE officers SET last_login = CURRENT_TIMESTAMP, name = ?, area_name = ? WHERE batch_number = ?').run(name, area_name, batch_number);
  }

  const session = db.prepare('INSERT INTO sessions (officer_id, ip_address) VALUES (?,?)').run(officer.id, req.ip);

  res.json({
    success: true,
    officer: { id: officer.id, name: officer.name, batch_number: officer.batch_number, area_name: officer.area_name },
    session_id: session.lastInsertRowid,
    message: 'Login successful'
  });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const { session_id } = req.body;
  if (session_id) {
    db.prepare('UPDATE sessions SET logout_time = CURRENT_TIMESTAMP WHERE id = ?').run(session_id);
  }
  res.json({ success: true });
});

// ─── CAMERA ROUTES ────────────────────────────────────────────────────────────
app.get('/api/cameras', (req, res) => {
  const cameras = db.prepare('SELECT * FROM cameras').all();
  res.json({ success: true, cameras });
});

app.get('/api/cameras/:id', (req, res) => {
  const cam = db.prepare('SELECT * FROM cameras WHERE id = ?').get(req.params.id);
  if (!cam) return res.status(404).json({ success: false, message: 'Camera not found' });
  const latestDetection = db.prepare('SELECT * FROM detections WHERE camera_id = ? ORDER BY timestamp DESC LIMIT 1').get(cam.id);
  const vehicleCount = db.prepare('SELECT * FROM vehicle_counts WHERE camera_id = ? ORDER BY timestamp DESC LIMIT 1').get(cam.id);
  res.json({ success: true, camera: cam, latest_detection: latestDetection, vehicle_count: vehicleCount });
});

// ─── DETECTION ROUTES ─────────────────────────────────────────────────────────
app.post('/api/detections', (req, res) => {
  const { camera_id, detection_type, confidence, vehicle_count, action_taken } = req.body;
  const result = db.prepare(
    'INSERT INTO detections (camera_id, detection_type, confidence, vehicle_count, action_taken) VALUES (?,?,?,?,?)'
  ).run(camera_id, detection_type, confidence, vehicle_count, action_taken);

  // Auto-update signal based on detection
  updateSignalForDetection(camera_id, detection_type);

  // Create alert for critical detections
  if (['ambulance','accident'].includes(detection_type)) {
    const cam = db.prepare('SELECT * FROM cameras WHERE id = ?').get(camera_id);
    const severity = detection_type === 'accident' ? 'critical' : 'critical';
    const msg = detection_type === 'ambulance'
      ? `AMBULANCE DETECTED · ${cam.camera_name} · BLUE SIGNAL ACTIVE`
      : `ACCIDENT DETECTED · ${cam.camera_name} · EMERGENCY SERVICES ALERTED`;
    db.prepare('INSERT INTO alerts (alert_type, severity, message, camera_id) VALUES (?,?,?,?)').run(detection_type, severity, msg, camera_id);
  }

  // Broadcast via WebSocket
  io.emit('detection', { camera_id, detection_type, confidence, vehicle_count, timestamp: new Date().toISOString() });

  res.json({ success: true, detection_id: result.lastInsertRowid });
});

app.get('/api/detections', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const detections = db.prepare(`
    SELECT d.*, c.camera_name, c.direction
    FROM detections d JOIN cameras c ON d.camera_id = c.id
    ORDER BY d.timestamp DESC LIMIT ?
  `).all(limit);
  res.json({ success: true, detections });
});

// ─── SIGNAL ROUTES ────────────────────────────────────────────────────────────
app.get('/api/signals', (req, res) => {
  const signals = db.prepare('SELECT * FROM signal_states').all();
  res.json({ success: true, signals });
});

app.put('/api/signals/:direction', (req, res) => {
  const { current_color, timer_seconds, mode } = req.body;
  db.prepare(
    'UPDATE signal_states SET current_color=?, timer_seconds=?, mode=?, updated_at=CURRENT_TIMESTAMP WHERE direction=?'
  ).run(current_color, timer_seconds, mode, req.params.direction.toUpperCase());
  io.emit('signal_update', { direction: req.params.direction, current_color, timer_seconds, mode });
  res.json({ success: true });
});

function updateSignalForDetection(camera_id, type) {
  const cam = db.prepare('SELECT direction FROM cameras WHERE id = ?').get(camera_id);
  if (!cam) return;

  let color, timer, mode;
  switch (type) {
    case 'ambulance': color = 'blue'; timer = 18; mode = 'ambulance'; break;
    case 'accident': color = 'red'; timer = 0; mode = 'accident'; break;
    case 'bus': color = 'green'; timer = 45; mode = 'bus'; break;
    default: color = 'green'; timer = 30; mode = 'normal'; break;
  }

  db.prepare('UPDATE signal_states SET current_color=?, timer_seconds=?, mode=?, updated_at=CURRENT_TIMESTAMP WHERE direction=?')
    .run(color, timer, mode, cam.direction);

  io.emit('signal_update', { direction: cam.direction, current_color: color, timer_seconds: timer, mode });
}

// ─── VEHICLE COUNT ROUTES ─────────────────────────────────────────────────────
app.get('/api/vehicle-counts', (req, res) => {
  const counts = db.prepare(`
    SELECT vc.*, c.camera_name, c.direction
    FROM vehicle_counts vc JOIN cameras c ON vc.camera_id = c.id
    ORDER BY vc.timestamp DESC LIMIT 4
  `).all();
  res.json({ success: true, counts });
});

app.post('/api/vehicle-counts', (req, res) => {
  const { camera_id, direction, count, car_count, bike_count, heavy_count } = req.body;
  db.prepare(
    'INSERT INTO vehicle_counts (camera_id, direction, count, car_count, bike_count, heavy_count) VALUES (?,?,?,?,?,?)'
  ).run(camera_id, direction, count, car_count, bike_count, heavy_count);
  io.emit('vehicle_count', { camera_id, direction, count });
  res.json({ success: true });
});

// ─── ALERTS ROUTES ────────────────────────────────────────────────────────────
app.get('/api/alerts', (req, res) => {
  const alerts = db.prepare('SELECT * FROM alerts ORDER BY timestamp DESC LIMIT 20').all();
  res.json({ success: true, alerts });
});

app.put('/api/alerts/:id/acknowledge', (req, res) => {
  db.prepare('UPDATE alerts SET acknowledged = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── ANALYTICS ROUTES ─────────────────────────────────────────────────────────
app.get('/api/analytics/summary', (req, res) => {
  const totalDetections = db.prepare('SELECT COUNT(*) as c FROM detections').get().c;
  const totalAlerts = db.prepare('SELECT COUNT(*) as c FROM alerts').get().c;
  const criticalAlerts = db.prepare("SELECT COUNT(*) as c FROM alerts WHERE severity='critical'").get().c;
  const activeOfficers = db.prepare("SELECT COUNT(*) as c FROM sessions WHERE logout_time IS NULL").get().c;

  res.json({
    success: true,
    summary: { totalDetections, totalAlerts, criticalAlerts, activeOfficers }
  });
});

app.get('/api/analytics/traffic-density', (req, res) => {
  const data = db.prepare(`
    SELECT strftime('%H', timestamp) as hour, COUNT(*) as count, SUM(vehicle_count) as vehicles
    FROM detections WHERE timestamp > datetime('now', '-24 hours')
    GROUP BY hour ORDER BY hour
  `).all();
  res.json({ success: true, data });
});

// ─── OFFICER ROUTES ───────────────────────────────────────────────────────────
app.get('/api/officers/:id', (req, res) => {
  const officer = db.prepare('SELECT * FROM officers WHERE id = ?').get(req.params.id);
  if (!officer) return res.status(404).json({ success: false });
  const sessions = db.prepare('SELECT * FROM sessions WHERE officer_id = ? ORDER BY login_time DESC LIMIT 5').all(officer.id);
  res.json({ success: true, officer, sessions });
});

// ─── WEBSOCKET ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send current state on connect
  const signals = db.prepare('SELECT * FROM signal_states').all();
  socket.emit('initial_state', { signals });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

  // Manual signal override from client
  socket.on('override_signal', ({ direction, color, timer }) => {
    db.prepare('UPDATE signal_states SET current_color=?, timer_seconds=?, mode=?, updated_at=CURRENT_TIMESTAMP WHERE direction=?')
      .run(color, timer, 'manual', direction);
    io.emit('signal_update', { direction, current_color: color, timer_seconds: timer, mode: 'manual' });
  });
});

// ─── SIMULATE LIVE DATA ───────────────────────────────────────────────────────
// Simulate real-time vehicle count updates
setInterval(() => {
  const cameras = db.prepare('SELECT * FROM cameras').all();
  cameras.forEach(cam => {
    const count = Math.floor(Math.random() * 30) + 5;
    const cars = Math.floor(count * 0.55);
    const bikes = Math.floor(count * 0.30);
    const heavy = count - cars - bikes;
    db.prepare('INSERT INTO vehicle_counts (camera_id, direction, count, car_count, bike_count, heavy_count) VALUES (?,?,?,?,?,?)')
      .run(cam.id, cam.direction, count, cars, bikes, heavy);
    io.emit('vehicle_count', { camera_id: cam.id, direction: cam.direction, count, cars, bikes, heavy });
  });
}, 5000);

// Simulate detection events
const detectionTypes = ['normal', 'normal', 'normal', 'ambulance', 'bus', 'accident'];
setInterval(() => {
  const camId = Math.ceil(Math.random() * 4);
  const type = detectionTypes[Math.floor(Math.random() * detectionTypes.length)];
  const confidence = (0.85 + Math.random() * 0.14).toFixed(3);
  const count = Math.floor(Math.random() * 25) + 5;
  db.prepare('INSERT INTO detections (camera_id, detection_type, confidence, vehicle_count, action_taken) VALUES (?,?,?,?,?)')
    .run(camId, type, confidence, count, type === 'ambulance' ? 'BLUE_SIGNAL' : type === 'accident' ? 'BLINK_ALERT' : type === 'bus' ? '+15s_GREEN' : 'STANDARD');
  io.emit('detection', { camera_id: camId, detection_type: type, confidence, vehicle_count: count, timestamp: new Date().toISOString() });
}, 15000);

// ─── START SERVER ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚦 Smart Traffic Control Server running on port ${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api`);
  console.log(`   Dashboard: http://localhost:${PORT}`);
  console.log(`   Database: ${DB_PATH}\n`);
});

module.exports = { app, db, io };
