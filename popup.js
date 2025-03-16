document.addEventListener("DOMContentLoaded", () => {
    const cookieSearch = document.getElementById("cookieSearch") || false;
    const viewCookies = document.getElementById("viewCookies") || false;
    const closePopup = document.getElementById("closePopup") || false;
    const exportJson = document.getElementById("exportJson") || false;
    const exportCsv = document.getElementById("exportCsv") || false;

    if (cookieSearch) cookieSearch.addEventListener("input", searchForCookie);
    if (viewCookies) viewCookies.addEventListener("click", showCookies);
    if (closePopup) closePopup.addEventListener("click", closePopup);
    if (exportJson) exportJson.addEventListener("click", exportAsJson);
    if (exportCsv) exportCsv.addEventListener("click", exportAsCsv);

    // Listen for messages from background.js
    const logContainer = document.getElementById("log");
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === "thirdPartyCookiesList") {
            const blockedCookiesList = document.getElementById("blocked-cookies-list");
    
            if (!blockedCookiesList) {
                console.warn("Blocked cookies list container not found!");
                return;
            }
    
            blockedCookiesList.innerHTML = ""; // Clear previous entries
    
            if (message.cookies.length === 0) {
                blockedCookiesList.textContent = "No third-party cookies detected.";
            } else {
                message.cookies.forEach((cookie) => {
                    const entry = document.createElement("div");
                    entry.classList.add("third-party-entry");
                    entry.innerHTML = `<a href="${cookie.url}" target="_blank">${cookie.name}</a>`;
                    blockedCookiesList.appendChild(entry);
                });
            }
        } 
        else if (message.type === "cookieChange") {
            const logEntry = document.createElement("div");
            logEntry.innerHTML = message.message;
    
            const logContainer = document.getElementById("log");
            if (!logContainer) {
                console.error("Log container not found!");
                return;
            }
    
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
    
    // Tab switching
    const tabs = document.querySelectorAll(".tab");
    const tabContents = document.querySelectorAll(".tab-content");

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");

        tabContents.forEach((content) => {
          content.classList.remove("active");
        });

        document.getElementById(tab.dataset.target).classList.add("active");
      });
    });

    // Dark mode toggle
    const themeToggle = document.getElementById("themeToggle") || false;
    if(themeToggle){
        themeToggle.addEventListener("click", () => {
          document.body.classList.toggle("dark-mode");
          themeToggle.textContent = document.body.classList.contains(
            "dark-mode"
          )
            ? "☀"
            : "⏾";
        });
    }

    const enableNotifications = document.getElementById("enableNotifications") || false;
    const enableTabLogging = document.getElementById("enableTabLogging") || false;
    const disableThirdPartyCookies = document.getElementById("disableThirdPartyCookies") || false;
    const autoDeleteCookies = document.getElementById("autoDeleteCookies") || false;
    const tabDropdown = document.getElementById("tabDropdown") || false;

    // Load saved settings
    chrome.storage.sync.get(["notifications", "loggingTab", "blockThirdParty","autoDelete"], (data) => {
        enableNotifications.checked = data.notifications || false;
        enableTabLogging.checked = !!data.loggingTab;
        disableThirdPartyCookies.checked = data.blockThirdParty || false;
        autoDeleteCookies.checked = data.autoDelete ?? false;
        console.log(data);
    });

    // Add auto-delete cookies checkbox listener
    if(autoDeleteCookies){
        autoDeleteCookies.addEventListener("change", () => {
            console.log(`Auto-delete cookies setting changed to: ${autoDeleteCookies.checked}`);
            chrome.storage.sync.set({ autoDelete: autoDeleteCookies.checked }, () => {
                if (chrome.runtime.lastError) {
                    console.error("Error saving auto-delete setting:", chrome.runtime.lastError);
                } else {
                    console.log("Auto-delete setting saved successfully");
                }
            });
        });
    }

    // Enable system notifications toggle
    if(enableNotifications){
        enableNotifications.addEventListener("change", () => {
            if (enableNotifications.checked) {
                Notification.requestPermission().then((permission) => {
                    if (permission === "granted") {
                        chrome.storage.sync.set({ notifications: true });
                    } else {
                        enableNotifications.checked = false;
                        chrome.storage.sync.set({ notifications: false });
                        alert("Notifications permission denied. Please allow notifications in browser settings.");
                    }
                });
            } else {
                chrome.storage.sync.set({ notifications: false });
            }
        });
    }

    // Populate tab dropdown
    function populateTabs() {
        chrome.tabs.query({}, (tabs) => {
            tabDropdown.innerHTML = "";
            tabs.forEach(tab => {
                const option = document.createElement("option");
                option.value = tab.id;
                option.textContent = tab.title;
                tabDropdown.appendChild(option);
            });

            // Restore the previously selected tab
            chrome.storage.sync.get(["loggingTab"], (data) => {
                if (data.loggingTab) {
                    tabDropdown.value = data.loggingTab;
                    enableTabLogging.checked = true;
                }
            });
        });
    }

    populateTabs();

    // Enable logging for a specific tab
    if(enableTabLogging){
        enableTabLogging.addEventListener("change", () => {
            if (enableTabLogging.checked) {
                const selectedTab = tabDropdown.value;
                chrome.storage.sync.set({ loggingTab: selectedTab });
            } else {
                chrome.storage.sync.remove("loggingTab");
            }
        });
    }

    // Disable third-party cookies toggle
    if(disableThirdPartyCookies){
        disableThirdPartyCookies.addEventListener("change", () => {
            chrome.storage.sync.set({ blockThirdParty: disableThirdPartyCookies.checked });
            chrome.privacy.websites.thirdPartyCookiesAllowed.set({
                value: !disableThirdPartyCookies.checked // Invert checkbox value to disable cookies
            });
        });
    }

    // Listen for tab selection changes
    if(tabDropdown){
        tabDropdown.addEventListener("change", () => {
            if (enableTabLogging.checked) {
                chrome.storage.sync.set({ loggingTab: tabDropdown.value });
            }
        });
    }

    const detectThirdPartyButton = document.getElementById("detectThirdParty");
    if (detectThirdPartyButton) {
        detectThirdPartyButton.addEventListener("click", () => {
            console.log("Detect Third Party button clicked");
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const currentTab = tabs[0];
                const currentHostname = new URL(currentTab.url).hostname;
                console.log("Current hostname:", currentHostname);
        
                // First get cookies for the current URL
                chrome.cookies.getAll({ domain: currentHostname }, (cookies) => {
                    console.log("Total cookies found:", cookies.length);
                    const thirdPartyCookies = new Map();
        
                    cookies.forEach(cookie => {
                        const cookieDomain = cookie.domain.startsWith('.') ? 
                            cookie.domain.substr(1) : cookie.domain;
        
                        // Only include cookies that are actually from a different domain
                        // but are present in the current website's context
                        if (cookieDomain !== currentHostname && 
                            !currentHostname.endsWith(cookieDomain) && 
                            !cookieDomain.endsWith(currentHostname)) {
                            
                            const protocol = cookie.secure ? 'https://' : 'http://';
                            const url = protocol + cookieDomain;
        
                            thirdPartyCookies.set(cookieDomain, {
                                url: url,
                                name: cookie.name,
                                domain: cookieDomain,
                                value: cookie.value,
                                path: cookie.path
                            });
                            
                            console.log("Found third-party cookie:", {
                                domain: cookieDomain,
                                name: cookie.name,
                                path: cookie.path
                            });
                        }
                    });
        
                    const cookiesList = Array.from(thirdPartyCookies.values());
                    console.log("Filtered third-party cookies list:", cookiesList);
                    chrome.runtime.sendMessage({
                        type: "thirdPartyCookiesList",
                        cookies: cookiesList
                    });
                });
            });
        });        
    } else {
        console.log("Detect Third Party button not found");
    }
});


