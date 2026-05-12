// content.js - Improved Huddle Meeting Detection
(function() {
    'use strict';

    const API_BASE = 'http://localhost:9876';
    let meetingActive = false;

    console.log("🔍 Huddle Detector v2 loaded");

    function showIndicator(message, color = '#4CAF50') {
        const existing = document.getElementById('huddle-detector-indicator');
        if (existing) existing.remove();

        const div = document.createElement('div');
        div.id = 'huddle-detector-indicator';
        div.style.cssText = `
            position: fixed; top: 20px; right: 20px;
            background: ${color}; color: white;
            padding: 10px 18px; border-radius: 20px;
            font-family: Arial, sans-serif; font-size: 13px;
            font-weight: 600; z-index: 999999;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            pointer-events: none;
        `;
        div.textContent = message;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 4000);
    }
    function notifyServer(action, data) {
    chrome.runtime.sendMessage({
        action: action,
        data: data
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Send failed:", chrome.runtime.lastError.message);
        } else {
            console.log("Sent to background OK");
        }
    });
}

    function isInHuddleCall() {
        // Method 1: Check for "End call" / "Leave call" buttons
        const allButtons = document.querySelectorAll('button');
        for (const btn of allButtons) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            const text = (btn.textContent || '').toLowerCase();
            
            if (label.includes('end call') || label.includes('leave call') || 
                label.includes('hang up') || label.includes('disconnect') ||
                text.includes('end call') || text.includes('leave call')) {
                return true;
            }
        }

        // Method 2: Check for active video elements
        const videos = document.querySelectorAll('video');
        for (const v of videos) {
            if (v.offsetParent !== null && v.videoWidth > 0 && v.srcObject) {
                return true;
            }
        }

        // Method 3: Check for call UI elements (Google Meet/Huddle specific)
        const callUI = document.querySelector(
            '[data-call-end-button], ' +
            '[data-meeting-id], ' +
            '[jsname="CQylAd"], ' +
            'button[jsname="CuS0Bf"], ' +
            '[aria-label*="huddle"], ' +
            '[data-huddle-id]'
        );
        
        if (callUI && callUI.offsetParent !== null) {
            return true;
        }

        // Method 4: Check page title for meeting indicators
        if (document.title.includes('Meeting') || document.title.includes('Huddle')) {
            const meetingContainer = document.querySelector(
                '[role="main"], [role="region"], .meeting-container, .call-container'
            );
            if (meetingContainer) return true;
        }

        return false;
    }

    function detectCall() {
        const inCall = isInHuddleCall();
        console.log(`🔍 Detection check: inCall=${inCall}, meetingActive=${meetingActive}`);

        if (inCall && !meetingActive) {
            // CALL STARTED
            meetingActive = true;
            console.log("🎬 CALL STARTED - Sending to server");
            
            notifyServer('meeting-started', {
                url: window.location.href,
                title: document.title || 'Huddle Meeting',
                timestamp: Date.now(),
                service: 'huddle'
            });
            
            showIndicator('📹 Huddle Detected - Recording Started', '#4CAF50');
        } 
        else if (!inCall && meetingActive) {
            // CALL ENDED
            meetingActive = false;
            console.log("🛑 CALL ENDED - Sending to server");
            
            notifyServer('meeting-ended', {
                url: window.location.href,
                timestamp: Date.now()
            });
            
            showIndicator('✅ Meeting Ended - Recording Saved', '#667eea');
        }
    }

    // ==========================================
// MUTE DETECTION
// ==========================================
let isMicMuted = false;

function checkMicMute() {
    const muteButtons = document.querySelectorAll('button[data-is-muted]');
    
    for (const btn of muteButtons) {
        const muted = btn.getAttribute('data-is-muted');
        
        if (muted === 'true' && !isMicMuted) {
            isMicMuted = true;
            console.log("🔇 MIC MUTED");
            notifyServer('mic-muted', {
                timestamp: Date.now()
            });
            showIndicator('🔇 Microphone Muted', '#FF9800');
        }
        else if (muted === 'false' && isMicMuted) {
            isMicMuted = false;
            console.log("🎤 MIC UNMUTED");
            notifyServer('mic-unmuted', {
                timestamp: Date.now()
            });
            showIndicator('🎤 Microphone Active', '#4CAF50');
        }
    }
}



    // Watch for ALL button clicks (more reliable than aria-label matching)
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        const text = (btn.textContent || '').toLowerCase();
        
        // Detect call start button clicks
        if (label.includes('call') || text.includes('call') || 
            label.includes('start') || text.includes('start')) {
            console.log("📞 Call-related button clicked:", label || text);
            // Wait for call UI to appear, then check
            setTimeout(detectCall, 3000);
            setTimeout(detectCall, 5000);
            setTimeout(detectCall, 8000);
        }
    }, true);

    // Also watch for keyboard shortcuts and Enter key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            setTimeout(detectCall, 2000);
        }
    }, true);

    // Start detection
    function init() {
    console.log("🔍 Starting Huddle detection...");
    
    setTimeout(detectCall, 2000);
    setTimeout(detectCall, 5000);
    
    setInterval(detectCall, 2000);
    setInterval(checkMicMute, 3000);    // ← ADD THIS
    
    const observer = new MutationObserver(() => {
        detectCall();
                       // ← ADD THIS
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-label', 'class', 'data-is-muted']  // ← ADD data-is-muted
    });
    
    console.log("✅ Huddle Detector active - watching for calls");
}

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

    // Cleanup on page close
    window.addEventListener('beforeunload', () => {
        if (meetingActive) {
            notifyServer('meeting-ended', {
                url: window.location.href,
                timestamp: Date.now()
            });
        }
    });
})();
