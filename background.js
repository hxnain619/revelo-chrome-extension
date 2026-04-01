// background.js - Service worker
// Sets up a repeating alarm every 10 minutes to trigger the content script check

const ALARM_NAME = "revelo-task-check";
const INTERVAL_MINUTES = 10;

const TARGET_PROJECTS = [
  "Single HTML Interfaces",
  "Single HTML Interfaces - Chocolate",
];

// On install/startup, create the alarm
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 0.1, // first run shortly after install
    periodInMinutes: INTERVAL_MINUTES,
  });
  log("Alarm created — checking every 5 minutes.");
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.get(ALARM_NAME, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: 0.1,
        periodInMinutes: INTERVAL_MINUTES,
      });
    }
  });
});

// When alarm fires, find the active Revelo tab and run the check
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  const { monitoringStopped } =
    await chrome.storage.local.get("monitoringStopped");
  if (monitoringStopped) {
    log("Alarm fired but monitoring is paused — skipping.");
    return;
  }
  log("Alarm fired — scanning Revelo tabs...");
  await runCheck();
  chrome.storage.local.set({ lastRun: Date.now() });
});

// Handle manual "Run Now" and stop/resume from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "run-now") {
    log("Manual run triggered from popup.");
    runCheck().then(() => {
      chrome.storage.local.set({ lastRun: Date.now() });
      sendResponse({ ok: true });
    });
    return true; // keep channel open for async response
  }
  if (message.action === "stop-monitoring") {
    log("Monitoring stopped by user.");
    sendResponse({ ok: true });
  }
  if (message.action === "resume-monitoring") {
    log("Monitoring resumed by user.");
    sendResponse({ ok: true });
  }
});

async function runCheck() {
  const tabs = await chrome.tabs.query({ url: "*://*.revelo.com/*" });
  if (tabs.length === 0) {
    log("No Revelo tabs found.");
    return;
  }

  for (const tab of tabs) {
    try {
      log(`Reloading tab ${tab.id} to fetch fresh API data...`);
      await chrome.tabs.reload(tab.id);
      // Wait for the tab to finish loading before injecting
      await new Promise((resolve) => {
        function onUpdated(tabId, info) {
          if (tabId === tab.id && info.status === "complete") {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            resolve();
          }
        }
        chrome.tabs.onUpdated.addListener(onUpdated);
        // Safety timeout: proceed after 15s even if event never fires
        setTimeout(resolve, 15000);
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: contentScriptCheck,
        args: [TARGET_PROJECTS],
      });
    } catch (err) {
      log(`Failed to inject into tab ${tab.id}: ${err.message}`);
    }
  }
}

// This function is injected into the page context
function contentScriptCheck(targetProjects) {
  const LOG_PREFIX = "[Revelo Auto Task]";

  function log(msg) {
    console.log(`${LOG_PREFIX} ${msg}`);
  }

  // Wait for an element to appear in the DOM via MutationObserver
  function waitForElement(selector, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          observer.disconnect();
          resolve(found);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for "${selector}"`));
      }, timeout);
    });
  }

  // Wait for start-task-button to appear and become enabled, then click it
  function waitAndClickStartTask() {
    log("Waiting for start-task-button on page 2...");
    waitForElement('[data-test="start-task-button"]', 15000)
      .then((btn) => {
        if (!btn.disabled) {
          log("start-task-button is enabled — clicking.");
          btn.click();
          return;
        }
        // Button exists but is disabled — poll until enabled (up to 30s)
        log("start-task-button found but disabled — polling until enabled...");
        const poll = setInterval(() => {
          const b = document.querySelector('[data-test="start-task-button"]');
          if (b && !b.disabled) {
            log("start-task-button is now enabled — clicking.");
            b.click();
            clearInterval(poll);
          }
        }, 500);
        setTimeout(() => clearInterval(poll), 30000);
      })
      .catch(() => log("start-task-button never appeared after navigation."));
  }

  // ── PAGE 2: already on project instructions page ──
  const startBtn = document.querySelector('[data-test="start-task-button"]');
  if (startBtn) {
    if (!startBtn.disabled) {
      log("Page 2 — clicking start-task-button.");
      startBtn.click();
    } else {
      log("Page 2 — start-task-button is disabled, polling...");
      const poll = setInterval(() => {
        const b = document.querySelector('[data-test="start-task-button"]');
        if (b && !b.disabled) {
          log("start-task-button enabled — clicking.");
          b.click();
          clearInterval(poll);
        }
      }, 500);
      setTimeout(() => clearInterval(poll), 30000);
    }
    return;
  }

  // ── PAGE 1: home projects table ──
  const rows = document.querySelectorAll('[data-test="item"]');
  if (rows.length === 0) {
    log("No table rows found — might not be on the projects page.");
    return;
  }

  let clicked = false;

  rows.forEach((row) => {
    if (clicked) return; // only click the first matching enabled button
    const nameEl = row.querySelector(".home-projects-table__project-name");
    if (!nameEl) return;

    const projectName = nameEl.textContent.trim();
    const isTarget = targetProjects.some(
      (t) => projectName.toLowerCase() === t.toLowerCase(),
    );
    if (!isTarget) return;

    const actionBtn = row.querySelector('button[data-test^="action-button-"]');
    if (!actionBtn) {
      log(`Row "${projectName}": no action button found.`);
      return;
    }

    if (actionBtn.disabled) {
      log(`Row "${projectName}": action button is disabled, skipping.`);
      return;
    }

    log(`Row "${projectName}": action button enabled — clicking.`);
    actionBtn.click();
    clicked = true;

    // After clicking, wait for page 2 to load and click start-task-button
    waitAndClickStartTask();
  });

  if (!clicked) {
    log("No enabled action buttons found for target projects.");
  }
}

function log(msg) {
  console.log(`[Revelo BG] ${msg}`);
}
