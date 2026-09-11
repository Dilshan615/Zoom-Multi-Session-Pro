const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'participants.txt');

/**
 * Format participants array to readable text file content
 */
function serializeParticipants(participants) {
  let content = `# ==========================================\n`;
  content += `# Zoom Multi-Session Participant Details\n`;
  content += `# You can edit this file directly in Notepad!\n`;
  content += `# ==========================================\n\n`;

  participants.forEach((p, idx) => {
    content += `[Session ${idx + 1}]\n`;
    content += `First Name: ${p.firstName || ''}\n`;
    content += `Last Name: ${p.lastName || ''}\n`;
    content += `Email: ${p.email || ''}\n`;
    content += `NIC Number: ${p.nic || ''}\n`;
    content += `Contact Number: ${p.phone || ''}\n\n`;
  });

  return content;
}

/**
 * Parse text file content into participants array
 */
function parseParticipants(text) {
  const participants = [];
  const lines = text.split(/\r?\n/);

  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Check session section header e.g. [Session 1] or [Participant 1]
    const headerMatch = trimmed.match(/^\[.*?(?:Session|Participant)?\s*([0-9]+)?.*?\]/i);
    if (headerMatch) {
      if (current) {
        participants.push(current);
      }
      current = {
        firstName: '',
        lastName: '',
        email: '',
        nic: '',
        phone: '',
        name: ''
      };
      continue;
    }

    if (!current) {
      current = {
        firstName: '',
        lastName: '',
        email: '',
        nic: '',
        phone: '',
        name: ''
      };
    }

    // Key-value pairs
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex !== -1) {
      const key = trimmed.substring(0, colonIndex).trim().toLowerCase();
      const val = trimmed.substring(colonIndex + 1).trim();

      if (key.includes('first')) {
        current.firstName = val;
      } else if (key.includes('last')) {
        current.lastName = val;
      } else if (key.includes('email')) {
        current.email = val;
      } else if (key.includes('nic')) {
        current.nic = val;
      } else if (key.includes('contact') || key.includes('phone') || key.includes('mobile')) {
        current.phone = val;
      } else if (key === 'name') {
        current.name = val;
      }
    }
  }

  if (current && (current.firstName || current.lastName || current.email || current.nic || current.phone)) {
    current.name = `${current.firstName} ${current.lastName}`.trim();
    participants.push(current);
  }

  // Ensure 'name' is set for all
  participants.forEach(p => {
    if (!p.name) p.name = `${p.firstName || ''} ${p.lastName || ''}`.trim();
  });

  return participants;
}

let isInternalSaving = false;

function saveParticipantsToFile(participants) {
  try {
    isInternalSaving = true;
    const content = serializeParticipants(participants);
    fs.writeFileSync(FILE_PATH, content, 'utf8');
    setTimeout(() => { isInternalSaving = false; }, 600);
    return { success: true, filePath: FILE_PATH };
  } catch (err) {
    isInternalSaving = false;
    console.error('Error writing participants.txt:', err);
    return { success: false, error: err.message };
  }
}

function loadParticipantsFromFile() {
  try {
    if (!fs.existsSync(FILE_PATH)) {
      return { success: false, error: 'File not found' };
    }
    const text = fs.readFileSync(FILE_PATH, 'utf8');
    const participants = parseParticipants(text);
    return { success: true, participants };
  } catch (err) {
    console.error('Error reading participants.txt:', err);
    return { success: false, error: err.message };
  }
}

function watchParticipantsFile(onChange) {
  let debounceTimer = null;
  try {
    fs.watch(FILE_PATH, (eventType) => {
      if (isInternalSaving) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const result = loadParticipantsFromFile();
        if (result.success && onChange) {
          onChange(result.participants);
        }
      }, 300);
    });
  } catch (e) {
    console.error('File watch error:', e);
  }
}

module.exports = {
  FILE_PATH,
  saveParticipantsToFile,
  loadParticipantsFromFile,
  watchParticipantsFile,
  serializeParticipants,
  parseParticipants
};
