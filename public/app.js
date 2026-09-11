// State
let sessionCount = 5;
let participants = [];
const activeSessionsMap = new Map(); // sessionId -> { name, status, message }

// DOM Elements
const meetingUrlInput = document.getElementById('meetingUrl');
const meetingPasscodeInput = document.getElementById('meetingPasscode');
const btnPasteUrl = document.getElementById('btnPasteUrl');
const participantsList = document.getElementById('participantsList');
const countButtons = document.querySelectorAll('.count-btn');
const btnAutoGenerate = document.getElementById('btnAutoGenerate');
const btnResetNames = document.getElementById('btnResetNames');
const btnSaveToFile = document.getElementById('btnSaveToFile');
const btnReloadFromFile = document.getElementById('btnReloadFromFile');
const btnLaunchAll = document.getElementById('btnLaunchAll');
const btnLaunchText = document.getElementById('btnLaunchText');
const btnStopAll = document.getElementById('btnStopAll');
const sessionCardsGrid = document.getElementById('sessionCardsGrid');
const emptySessionsState = document.getElementById('emptySessionsState');
const activeCountBadge = document.getElementById('activeCountBadge');
const logConsole = document.getElementById('logConsole');
const btnClearLogs = document.getElementById('btnClearLogs');
const muteAudioToggle = document.getElementById('muteAudioToggle');
const muteVideoToggle = document.getElementById('muteVideoToggle');

// Sample Sri Lankan Profiles for realistic auto generation
const sampleProfiles = [
  { firstName: 'Kasun', lastName: 'Perera', email: 'kasun.p@gmail.com', nic: '199824501234', phone: '0771234567' },
];

// Initialize participants
function initParticipants(count) {
  const saved = localStorage.getItem('zoom_saved_participants');
  let savedList = [];
  if (saved) {
    try { savedList = JSON.parse(saved); } catch (e) { }
  }

  participants = [];
  for (let i = 0; i < count; i++) {
    const existing = savedList[i] || {};
    const sample = sampleProfiles[i % sampleProfiles.length];
    participants.push({
      firstName: existing.firstName || sample.firstName,
      lastName: existing.lastName || sample.lastName,
      name: existing.name || `${existing.firstName || sample.firstName} ${existing.lastName || sample.lastName}`,
      email: existing.email || sample.email,
      nic: existing.nic || sample.nic,
      phone: existing.phone || sample.phone
    });
  }
  renderParticipants();
}

// Render Participant Input Cards
function renderParticipants() {
  participantsList.innerHTML = '';
  participants.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'participant-item';
    row.innerHTML = `
      <div class="participant-header">
        <div class="participant-header-left">
          <div class="participant-badge">${idx + 1}</div>
          <span class="participant-title">Session ${idx + 1}: ${escapeHtml(p.firstName || 'User')} ${escapeHtml(p.lastName || '')}</span>
        </div>
      </div>

      <div class="form-row-2col">
        <div class="field-group">
          <label class="input-label-sm">First Name <span>*</span></label>
          <input 
            type="text" 
            placeholder="First Name" 
            value="${escapeHtml(p.firstName || '')}" 
            data-field="firstName" 
            data-index="${idx}" 
          />
        </div>
        <div class="field-group">
          <label class="input-label-sm">Last Name <span>*</span></label>
          <input 
            type="text" 
            placeholder="Last Name" 
            value="${escapeHtml(p.lastName || '')}" 
            data-field="lastName" 
            data-index="${idx}" 
          />
        </div>
      </div>

      <div class="field-group">
        <label class="input-label-sm">Email Address <span>*</span></label>
        <input 
          type="email" 
          placeholder="join@company.com" 
          value="${escapeHtml(p.email || '')}" 
          data-field="email" 
          data-index="${idx}" 
        />
      </div>

      <div class="form-row-2col">
        <div class="field-group">
          <label class="input-label-sm">NIC Number <span>*</span></label>
          <input 
            type="text" 
            placeholder="e.g. 199824501234 or 981234567V" 
            value="${escapeHtml(p.nic || '')}" 
            data-field="nic" 
            data-index="${idx}" 
          />
        </div>
        <div class="field-group">
          <label class="input-label-sm">Contact Number <span>*</span></label>
          <input 
            type="text" 
            placeholder="e.g. 0771234567" 
            value="${escapeHtml(p.phone || '')}" 
            data-field="phone" 
            data-index="${idx}" 
          />
        </div>
      </div>
    `;
    participantsList.appendChild(row);
  });

  // Attach input listeners to keep state in sync
  participantsList.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      const field = e.target.dataset.field;
      if (participants[idx] && field) {
        participants[idx][field] = e.target.value.trim();
        participants[idx].name = `${participants[idx].firstName || ''} ${participants[idx].lastName || ''}`.trim();

        // Update title dynamically if first or last name changes
        if (field === 'firstName' || field === 'lastName') {
          const title = e.target.closest('.participant-item').querySelector('.participant-title');
          if (title) {
            title.innerText = `Session ${idx + 1}: ${participants[idx].firstName || 'User'} ${participants[idx].lastName || ''}`;
          }
        }
        saveToStorage();
      }
    });
  });
}

