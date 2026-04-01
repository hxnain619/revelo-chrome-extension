// content.js — Runs on page load for *.revelo.com pages
// Also handles the case where the page loads mid-interval (e.g. user opens a tab)

const LOG_PREFIX = "[Revelo Auto Task]";

const TARGET_PROJECTS = [
  "Single HTML Interfaces",
  "Single HTML Interfaces - Chocolate",
];

function log(msg) {
  console.log(`${LOG_PREFIX} ${msg}`);
}

// Wait for a DOM element matching the selector to appear (used for SPA navigation)
function waitForElement(selector, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for "${selector}"`));
    }, timeout);
  });
}

// Wait for start-task-button to appear, then click it once enabled
function waitAndClickStartTask() {
  log("Waiting for start-task-button on page 2...");
  waitForElement('[data-test="start-task-button"]', 15000)
    .then((btn) => {
      if (!btn.disabled) {
        log("start-task-button is enabled — clicking.");
        btn.click();
        return;
      }
      // Exists but disabled — poll every 500ms until it becomes enabled
      log("start-task-button is disabled — polling until enabled...");
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

async function handlePage() {
  // ── PAGE 2: project instructions ──
  const startBtn = document.querySelector('[data-test="start-task-button"]');
  if (startBtn) {
    if (!startBtn.disabled) {
      log("Page 2 — clicking start-task-button.");
      startBtn.click();
    } else {
      log("Page 2 — start-task-button is disabled, polling...");
      const poll = setInterval(() => {
        const btn = document.querySelector('[data-test="start-task-button"]');
        if (btn && !btn.disabled) {
          log("start-task-button is now enabled, clicking.");
          btn.click();
          clearInterval(poll);
        }
      }, 500);
      setTimeout(() => clearInterval(poll), 30000);
    }
    return;
  }

  // ── PAGE 1: home projects table ──
  let rows;
  try {
    await waitForElement('[data-test="item"]');
    rows = document.querySelectorAll('[data-test="item"]');
  } catch {
    log("No project table rows found on this page.");
    return;
  }

  let clicked = false;

  for (const row of rows) {
    if (clicked) break; // only handle the first matching enabled button per cycle
    const nameEl = row.querySelector(".home-projects-table__project-name");
    if (!nameEl) continue;

    const projectName = nameEl.textContent.trim();
    const isTarget = TARGET_PROJECTS.some(
      (t) => projectName.toLowerCase() === t.toLowerCase(),
    );
    if (!isTarget) continue;

    const actionBtn = row.querySelector('button[data-test^="action-button-"]');
    if (!actionBtn) {
      log(`"${projectName}": no action button found.`);
      continue;
    }

    if (actionBtn.disabled) {
      log(`"${projectName}": action button disabled — will retry next cycle.`);
      continue;
    }

    log(`"${projectName}": action button is enabled — clicking.`);
    actionBtn.click();
    clicked = true;

    // Immediately watch for the SPA to load page 2 and click start-task-button
    waitAndClickStartTask();
  }

  if (!clicked) {
    log("No clickable action buttons found for target projects this cycle.");
  }
}

// Run once on page load (handles direct navigation / page refresh)
handlePage();

// Also listen for messages from background (alarm fires on already-open tab)
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "run-check") {
    log("Received run-check message from background.");
    handlePage();
  }
});
