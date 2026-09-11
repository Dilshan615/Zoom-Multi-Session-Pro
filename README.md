# 🚀 Zoom Multi-Session Pro

<p align="center">
  <img src="https://img.shields.io/badge/Version-0.1.01-blue.svg" alt="Version" />
  <img src="https://img.shields.io/badge/Node.js-v18%2B-green.svg" alt="Node.js" />
  <img src="https://img.shields.io/badge/Playwright-Automated-orange.svg" alt="Playwright" />
  <img src="https://img.shields.io/badge/Browser-Google%20Chrome-4285F4.svg" alt="Chrome" />
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License" />
</p>

An automated, multi-participant Zoom joining tool that fills registration/join forms and launches **multiple simultaneous Zoom sessions (4 to 5+ sessions)** inside Google Chrome tabs with **a single button click**.

> 🇱🇰 **සිංහල සාරාංශය**: එකම පරිගණකයෙන් එකවර Zoom Sessions 4ක් හෝ 5ක් ස්වයංක්‍රීයව (Auto) Form Fill කර (First Name, Last Name, Email, NIC Number, Contact Number) Chrome Tabs හරහා එක ක්ලික් එකෙන් Join කරවන සහ Camera/Mic 100% Mute කර තබන Bot එකක්.

---

## 🌟 Key Features (ප්‍රධාන විශේෂාංග)

### 1. 📑 Chrome Multi-Tab Architecture
- Instead of opening 5 separate browser windows that clutter your screen, all participants open as **separate Tabs in a single maximized Google Chrome window** (`Tab 1: Student 1`, `Tab 2: Student 2`, `Tab 3: Student 3`...).
- Easily switch between participant tabs just like normal browsing.

### 2. ✍️ Automatic Registration & Form Filling
- Automatically detects and fills all standard and custom Zoom registration fields:
  - **First Name \***
  - **Last Name \***
  - **Email Address \***
  - **NIC Number \*** (Custom Zoom Question)
  - **Contact Number \*** (Custom Zoom Question)
- Automatically clicks **Register / Submit**, obtains the join token, and connects directly to the Zoom meeting room!

### 3. 🔒 100% Guaranteed Microphone & Camera Hardware Block
- **4-Layer Security Protection**:
  1. **JavaScript Hardware Block**: Overrides `navigator.mediaDevices.getUserMedia` at browser init to reject any mic/cam access with `NotAllowedError`.
  2. **Zero Permissions**: Chromium launches with `--deny-permission-prompts` and zero device permissions granted.
  3. **Pre-Join Force-Mute**: Forcefully checks *"Don't connect to audio"* and *"Turn off my video"* on Zoom's join preview screen.
  4. **Active Meeting Watcher**: Monitors meeting status and automatically dismisses *"Join Audio"* dialogs and mutes any active mic/camera buttons.

### 4. 🔄 Real-Time Live File Sync (`participants.txt`)
- All participant details are saved in a simple, human-readable text file: [`participants.txt`](participants.txt).
- **Edit in Notepad**: Whenever you edit and save (Ctrl + S) `participants.txt`, the Dashboard updates **instantly in real-time** without needing to refresh the browser!
- **Auto-Save**: Changes typed in the Web Dashboard are automatically written back to `participants.txt`.

### 5. 🚪 Graceful Meeting Leave & Force-Close
- Clicking **"⏹ Stop & Close All Active Sessions"** automatically clicks the Zoom meeting *"Leave Meeting"* button and closes all tabs/browser cleanly without getting stuck on *"Are you sure you want to leave?"* confirmation dialogs.

### 6. 📊 Real-Time Live Dashboard
- Modern dark-mode glassmorphism interface running locally at `http://localhost:3000`.
- Live session cards showing real-time status: `Starting` ➔ `Opening Zoom` ➔ `Auto-Filling Form` ➔ `In Waiting Room` ➔ `Inside Meeting`.
- Terminal console with colored activity logs and individual session close buttons.

---

## 📁 Project Structure

```text
├── automation/
│   └── zoomBot.js        # Playwright Chrome automation engine
├── public/
│   ├── index.html        # Glassmorphism dashboard UI
│   ├── style.css         # Modern dark luxury design & animations
│   └── app.js            # Frontend logic & SSE real-time sync
├── dataManager.js        # File parser, serializer & live file watcher
├── participants.txt      # Text file storing participant details
├── server.js             # Express backend with SSE streaming
├── start.bat             # Double-clickable Windows launcher
├── package.json          # Node dependencies
└── .gitignore            # Git ignore rules
```

---

## 🚀 Getting Started (භාවිතා කරන ආකාරය)

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher installed)
- [Google Chrome](https://www.google.com/chrome/) installed on your PC

### Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/Dilshan615/Zoom-Multi-Session-Pro.git
cd Zoom-Multi-Session-Pro
npm install
```

### Launching the Application
You can start the tool with one double-click:
- Double-click **`start.bat`** in the project folder.

*(Or run via terminal: `npm start` and visit `http://localhost:3000`)*

---

## 📝 Configuring `participants.txt`

You can edit [`participants.txt`](participants.txt) in **Notepad** anytime. Example format:

```text
# ==========================================
# Zoom Multi-Session Participant Details
# You can edit this file directly in Notepad!
# ==========================================

[Session 1]
First Name: Dilshan
Last Name: Dinuja
Email: gamagedinuja842@gmail.com
NIC Number: 200516703056
Contact Number: 0703026293

[Session 2]
First Name: Kasun
Last Name: Perera
Email: kasun.p@gmail.com
NIC Number: 199824501234
Contact Number: 0771234567

[Session 3]
First Name: Nuwan
Last Name: Silva
Email: nuwan.s@gmail.com
NIC Number: 199934102345
Contact Number: 0712345678

[Session 4]
First Name: Chamara
Last Name: Bandara
Email: chamara.b@gmail.com
NIC Number: 199745204567
Contact Number: 0784567890

[Session 5]
First Name: Kavindu
Last Name: Senanayake
Email: kavindu.s@gmail.com
NIC Number: 200156305678
Contact Number: 0755678901
```

---

## 🎯 How to Join a Meeting

1. Open the dashboard at `http://localhost:3000`.
2. Paste your **Zoom URL** (Meeting link `zoom.us/j/...` or Registration link `zoom.us/meeting/register/...`).
3. Enter the **Passcode** (if not included in the link).
4. Choose the number of sessions (**1 to 6**).
5. Click **"🚀 LAUNCH ZOOM SESSIONS"**.
6. Chrome will open, auto-fill all forms, and connect all accounts simultaneously!

---

## 🛠️ Built With

- **[Node.js](https://nodejs.org/)** - Backend runtime
- **[Express](https://expressjs.com/)** - Local API & SSE server
- **[Playwright](https://playwright.dev/)** - Browser automation
- **[Google Chrome](https://www.google.com/chrome/)** - Multi-tab web engine
- **HTML5 & Vanilla CSS** - Modern Glassmorphism responsive UI

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