// Function to show cookies in the popup

function showCookies() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        chrome.cookies.getAll({ url: tab.url }, (cookies) => {
            let tableBody = document.getElementById("cookieTableBody");
            tableBody.innerHTML = ""; // Clear previous entries

            console.log("Cookies found:", cookies);

            if (!cookies || cookies.length === 0) {
                tableBody.innerHTML = "<tr><td colspan='4'>No cookies found</td></tr>";
                return;
            }

            cookies.forEach(cookie => {
                let row = document.createElement("tr");

                let cookieSize = encodeURIComponent(cookie.name + "=" + cookie.value).length;
                let sizeThreshold = 4096; // 4KB limit for performance-heavy cookies
                let performanceQuality = cookieSize > sizeThreshold ? "High Impact" : "Low Impact";

                // Format expiration date
                let expiration = cookie.expirationDate ? 
                    new Date(cookie.expirationDate * 1000).toLocaleString() : 
                    "Session Cookie";

                row.innerHTML = `
                    <td>${cookie.name}</td>
                    <td>${cookie.value}</td>
                    <td>${expiration}</td>
                    <td>${cookieSize} bytes</td>
                    <td>${performanceQuality}</td>
                    <td><button class="delete-btn" data-cookie-name="${cookie.name}">Delete</button></td>
                `;

                // Add delete button listener
                row.querySelector('.delete-btn').addEventListener('click', function() {
                    const cookieName = this.getAttribute('data-cookie-name');
                    chrome.cookies.remove({
                        url: tab.url,
                        name: cookieName
                    }, () => {
                        row.remove();
                        if (tableBody.children.length === 0) {
                            tableBody.innerHTML = "<tr><td colspan='4'>No cookies found</td></tr>";
                        }
                    });
                });

                tableBody.appendChild(row);
            });
        });
    });

    document.getElementById("cookieOverlay").style.display = "flex";
}

