const cookieCategories = {
    analytics: {
        patterns: ['_ga', '_gid', 'analytics', 'statistic', '_pk_', 'gtag'],
        name: 'Analytics'
    },
    advertising: {
        patterns: ['_fbp', 'ads', '_gcl', 'doubleclick', 'adwords', 'adsense'],
        name: 'Advertising'
    },
    essential: {
        patterns: ['csrf', 'session', 'auth', 'token', 'secure', 'asp.net'],
        name: 'Essential'
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

// Listen for cookie changes
chrome.cookies.onChanged.addListener((changeInfo) => {
    if (!changeInfo.cookie) return; // Ignore undefined cookie changes

    const cookie = changeInfo.cookie;
    let message = "";
    let source = "Unknown source";
    let cookieDetail = "";
    let thirdPartyMessage = null
    let securityWarnings = [];
    const { category, isSuspiciousEssential } = categorizeCookie(cookie);

    // Check if the current tab is the "loggingTab"
    chrome.storage.sync.get(["loggingTab"], (result) => {
        const loggingTab = result.loggingTab;
        if (!loggingTab) return; // No tab selected for logging, skip the processing

        // Get the current tab ID
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTabId = tabs[0].id;
            const currentTabHostname = new URL(tabs[0].url).hostname;

            // If the current tab is the "loggingTab", proceed
            if (currentTabId == loggingTab) {

                // Check if it's a third-party cookie
                const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.substr(1) : cookie.domain;
                if (!currentTabHostname.includes(cookieDomain) && !cookieDomain.includes(currentTabHostname)) {
                    if (changeInfo.removed) {
                        thirdPartyMessage = `🟥 Third-party cookie removed from ${cookieDomain}: ${cookie.name}`;
                    } else {
                        thirdPartyMessage = `🟦 Third-party cookie added from ${cookieDomain}: ${cookie.name}`;
                    }
                    console.log(thirdPartyMessage);
                }

                if (isSuspiciousEssential) {
                    securityWarnings.push("⚠️ Suspicious 'essential' cookie detected - possible tracking cookie");
                }

                // Identify modification source
                if (changeInfo.cause === "explicit") {
                    source = "Modified by the website itself";
                } else if (changeInfo.cause === "overwrite") {
                    source = "Modified externally (e.g., server response, browser policy)";
                } else if (changeInfo.cause === "expired_overwrite") {
                    source = "Modified by another extension";
                }

                // Track potential session hijacking
                const sessionKeywords = ["session", "auth", "token"];
                const isSessionCookie = sessionKeywords.some(keyword => cookie.name.toLowerCase().includes(keyword));

                if (changeInfo.removed) {
                    let reason = changeInfo.cause === "evicted" ? "Deleted due to storage limit" : "Explicitly deleted";
                    message = `❌ Cookie Removed: ${cookie.name} (${reason})`;
                    cookieDetail = `Category: ${category} || Key: ${cookie.name} || Value: ${cookie.value || "undefined"}`;

                    // Detect unauthorized session deletion
                    if (isSessionCookie) {
                        securityWarnings.push("🚨 Possible session hijacking: A session/auth cookie was deleted!");
                    }
                } else {
                    if (cookie.value === "") {
                        message = `🆕 New Cookie Added: ${cookie.name} (${source})`;
                    } else {
                        message = `✏️ Cookie Modified: ${cookie.name} (${source})`;
                    }
                    cookieDetail = `Category: ${category} || Key: ${cookie.name} || Value: ${cookie.value || "undefined"}`;

                    // Detect potential poisoning attacks (if the value changes unexpectedly)
                    chrome.storage.local.get([cookie.name], (result) => {
                        if (result[cookie.name] && result[cookie.name] !== cookie.value) {
                            securityWarnings.push(`⚠️ Cookie Poisoning Detected: ${cookie.name} was altered unexpectedly!`);
                        }
                        chrome.storage.local.set({ [cookie.name]: cookie.value });
                    });
                }

                // Security warnings
                if (!cookie.httpOnly) {
                    securityWarnings.push("⚠️ JavaScript can access this cookie (httpOnly=false)");
                }
                if (!cookie.secure) {
                    securityWarnings.push("⚠️ This cookie is sent over HTTP (secure=false)");
                }
                if (cookie.sameSite === "unspecified") {
                    securityWarnings.push("⚠️ No SameSite policy set (Cross-site requests allowed)");
                }

                if (securityWarnings.length > 0) {
                    message += ` | Security Issues: ${securityWarnings.join(", ")}`;
                }

                // Log to console
                console.log("Cookie Change Detected:", message);

                // Send message to popup
                chrome.runtime.sendMessage({ type: "cookieChange", message, cookieDetail, thirdPartyMessage });

                // Show notification for critical security issues
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
console.log("TABS: ", tabUrls)

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.url) {
        tabUrls[tabId] = tab.url;
    }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    console.log(`Tab ${tabId} closed.`);
    chrome.storage.sync.get(["autoDelete"], (data) => {
        if (data.autoDelete && tabUrls[tabId]) {
            chrome.cookies.getAll({ url: tabUrls[tabId] }, (cookies) => {
                if (chrome.runtime.lastError) {
                    console.error("Error getting cookies:", chrome.runtime.lastError);
                    return;
                }

                cookies.forEach(cookie => {
                    const cookieUrl = (cookie.secure ? "https://" : "http://") + cookie.domain + cookie.path;

                    chrome.cookies.remove({
                        url: cookieUrl,
                        name: cookie.name
                    }, () => {
                        if (chrome.runtime.lastError) {
                            console.error(`Error deleting ${cookie.name}:`, chrome.runtime.lastError);
                        } else {
                            console.log(`Deleted cookie: ${cookie.name}`);
                        }
                    });
                });

                delete tabUrls[tabId];
            });
        }
    });
});
