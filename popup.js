// popup.js

document.addEventListener("DOMContentLoaded", async () => {
  const { lastRun, monitoringStopped } = await chrome.storage.local.get([
    "lastRun",
    "monitoringStopped",
  ]);

  if (lastRun) {
    document.getElementById("lastRun").textContent =
      `Last run: ${new Date(lastRun).toLocaleTimeString()}`;
  }

  function applyStoppedState(stopped) {
    const dot = document.getElementById("statusDot");
    const label = document.getElementById("statusLabel");
    const toggleBtn = document.getElementById("toggleBtn");
    const runNowBtn = document.getElementById("runNowBtn");

    if (stopped) {
      dot.classList.remove("active");
      label.textContent = "Monitoring paused";
      toggleBtn.textContent = "Resume Monitoring";
      toggleBtn.className = "btn resume";
      runNowBtn.disabled = true;
    } else {
      dot.classList.add("active");
      label.textContent = "Monitoring active";
      toggleBtn.textContent = "Stop Monitoring";
      toggleBtn.className = "btn stop";
      runNowBtn.disabled = false;
    }
  }

  applyStoppedState(!!monitoringStopped);

  document.getElementById("toggleBtn").addEventListener("click", async () => {
    const { monitoringStopped: current } =
      await chrome.storage.local.get("monitoringStopped");
    const next = !current;
    await chrome.storage.local.set({ monitoringStopped: next });
    await chrome.runtime.sendMessage({
      action: next ? "stop-monitoring" : "resume-monitoring",
    });
    applyStoppedState(next);
  });

  document.getElementById("runNowBtn").addEventListener("click", async () => {
    const btn = document.getElementById("runNowBtn");
    btn.textContent = "Running…";
    btn.disabled = true;

    // Tell background to run check immediately
    await chrome.runtime.sendMessage({ action: "run-now" });

    await chrome.storage.local.set({ lastRun: Date.now() });
    document.getElementById("lastRun").textContent =
      `Last run: ${new Date().toLocaleTimeString()}`;

    btn.textContent = "Run Check Now";
    btn.disabled = false;
  });
});
