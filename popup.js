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

            // Color coding based on event type
            if (message.message.includes("Cookie Removed")) {
                logEntry.style.color = "red";
            } else if (message.message.includes("New Cookie Added")) {
                logEntry.style.color = "blue";
            } else if (message.message.includes("Cookie Modified")) {
                logEntry.style.color = "green";
            } else if (message.message.includes("Security Alert")) {
                logEntry.style.color = "orange";
                logEntry.style.fontWeight = "bold";
            } else {
                logEntry.style.color = "black";
            }

            const blockquote = document.createElement("blockquote");
            blockquote.textContent = message.cookieDetail;
            logEntry.appendChild(blockquote);

            // Append to log container
            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    });

    // Open Persistent Monitor
    const btn = document.getElementById("openPersistent");
    if (btn && !btn.dataset.listenerAdded) {
        btn.dataset.listenerAdded = "true";
        btn.addEventListener("click", () => {
            chrome.tabs.create({ url: "persistent.html" });
        });
    }
});
