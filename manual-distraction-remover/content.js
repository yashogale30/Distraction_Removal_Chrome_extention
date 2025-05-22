if (window.hasOwnProperty("distRemoverInjected")) {
  console.log("Content script already loaded, skipping initialization");
} else {
  // Mark as injected
  window.distRemoverInjected = true;

  let removeMode = false;
  let overlay = null;
  let hoverBox = null;
  let lastTarget = null;
  let statusIndicator = null;
  let removedCount = 0;
  let removedElements = []; // Stack to store removed elements
  let savedSelectors = {}; // Object to store saved selectors per site
  let currentDomain = window.location.hostname;
  let saveRemovedElements = false;
  let saveToggle = null;
  let undoButton = null;

  function clickHandler(event) {
    // Don't process clicks on the status indicator or its children
    if (
      statusIndicator &&
      (statusIndicator === event.target ||
        statusIndicator.contains(event.target))
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const target = event.target;

    // Save element information for undo
    const parentNode = target.parentNode;
    const nextSibling = target.nextSibling;
    const selector = generateSelector(target);

    // Store element data for undo
    removedElements.push({
      element: target,
      parentNode: parentNode,
      nextSibling: nextSibling,
      selector: selector,
    });

    // Limit the undo stack to 10 items
    if (removedElements.length > 10) {
      removedElements.shift();
    }

    // Create a clone for animation
    const clone = target.cloneNode(true);
    const rect = target.getBoundingClientRect();

    Object.assign(clone.style, {
      position: "fixed",
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      transition: "all 0.3s ease-out",
      zIndex: "10000",
      pointerEvents: "none",
    });

    document.body.appendChild(clone);

    // Animate and remove
    setTimeout(() => {
      clone.style.opacity = "0";
      clone.style.transform = "scale(0.8)";
    }, 10);

    setTimeout(() => {
      clone.remove();
      target.remove();

      // Save the selector for this site if save mode is enabled
      if (saveRemovedElements) {
        if (!savedSelectors[currentDomain]) {
          savedSelectors[currentDomain] = [];
        }
        if (!savedSelectors[currentDomain].includes(selector)) {
          savedSelectors[currentDomain].push(selector);
          // Save to storage
          chrome.storage.local.set({ savedSelectors: savedSelectors });
        }
      }
    }, 300);

    removedCount++;
    updateStatusIndicator();
    updateUndoButton();
  }

  // Generate a CSS selector for an element
  function generateSelector(el) {
    if (el.id) {
      return `#${el.id}`;
    }

    if (el.className && typeof el.className === "string") {
      const classes = el.className
        .trim()
        .split(/\s+/)
        .filter((c) => c);
      if (classes.length > 0) {
        return `.${classes.join(".")}`;
      }
    }

    // Create a path-based selector
    let path = [];
    let current = el;
    while (current && current !== document.body && current !== document) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector = `#${current.id}`;
        path.unshift(selector);
        break;
      } else if (current.className && typeof current.className === "string") {
        const classes = current.className
          .trim()
          .split(/\s+/)
          .filter((c) => c);
        if (classes.length > 0) {
          selector += `.${classes.join(".")}`;
        }
      }

      // Add nth-child if needed
      const siblings = Array.from(current.parentNode.children).filter(
        (child) => child.tagName === current.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }

      path.unshift(selector);
      current = current.parentNode;
    }

    return path.join(" > ");
  }

  function undoLastRemoval() {
    if (removedElements.length === 0) return;

    const lastRemoved = removedElements.pop();

    if (lastRemoved.parentNode) {
      if (lastRemoved.nextSibling) {
        lastRemoved.parentNode.insertBefore(
          lastRemoved.element,
          lastRemoved.nextSibling
        );
      } else {
        lastRemoved.parentNode.appendChild(lastRemoved.element);
      }

      // Animate the restored element
      lastRemoved.element.style.transition = "all 0.3s ease-out";
      lastRemoved.element.style.opacity = "0";
      lastRemoved.element.style.transform = "scale(0.8)";

      setTimeout(() => {
        lastRemoved.element.style.opacity = "1";
        lastRemoved.element.style.transform = "scale(1)";
      }, 10);

      // Remove from saved selectors if applicable
      if (saveRemovedElements && savedSelectors[currentDomain]) {
        const index = savedSelectors[currentDomain].indexOf(
          lastRemoved.selector
        );
        if (index !== -1) {
          savedSelectors[currentDomain].splice(index, 1);
          chrome.storage.local.set({ savedSelectors: savedSelectors });
        }
      }

      removedCount--;
      updateStatusIndicator();
      updateUndoButton();
    }
  }

  function updateUndoButton() {
    if (undoButton) {
      undoButton.style.opacity = removedElements.length > 0 ? "1" : "0.5";
      undoButton.style.pointerEvents =
        removedElements.length > 0 ? "auto" : "none";
    }
  }

  function mouseMoveHandler(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (
      !el ||
      el === hoverBox ||
      el === overlay ||
      (statusIndicator &&
        (el === statusIndicator || statusIndicator.contains(el))) ||
      el.contains(hoverBox)
    )
      return;

    lastTarget = el;
    const rect = el.getBoundingClientRect();

    // Smooth transition for hover box
    Object.assign(hoverBox.style, {
      top: `${rect.top + window.scrollY}px`,
      left: `${rect.left + window.scrollX}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      display: "block",
    });
  }

  function mouseOutHandler() {
    if (hoverBox) hoverBox.style.display = "none";
  }

  function createOverlay() {
    overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0, 0, 0, 0.69);
      backdrop-filter: blur(0.79px);
      z-index: 9998;
      pointer-events: none;
      transition: opacity 0.3s ease;
    `;
    document.body.appendChild(overlay);
    // Fade in effect
    setTimeout(() => (overlay.style.opacity = "1"), 10);
    overlay.style.opacity = "0";
  }

  function createHoverBox() {
    hoverBox = document.createElement("div");
    hoverBox.style.cssText = `
      position: absolute;
      border: 2px solid #4285f4;
      box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.3);
      background-color: rgba(66, 133, 244, 0.1);
      z-index: 9999;
      pointer-events: none;
      transition: all 0.15s ease-out;
      border-radius: 3px;
      display: none;
    `;
    document.body.appendChild(hoverBox);
  }

  function createStatusIndicator() {
    statusIndicator = document.createElement("div");
    statusIndicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #4285f4;
      color: white;
      padding: 8px 15px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      border-radius: 20px;
      box-shadow: 0 3px 10px rgba(0,0,0,0.2);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      opacity: 0;
      transform: translateY(20px);
      transition: all 0.3s ease;
      pointer-events: auto;
    `;

    // Prevent clicks on the indicator from removing elements
    statusIndicator.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
      },
      true
    );

    // Top section with status text
    const statusText = document.createElement("div");
    statusText.style.cssText = `
      display: flex;
      align-items: center;
    `;

    // Add a dot indicator
    const dot = document.createElement("div");
    dot.style.cssText = `
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #ff4444;
      margin-right: 8px;
      box-shadow: 0 0 5px #ff4444;
      animation: pulse 1.5s infinite;
    `;

    // Add animation
    const style = document.createElement("style");
    style.textContent = `
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.2); }
        100% { transform: scale(1); }
      }
    `;
    document.head.appendChild(style);

    statusText.appendChild(dot);
    statusText.appendChild(document.createTextNode("Element Removal Mode"));

    // Controls section
    const controls = document.createElement("div");
    controls.style.cssText = `
      display: flex;
      gap: 8px;
      justify-content: space-between;
    `;

    // Undo button
    undoButton = document.createElement("button");
    undoButton.textContent = "↩️ Cntr+Z";
    undoButton.style.cssText = `
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      opacity: 0.5;
      pointer-events: none;
      transition: all 0.2s ease;
    `;
    undoButton.addEventListener("click", (e) => {
      e.stopPropagation();
      undoLastRemoval();
    });

    // Save toggle
    const saveContainer = document.createElement("div");
    saveContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 5px;
    `;

    saveToggle = document.createElement("input");
    saveToggle.type = "checkbox";
    saveToggle.id = "save-toggle";
    saveToggle.style.cssText = `
      margin: 0;
    `;
    saveToggle.checked = saveRemovedElements;
    saveToggle.addEventListener("change", (e) => {
      e.stopPropagation();
      saveRemovedElements = saveToggle.checked;
      chrome.storage.local.set({ saveRemovedElements: saveRemovedElements });
    });

    const saveLabel = document.createElement("label");
    saveLabel.htmlFor = "save-toggle";
    saveLabel.textContent = "Save";
    saveLabel.style.cssText = `
      font-size: 12px;
      cursor: pointer;
    `;

    saveContainer.appendChild(saveToggle);
    saveContainer.appendChild(saveLabel);

    controls.appendChild(undoButton);
    controls.appendChild(saveContainer);

    statusIndicator.appendChild(statusText);
    statusIndicator.appendChild(controls);

    document.body.appendChild(statusIndicator);

    // Animate in
    setTimeout(() => {
      statusIndicator.style.opacity = "1";
      statusIndicator.style.transform = "translateY(0)";
    }, 10);

    return statusText;
  }

  function updateStatusIndicator() {
    if (statusIndicator) {
      statusIndicator.querySelector(
        "div"
      ).lastChild.textContent = `Element Removal Mode (${removedCount} removed)`;
    }
  }

  function destroyOverlay() {
    if (overlay) {
      overlay.style.opacity = "0";
      setTimeout(() => {
        if (overlay) overlay.remove();
        overlay = null;
      }, 300);
    }
  }

  function destroyHoverBox() {
    if (hoverBox) {
      hoverBox.style.opacity = "0";
      setTimeout(() => {
        if (hoverBox) hoverBox.remove();
        hoverBox = null;
      }, 300);
    }
  }

  function destroyStatusIndicator() {
    if (statusIndicator) {
      statusIndicator.style.opacity = "0";
      statusIndicator.style.transform = "translateY(20px)";
      setTimeout(() => {
        if (statusIndicator) statusIndicator.remove();
        statusIndicator = null;
      }, 300);
    }
  }

  function setupKeyboardShortcuts() {
    document.addEventListener(
      "keydown",
      (e) => {
        if (!removeMode) return;

        console.log("Key pressed:", e.key);

        // Escape key to exit remove mode
        if (e.key === "Escape" || e.keyCode === 27) {
          console.log("Escape pressed, disabling remove mode");
          chrome.runtime.sendMessage({ action: "requestDisable" });
          e.preventDefault();
          e.stopPropagation();

          // As a fallback, also disable directly
          chrome.storage.local.set({ removeModeOn: false });
          removeMode = false;
          destroyOverlay();
          destroyHoverBox();
          destroyStatusIndicator();
          document.removeEventListener("click", clickHandler, true);
          document.removeEventListener("mousemove", mouseMoveHandler, true);
          document.removeEventListener("mouseout", mouseOutHandler, true);
        }

        // Delete key to remove currently highlighted element
        if (e.key === "Delete" && lastTarget) {
          // Simulate a click on the element
          const clickEvent = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
          });
          lastTarget.dispatchEvent(clickEvent);
        }

        // Ctrl+Z to undo
        if ((e.ctrlKey || e.metaKey) && e.key === "z") {
          undoLastRemoval();
        }
      },
      true
    );
  }

  // Apply saved element removals for this site
  function applySavedRemovals() {
    if (
      savedSelectors[currentDomain] &&
      savedSelectors[currentDomain].length > 0
    ) {
      savedSelectors[currentDomain].forEach((selector) => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach((el) => {
            el.remove();
            removedCount++;
          });
        } catch (error) {
          console.error("Error applying saved selector:", selector, error);
        }
      });

      if (removedCount > 0) {
        // Create a temporary notification
        const notification = document.createElement("div");
        notification.style.cssText = `
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: rgba(0, 0, 0, 0.7);
          color: white;
          padding: 10px 15px;
          border-radius: 5px;
          font-family: Arial, sans-serif;
          font-size: 14px;
          z-index: 9999;
          opacity: 0;
          transform: translateY(20px);
          transition: all 0.3s ease;
        `;
        notification.textContent = `Removed ${removedCount} saved element${
          removedCount > 1 ? "s" : ""
        }`;
        document.body.appendChild(notification);

        setTimeout(() => {
          notification.style.opacity = "1";
          notification.style.transform = "translateY(0)";
        }, 10);

        setTimeout(() => {
          notification.style.opacity = "0";
          notification.style.transform = "translateY(20px)";
          setTimeout(() => notification.remove(), 300);
        }, 3000);
      }
    }
  }

  // Load saved settings and selectors
  chrome.storage.local.get(
    ["removeModeOn", "saveRemovedElements", "savedSelectors"],
    (result) => {
      saveRemovedElements = result.saveRemovedElements || false;
      savedSelectors = result.savedSelectors || {};

      // Apply saved removals
      applySavedRemovals();

      if (result.removeModeOn) {
        removeMode = true;
        createOverlay();
        createHoverBox();
        createStatusIndicator();
        setupKeyboardShortcuts();
        document.addEventListener("click", clickHandler, true);
        document.addEventListener("mousemove", mouseMoveHandler, true);
        document.addEventListener("mouseout", mouseOutHandler, true);
        console.log("Remove mode enabled on load");

        // Update save toggle
        if (saveToggle) {
          saveToggle.checked = saveRemovedElements;
        }
      }
    }
  );

  // Combined message listener
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Message received:", request);

    if (request.action === "enable" && !removeMode) {
      removeMode = true;
      createOverlay();
      createHoverBox();
      createStatusIndicator();
      setupKeyboardShortcuts();
      document.addEventListener("click", clickHandler, true);
      document.addEventListener("mousemove", mouseMoveHandler, true);
      document.addEventListener("mouseout", mouseOutHandler, true);
      console.log("Remove mode enabled");

      // Update save toggle
      if (saveToggle) {
        saveToggle.checked = saveRemovedElements;
      }

      updateUndoButton();
    } else if (request.action === "disable" && removeMode) {
      removeMode = false;
      destroyOverlay();
      destroyHoverBox();
      destroyStatusIndicator();
      document.removeEventListener("click", clickHandler, true);
      document.removeEventListener("mousemove", mouseMoveHandler, true);
      document.removeEventListener("mouseout", mouseOutHandler, true);
      console.log("Remove mode disabled");
    } else if (request.action === "requestDisable" && removeMode) {
      chrome.storage.local.set({ removeModeOn: false });
      removeMode = false;
      destroyOverlay();
      destroyHoverBox();
      destroyStatusIndicator();
      document.removeEventListener("click", clickHandler, true);
      document.removeEventListener("mousemove", mouseMoveHandler, true);
      document.removeEventListener("mouseout", mouseOutHandler, true);
      console.log("Remove mode disabled by keyboard shortcut");
    }

    sendResponse({ status: "ok" });
    return true; // Keep the message channel open for async response
  });

  console.log("Content script loaded");
}