function deleteCookie(name) {
    document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    showCookies(); // Refresh list
}

function closePopup() {
    document.getElementById("cookieOverlay").style.display = "none";
}

function searchForCookie(){
    const query = this.value.toLowerCase();
    const rows = document.querySelectorAll("#cookieTableBody tr");

    rows.forEach(row => {
        const cookieName = row.cells[0].textContent.toLowerCase();
        if (cookieName.includes(query)) {
            row.style.display = "";
        } else {
            row.style.display = "none";
        }
    });
}

function exportAsJson() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        chrome.cookies.getAll({ url: tab.url }, (cookies) => {
            const cookieData = cookies.map(cookie => ({
                name: cookie.name,
                value: cookie.value,
                domain: cookie.domain,
                path: cookie.path,
                expirationDate: cookie.expirationDate ? 
                    new Date(cookie.expirationDate * 1000).toLocaleString() : 
                    'Session Cookie',
                secure: cookie.secure,
                httpOnly: cookie.httpOnly
            }));

            const dataStr = JSON.stringify(cookieData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            
            chrome.downloads.download({
                url: url,
                filename: 'cookies.json',
                saveAs: true
            });
        });
    });
}

function exportAsCsv() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        chrome.cookies.getAll({ url: tab.url }, (cookies) => {
            const headers = ['Name', 'Value', 'Domain', 'Path', 'Expiration Date', 'Secure', 'HttpOnly'];
            const csvRows = [headers];

            cookies.forEach(cookie => {
                csvRows.push([
                    cookie.name,
                    cookie.value,
                    cookie.domain,
                    cookie.path,
                    cookie.expirationDate ? 
                        new Date(cookie.expirationDate * 1000).toLocaleString() : 
                        'Session Cookie',
                    cookie.secure,
                    cookie.httpOnly
                ]);
            });

            const csvContent = csvRows
                .map(row => row
                    .map(cell => `"${String(cell).replace(/"/g, '""')}"`)
                    .join(',')
                )
                .join('\n');

            const dataBlob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(dataBlob);
            
            chrome.downloads.download({
                url: url,
                filename: 'cookies.csv',
                saveAs: true
            });
        });
    });
}