const cookieCategories = {
    essential: {
        patterns: ["session", "auth", "login", "security", "csrf", "token", "necessary", "required", "essential"],
        name: 'Essential'
    },
    functional: {
        patterns: ["preferences", "settings", "language", "timezone", "region", "country", "saved", "functional"],
        name: 'Functional'
    },
    analytics: {
        patterns: ["analytics", "stats", "measurement", "metric", "ga", "gtm", "_ga", "_gid", "_gat", "utma", "utmb", "utmc", "utmt", "utmz",  "amplitude", "mixpanel", "plausible", "clarity"],
        name: 'Analytics'
    },
    advertising: {
        patterns: [
            "ad", "ads", "advert", "marketing", "promotion", "targeting", "affiliate", "conversion", "personalization", "retargeting", "campaign", "fbclid", "gclid", "doubleclick", "dcm", "criteo", "pixel", "impression"
        ],
        name: 'Advertising'
    },
    preferences: {
        patterns: ['theme', 'lang', 'preferences', 'settings'],
        name: 'Preferences'
    },
    social: {
        patterns: ['facebook', 'fb', 'twitter', 'linkedin', 'instagram', 'insta'],
        name: 'Social Media'
    }
};

function categorizeCookie(cookie) {
    const cookieName = cookie.name.toLowerCase();
    let category = 'Unknown';
    let isSuspiciousEssential = false;

    // Check each category's patterns
    for (const [type, data] of Object.entries(cookieCategories)) {
        if (data.patterns.some(pattern => cookieName.includes(pattern))) {
            category = data.name;
            
            // Check for suspicious "essential" cookies
            if (type !== 'essential' && 
                cookieCategories.essential.patterns.some(pattern => cookieName.includes(pattern))) {
                isSuspiciousEssential = true;
            }
            break;
        }
    }

    return { category, isSuspiciousEssential };
}

let cookieStats = {
    totalCookiesPerDomain: {},
    modifiedCookies: {}
};

// Function to count cookies per domain
function updateTotalCookiesPerDomain(cookie, changeType) {
    const domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;

    if (!cookieStats.totalCookiesPerDomain[domain]) {
        cookieStats.totalCookiesPerDomain[domain] = 0;
    }

    if (changeType === "added") {
        cookieStats.totalCookiesPerDomain[domain]++;
    } else if (changeType === "removed") {
        cookieStats.totalCookiesPerDomain[domain] = Math.max(0, cookieStats.totalCookiesPerDomain[domain] - 1);
    }

    // Send updated stats to persistent.js
    chrome.runtime.sendMessage({ type: "updateTotalCookies", data: cookieStats.totalCookiesPerDomain });
}

// Function to track cookie modifications
function updateModifiedCookies(cookie) {
    const cookieKey = `${cookie.domain}:${cookie.name}`;

    if (!cookieStats.modifiedCookies[cookieKey]) {
        cookieStats.modifiedCookies[cookieKey] = { name: cookie.name, domain: cookie.domain, count: 0 };
    }

    cookieStats.modifiedCookies[cookieKey].count++;

    // Send updated stats to persistent.js
    chrome.runtime.sendMessage({ type: "updateModifiedCookies", data: cookieStats.modifiedCookies });
}

function updateCookieSizes(cookie) {
    const cookieKey = `${cookie.domain}:${cookie.name}`;
    const size = new Blob([JSON.stringify(cookie)]).size; // Approximate size

    chrome.storage.local.get(["cookieSizes"], (data) => {
        let cookieSizes = data.cookieSizes || {};

        // Store or update cookie size
        cookieSizes[cookieKey] = {
            name: cookie.name,
            domain: cookie.domain,
            size
        };

        // Save updated size data
        chrome.storage.local.set({ cookieSizes }, () => {
            updateSizeStats(cookieSizes);
        });
    });
}

// Function to find largest cookies
function updateSizeStats(cookieSizes) {
    let sortedCookies = Object.values(cookieSizes).sort((a, b) => b.size - a.size); // Sort by size (descending)

    let largestCookies = sortedCookies.slice(0, 5); // Top 5 largest cookies

    chrome.runtime.sendMessage({
        type: "updateLargestCookies",
        largestCookies
    });
}

