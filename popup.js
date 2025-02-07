document.addEventListener("DOMContentLoaded", () => {
    const viewCookiesButton = document.getElementById("viewCookies");
    const clearCookiesButton = document.getElementById("clearCookies");
    const cookieList = document.getElementById("cookieList");

    function displayCookies(cookies) {
        cookieList.innerHTML = "";
        if (cookies.length === 0) {
            cookieList.innerHTML = "<li>No cookies found</li>";
            return;
        }
        cookies.forEach(cookie => {
            const li = document.createElement("li");
            li.textContent = `${cookie.name} = ${cookie.value}`;
            cookieList.appendChild(li);
        });
    }

    if (viewCookiesButton) {
        console.log("Cookie viewing:")
        viewCookiesButton.addEventListener("click", () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tab = tabs[0];
                chrome.cookies.getAll({ url: tab.url }, (cookies) => {
                    displayCookies(cookies);
                });
            });
        });
    }

    if (clearCookiesButton) {
        clearCookiesButton.addEventListener("click", () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tab = tabs[0];
                chrome.cookies.getAll({ url: tab.url }, (cookies) => {
                    cookies.forEach(cookie => {
                        chrome.cookies.remove({ url: tab.url, name: cookie.name });
                    });
                    displayCookies([]); // Clear the UI
                    alert("Cookies cleared for this tab!");
                });
            });
        });
    }
    // Listen for messages from background.js
    const logContainer = document.getElementById("log");
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === "cookieChange") {
            const logEntry = document.createElement("div");
            logEntry.innerHTML = message.message;
    
            // Log message content for debugging
            console.log("Received Message:", message.message);
    
            // Apply color coding based on event type by checking for specific keywords in the message
            if (message.message.includes("Cookie Removed")) {
                logEntry.style.color = "red"; // Deletions
            } else if (message.message.includes("New Cookie Added")) {
                logEntry.style.color = "blue"; // New cookies
            } else if (message.message.includes("Cookie Modified")) {
                logEntry.style.color = "green"; // Modifications
            } else if (message.message.includes("Insecure Cookie Detected")) {
                logEntry.style.color = "orange"; // Security warnings
            } else {
                logEntry.style.color = "black"; // Default color for unknown cases
            }

            const blockquote = document.createElement("blockquote");
            blockquote.textContent = message.cookieDetail;  // This is the cookie key/value detail
            logEntry.appendChild(blockquote);  // Add blockquote to the log entry
    
            // Append to log container
            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight; // Auto-scroll to bottom
        }
    });
    
    

    const btn = document.getElementById("openPersistent");
    if (btn && !btn.dataset.listenerAdded) {
        btn.dataset.listenerAdded = "true";  // Mark listener as added
        btn.addEventListener("click", () => {
            chrome.tabs.create({ url: "persistent.html" });
        });
    }
});
