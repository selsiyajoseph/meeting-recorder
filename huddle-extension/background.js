// background.js - Receives messages from content.js and calls the server
console.log("🔄 Background service worker started");

const SERVER_URL = 'http://localhost:9876';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("📨 Background received:", message.action);

    let endpoint;

    // ← PASTE HERE - inside the listener, before the if-else chain
    
    if (message.action === 'meeting-started') {
        endpoint = `${SERVER_URL}/meeting-started`;
    } else if (message.action === 'meeting-ended') {
        endpoint = `${SERVER_URL}/meeting-ended`;
    } else if (message.action === 'mic-muted') {
        endpoint = `${SERVER_URL}/mic-muted`;
    } else if (message.action === 'mic-unmuted') {
        endpoint = `${SERVER_URL}/mic-unmuted`;
    } else {
        sendResponse({ success: false, error: 'Unknown action' });
        return true;
    }

    console.log(`📤 Calling server: ${endpoint}`);

    fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message.data)
    })
    .then(response => response.json())
    .then(data => {
        console.log("✅ Server response:", data);
        sendResponse({ success: true, data: data });
    })
    .catch(error => {
        console.error("❌ Server error:", error.message);
        sendResponse({ success: false, error: error.message });
    });

    return true;
});