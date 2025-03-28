document.addEventListener("DOMContentLoaded", () => {
    const logContainer = document.querySelector("#logs-content .log-container");
    const securityContainer = document.querySelector("#security-content .log-container");
    const logsTab = document.querySelector("[data-tab='logs']");
    const securityTab = document.querySelector("[data-tab='security']");
    const clearLogsBtn = document.querySelector(".btn:nth-child(2)");
    const refreshLogsBtn = document.querySelector(".btn:first-child");
    const exportLogsBtn = document.querySelector(".btn:last-child");
    
    let logs = []; // Store logs for exporting

    // Functions to update the UI
    function updateTotalCookiesUI(data) {
        const totalCookiesEl = document.getElementById("total-cookies");
        totalCookiesEl.textContent = Object.entries(data)
            .map(([domain, count]) => `${domain}: ${count}`)
            .join(", ") || "No data available";
    }
    function updateModifiedCookiesUI(data) {
        const modifiedCookiesEl = document.getElementById("frequent-cookies");

        const sortedCookies = Object.values(data)
            .sort((a, b) => b.count - a.count) // Sort by modification count
            .slice(0, 5); // Show top 5 modified cookies

        modifiedCookiesEl.textContent = sortedCookies.length > 0
            ? sortedCookies.map(cookie => `${cookie.name} (${cookie.count} changes)`).join(", ")
            : "No data available";
    }
    function updateSizeUI(largestCookies) {
        const sizeEl = document.getElementById("largest-cookies");
    
        if (!largestCookies.length) {
            sizeEl.textContent = "No data available";
            return;
        }
    
        sizeEl.innerHTML = largestCookies.map(cookie =>
            `<b>${cookie.name}</b> (${cookie.size} bytes)`
        ).join("<br>");
    }

    // Function to create a log entry
    function createLogEntry(message, type, cookieName, timestamp, securityIssues, cookieValue) {
        const logEntry = document.createElement("div");
        logEntry.classList.add("log-entry", type);
    
        logEntry.innerHTML = `
            <div class="log-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    ${getIconPath(type)}
                </svg>
            </div>
            <div class="log-details">
                <div class="log-header">
                    <span class="cookie-name">${cookieName}</span>
                    <span class="timestamp">${timestamp}</span>
                </div>
                <p class="cookie-value">Value - ${cookieValue}</p>
                <p class="description">${message}</p>
                ${securityIssues ? `<ul class="security-list">${securityIssues.map(issue => `<li>${issue}</li>`).join("")}</ul>` : ""}
            </div>
        `;
    
        return logEntry;
    }
    
    // Function to get appropriate icon SVG path
    function getIconPath(type) {
        const icons = {
            "added": '<path d="M5 12h14"/><path d="M12 5v14"/>', // Plus icon
            "removed": '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>', // Trash icon
            "modified": '<path d="M12 2v20"/><path d="M5 12h14"/>', // Edit icon
            "security": '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' // Security icon
        };
        return icons[type] || '<path d="M12 12h.01"/>'; // Default dot
    }
    
    // Listen for messages from background.js
    chrome.runtime.onMessage.addListener((message) => {

        if (message.type === "updateTotalCookies") {
            updateTotalCookiesUI(message.data);
        }

        if (message.type === "updateModifiedCookies") {
            updateModifiedCookiesUI(message.data);
        }

        if (message.type === "updateLargestCookies") {
            updateSizeUI(message.largestCookies);
        }

        if (message.type === "cookieChange") {
            const { message: msg, essentialInfo, expirationInfo, securityMessage, cookieValue } = message;
            console.log(message);
            const timestamp = new Date().toLocaleTimeString(); // Better timestamp handling
            const securityIssues = securityMessage ? securityMessage.split(", ").map(issue => `${issue}`) : [];
    
            // Determine log type
            let logType = "default";
            if (msg.includes("New Cookie")) logType = "added";
            else if (msg.includes("Cookie Removed")) logType = "removed";
            else if (msg.includes("Cookie Modified")) logType = "modified";
    
            // Create and store log entry
            const logEntry = createLogEntry(msg, logType, essentialInfo, timestamp, securityIssues, cookieValue);
            logs.push({ message: msg, type: logType, cookie: essentialInfo, timestamp, cookieValue });
    
            // Add entry to correct tab
            const targetContainer = document.querySelector("#logs-content .log-container"); // Normal logs tab
    
            if (targetContainer) {
                targetContainer.appendChild(logEntry);
                targetContainer.scrollTop = targetContainer.scrollHeight;
            }
        }
    });

    // Theme Toggle
    const themeToggle = document.getElementById("theme-toggle");
    themeToggle.addEventListener("click", () => {
        document.body.classList.toggle("dark-theme");
    });

    // Tab Switching
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            tabs.forEach((t) => t.classList.remove("active"));
            document.querySelectorAll(".content-section").forEach((section) => {
                section.classList.remove("active");
            });

            tab.classList.add("active");
            const contentId = `${tab.dataset.tab}-content`;
            document.getElementById(contentId).classList.add("active");
        });
    });

    // Refresh Logs
    refreshLogsBtn.addEventListener("click", () => {
        logContainer.innerHTML = "";
        securityContainer.innerHTML = "";
        logs = [];
        chrome.runtime.sendMessage({ type: "refreshLogs" });
    });

    // Clear Logs
    clearLogsBtn.addEventListener("click", () => {
        logContainer.innerHTML = "";
        securityContainer.innerHTML = "";
        logs = [];
    });

    // Export Logs as JSON
    exportLogsBtn.addEventListener("click", () => {
        const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cookie_logs.json";
        a.click();
        URL.revokeObjectURL(url);
    });
});
