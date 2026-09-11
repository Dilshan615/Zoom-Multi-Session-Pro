const { chromium } = require('playwright');

class ZoomMultiManager {
  constructor() {
    this.browser = null;
    this.context = null;
    this.sessions = new Map(); // id -> { id, name, email, page, status, startedAt }
    this.statusListeners = new Set();
  }

  onStatus(callback) {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  notify(sessionId, status, message, extra = {}) {
    const payload = {
      sessionId,
      status,
      message,
      timestamp: new Date().toLocaleTimeString(),
      ...extra
    };
    for (const listener of this.statusListeners) {
      try {
        listener(payload);
      } catch (err) {
        console.error('Error notifying listener:', err);
      }
    }
  }

  /**
   * Ensure a single Chrome browser window is running with isolated permissions
   */
  async getOrCreateBrowser() {
    if (!this.browser || !this.browser.isConnected()) {
      const launchOptions = {
        headless: false,
        channel: 'chrome',
        args: [
          '--start-maximized',
          '--disable-blink-features=AutomationControlled',
          '--no-first-run',
          '--no-default-browser-check',
          '--deny-permission-prompts',
          '--autoplay-policy=user-gesture-required'
        ]
      };

      try {
        this.browser = await chromium.launch(launchOptions);
      } catch (e) {
        this.browser = await chromium.launch({
          ...launchOptions,
          executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        });
      }

      this.context = await this.browser.newContext({
        viewport: null, // Full natural maximized screen
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        permissions: [] // Zero permissions for camera and mic
      });

      // Strict hardware media device block: camera & mic can NEVER be opened
      await this.context.addInitScript(() => {
        if (navigator.mediaDevices) {
          navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Camera and Microphone are strictly blocked.', 'NotAllowedError'));
          navigator.mediaDevices.enumerateDevices = async () => [];
        }
        if (navigator.getUserMedia) {
          navigator.getUserMedia = (c, s, e) => { if (e) e(new DOMException('Camera and Microphone are strictly blocked.', 'NotAllowedError')); };
        }
        if (navigator.webkitGetUserMedia) {
          navigator.webkitGetUserMedia = (c, s, e) => { if (e) e(new DOMException('Camera and Microphone are strictly blocked.', 'NotAllowedError')); };
        }
      });

      this.browser.on('disconnected', () => {
        this.browser = null;
        this.context = null;
        for (const [id] of this.sessions.entries()) {
          this.notify(id, 'closed', 'Chrome window was closed.');
        }
        this.sessions.clear();
      });
    }
    return { browser: this.browser, context: this.context };
  }

  /**
   * Helper to normalize Zoom URL into web client join format if direct meeting
   */
  normalizeZoomUrl(rawUrl, passcode = '') {
    let url = rawUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // Check if it is a registration link
    if (url.includes('/meeting/register/') || url.includes('/webinar/register/') || url.includes('/register/')) {
      return { type: 'registration', url };
    }

    // Check if already web client join
    if (url.includes('/wc/') && url.includes('/join')) {
      return { type: 'web_client', url };
    }

    // Handle meeting link e.g. https://us04web.zoom.us/j/123456789?pwd=xxx
    const match = url.match(/\/j\/([0-9]+)/);
    if (match && match[1]) {
      const meetingId = match[1];
      const urlObj = new URL(url);
      const pwd = urlObj.searchParams.get('pwd') || passcode || '';
      let wcUrl = `https://app.zoom.us/wc/${meetingId}/join`;
      if (pwd) {
        wcUrl += `?pwd=${encodeURIComponent(pwd)}`;
      }
      return { type: 'web_client', url: wcUrl };
    }

    // Fallback: standard direct link
    return { type: 'direct', url };
  }

  /**
   * Start a single Zoom participant session as a new TAB in the Chrome window
   */
  async launchSession(sessionConfig, index, total) {
    const sessionId = sessionConfig.id || `session_${Date.now()}_${index + 1}`;
    const name = sessionConfig.name || `User ${index + 1}`;
    const email = sessionConfig.email || `user${index + 1}@example.com`;
    const rawUrl = sessionConfig.url;
    const passcode = sessionConfig.passcode || '';
    const muteAudio = sessionConfig.muteAudio !== false;
    const muteVideo = sessionConfig.muteVideo !== false;

    this.notify(sessionId, 'starting', `Opening Chrome Tab #${index + 1} for ${name}...`, { name });

    try {
      const { context } = await this.getOrCreateBrowser();

      // Open a new tab in the Chrome window
      let page;
      const existingPages = context.pages();
      if (index === 0 && existingPages.length === 1 && existingPages[0].url() === 'about:blank') {
        page = existingPages[0];
      } else {
        page = await context.newPage();
      }

      this.sessions.set(sessionId, {
        id: sessionId,
        name,
        email,
        page,
        status: 'running',
        startedAt: new Date()
      });

      // Automatically accept any leave meeting / alert dialogs
      page.on('dialog', async dialog => {
        try {
          await dialog.accept();
        } catch (e) {}
      });

      page.on('close', () => {
        if (this.sessions.has(sessionId)) {
          this.sessions.delete(sessionId);
          this.notify(sessionId, 'closed', `Tab for ${name} closed.`);
        }
      });

      // Handle target link
      const parsed = this.normalizeZoomUrl(rawUrl, passcode);

      if (parsed.type === 'registration') {
        await this.handleRegistrationFlow(sessionId, page, parsed.url, {
          firstName: sessionConfig.firstName || name.split(' ')[0] || 'User',
          lastName: sessionConfig.lastName || name.split(' ').slice(1).join(' ') || 'Participant',
          email: sessionConfig.email || email,
          nic: sessionConfig.nic || '',
          phone: sessionConfig.phone || ''
        }, passcode);
      } else {
        await this.handleWebJoinFlow(sessionId, page, parsed.url, name, passcode, muteAudio, muteVideo);
      }

      return { success: true, sessionId };
    } catch (err) {
      console.error(`Session ${sessionId} error:`, err);
      this.notify(sessionId, 'error', `Error: ${err.message}`, { error: err.message });
      return { success: false, sessionId, error: err.message };
    }
  }

  /**
   * Handles Zoom Registration Form Flow (e.g. /meeting/register/...)
   */
  async handleRegistrationFlow(sessionId, page, regUrl, participant, passcode) {
    const { firstName, lastName, email, nic, phone } = participant;
    const fullName = `${firstName} ${lastName}`.trim();

    this.notify(sessionId, 'navigating', `Opening Zoom Registration page...`, { name: fullName });
    await page.goto(regUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Handle cookie banner if present
    await this.dismissCookieBanners(page);

    this.notify(sessionId, 'filling_form', `Filling registration form for ${fullName}...`);

    try {
      // 1. Fill First Name
      const fnSelectors = [
        'input[name="first_name"]',
        '#first_name',
        'input[id*="first_name" i]',
        'input[placeholder*="First Name" i]',
        'input[aria-label*="First Name" i]'
      ];
      for (const sel of fnSelectors) {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          await el.fill(firstName);
          break;
        }
      }

      // 2. Fill Last Name
      const lnSelectors = [
        'input[name="last_name"]',
        '#last_name',
        'input[id*="last_name" i]',
        'input[placeholder*="Last Name" i]',
        'input[aria-label*="Last Name" i]'
      ];
      for (const sel of lnSelectors) {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          await el.fill(lastName);
          break;
        }
      }

      // 3. Fill Email Address
      const emailSelectors = [
        'input[name="email"]',
        '#email',
        'input[id*="email" i]',
        'input[placeholder*="company.com" i]',
        'input[placeholder*="Email" i]',
        'input[type="email"]'
      ];
      for (const sel of emailSelectors) {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          await el.fill(email);
          break;
        }
      }

      // 4. Confirm Email (if exists)
      const confEmailSelectors = [
        'input[name="confirm_email"]',
        '#confirm_email',
        'input[id*="confirm_email" i]',
        'input[placeholder*="Confirm Email" i]'
      ];
      for (const sel of confEmailSelectors) {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          await el.fill(email);
          break;
        }
      }

