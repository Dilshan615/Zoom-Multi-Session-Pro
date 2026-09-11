const express = require('express');
const cors = require('cors');
const path = require('path');
const zoomManager = require('./automation/zoomBot');
const dataManager = require('./dataManager');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Server-Sent Events (SSE) clients
const sseClients = new Set();

// Register SSE handler
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);

  // Send initial ping
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE Stream Active' })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Broadcast status update to all connected frontend clients
zoomManager.onStatus((event) => {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    client.write(data);
  }
});

// Watch participants.txt for external edits and live sync to frontend
dataManager.watchParticipantsFile((newParticipants) => {
  console.log(`[Watch] participants.txt modified on disk! Syncing ${newParticipants.length} participants...`);
  const data = `data: ${JSON.stringify({ type: 'file_updated', participants: newParticipants })}\n\n`;
  for (const client of sseClients) {
    client.write(data);
  }
});

// Launch multiple Zoom sessions
app.post('/api/launch', async (req, res) => {
  const { url, passcode, participants, muteAudio, muteVideo } = req.body;

  if (!url || !participants || !Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({ error: 'Please provide a valid Zoom URL and at least one participant.' });
  }

  res.json({ message: `Starting ${participants.length} sessions...`, count: participants.length });

  // Stagger launch each session by 1.5 seconds to ensure smooth browser initialization
  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    const firstName = p.firstName || (p.name ? p.name.split(' ')[0] : `User${i + 1}`);
    const lastName = p.lastName || (p.name && p.name.includes(' ') ? p.name.split(' ').slice(1).join(' ') : 'Participant');
    const fullName = p.name || `${firstName} ${lastName}`.trim();

    const sessionConfig = {
      id: `zoom_session_${i + 1}_${Date.now()}`,
      name: fullName,
      firstName,
      lastName,
      email: p.email || `user${i + 1}@example.com`,
      nic: p.nic || '',
      phone: p.phone || '',
      url: url.trim(),
      passcode: passcode ? passcode.trim() : '',
      muteAudio: muteAudio !== false,
      muteVideo: muteVideo !== false
    };

    // Trigger async launch without blocking the loop completely, staggered
    zoomManager.launchSession(sessionConfig, i, participants.length);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
});

// Get active sessions
app.get('/api/sessions', (req, res) => {
  res.json(zoomManager.getActiveSessions());
});

// Close specific session
app.post('/api/sessions/:id/close', async (req, res) => {
  const success = await zoomManager.closeSession(req.params.id);
  res.json({ success });
});

// Close all sessions
app.post('/api/sessions/close-all', async (req, res) => {
  await zoomManager.closeAllSessions();
  res.json({ success: true, message: 'All sessions closed.' });
});

// Load participants from participants.txt
app.get('/api/participants-file', (req, res) => {
  const result = dataManager.loadParticipantsFromFile();
  res.json(result);
});

// Save participants to participants.txt
app.post('/api/participants-file', (req, res) => {
  const { participants } = req.body;
  if (!participants || !Array.isArray(participants)) {
    return res.status(400).json({ success: false, error: 'Invalid participants list' });
  }
  const result = dataManager.saveParticipantsToFile(participants);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Zoom Multi-Session Tool is running!`);
  console.log(`👉 Open in your browser: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