let autoSaveTimer = null;

function saveToStorage() {
  localStorage.setItem('zoom_saved_participants', JSON.stringify(participants));

  // Debounced auto-save directly to participants.txt
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveToFile(false);
  }, 1200);
}

// Save directly to participants.txt on server
async function saveToFile(showFeedback = true) {
  try {
    const res = await fetch('/api/participants-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participants })
    });
    const data = await res.json();
    if (data.success) {
      if (showFeedback) {
        appendLog('💾 Saved all participant details to participants.txt!', 'success');
      }
    } else {
      if (showFeedback) appendLog(`Save failed: ${data.error}`, 'error');
    }
  } catch (err) {
    if (showFeedback) appendLog(`Save error: ${err.message}`, 'error');
  }
}

// Load directly from participants.txt on server
async function loadFromFile(showFeedback = true) {
  try {
    const res = await fetch('/api/participants-file');
    const data = await res.json();
    if (data.success && data.participants && data.participants.length > 0) {
      participants = data.participants;
      sessionCount = participants.length;

      // Update count button active state
      countButtons.forEach(b => {
        b.classList.remove('active', 'active-gold');
        if (parseInt(b.dataset.count, 10) === sessionCount) {
          b.classList.add(sessionCount >= 5 ? 'active-gold' : 'active');
        }
      });
      btnLaunchText.innerText = `LAUNCH ${sessionCount} ZOOM SESSIONS`;

      renderParticipants();
      if (showFeedback) {
        appendLog(`📂 Successfully loaded ${participants.length} participants from participants.txt`, 'success');
      }
    } else if (showFeedback) {
      appendLog('Notice: No custom participants found in participants.txt', 'warning');
    }
  } catch (err) {
    if (showFeedback) appendLog(`Error loading file: ${err.message}`, 'error');
  }
}

// Manual Save button
btnSaveToFile.addEventListener('click', () => {
  saveToFile(true);
});

// Manual Load button
btnReloadFromFile.addEventListener('click', () => {
  loadFromFile(true);
});

// Auto-fill names
btnAutoGenerate.addEventListener('click', () => {
  participants.forEach((p, idx) => {
    const sample = sampleProfiles[idx % sampleProfiles.length];
    p.firstName = sample.firstName;
    p.lastName = sample.lastName;
    p.name = `${sample.firstName} ${sample.lastName}`;
    p.email = sample.email;
    p.nic = sample.nic;
    p.phone = sample.phone;
  });
  renderParticipants();
  saveToStorage();
  saveToFile(true);
  appendLog('Generated fresh Sri Lankan participant presets (Name, NIC, Phone, Email).', 'info');
});

// Reset to simple numbered names
btnResetNames.addEventListener('click', () => {
  participants.forEach((p, idx) => {
    p.firstName = `Student`;
    p.lastName = `${idx + 1}`;
    p.name = `Student ${idx + 1}`;
    p.email = `student${idx + 1}@gmail.com`;
    p.nic = `2000${String(idx + 1).padStart(2, '0')}001234`;
    p.phone = `077000000${idx + 1}`;
  });
  renderParticipants();
  saveToStorage();
  saveToFile(true);
  appendLog('Reset participant details to defaults.', 'info');
});