      // 5. Fill NIC Number (Custom Field)
      if (nic) {
        this.notify(sessionId, 'filling_form', `Filling NIC Number (${nic})...`);
        let nicFilled = false;

        // Try label matching: Find label with text containing 'NIC'
        try {
          const nicLabel = page.locator('label:has-text("NIC")').first();
          if (await nicLabel.count() > 0) {
            // Find input associated with label
            const forAttr = await nicLabel.getAttribute('for');
            if (forAttr) {
              const inputByFor = await page.$(`#${forAttr}`);
              if (inputByFor) {
                await inputByFor.fill(nic);
                nicFilled = true;
              }
            }
            if (!nicFilled) {
              // Look within same parent container
              const inputNear = nicLabel.locator('xpath=following::input[1]');
              if (await inputNear.count() > 0) {
                await inputNear.fill(nic);
                nicFilled = true;
              }
            }
          }
        } catch (e) {}

        // Fallback selectors for NIC
        if (!nicFilled) {
          const nicDirect = await page.$('input[placeholder*="NIC" i], input[aria-label*="NIC" i], input[name*="nic" i], input[id*="nic" i]');
          if (nicDirect) {
            await nicDirect.fill(nic);
            nicFilled = true;
          }
        }
      }

      // 6. Fill Contact Number (Custom Field)
      if (phone) {
        this.notify(sessionId, 'filling_form', `Filling Contact Number (${phone})...`);
        let phoneFilled = false;

        // Try label matching: Find label with text containing 'Contact' or 'Phone' or 'Mobile'
        try {
          const phoneLabel = page.locator('label:has-text("Contact"), label:has-text("Phone"), label:has-text("Mobile")').first();
          if (await phoneLabel.count() > 0) {
            const forAttr = await phoneLabel.getAttribute('for');
            if (forAttr) {
              const inputByFor = await page.$(`#${forAttr}`);
              if (inputByFor) {
                await inputByFor.fill(phone);
                phoneFilled = true;
              }
            }
            if (!phoneFilled) {
              const inputNear = phoneLabel.locator('xpath=following::input[1]');
              if (await inputNear.count() > 0) {
                await inputNear.fill(phone);
                phoneFilled = true;
              }
            }
          }
        } catch (e) {}

        // Fallback selectors for Contact Number
        if (!phoneFilled) {
          const phoneDirect = await page.$('input[placeholder*="Contact" i], input[aria-label*="Contact" i], input[placeholder*="Phone" i], input[type="tel"]');
          if (phoneDirect) {
            await phoneDirect.fill(phone);
            phoneFilled = true;
          }
        }
      }

