import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './App.css';

const API_BASE = 'http://localhost:9876';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordings, setRecordings] = useState([]);
  const [currentFile, setCurrentFile] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [serverOnline, setServerOnline] = useState(false);
  const [meetingDetected, setMeetingDetected] = useState(false);

  // Use refs to avoid stale closure issues
  const isRecordingRef = useRef(isRecording);
  
  // Keep ref in sync
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Timer for recording duration
  useEffect(() => {
    let timer;
    if (isRecording) {
      timer = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => clearInterval(timer);
  }, [isRecording]);

  // Load recordings on mount and when recording stops
  useEffect(() => {
    loadRecordings();
  }, [isRecording]);

  const handleStartRecording = async () => {
    try {
      setMessage('');
      const filename = await invoke('start_recording');
      setIsRecording(true);
      setCurrentFile(filename);
      showMessage(`Recording started!`, 'success');
    } catch (error) {
      showMessage(`Error: ${error}`, 'error');
    }
  };

  const handleStopRecording = async () => {
    try {
      const result = await invoke('stop_recording');
      setIsRecording(false);
      setCurrentFile(null);

      if (result.success) {
        showMessage(`Saved! ${result.fileSizeMB} MB`, 'success');
      }

      // Notify server that we stopped
      try {
        await fetch(`${API_BASE}/stop-recording`, { method: 'POST' });
      } catch (e) {
        // Server might not be running
      }

      loadRecordings();
    } catch (error) {
      showMessage(`Error: ${error}`, 'error');
    }
  };

  const loadRecordings = async () => {
    try {
      const recs = await invoke('get_recordings');
      setRecordings(recs || []);
    } catch (error) {
      console.error('Failed to load recordings:', error);
    }
  };

  const showMessage = (msg, type = 'info') => {
    setMessage(msg);
    setMessageType(type);
    if (type !== 'error') {
      setTimeout(() => setMessage(''), 5000);
    }
  };

  // Check server status and auto-start/stop recording
  useEffect(() => {
    const checkServer = async () => {
      try {
        const res = await fetch(`${API_BASE}/status`);
        const data = await res.json();
        setServerOnline(true);

        // Update meeting detected status
        if (data.currentMeeting) {
          setMeetingDetected(true);
        } else {
          setMeetingDetected(false);
        }

        // Auto-start: Server says recording, but app is not recording
        if (data.isRecording && !isRecordingRef.current) {
          console.log("🎬 Auto-starting recording from server signal");
          // Call start directly
          try {
            const filename = await invoke('start_recording');
            setIsRecording(true);
            setCurrentFile(filename);
          } catch (error) {
            console.error("Auto-start failed:", error);
          }
        }
        // Auto-stop: Server says NOT recording, but app is recording
        else if (!data.isRecording && isRecordingRef.current) {
          console.log("🛑 Auto-stopping recording from server signal");
          try {
            const result = await invoke('stop_recording');
            setIsRecording(false);
            setCurrentFile(null);
            if (result.success) {
              showMessage(`Auto-saved! ${result.fileSizeMB} MB`, 'success');
            }
            loadRecordings();
          } catch (error) {
            console.error("Auto-stop failed:", error);
          }
        }
      } catch (error) {
        setServerOnline(false);
      }
    };

    // Initial check
    checkServer();

    // Poll every 2 seconds
    const interval = setInterval(checkServer, 2000);
    return () => clearInterval(interval);
  }, []); // Empty dependency - runs once on mount

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        background: 'rgba(0,0,0,0.3)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h1 style={{ fontSize: '1.3rem', margin: 0, color: '#e0e0e0' }}>
          <span style={{ marginRight: '8px' }}>🎙️</span>
          Huddle Recorder
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#e0e0e0' }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: serverOnline ? '#4CAF50' : '#f44336',
            display: 'inline-block'
          }} />
          {serverOnline ? 'Server Online' : 'Server Offline'}
        </div>
      </div>

      {/* Main */}
      <div style={{
        maxWidth: '500px', margin: '0 auto', padding: '24px 16px',
        minHeight: 'calc(100vh - 60px)'
      }}>
        {/* Status Card */}
        <div style={{
          background: isRecording ? 'rgba(255,68,68,0.08)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${isRecording ? 'rgba(255,68,68,0.3)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: '16px', padding: '20px', marginBottom: '16px',
          display: 'flex', alignItems: 'center', gap: '16px'
        }}>
          <div style={{
            width: '16px', height: '16px', borderRadius: '50%',
            background: isRecording ? '#ff4444' : '#666',
            animation: isRecording ? 'pulse 1.5s infinite' : 'none'
          }} />
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '1rem', margin: '0 0 4px 0', color: '#e0e0e0' }}>
              {isRecording ? '🔴 Recording in Progress' : '⚪ Ready to Record'}
            </h2>
            {isRecording && (
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#ff4444' }}>
                {formatTime(elapsedTime)}
              </div>
            )}
          </div>
          {meetingDetected && (
            <div style={{
              background: 'rgba(76,175,80,0.2)', color: '#4CAF50',
              padding: '4px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600
            }}>
              Meeting Active
            </div>
          )}
        </div>

        {/* Message */}
        {message && (
          <div style={{
            padding: '12px 16px', borderRadius: '10px', marginBottom: '16px',
            textAlign: 'center', fontSize: '0.85rem',
            background: messageType === 'success' ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.15)',
            border: `1px solid ${messageType === 'success' ? 'rgba(76,175,80,0.3)' : 'rgba(244,67,54,0.3)'}`,
            color: messageType === 'success' ? '#81c784' : '#e57373'
          }}>
            {messageType === 'success' ? '✅ ' : messageType === 'error' ? '❌ ' : 'ℹ️ '}
            {message}
          </div>
        )}

        {/* Controls */}
        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={isRecording ? handleStopRecording : handleStartRecording}
            style={{
              width: '100%', padding: '18px', border: 'none', borderRadius: '14px',
              fontSize: '1rem', fontWeight: 600, cursor: 'pointer',
              background: isRecording
                ? 'linear-gradient(135deg, #ff4444, #d32f2f)'
                : 'linear-gradient(135deg, #667eea, #764ba2)',
              color: 'white',
              transition: 'all 0.3s ease'
            }}
          >
            {isRecording ? (
              <>⏹ Stop & Save Recording</>
            ) : (
              <>▶ Start Recording</>
            )}
          </button>
          {isRecording && (
            <p style={{ textAlign: 'center', fontSize: '0.75rem', opacity: 0.6, marginTop: '10px', color: '#e0e0e0' }}>
              Recording entire screen
            </p>
          )}
        </div>

        {/* Recordings List */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px', padding: '20px', marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#e0e0e0' }}>📁 Saved Recordings</h3>
            <span style={{ fontSize: '0.75rem', opacity: 0.6, color: '#e0e0e0' }}>
              {recordings.length} files
            </span>
          </div>

          {recordings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', opacity: 0.5, color: '#e0e0e0' }}>
              <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📭</div>
              <p style={{ margin: 0 }}>No recordings yet</p>
            </div>
          ) : (
            recordings.map((rec, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px', background: 'rgba(255,255,255,0.02)',
                borderRadius: '10px', marginBottom: '8px'
              }}>
                <span style={{ fontSize: '1.4rem' }}>🎬</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '0.85rem', color: '#e0e0e0',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                  }}>
                    {rec.name}
                  </div>
                  <div style={{ fontSize: '0.7rem', opacity: 0.5, color: '#e0e0e0' }}>
                    {formatFileSize(rec.size)}
                  </div>
                </div>
                {currentFile === rec.name && isRecording && (
                  <span style={{
                    background: 'rgba(255,68,68,0.2)', color: '#ff4444',
                    padding: '3px 8px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 700
                  }}>
                    LIVE
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        {/* Instructions */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px', padding: '20px'
        }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#e0e0e0' }}>🚀 How It Works</h3>
          <ol style={{ paddingLeft: '20px', fontSize: '0.8rem', opacity: 0.7, lineHeight: 1.8, margin: 0, color: '#e0e0e0' }}>
            <li>Load extension from <code>extension-detector/</code></li>
            <li>Start server: <code>npm run server</code></li>
            <li>Open Huddle meeting in Chrome</li>
            <li>Recording auto-starts when extension detects the call</li>
          </ol>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        textAlign: 'center', padding: '16px',
        fontSize: '0.75rem', opacity: 0.4, color: '#e0e0e0',
        borderTop: '1px solid rgba(255,255,255,0.05)'
      }}>
        Recordings saved in <code>~/HuddleRecordings/</code>
      </div>

      {/* CSS Animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(255,68,68,0.5); }
          50% { opacity: 0.6; box-shadow: 0 0 0 12px rgba(255,68,68,0); }
        }
        code {
          background: rgba(255,255,255,0.08);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.75rem;
          color: #e0e0e0;
        }
        button:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(102,126,234,0.3);
        }
      `}</style>
    </div>
  );
}

export default App;