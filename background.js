// Listen for cookie changes
chrome.cookies.onChanged.addListener((changeInfo) => {
    if (!changeInfo.cookie) return; // Ignore undefined cookie changes

    const cookie = changeInfo.cookie;
    let message = "";
    let source = "Unknown source";
    let cookieDetail = "";
    let securityWarnings = [];

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
        cookieDetail = `Key: ${cookie.name}; Value: ${cookie.value || "undefined"}`;

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
        cookieDetail = `Key: ${cookie.name}; Value: ${cookie.value || "undefined"}`;

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
    chrome.runtime.sendMessage({ type: "cookieChange", message, cookieDetail });

    // Show notification for critical security issues
    if (securityWarnings.length > 0) {
        showNotification("⚠️ Security Alert!", message);
    }
});

// Helper function to create notifications
function showNotification(title, message) {
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
