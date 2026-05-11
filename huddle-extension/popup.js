async function checkStatus() {
  const statusEl = document.getElementById('status');
  try {
    const res = await fetch('http://localhost:9876/status');
    const data = await res.json();
    if (data.isRecording) {
      statusEl.textContent = '🔴 Recording';
      statusEl.className = 'value offline';
    } else {
      statusEl.textContent = '🟢 Ready';
      statusEl.className = 'value online';
    }
  } catch (e) {
    statusEl.textContent = '❌ App Offline';
    statusEl.className = 'value offline';
  }
}

document.getElementById('refresh').addEventListener('click', checkStatus);
checkStatus();