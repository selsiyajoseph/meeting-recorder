use std::process::Command;
use std::sync::Mutex;
use std::fs;
use std::path::PathBuf;

struct RecorderState {
    is_recording: Mutex<bool>,
    current_filename: Mutex<Option<String>>,
}

#[tauri::command]
fn start_recording(state: tauri::State<RecorderState>) -> Result<String, String> {
    let mut is_rec = state.is_recording.lock().map_err(|e| e.to_string())?;
    
    if *is_rec {
        return Err("Already recording".to_string());
    }

    let output_dir = dirs_next::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("HuddleRecordings");
    
    fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Cannot create directory: {}", e))?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    
    let filename = format!("huddle_recording_{}.mkv", timestamp);
    let output_path = output_dir.join(&filename);

    println!("🎬 Starting recording: {}", filename);
    println!("📁 Path: {}", output_path.display());

    // Use the EXACT SAME command that worked in terminal
    let child = Command::new("ffmpeg")
    .args([
    "-f", "gdigrab",
    "-framerate", "30",
    "-i", "desktop",
    "-f", "dshow",
    "-i", "audio=Microphone Array (AMD Audio Device)",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "28",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-f", "matroska",
    "-y",
    output_path.to_str().unwrap(),
])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start FFmpeg: {}", e))?;

    let pid = child.id();
    
    // Save PID to file for later killing
    let pid_path = output_dir.join(format!("recording_{}.pid", pid));
    fs::write(&pid_path, pid.to_string()).ok();

    // Store filename for later
    let mut current = state.current_filename.lock().map_err(|e| e.to_string())?;
    *current = Some(filename.clone());

    *is_rec = true;
    
    // Detach the process so it keeps running in background
    // This is important - we don't want to wait for it
    std::mem::forget(child);

    println!("✅ Recording started (PID: {})", pid);

    Ok(filename)
}

#[tauri::command]
fn stop_recording(state: tauri::State<RecorderState>) -> Result<serde_json::Value, String> {
    let mut is_rec = state.is_recording.lock().map_err(|e| e.to_string())?;
    
    if !*is_rec {
        return Ok(serde_json::json!({
            "success": false,
            "message": "Not recording"
        }));
    }

    println!("⏹️ Stopping recording...");

    let output_dir = dirs_next::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("HuddleRecordings");

    // Kill ALL ffmpeg processes (ensures recording stops)
    let _ = Command::new("taskkill")
        .args(["/IM", "ffmpeg.exe", "/F"])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output();

    println!("📤 FFmpeg processes killed");

    *is_rec = false;

    // Wait for file to be written
    std::thread::sleep(std::time::Duration::from_secs(2));

    // Get the saved filename
    let current = state.current_filename.lock().map_err(|e| e.to_string())?;
    let filename = current.clone().unwrap_or_default();
    let file_path = output_dir.join(&filename);

    println!("🔍 Checking: {}", file_path.display());

    match fs::metadata(&file_path) {
        Ok(meta) => {
            let size_mb = meta.len() as f64 / 1_048_576.0;
            println!("✅ File found! {} ({:.2} MB)", filename, size_mb);
            
            if meta.len() < 1000 {
                println!("⚠️ File is too small ({} bytes) - may be corrupted", meta.len());
            }
            
            Ok(serde_json::json!({
                "success": true,
                "filename": filename,
                "fileSize": meta.len(),
                "fileSizeMB": format!("{:.2}", size_mb),
                "path": file_path.to_string_lossy().to_string()
            }))
        }
        Err(e) => {
            println!("❌ File not found: {}", e);
            
            // List files in directory for debugging
            if let Ok(entries) = fs::read_dir(&output_dir) {
                println!("📁 Directory contents:");
                for entry in entries.flatten() {
                    println!("   - {}", entry.path().display());
                }
            }
            
            Ok(serde_json::json!({
                "success": false,
                "message": format!("File not found: {}", e)
            }))
        }
    }
}

#[tauri::command]
fn get_status(state: tauri::State<RecorderState>) -> Result<serde_json::Value, String> {
    let is_rec = state.is_recording.lock().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "isRunning": true,
        "isRecording": *is_rec,
        "currentFile": null
    }))
}

#[tauri::command]
fn get_recordings() -> Result<Vec<serde_json::Value>, String> {
    let output_dir = dirs_next::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("HuddleRecordings");
    
    if !output_dir.exists() {
        return Ok(vec![]);
    }

    let mut recordings = Vec::new();
    if let Ok(entries) = fs::read_dir(&output_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            
            // Only include actual recordings (not PID files)
            if name.ends_with(".mp4") || name.ends_with(".webm") {
                if let Ok(meta) = entry.metadata() {
                    if meta.len() > 1000 {  // Only show files > 1KB
                        recordings.push(serde_json::json!({
                            "name": name,
                            "size": meta.len(),
                            "path": path.to_string_lossy()
                        }));
                    }
                }
            }
        }
    }

    // Sort by name (newest first - timestamps are in filename)
    recordings.sort_by(|a, b| b["name"].as_str().cmp(&a["name"].as_str()));
    Ok(recordings)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let output_dir = dirs_next::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("HuddleRecordings");
    
    fs::create_dir_all(&output_dir).ok();
    println!("📁 Recordings saved to: {}", output_dir.display());

    tauri::Builder::default()
        .manage(RecorderState {
            is_recording: Mutex::new(false),
            current_filename: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            start_recording,
            stop_recording,
            get_status,
            get_recordings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}