      // Short pause before submitting so user or Zoom validation catches it cleanly
      await page.waitForTimeout(800);

      this.notify(sessionId, 'submitting', `Submitting registration form...`);

      // Find submit button
      const submitSelectors = [
        '#btnSubmit',
        'button[type="submit"]',
        'button:has-text("Register")',
        'button:has-text("Submit")',
        'input[type="submit"]'
      ];
      let submitted = false;
      for (const sel of submitSelectors) {
        const btn = await page.$(sel);
        if (btn && await btn.isVisible()) {
          await btn.click();
          submitted = true;
          break;
        }
      }

      this.notify(sessionId, 'registered', `Registration submitted! Checking for join link...`);
      await page.waitForTimeout(2000);

      // Wait for link on confirmation page: "Click here to join" or join link
      const joinLinkSelector = 'a:has-text("Click here to join"), a:has-text("Join meeting"), a[href*="/j/"], a[href*="/w/"], a[href*="/wc/"]';
      try {
        await page.waitForSelector(joinLinkSelector, { timeout: 15000 });
        const joinLinkElement = await page.$(joinLinkSelector);
        if (joinLinkElement) {
          const joinHref = await joinLinkElement.getAttribute('href');
          if (joinHref) {
            this.notify(sessionId, 'joining', `Join link found! Connecting to meeting...`);
            const parsed = this.normalizeZoomUrl(joinHref, passcode);
            await this.handleWebJoinFlow(sessionId, page, parsed.url, fullName, passcode);
            return;
          }
        }
      } catch (e) {
        console.log('No direct join link selector found after registration, staying on page:', e.message);
      }

