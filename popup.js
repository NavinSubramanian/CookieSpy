document.addEventListener("DOMContentLoaded", () => {
    const cookieSearch = document.getElementById("cookieSearch") || false;
    const viewCookies = document.getElementById("viewCookies") || false;
    const closePopup = document.getElementById("closePopup") || false;
    const exportJson = document.getElementById("exportJson") || false;
    const exportCsv = document.getElementById("exportCsv") || false;
    const addCookiebtn = document.getElementById("addCookie") || false;
    
    if(addCookiebtn) addCookiebtn.addEventListener("click", addNewCookie);
    if (cookieSearch) cookieSearch.addEventListener("input", searchForCookie);
    if (viewCookies) viewCookies.addEventListener("click", showCookies);
    if (closePopup) closePopup.addEventListener("click", closePopup);
    if (exportJson) exportJson.addEventListener("click", exportAsJson);
    if (exportCsv) exportCsv.addEventListener("click", exportAsCsv);

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
    if (autoDeleteCookies) {
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
                tableBody.innerHTML = "<tr><td colspan='7'>No cookies found</td></tr>";
                return;
            }

            // Retrieve whitelisted cookies from storage
            chrome.storage.sync.get(["whitelistedCookies"], (data) => {
                let whitelistedCookies = data.whitelistedCookies || [];

                cookies.forEach(cookie => {
                    let row = document.createElement("tr");

                    let cookieSize = encodeURIComponent(cookie.name + "=" + cookie.value).length;
                    let sizeThreshold = 4096;
                    let performanceQuality = cookieSize > sizeThreshold ? "High Impact" : "Low Impact";

                    let expiration = cookie.expirationDate ? 
                        new Date(cookie.expirationDate * 1000).toLocaleString() : 
                        "Session Cookie";

                    let isWhitelisted = whitelistedCookies.includes(cookie.name);

                    row.innerHTML = `
                        <td contenteditable="true" class="editable cookie-name">${cookie.name}</td>
                        <td contenteditable="true" class="editable cookie-value">${cookie.value}</td>
                        <td>${expiration}</td>
                        <td>${cookieSize} bytes</td>
                        <td>${performanceQuality}</td>
                        <td>
                            <button class="delete-btn" data-cookie-name="${cookie.name}">Delete</button>
                            <button class="whitelist-btn" data-cookie-name="${cookie.name}">${isWhitelisted ? "Unwhitelist" : "Whitelist"}</button>
                        </td>
                    `;

                    if (isWhitelisted) {
                        row.style.backgroundColor = "#c3f7c3"; // Highlight whitelisted cookies
                    }

                    // Update cookie on edit
                    row.querySelector(".cookie-name").addEventListener("blur", function () {
                        updateCookie(tab.url, cookie.name, this.textContent, cookie.value);
                    });

                    row.querySelector(".cookie-value").addEventListener("blur", function () {
                        updateCookie(tab.url, cookie.name, cookie.name, this.textContent);
                    });

                    // Delete Button Listener
                    row.querySelector('.delete-btn').addEventListener('click', function () {
                        const cookieName = this.getAttribute('data-cookie-name');
                        chrome.cookies.remove({ url: tab.url, name: cookieName }, () => {
                            row.remove();
                            if (tableBody.children.length === 0) {
                                tableBody.innerHTML = "<tr><td colspan='7'>No cookies found</td></tr>";
                            }
                        });
                    });

                    // Whitelist Button Listener
                    row.querySelector('.whitelist-btn').addEventListener('click', function () {
                        const cookieName = this.getAttribute('data-cookie-name');
                        if (whitelistedCookies.includes(cookieName)) {
                            whitelistedCookies = whitelistedCookies.filter(name => name !== cookieName);
                            row.style.backgroundColor = ""; // Remove highlight
                            this.textContent = "Whitelist";
                        } else {
                            whitelistedCookies.push(cookieName);
                            row.style.backgroundColor = "#c3f7c3"; // Highlight whitelisted row
                            this.textContent = "Unwhitelist";
                        }
                        chrome.storage.sync.set({ whitelistedCookies });
                    });

                    tableBody.appendChild(row);
                });
            });
        });
    });

    document.getElementById("cookieOverlay").style.display = "flex";
}

// Function to update cookie values
function updateCookie(url, oldName, newName, newValue) {
    chrome.cookies.getAll({ url: url }, (cookies) => {
        cookies.forEach(cookie => {
            if (cookie.name === oldName) {
                // Remove the old cookie
                chrome.cookies.remove({ url: url, name: oldName }, () => {
                    // Set the new cookie
                    chrome.cookies.set({
                        url: url,
                        name: newName,
                        value: newValue,
                        path: cookie.path || "/",
                        secure: cookie.secure,
                        httpOnly: cookie.httpOnly,
                        sameSite: cookie.sameSite,
                        expirationDate: cookie.expirationDate
                    });
                });
            }
        });
    });
}

