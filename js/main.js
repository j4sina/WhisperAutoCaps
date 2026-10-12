// Load CSInterface
var csInterface = new CSInterface();
var extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);

// Node.js modules
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

// UI Elements
var transcribeBtn = document.getElementById('transcribeBtn');
var modelSelect = document.getElementById('modelSelect');
var languageSelect = document.getElementById('languageSelect');
var presetPathInput = document.getElementById('presetPath');
var browsePresetBtn = document.getElementById('browsePresetBtn');
var statusContainer = document.getElementById('statusContainer');
var progressBar = document.getElementById('progressBar');
var statusText = document.getElementById('statusText');
var errorContainer = document.getElementById('errorContainer');
var errorText = document.getElementById('errorText');

// Formatting Options
var maxWordsInput = document.getElementById('maxWordsInput');
var highlightCheckbox = document.getElementById('highlightCheckbox');
var highlightColor = document.getElementById('highlightColor');
var colorHex = document.getElementById('colorHex');

// Setup
window.onload = function() {
    loadSettings();
    
    // Color picker sync
    highlightColor.addEventListener('input', function() {
        colorHex.innerText = highlightColor.value;
    });
};

function loadSettings() {
    var savedPreset = localStorage.getItem('whisperauto_preset');
    if (savedPreset) {
        presetPathInput.value = savedPreset;
    }
    
    var savedMaxWords = localStorage.getItem('whisperauto_maxwords');
    if (savedMaxWords) maxWordsInput.value = savedMaxWords;
    
    var savedHighlight = localStorage.getItem('whisperauto_highlight');
    if (savedHighlight !== null) highlightCheckbox.checked = savedHighlight === 'true';
    
    var savedColor = localStorage.getItem('whisperauto_color');
    if (savedColor) {
        highlightColor.value = savedColor;
        colorHex.innerText = savedColor;
    }
}

function saveSettings() {
    localStorage.setItem('whisperauto_preset', presetPathInput.value);
    localStorage.setItem('whisperauto_maxwords', maxWordsInput.value);
    localStorage.setItem('whisperauto_highlight', highlightCheckbox.checked);
    localStorage.setItem('whisperauto_color', highlightColor.value);
}

// UI Helpers
function setStatus(text, progressPercent, isPulse) {
    statusContainer.classList.remove('hidden');
    errorContainer.classList.add('hidden');
    statusText.innerText = text;
    
    if (isPulse) {
        progressBar.classList.add('pulse');
        progressBar.style.width = '100%';
    } else {
        progressBar.classList.remove('pulse');
        progressBar.style.width = progressPercent + '%';
    }
}

function setError(text) {
    statusContainer.classList.add('hidden');
    errorContainer.classList.remove('hidden');
    errorText.innerText = text;
    
    // Reset button
    transcribeBtn.classList.remove('loading');
    transcribeBtn.disabled = false;
}

// Actions
browsePresetBtn.addEventListener('click', function() {
    var result = window.cep.fs.showOpenDialog(
        false, // allow multiple
        false, // choose directory
        "Select Audio Export Preset (.epr)", // title
        "", // initial path
        ["epr"] // file types
    );
    
    if (result.data && result.data.length > 0) {
        presetPathInput.value = result.data[0];
        saveSettings();
    }
});

