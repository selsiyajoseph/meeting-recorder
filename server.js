import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';

const app = express();
const PORT = 9876;

app.use(cors());
app.use(express.json());

let state = {
    isRunning: true,
    isRecording: false,
    currentMeeting: null,
    recordingStartTime: null,
    meetingHistory: [],
    micMuted: false
};

console.log("=".repeat(50));
console.log("🎙️  HUDDLE RECORDER SERVER");
console.log("=".repeat(50));

// GET /status - Check status
app.get('/status', (req, res) => {
    const duration = state.recordingStartTime 
        ? Math.round((Date.now() - state.recordingStartTime) / 1000) 
        : 0;
    
    res.json({
        isRunning: state.isRunning,
        isRecording: state.isRecording,
        currentMeeting: state.currentMeeting,
        recordingDuration: duration,
        micMuted: state.micMuted || false
    });
});

// POST /meeting-started - Huddle call detected
app.post('/meeting-started', (req, res) => {
    console.log("\n📞 MEETING STARTED!");
    console.log(`   URL: ${req.body.url || 'N/A'}`);
    console.log(`   Title: ${req.body.title || 'N/A'}`);
    console.log(`   Time: ${new Date(req.body.timestamp).toLocaleTimeString()}`);
    
    state.isRecording = true;
    state.recordingStartTime = Date.now();
    state.currentMeeting = {
        url: req.body.url,
        title: req.body.title,
        startTime: req.body.timestamp
    };
    
    state.meetingHistory.push({
        ...state.currentMeeting,
        status: 'started',
        recordedAt: new Date().toISOString()
    });
    
    console.log("▶️  Recording state: ACTIVE\n");
    
    res.json({ 
        success: true, 
        message: 'Meeting detected - Recording started',
        recordingStartTime: state.recordingStartTime
    });
});

// POST /meeting-ended - Huddle call ended
app.post('/meeting-ended', (req, res) => {
    const duration = state.recordingStartTime 
        ? Math.round((Date.now() - state.recordingStartTime) / 1000)
        : 0;
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    
    console.log("\n📴 MEETING ENDED!");
    console.log(`   Duration: ${mins}m ${secs}s`);
    console.log(`   Time: ${new Date().toLocaleTimeString()}`);
    
    if (state.currentMeeting && state.meetingHistory.length > 0) {
        const last = state.meetingHistory[state.meetingHistory.length - 1];
        last.endTime = Date.now();
        last.duration = duration;
        last.status = 'ended';
    }
    
    state.isRecording = false;
    state.recordingStartTime = null;
    
    console.log("⏹️  Recording state: STOPPED\n");
    
    res.json({
        success: true,
        message: 'Meeting ended - Recording stopped',
        duration: duration,
        durationFormatted: `${mins}m ${secs}s`
    });
});

// POST /start-recording - Manual start
app.post('/start-recording', (req, res) => {
    console.log("\n▶️  MANUAL START");
    if (state.isRecording) {
        return res.json({ success: false, message: 'Already recording' });
    }
    state.isRecording = true;
    state.recordingStartTime = Date.now();
    console.log("▶️  Recording manually started\n");
    res.json({ success: true, message: 'Recording started' });
});

// POST /stop-recording - Manual stop
app.post('/stop-recording', (req, res) => {
    console.log("\n⏹️  MANUAL STOP");
    if (!state.isRecording) {
        return res.json({ success: false, message: 'Not recording' });
    }
    const duration = state.recordingStartTime 
        ? Math.round((Date.now() - state.recordingStartTime) / 1000)
        : 0;
    state.isRecording = false;
    state.recordingStartTime = null;
    console.log(`⏹️  Recording stopped (${duration}s)\n`);
    res.json({ success: true, message: 'Recording stopped', duration });
});

// GET /history - Meeting history
app.get('/history', (req, res) => {
    res.json(state.meetingHistory);
});

// POST /mic-muted
app.post('/mic-muted', (req, res) => {
    console.log("🔇 Microphone muted");
    state.micMuted = true;
    res.json({ success: true, micMuted: true });
});

// POST /mic-unmuted
app.post('/mic-unmuted', (req, res) => {
    console.log("🎤 Microphone unmuted");
    state.micMuted = false;
    res.json({ success: true, micMuted: false });
});

app.listen(PORT, () => {
    console.log(`\n🚀 Server running: http://localhost:${PORT}`);
    console.log("\n📋 Endpoints:");
    console.log("   GET  /status");
    console.log("   GET  /history");
    console.log("   POST /meeting-started");
    console.log("   POST /meeting-ended");
    console.log("   POST /start-recording");
    console.log("   POST /stop-recording");
    console.log("\n⏳ Waiting for extension...\n");
});