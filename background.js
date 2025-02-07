// Listen for cookie changes
chrome.cookies.onChanged.addListener((changeInfo) => {
    if (!changeInfo.cookie) return; // Ignore undefined cookie changes

    const cookie = changeInfo.cookie;
    let message = "";
    let source = "Unknown source";
    let cookieDetail = "";

    // Identify source of modification
    if (changeInfo.cause === "explicit") {
        source = "From the website itself";
    } else if (changeInfo.cause === "overwrite") {
        source = "From outside sources (e.g., server response, browser policy)";
    } else if (changeInfo.cause === "expired_overwrite") {
        source = "From another extension";
    }

    if (changeInfo.removed) {
        let reason = changeInfo.cause === "evicted" ? "Deleted due to storage limit" : "Explicitly deleted";
        message = `❌ Cookie Removed: ${cookie.name} (${reason})`;
        cookieDetail = changeInfo.cookie.value ? `Key: ${cookie.name}; Value: ${changeInfo.cookie.value}` : `Key: ${cookie.name}; Value: undefined`;
    } else {
        if (cookie.value === "") {
            message = `🆕 New Cookie Added: ${cookie.name} (${source})`;
            cookieDetail = changeInfo.cookie.value ? `Key: ${cookie.name}; Value: ${changeInfo.cookie.value}` : `Key: ${cookie.name}; Value: undefined`;
        } else {
            message = `✏️ Cookie Modified: ${cookie.name} (${source})`;
            cookieDetail = changeInfo.cookie.value ? `Key: ${cookie.name}; Value: ${changeInfo.cookie.value}` : `Key: ${cookie.name}; Value: undefined`;
        }
    }

    // Security warnings
    let securityWarnings = [];
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

    // Show notification
    showNotification("Cookie Change Detected", message);
});

// Helper function to create notifications
function showNotification(title, message) {
    chrome.notifications.create({
        type: "basic",
        iconUrl: "icon.png",
        title: title,
        message: message
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