transcribeBtn.addEventListener('click', function() {
    var presetPath = presetPathInput.value;
    
    if (!presetPath) {
        setError("Please select an Adobe Media Encoder preset (.epr) first.");
        return;
    }

    // Convert path to ExtendScript format (forward slashes)
    var jsxPresetPath = presetPath.replace(/\\/g, '/');

    // Start UI
    transcribeBtn.classList.add('loading');
    transcribeBtn.disabled = true;
    errorContainer.classList.add('hidden');
    
    setStatus("Exporting audio from sequence...", 10, false);

    // Call ExtendScript to export audio
    csInterface.evalScript('exportAudio("' + jsxPresetPath + '")', function(result) {
        if (result.startsWith("ERROR:")) {
            setError(result);
            return;
        }

        if (result.startsWith("SUCCESS:")) {
            var audioPath = result.split("SUCCESS:")[1].trim();
            var winAudioPath = audioPath.replace(/\//g, '\\');
            if (winAudioPath.startsWith('\\c\\') || winAudioPath.startsWith('\\C\\')) {
                winAudioPath = winAudioPath.substring(1, 2) + ":" + winAudioPath.substring(2);
            }
            
            setStatus("Exporting audio via Adobe Media Encoder...", 20, true);
            
            // Wait for AME to finish writing the file
            waitForAudio(winAudioPath, function() {
                runWhisper(winAudioPath);
            });
        }
    });
});

function waitForAudio(audioPath, callback) {
    var retries = 0;
    var lastSize = -1;
    var checkInterval = setInterval(function() {
        if (fs.existsSync(audioPath)) {
            var stats = fs.statSync(audioPath);
            if (stats.size > 0 && stats.size === lastSize) {
                // File exists and size hasn't changed for 1 second, assume done
                clearInterval(checkInterval);
                callback();
            } else {
                lastSize = stats.size;
            }
        } else {
            retries++;
            if (retries > 300) { // 5 minutes timeout
                clearInterval(checkInterval);
                setError("Timeout waiting for audio export from Adobe Media Encoder.");
            }
        }
    }, 1000);
}

function runWhisper(winAudioPath) {
    setStatus("Transcribing with Whisper AI (this may take a while)...", 50, true);

    var pythonScript = path.join(extensionPath, 'python', 'transcribe.py');
    var model = modelSelect.value;
    var lang = languageSelect.value;

    var args = [pythonScript, winAudioPath, '--model', model];
    if (lang) {
        args.push('--language', lang);
    }
    
    var maxWords = parseInt(maxWordsInput.value);
    if (!isNaN(maxWords) && maxWords > 0) {
        args.push('--max-words', maxWords.toString());
    }
    
    if (highlightCheckbox.checked) {
        args.push('--highlight-color', highlightColor.value);
    }

    // Call python script directly using python.exe
    var pythonExecutable = 'python.exe';
    try {
        var pythonPaths = cp.execSync('where python', { encoding: 'utf8' });
        if (pythonPaths) {
            pythonExecutable = pythonPaths.split('\n')[0].trim();
        }
    } catch (e) {
        console.log("Could not find python via where: " + e);
    }

    var pythonProcess = cp.spawn(pythonExecutable, args);
    var errorOutput = "";

    pythonProcess.on('error', function(err) {
        errorOutput += "Spawn error: " + err.toString() + "\n";
    });

    pythonProcess.stdout.on('data', function(data) {
        console.log("Whisper Output: " + data.toString());
        errorOutput += data.toString();
    });

    pythonProcess.stderr.on('data', function(data) {
        console.log("Whisper Error: " + data.toString());
        errorOutput += data.toString();
    });

    pythonProcess.on('close', function(code) {
        if (code !== 0) {
            setError("Whisper failed. Check if python and openai-whisper are installed.\nError: " + errorOutput);
            return;
        }

        setStatus("Transcription complete. Importing SRT...", 90, false);
        
        // Import SRT back into Premiere
        var srtPath = winAudioPath.substring(0, winAudioPath.lastIndexOf('.')) + ".srt";
        var jsxSrtPath = srtPath.replace(/\\/g, '/');

        csInterface.evalScript('importSRT("' + jsxSrtPath + '")', function(result) {
            if (result.startsWith("ERROR:")) {
                setError(result);
            } else {
                setStatus("Done! SRT imported to Project Bin.", 100, false);
                
                // Cleanup temp audio
                try {
                    fs.unlinkSync(winAudioPath);
                } catch(e) {
                    console.log("Could not delete temp audio: " + e);
                }
            }
            
            // Reset button
            transcribeBtn.classList.remove('loading');
            transcribeBtn.disabled = false;
        });
    });
}
