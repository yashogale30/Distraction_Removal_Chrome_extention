const toggleBtn = document.getElementById("toggle-btn");
const statusBadge = document.getElementById("status-badge");
const removedCountEl = document.getElementById("removed-count");
let removeModeOn = false;

// Load state and stats when popup opens
chrome.storage.local.get(
  ["removeModeOn", "removedCount", "savedSelectors"],
  (result) => {
    removeModeOn = result.removeModeOn || false;

    // Update UI based on current state
    if (removeModeOn) {
      toggleBtn.innerHTML =
        '<span class="btn-icon"></span>Disable Removal Mode';
      statusBadge.textContent = "Enabled";
      statusBadge.classList.remove("disabled");
    } else {
      toggleBtn.innerHTML = '<span class="btn-icon"></span>Enable Removal Mode';
      statusBadge.textContent = "Disabled";
      statusBadge.classList.add("disabled");
    }

    // Update stats
    const count = result.removedCount || 0;
    removedCountEl.textContent = count;

    // Count saved elements across all domains
    const savedSelectors = result.savedSelectors || {};
    let savedCount = 0;
    Object.values(savedSelectors).forEach((selectors) => {
      savedCount += selectors.length;
    });
    document.getElementById("saved-count").textContent = savedCount;
  }
);

toggleBtn.addEventListener("click", async () => {
  removeModeOn = !removeModeOn;

  // Save state to storage
  chrome.storage.local.set({ removeModeOn });

  // Update UI
  if (removeModeOn) {
    toggleBtn.innerHTML = '<span class="btn-icon"></span>Disable Removal Mode';
    statusBadge.textContent = "Enabled";
    statusBadge.classList.remove("disabled");
  } else {
    toggleBtn.innerHTML = '<span class="btn-icon"></span>Enable Removal Mode';
    statusBadge.textContent = "Disabled";
    statusBadge.classList.add("disabled");
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    // Inject content script if not already there
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });

    // Send message to enable/disable remove mode
    chrome.tabs.sendMessage(
      tab.id,
      { action: removeModeOn ? "enable" : "disable" },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Message failed:", chrome.runtime.lastError.message);
        } else {
          console.log("Response from content script:", response);
        }
      }
    );
  } catch (error) {
    console.error("Script injection failed:", error);
  }
});

// Optional: Add functionality for the saved elements button
document.getElementById("saved-btn").addEventListener("click", () => {
  // This could open a new tab with a settings page
  chrome.tabs.create({ url: "settings.html" });

  // // Or for now, just show a notification
  // if (toggleBtn.textContent.includes("Disable")) {
  //   alert("Please disable removal mode before managing saved elements.");
  // } else {
  //   alert("Saved elements management coming soon!");
  // }
});