// Count buttons handling
countButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    countButtons.forEach(b => b.classList.remove('active', 'active-gold'));
    const count = parseInt(btn.dataset.count, 10);
    sessionCount = count;
    btn.classList.add(count >= 5 ? 'active-gold' : 'active');
    btnLaunchText.innerText = `LAUNCH ${sessionCount} ZOOM SESSIONS`;
    initParticipants(sessionCount);
  });
});

// Paste from clipboard helper
btnPasteUrl.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      meetingUrlInput.value = text.trim();
      appendLog(`Pasted Zoom link: ${text.substring(0, 45)}...`, 'info');
    }
  } catch (e) {
    meetingUrlInput.focus();
  }
});

// Append entry to terminal log
function appendLog(message, type = 'info') {
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  entry.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-msg">${escapeHtml(message)}</span>`;
  logConsole.appendChild(entry);
  logConsole.scrollTop = logConsole.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

btnClearLogs.addEventListener('click', () => {
  logConsole.innerHTML = '';
});

// Map status key to readable label & style
function getStatusBadge(status) {
  switch (status) {
    case 'starting':
      return { label: 'Starting Chrome...', class: 'status-starting' };
    case 'navigating':
      return { label: 'Opening Zoom...', class: 'status-navigating' };
    case 'filling_name':
    case 'filling_form':
      return { label: 'Auto-Filling Form...', class: 'status-filling_form' };
    case 'submitting':
      return { label: 'Submitting Form...', class: 'status-submitting' };
    case 'joining':
      return { label: 'Joining Meeting...', class: 'status-navigating' };
    case 'waiting_room':
      return { label: '⏳ In Waiting Room', class: 'status-waiting_room' };
    case 'in_meeting':
      return { label: '✅ Inside Meeting', class: 'status-in_meeting' };
    case 'error':
      return { label: '❌ Error', class: 'status-error' };
    default:
      return { label: status, class: 'status-starting' };
  }
}

// Update or add a session card in UI
function updateSessionCard(sessionId, status, message, extra = {}) {
  if (status === 'closed') {
    activeSessionsMap.delete(sessionId);
    const existingCard = document.getElementById(`card-${sessionId}`);
    if (existingCard) existingCard.remove();
    updateActiveCount();
    return;
  }

  let session = activeSessionsMap.get(sessionId);
  if (!session) {
    session = {
      id: sessionId,
      name: extra.name || `Session ${activeSessionsMap.size + 1}`,
      status: status,
      message: message
    };
    activeSessionsMap.set(sessionId, session);
  } else {
    session.status = status;
    session.message = message;
    if (extra.name) session.name = extra.name;
  }

  updateActiveCount();

  let card = document.getElementById(`card-${sessionId}`);
  const badgeInfo = getStatusBadge(status);

  if (!card) {
    emptySessionsState.style.display = 'none';
    card = document.createElement('div');
    card.id = `card-${sessionId}`;
    card.className = 'session-card';
    card.innerHTML = `
      <div class="session-card-info">
        <div class="session-avatar">${session.name.substring(0, 2).toUpperCase()}</div>
        <div class="session-meta">
          <h4>${escapeHtml(session.name)}</h4>
          <span class="card-message">${escapeHtml(message)}</span>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="session-status-badge ${badgeInfo.class}">${badgeInfo.label}</span>
        <button class="btn-close-session" title="Close this session" data-id="${sessionId}">✕</button>
      </div>
    `;

    card.querySelector('.btn-close-session').addEventListener('click', () => {
      closeSession(sessionId);
    });

    sessionCardsGrid.appendChild(card);
  } else {
    const badge = card.querySelector('.session-status-badge');
    badge.className = `session-status-badge ${badgeInfo.class}`;
    badge.innerText = badgeInfo.label;
    card.querySelector('.card-message').innerText = message;
  }
}

function updateActiveCount() {
  const count = activeSessionsMap.size;
  activeCountBadge.innerText = `${count} Active`;
  if (count === 0) {
    emptySessionsState.style.display = 'flex';
  } else {
    emptySessionsState.style.display = 'none';
  }
}

// Close single session
async function closeSession(id) {
  try {
    await fetch(`/api/sessions/${encodeURIComponent(id)}/close`, { method: 'POST' });
    appendLog(`Requested closure of session ${id}`, 'info');
  } catch (e) {
    console.error(e);
  }
}

// Stop all sessions
btnStopAll.addEventListener('click', async () => {
  btnStopAll.innerText = 'Closing All...';
  try {
    const res = await fetch('/api/sessions/close-all', { method: 'POST' });
    const data = await res.json();
    appendLog('Terminated all active Zoom Chrome sessions.', 'warning');
    activeSessionsMap.clear();
    sessionCardsGrid.querySelectorAll('.session-card').forEach(c => c.remove());
    updateActiveCount();
  } catch (e) {
    appendLog(`Error closing sessions: ${e.message}`, 'error');
  } finally {
    btnStopAll.innerText = '⏹ Stop & Close All Active Sessions';
  }
});

// Launch All Sessions
btnLaunchAll.addEventListener('click', async () => {
  const url = meetingUrlInput.value.trim();
  const passcode = meetingPasscodeInput.value.trim();

  if (!url) {
    alert('Please enter a valid Zoom meeting or registration URL!');
    meetingUrlInput.focus();
    return;
  }

  // Visual button state
  btnLaunchAll.disabled = true;
  btnLaunchAll.style.opacity = '0.7';
  btnLaunchText.innerText = 'LAUNCHING SESSIONS...';

  appendLog(`Initiating multi-session launch for ${participants.length} users...`, 'info');

  try {
    const res = await fetch('/api/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        passcode,
        participants,
        muteAudio: muteAudioToggle.checked,
        muteVideo: muteVideoToggle.checked
      })
    });

    const data = await res.json();
    if (res.ok) {
      appendLog(`Successfully triggered ${participants.length} sessions! Opening Chrome windows...`, 'success');
    } else {
      appendLog(`Launch failed: ${data.error}`, 'error');
    }
  } catch (err) {
    appendLog(`Launch error: ${err.message}`, 'error');
  } finally {
    setTimeout(() => {
      btnLaunchAll.disabled = false;
      btnLaunchAll.style.opacity = '1';
      btnLaunchText.innerText = `LAUNCH ${sessionCount} ZOOM SESSIONS`;
    }, 2500);
  }
});