      this.notify(sessionId, 'ready', `Registration completed! Browser window is ready.`);
    } catch (err) {
      console.warn(`Registration form auto-fill issue: ${err.message}`);
      this.notify(sessionId, 'warning', `Form interaction notice: ${err.message}`);
    }
  }

  /**
   * Handles Direct Zoom Web Client Join Flow
   */
  async handleWebJoinFlow(sessionId, page, joinUrl, displayName, passcode, muteAudio = true, muteVideo = true) {
    this.notify(sessionId, 'navigating', `Loading Zoom Web Client...`);
    
    // If given regular /j/ link, try to ensure we open the web client
    let targetUrl = joinUrl;
    if (targetUrl.includes('/j/') && !targetUrl.includes('/wc/')) {
      targetUrl = targetUrl.replace('/j/', '/wc/join/');
    }

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Handle cookie banner
    await this.dismissCookieBanners(page);

    // If redirected to zoom launch helper page, look for "Join from your browser" link
    const browserJoinLink = await page.$('a:has-text("Join from your browser"), a[href*="/wc/"]');
    if (browserJoinLink) {
      this.notify(sessionId, 'redirecting', `Clicking "Join from your browser"...`);
      await browserJoinLink.click();
      await page.waitForLoadState('domcontentloaded');
    }

    this.notify(sessionId, 'filling_name', `Entering display name: "${displayName}"...`);

    // Wait for the Name Input
    const nameSelector = '#input-for-name, #inputname, input[name="inputname"], input[placeholder*="name" i], input[aria-label*="Name" i]';
    try {
      await page.waitForSelector(nameSelector, { timeout: 20000 });
      const nameInput = await page.$(nameSelector);
      if (nameInput) {
        await nameInput.click();
        await nameInput.fill('');
        await nameInput.fill(displayName);
      }
    } catch (e) {
      console.log('Name field not found immediately, checking if already past name screen...');
    }

    // Passcode if field exists
    if (passcode) {
      const pwdSelector = '#input-for-pwd, #inputpasscode, input[name="inputpasscode"], input[type="password"]';
      const pwdInput = await page.$(pwdSelector);
      if (pwdInput) {
        await pwdInput.fill(passcode);
      }
    }

    // Strict Audio & Video mute options on preview screen
    try {
      // 1. Force check "Don't connect to audio"
      const audioSelectors = [
        'input[id*="audio" i]',
        'label:has-text("Don\'t connect to audio") input',
        'label:has-text("Do not connect to audio") input',
        'input[aria-label*="audio" i]'
      ];
      for (const sel of audioSelectors) {
        const audioCheckbox = await page.$(sel);
        if (audioCheckbox) {
          const isChecked = await audioCheckbox.isChecked();
          if (!isChecked) await audioCheckbox.check();
          break;
        }
      }

      // 2. Force check "Turn off my video"
      const videoSelectors = [
        'input[id*="video" i]',
        'label:has-text("Turn off my video") input',
        'input[aria-label*="video" i]'
      ];
      for (const sel of videoSelectors) {
        const videoCheckbox = await page.$(sel);
        if (videoCheckbox) {
          const isChecked = await videoCheckbox.isChecked();
          if (!isChecked) await videoCheckbox.check();
          break;
        }
      }
    } catch (e) {
      // Non-fatal
    }

    // Click Join Button
    this.notify(sessionId, 'joining', `Clicking Join button...`);
    const joinBtnSelector = 'button.btn-join, #preview-join-button, button:has-text("Join"), button[type="submit"]';
    try {
      const joinBtn = await page.$(joinBtnSelector);
      if (joinBtn) {
        await joinBtn.click();
      }
    } catch (e) {
      console.log('Join button click error:', e.message);
    }

    // Handle "Terms of Service / Privacy Policy" popups if they appear
    setTimeout(async () => {
      try {
        const agreeBtn = await page.$('button:has-text("I Agree"), button:has-text("Agree"), button:has-text("Accept")');
        if (agreeBtn) {
          await agreeBtn.click();
        }
      } catch (e) {}
    }, 1500);

    // Continuous status monitor for 60 seconds
    this.monitorMeetingStatus(sessionId, page);
  }

  async dismissCookieBanners(page) {
    try {
      const cookieSelectors = [
        '#onetrust-accept-btn-handler',
        'button:has-text("Accept Cookies")',
        'button:has-text("Accept All Cookies")',
        'button:has-text("OK")',
        'button:has-text("I Agree")'
      ];
      for (const sel of cookieSelectors) {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          await el.click();
          break;
        }
      }
    } catch (e) {}
  }

  async monitorMeetingStatus(sessionId, page) {
    let checks = 0;
    const interval = setInterval(async () => {
      checks++;
      if (checks > 30 || !this.sessions.has(sessionId)) {
        clearInterval(interval);
        return;
      }

      try {
        if (page.isClosed()) {
          this.notify(sessionId, 'closed', 'Browser window was closed.');
          this.sessions.delete(sessionId);
          clearInterval(interval);
          return;
        }

        const pageContent = await page.content();

        if (pageContent.includes('Please wait, the meeting host will let you in soon') ||
            pageContent.includes('Waiting for the host') ||
            pageContent.includes('waiting room')) {
          this.notify(sessionId, 'waiting_room', '⏳ In Waiting Room (Waiting for host to admit)...');
        } else if (pageContent.includes('Join Audio') || 
                   pageContent.includes('meeting-client') || 
                   pageContent.includes('footer-button__button') || 
                   pageContent.includes('participants-section')) {
          this.notify(sessionId, 'in_meeting', '✅ Connected! Inside the Zoom Meeting.');

          // Actively enforce camera & mic remain strictly OFF inside meeting
          try {
            const muteMicBtn = await page.$('button[aria-label*="mute my microphone" i], button.footer-button__button:has-text("Mute")');
            if (muteMicBtn) await muteMicBtn.click();

            const stopVidBtn = await page.$('button[aria-label*="stop video" i], button.footer-button__button:has-text("Stop Video")');
            if (stopVidBtn) await stopVidBtn.click();

            const dismissAudio = await page.$('button[aria-label="Close"], .join-audio-container button:has-text("Cancel"), button.close');
            if (dismissAudio && await dismissAudio.isVisible()) await dismissAudio.click();
          } catch (e) {}
        } else if (pageContent.includes('Meeting password is wrong') || pageContent.includes('Incorrect passcode')) {
          this.notify(sessionId, 'error', '❌ Incorrect meeting passcode.');
          clearInterval(interval);
        }
      } catch (e) {
        // Page navigation or closed
      }
    }, 3000);
  }

  async closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session && session.page) {
      try {
        if (!session.page.isClosed()) {
          // Attempt to gracefully click Zoom's Leave button
          try {
            const leaveBtn = await session.page.$('button:has-text("Leave"), [aria-label*="Leave" i], button.footer-button__button--leave');
            if (leaveBtn) {
              await leaveBtn.click();
              const confirmBtn = await session.page.$('button:has-text("Leave Meeting"), button.leave-meeting-options__btn');
              if (confirmBtn) await confirmBtn.click();
            }
          } catch (e) {}

          // Forcefully close tab without blocking on beforeunload
          await session.page.close({ runBeforeUnload: false });
        }
      } catch (e) {}
      this.sessions.delete(sessionId);
      this.notify(sessionId, 'closed', `Left Zoom meeting & closed tab for ${session.name}.`);
      return true;
    }
    return false;
  }

  async closeAllSessions() {
    // 1. Leave Zoom meeting on each active page
    for (const [id, session] of this.sessions.entries()) {
      if (session && session.page) {
        try {
          if (!session.page.isClosed()) {
            try {
              const leaveBtn = await session.page.$('button:has-text("Leave"), [aria-label*="Leave" i], button.footer-button__button--leave');
              if (leaveBtn) {
                await leaveBtn.click();
                const confirmBtn = await session.page.$('button:has-text("Leave Meeting"), button.leave-meeting-options__btn');
                if (confirmBtn) await confirmBtn.click();
              }
            } catch (e) {}
            await session.page.close({ runBeforeUnload: false });
          }
        } catch (e) {}
      }
      this.notify(id, 'closed', 'Left Zoom meeting.');
    }

    // 2. Close all pages in the context
    if (this.context) {
      try {
        for (const p of this.context.pages()) {
          try {
            await p.close({ runBeforeUnload: false });
          } catch (e) {}
        }
        await this.context.close();
      } catch (e) {}
      this.context = null;
    }

    // 3. Close the Chrome browser process
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {}
      this.browser = null;
    }

    this.sessions.clear();
  }

  getActiveSessions() {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      name: s.name,
      email: s.email,
      status: s.status,
      startedAt: s.startedAt
    }));
  }
}

module.exports = new ZoomMultiManager();
