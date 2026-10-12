// WhisperAuto ExtendScript functions

// Helper function to send message back to CEP panel
function sendMessageToCEP(status, message, data) {
    var eventObj = new CSXSEvent();
    eventObj.type = "com.whisperauto.panel.event";
    eventObj.data = JSON.stringify({
        status: status,
        message: message,
        data: data || ""
    });
    eventObj.dispatch();
}

function exportAudio(presetPath) {
    try {
        var project = app.project;
        if (!project) {
            return "ERROR: No project open.";
        }

        var activeSeq = project.activeSequence;
        if (!activeSeq) {
            return "ERROR: No active sequence selected. Please select a sequence in the timeline.";
        }

        var desktopFolder = Folder.desktop.fsName.replace(/\\/g, '/');
        var audioName = "whisper_temp_audio_" + new Date().getTime() + ".wav";
        var outPath = desktopFolder + "/" + audioName;

        // Try to find standard system WAV presets instead of relying on custom user preset
        var systemPresets = [
            "C:/Program Files/Adobe/Adobe Premiere Pro 2026/Settings/EncoderPresets/Wave48mono16.epr",
            "C:/Program Files/Adobe/Adobe Premiere Pro 2026/Settings/EncoderPresets/Wave48mono24.epr",
            "C:/Program Files/Adobe/Adobe Premiere Pro 2026/MediaIO/systempresets/3F3F3F3F_57415645/Waveform Audio 48kHz 16-bit.epr",
            presetPath // fallback to user preset
        ];

        var finalPresetPath = presetPath;
        for (var i = 0; i < systemPresets.length; i++) {
            var f = new File(systemPresets[i]);
            if (f.exists) {
                finalPresetPath = f.fsName;
                break;
            }
        }

        var presetFile = new File(finalPresetPath);
        if (!presetFile.exists) {
            return "ERROR: Preset file does not exist at " + finalPresetPath;
        }

        // Ensure AME is running before attempting to queue
        app.encoder.launchEncoder();

        // Export active sequence audio via Adobe Media Encoder
        // Use native fsName (backslashes on Windows) for AME API, and 0 for ENCODE_ENTIRE
        var jobID = app.encoder.encodeSequence(activeSeq, new File(outPath).fsName, presetFile.fsName, 0, 1);
        
        app.encoder.startBatch();

        if (jobID) {
            return "SUCCESS:" + outPath;
        } else {
            return "ERROR: Failed to queue export in Adobe Media Encoder.";
        }
    } catch (e) {
        return "ERROR: " + e.toString();
    }
}

function importSRT(srtPath) {
    try {
        var project = app.project;
        if (!project) {
            return "ERROR: No project open.";
        }

        // Import the SRT file into the project bin
        var importResult = project.importFiles([srtPath], false, project.rootItem, false);
        
        if (importResult) {
            return "SUCCESS: SRT imported to project bin.";
        } else {
            return "ERROR: Failed to import SRT into project.";
        }
    } catch (e) {
        return "ERROR: " + e.toString();
    }
}