// Connect to Server-Sent Events (SSE) for real-time live updates
function connectSSE() {
  const eventSource = new EventSource('/api/events');

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'connected') return;

      if (data.type === 'file_updated' && data.participants) {
        participants = data.participants;
        sessionCount = participants.length;

        // Update count buttons
        countButtons.forEach(b => {
          b.classList.remove('active', 'active-gold');
          if (parseInt(b.dataset.count, 10) === sessionCount) {
            b.classList.add(sessionCount >= 5 ? 'active-gold' : 'active');
          }
        });
        btnLaunchText.innerText = `LAUNCH ${sessionCount} ZOOM SESSIONS`;

        renderParticipants();
        appendLog(`⚡ participants.txt changed on disk! UI updated live with ${participants.length} sessions.`, 'success');
        return;
      }

      if (data.sessionId) {
        updateSessionCard(data.sessionId, data.status, data.message, data);

        let logType = 'info';
        if (data.status === 'in_meeting') logType = 'success';
        if (data.status === 'error') logType = 'error';
        if (data.status === 'waiting_room' || data.status === 'warning') logType = 'warning';

        appendLog(`[${data.name || data.sessionId}] ${data.message}`, logType);
      }
    } catch (e) {
      console.error('SSE parse error:', e);
    }
  };

  eventSource.onerror = () => {
    // Retry connection automatically
    eventSource.close();
    setTimeout(connectSSE, 3000);
  };
}

// Initial setup
initParticipants(sessionCount);
loadFromFile(false);
btnLaunchText.innerText = `LAUNCH ${sessionCount} ZOOM SESSIONS`;
connectSSE();