// Function to add a new cookie
function addNewCookie() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        const name = document.getElementById("newCookieName").value;
        const value = document.getElementById("newCookieValue").value;

        console.log(name+" "+value)

        if (!name || !value) {
            alert("Please enter both a name and a value for the cookie.");
            return;
        }

        chrome.cookies.set({
            url: tab.url,
            name: name,
            value: value,
            path: "/",
            expirationDate: (Date.now() / 1000) + 3600 // 1 hour expiry
        }, () => {
            showCookies(); // Refresh table
        });
    });
}



function deleteCookie(name) {
    document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    showCookies(); // Refresh list
}

function closePopup() {
    console.log("Close button clicked")
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

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentUrl = new URL(tabs[0].url).hostname;
    
    getWebsiteScore(currentUrl).then(score => {
        document.getElementById("scoreValue").innerText = score;
    });
});

// Add this after your existing imports
async function getWebsiteScore(url) {
    try {
        let hostname;
        let protocol;
        
        try {
            const urlObj = new URL(url);
            hostname = urlObj.hostname;
            protocol = urlObj.protocol;
        } catch (error) {
            // If URL parsing fails, assume it's just a hostname
            hostname = url;
            protocol = 'http:'; // Default to http
        }
        console.log(protocol+" "+url+" "+hostname);
        // Check common security indicators
        const securityChecks = {
            httpsScore: protocol === 'https:' ? 30 : 0,
            cookieScore: 0,
            domainReputation: 0
        };

        // Get all cookies for the domain
        const cookies = await new Promise(resolve => {
            chrome.cookies.getAll({ domain: hostname }, resolve);
        });

        // Analyze cookies for security practices
        cookies.forEach(cookie => {
            if (cookie.secure) securityChecks.cookieScore += 10;
            if (cookie.httpOnly) securityChecks.cookieScore += 10;
            if (cookie.sameSite !== 'none') securityChecks.cookieScore += 10;
        });

        // Normalize cookie score to max 40 points
        securityChecks.cookieScore = Math.min(40, securityChecks.cookieScore);

        // Check domain reputation using Google Safe Browsing API (you'll need to implement this)
        try {
            const response = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=AIzaSyB-hJcpJqQIvgmCbLtrzM7Wo8LxukARLdU`, {
                method: 'POST',
                body: JSON.stringify({
                    client: {
                        clientId: "your-client-id",
                        clientVersion: "1.0.0"
                    },
                    threatInfo: {
                        threatTypes: ["MALWARE", "SOCIAL_ENGINEERING"],
                        platformTypes: ["ANY_PLATFORM"],
                        threatEntryTypes: ["URL"],
                        threatEntries: [{ url: hostname }]
                    }
                })
            });
            const data = await response.json();
            securityChecks.domainReputation = data.matches ? 0 : 30;
        } catch (error) {
            console.error('Safe Browsing API error:', error);
            securityChecks.domainReputation = 15; // Default score if API fails
        }

        // Calculate total score
        const totalScore = securityChecks.httpsScore + 
                          securityChecks.cookieScore + 
                          securityChecks.domainReputation;

        // Get rating based on score
        let rating;
        if (totalScore >= 90) rating = "A+ (Excellent)";
        else if (totalScore >= 80) rating = "A (Very Good)";
        else if (totalScore >= 70) rating = "B (Good)";
        else if (totalScore >= 60) rating = "C (Fair)";
        else if (totalScore >= 50) rating = "D (Poor)";
        else rating = "F (Unsafe)";

        // Update UI with detailed information
        const scoreElement = document.getElementById("scoreValue");
        if (scoreElement) {
            scoreElement.innerHTML = `
                ${rating} (${totalScore}%)
                <div class="score-details">
                    <small>
                        HTTPS: ${securityChecks.httpsScore}/30<br>
                        Cookie Security: ${securityChecks.cookieScore}/40<br>
                        Domain Safety: ${securityChecks.domainReputation}/30
                    </small>
                </div>
            `;
            
            // Add color coding based on score
            scoreElement.className = '';
            if (totalScore >= 80) scoreElement.classList.add('score-excellent');
            else if (totalScore >= 60) scoreElement.classList.add('score-good');
            else if (totalScore >= 40) scoreElement.classList.add('score-fair');
            else scoreElement.classList.add('score-poor');
        }

        return rating;
    } catch (error) {
        console.error('Error calculating website score:', error);
        return "Unable to calculate score";
    }
}

// Update the existing tab query to use the new scoring system
chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (tabs[0] && tabs[0].url) {
        const hostname = new URL(tabs[0].url).hostname;
        await getWebsiteScore(hostname);
    }
});