// Listen for cookie changes
chrome.cookies.onChanged.addListener((changeInfo) => {
    if (!changeInfo.cookie) return;

    const cookie = changeInfo.cookie;
    const changeType = changeInfo.removed ? "removed" : "added";

    updateTotalCookiesPerDomain(cookie, changeType);
    updateModifiedCookies(changeInfo.cookie);
    updateCookieSizes(changeInfo.cookie);

    let message = "";
    let securityWarnings = [];
    const { category, isSuspiciousEssential } = categorizeCookie(cookie);

    chrome.storage.sync.get(["loggingTab"], (result) => {
        const loggingTab = result.loggingTab;
        if (!loggingTab) return;

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTabId = tabs[0].id;
            const currentTabHostname = new URL(tabs[0].url).hostname;

            if (currentTabId == loggingTab) {
                // Detect Third-Party Cookie
                const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.substr(1) : cookie.domain;
                const isThirdParty = !currentTabHostname.includes(cookieDomain) && !cookieDomain.includes(currentTabHostname);
                
                if (isThirdParty) {
                    console.log(`🟦 Third-party cookie detected: ${cookie.name} from ${cookieDomain}`);
                }

                // Identify modification cause
                let source = "Modified by website";
                if (changeInfo.cause === "overwrite") source = "Overwritten by server";
                if (changeInfo.cause === "expired_overwrite") source = "Modified by another extension";

                // Detect Security Issues
                if (!cookie.httpOnly) securityWarnings.push("Insecure cookie detected - missing HttpOnly flag");
                if (!cookie.secure) securityWarnings.push("Cookie is sent over HTTP - vulnerable to interception");
                if (cookie.sameSite === "unspecified") securityWarnings.push("No SameSite policy - Cross-site access allowed");
                if (isSuspiciousEssential) securityWarnings.push("Suspicious essential cookie - possible tracking");

                // Detect Expiration & Session Hijacking
                let expirationInfo = "Session cookie (expires when closed)";
                if (cookie.expirationDate) {
                    let expiryDate = new Date(cookie.expirationDate * 1000);
                    let expiryYears = (cookie.expirationDate - Date.now() / 1000) / (60 * 60 * 24 * 365);
                    expirationInfo = `Expires on ${expiryDate.toUTCString()}`;
                    if (expiryYears > 2) securityWarnings.push("Excessively long expiration - Possible GDPR violation");
                }

                const sessionKeywords = ["session", "auth", "token"];
                const isSessionCookie = sessionKeywords.some(keyword => cookie.name.toLowerCase().includes(keyword));
                
                if (changeInfo.removed) {
                    message = `🚨 Cookie Removed: ${cookie.name}`;
                    if (isSessionCookie) securityWarnings.push("Session cookie deleted - Possible session hijacking!");
                } else {
                    message = changeInfo.cause === "explicit"
                        ? `🆕 New Cookie: ${cookie.name} (Essential)` 
                        : `✏️ Cookie Modified: ${cookie.name}`;
                }

                // Format Security Issues for display
                let securityMessage = securityWarnings.length > 0 
                    ? `<ul>${securityWarnings.map(issue => `<li>${issue}</li>`).join("")}</ul>` 
                    : "";

                // Essential Cookie Info - Styled Green Button
                let essentialInfo = `${cookie.name} <span class="essential-btn">Category: ${category}</span>`;

                // Send formatted log message
                chrome.runtime.sendMessage({
                    type: "cookieChange",
                    message,
                    essentialInfo,
                    securityMessage,
                    expirationInfo
                });

                // Alert for critical security issues
                if (securityWarnings.length > 0) {
                    showNotification("⚠️ Security Alert!", message);
                }
            }
        });
    });
});


// Helper function to create notifications
function showNotification(title, message) {
    chrome.storage.sync.get("notifications", (data) => {
        if (data.notifications) { // Only show if enabled
            chrome.notifications.create(
                "",
                {
                    type: "basic",
                    iconUrl: "Logo.png",
                    title: title,
                    message: message
                },
                (notificationId) => {
                    if (chrome.runtime.lastError) {
                        console.error("Notification Error:", chrome.runtime.lastError.message);
                    } else {
                        console.log("Notification Created:", notificationId);
                    }
                }
            );
        } else {
            console.log("Notifications are disabled, skipping.");
        }
    });
}

// Monitor cookies on tab navigation
chrome.webNavigation.onCompleted.addListener((details) => {
    chrome.tabs.get(details.tabId, (tab) => {
        if (tab.url) {
            chrome.cookies.getAll({ url: tab.url }, (cookies) => {
                cookies.forEach((cookie) => {
                    if (!cookie.httpOnly) {
                        console.warn("⚠️ Insecure cookie detected (missing HttpOnly):", cookie);
                        showNotification(
                            "Insecure Cookie Detected",
                            `⚠️ Cookie ${cookie.name} is missing HttpOnly.`
                        );
                    }
                });
            });
        }
    });
}, { url: [{ urlMatches: ".*" }] });

// Add message relay handler for third-party cookies
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "thirdPartyCookiesList") {
        // Relay the message to all tabs
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, message).catch(() => {
                    // Ignore errors for tabs that can't receive messages
                });
            });
        });
    }
});

const tabUrls = {};
console.log("TABS: ", tabUrls);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.url) {
        tabUrls[tabId] = tab.url;
    }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    console.log(`Tab ${tabId} closed.`);

    chrome.storage.sync.get(["autoDelete", "whitelistedCookies"], (data) => {
        if (data.autoDelete && tabUrls[tabId]) {
            let whitelistedCookies = data.whitelistedCookies || [];

            chrome.cookies.getAll({ url: tabUrls[tabId] }, (cookies) => {
                if (chrome.runtime.lastError) {
                    console.error("Error getting cookies:", chrome.runtime.lastError);
                    return;
                }

                cookies.forEach(cookie => {
                    if (whitelistedCookies.includes(cookie.name)) {
                        console.log(`Skipping whitelisted cookie: ${cookie.name}`);
                        return; // Skip deletion for whitelisted cookies
                    }

                    const cookieUrl = (cookie.secure ? "https://" : "http://") + cookie.domain + cookie.path;

                    chrome.cookies.remove({ url: cookieUrl, name: cookie.name }, () => {
                        if (chrome.runtime.lastError) {
                            console.error(`Error deleting ${cookie.name}:`, chrome.runtime.lastError);
                        } else {
                            console.log(`Deleted cookie: ${cookie.name}`);
                        }
                    });
                });

                delete tabUrls[tabId]; // Remove tab entry after processing
            });
        }
    });
});
