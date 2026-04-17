// Global variables
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let isProcessing = false;
let audioContext;
let analyser;
let currentAudio;
let animationFrame;
let config;
let recordingStartTime = 0;
const MIN_RECORDING_TIME = 500; // Minimum 0.5 seconds

// Request management system
let currentAbortController = null; // For canceling ongoing requests
let currentStreamReader = null; // For canceling streaming responses
let requestInProgress = false; // Track if a request is currently being processed
let lastRequestTime = 0; // Prevent rapid repeated requests
const REQUEST_COOLDOWN = 300; // Minimum ms between requests

// Sentence-by-sentence TTS streaming
let audioQueue = [];
let isPlayingQueue = false;
let partialSentenceBuffer = "";
let processedSentencesCount = 0;
let nextAudioToPlay = 0;

// Input mode: 'audio' | 'text'
let currentInputMode = 'audio';

// DOM elements
let voiceBtn;
let closeBtn;
let voiceVisualizer;
let waveContainer;
let chatMessages;
let textInput;
let sendBtn;
let clearBtn;
let autoPlayToggle;
let statusText;
let chatSection;
let textInputContainer;
let controlsContainer;
let userTranscript;
let activeChunkDisplay;
let voiceSection;
let textSection;
let modeAudioBtn;
let modeTextBtn;
let languageSelect;
let lastUserMessage = "";
let lastBotMessage = "";


// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Load config
    config = window.APP_CONFIG;

    // ── Single point of truth for language ────────────────────────────────────
    // Fetch the language (and other server settings) from /api/config.
    // This means changing WHISPER_LANGUAGE in config.py is the ONLY thing needed
    // to change the bot's language — no frontend edits required.
    try {
        const serverConfig = await fetch('/api/config').then(r => r.json());
        if (serverConfig.whisper_language) {
            config.asr.language = serverConfig.whisper_language;
        }
    } catch (e) {
        // Fallback: keep whatever is in config.js (null → will use server default)
        console.warn('Could not fetch server config, using local asr.language:', config.asr.language);
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Get DOM elements
    voiceBtn = document.getElementById('voiceBtn');
    closeBtn = document.getElementById('closeBtn');
    voiceVisualizer = document.getElementById('voiceVisualizer');
    waveContainer = document.getElementById('waveContainer');
    chatMessages = document.getElementById('chatMessages');
    textInput = document.getElementById('textInput');
    sendBtn = document.getElementById('sendBtn');
    clearBtn = document.getElementById('clearBtn');
    autoPlayToggle = document.getElementById('autoPlayToggle');
    statusText = document.getElementById('statusText');
    chatSection = document.getElementById('chatSection');
    textInputContainer = document.getElementById('textInputContainer');
    controlsContainer = document.getElementById('controlsContainer');
    userTranscript = document.getElementById('userTranscript');
    activeChunkDisplay = document.getElementById('activeChunkDisplay');
    voiceSection = document.getElementById('voiceSection');
    textSection = document.getElementById('textSection');
    modeAudioBtn = document.getElementById('modeAudioBtn');
    modeTextBtn = document.getElementById('modeTextBtn');
    languageSelect = document.getElementById('languageSelect');

    // Pre-select the dropdown to match the server-supplied language,
    // and update the visible display text span
    if (languageSelect && config.asr && config.asr.language) {
        languageSelect.value = config.asr.language;
        const displayEl = document.getElementById('langDisplayText');
        if (displayEl && languageSelect.options[languageSelect.selectedIndex]) {
            displayEl.textContent = languageSelect.options[languageSelect.selectedIndex].text;
        }
    }

    // Apply config
    applyConfiguration();
    applyCustomText();
    applyTheme();

    // Generate waveform bars
    generateWaveformBars();

    // Setup event listeners
    setupEventListeners();

    // Check microphone permission
    checkMicrophonePermission();
});

function showFinalTranscript() {
    if (userTranscript && lastUserMessage && lastBotMessage) {
        const cleanedUserText = cleanText(lastUserMessage);
        const cleanedBotText = cleanText(lastBotMessage);
        userTranscript.innerHTML = `
            <div class="final-transcript">
                <div class="final-user"><span class="muted-text">You</span> <br><strong>${cleanedUserText}</strong></div>
                <div class="final-agent"><span class="muted-text">Agent</span> <br><strong>${cleanedBotText}</strong></div>
            </div>
        `;

        // Scroll to top of transcript area
        const transcriptSection = userTranscript.closest('.transcript-section');
        if (transcriptSection) {
            transcriptSection.scrollTop = 0;
        }
    }
}

function applyConfiguration() {
    const mainContent = document.querySelector('.main-content');

    // Show/hide chat history
    if (!config.features.showChatHistory) {
        chatMessages.style.display = 'none';
    }

    // Show/hide text input
    if (!config.features.showTextInput) {
        if (textInputContainer) {
            textInputContainer.style.display = 'none';
        }
    }

    // Show/hide clear button
    if (!config.features.showClearButton) {
        if (controlsContainer) {
            controlsContainer.style.display = 'none';
        }
    }

    // Hide entire chat section if both chat history and text input are disabled
    if (!config.features.showChatHistory && !config.features.showTextInput) {
        if (chatSection) {
            chatSection.style.display = 'none';
        }
        mainContent.classList.add('voice-only');
    }

    // Show/hide status text
    if (!config.features.showStatusText) {
        statusText.style.display = 'none';
    }

    // Show/hide waveform
    if (!config.features.showWaveform) {
        voiceVisualizer.style.display = 'none';
    }

    // Set auto-play
    if (autoPlayToggle) {
        autoPlayToggle.checked = config.features.autoPlayVoice;
    }
}

function applyCustomText() {
    // Apply custom text from config
    const header = document.querySelector('header h1');

    if (header && config.text.appTitle) {
        header.textContent = config.text.appTitle;
    }

    // Initialize the conversation container with a welcome message if applicable
    if (userTranscript) {
        userTranscript.innerHTML = '';
        if (config.text.welcomeMessage) {
            appendChatBubble(config.text.welcomeMessage, 'agent');
        }
    }
}

function applyTheme() {
    if (config.ui.theme === 'blackwhite') {
        document.body.classList.add('theme-blackwhite');
    } else {
        document.body.classList.remove('theme-blackwhite');
    }
}

function generateWaveformBars() {
    const barCount = 20; // Fixed for 360 visualizer calc
    waveContainer.innerHTML = '';

    for (let i = 1; i <= barCount; i++) {
        const bar = document.createElement('div');
        bar.className = 'wave-bar';
        bar.style.setProperty('--i', i);
        waveContainer.appendChild(bar);
    }
}

function setupEventListeners() {
    // Voice button - click to toggle recording
    voiceBtn.addEventListener('click', handleVoiceClick);

    // Close button - interrupt/cancel
    closeBtn.addEventListener('click', handleCloseClick);

    // Prevent context menu
    voiceBtn.addEventListener('contextmenu', (e) => e.preventDefault());

    // Text input (always wired up; visibility controlled by mode toggle)
    if (sendBtn && textInput) {
        sendBtn.addEventListener('click', sendTextMessage);
        textInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendTextMessage();
        });
    }

    // Clear button (if enabled)
    if (config.features.showClearButton && clearBtn) {
        clearBtn.addEventListener('click', clearConversation);
    }

    // Mode toggle buttons
    if (modeAudioBtn) modeAudioBtn.addEventListener('click', () => switchInputMode('audio'));
    if (modeTextBtn) modeTextBtn.addEventListener('click', () => switchInputMode('text'));

    // Language dropdown — updates ASR language in real-time without page reload
    if (languageSelect) {
        languageSelect.addEventListener('change', () => {
            const newLang = languageSelect.value;
            const newLabel = languageSelect.options[languageSelect.selectedIndex].text;

            // Update the visible display text
            const displayEl = document.getElementById('langDisplayText');
            if (displayEl) displayEl.textContent = newLabel;

            // Update local config so the next recording uses the new language
            if (config.asr) config.asr.language = newLang;

            // Notify server so Whisper prompt (Greek terms, etc.) also updates
            fetch('/api/set-language', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ language: newLang })
            }).catch(() => {}); // Fire-and-forget; client config is enough
        });
    }
}

/**
 * Switches the UI between 'audio' (voice orb) and 'text' (text input) modes.
 */
function switchInputMode(mode) {
    if (mode === currentInputMode) return;
    currentInputMode = mode;

    if (mode === 'text') {
        // Interrupt any active recording/playback before switching
        if (isRecording) cancelRecording();
        if (isProcessing) interruptCurrentAction();

        // Update toggle buttons
        modeAudioBtn.classList.remove('active');
        modeTextBtn.classList.add('active');

        // Show/hide sections
        if (voiceSection) voiceSection.style.display = 'none';
        if (textSection) textSection.style.display = 'flex';

        // Focus the input
        if (textInput) setTimeout(() => textInput.focus(), 50);
    } else {
        // mode === 'audio'
        modeTextBtn.classList.remove('active');
        modeAudioBtn.classList.add('active');

        if (textSection) textSection.style.display = 'none';
        if (voiceSection) voiceSection.style.display = 'flex';
    }
}

async function checkMicrophonePermission() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());

        // Enable button after permission granted
        voiceBtn.disabled = false;
        setStatus(config.text.statusReady, 'default');
    } catch (error) {
        setStatus(config.text.errorMicDenied, 'error');
        voiceBtn.disabled = true;
        console.error('Microphone permission error:', error);
    }
}

function handleVoiceClick(e) {
    e.preventDefault();

    // Prevent action if button is disabled
    if (voiceBtn.disabled) {
        return;
    }

    // If currently recording, stop and submit
    if (isRecording) {
        stopRecording();
        return;
    }

    // If currently speaking or processing, interrupt and allow new recording
    if (isProcessing || requestInProgress) {
        interruptCurrentAction();
        // Small delay to ensure cleanup before starting new recording
        setTimeout(() => {
            startRecording();
        }, 100);
        return;
    }

    // Otherwise, start recording
    startRecording();
}

function handleCloseClick(e) {
    e.preventDefault();

    // If recording, cancel it
    if (isRecording) {
        cancelRecording();
        return;
    }

    // If processing or speaking, interrupt
    if (isProcessing) {
        interruptCurrentAction();
        setStatus(config.text.statusInterrupted, 'default');
        hideCloseButton();
    }
}

function showCloseButton() {
    if (closeBtn) {
        closeBtn.classList.add('visible');
    }
}

function hideCloseButton() {
    if (closeBtn) {
        closeBtn.classList.remove('visible');
    }
}

function abortCurrentRequest() {
    // Abort any ongoing fetch requests
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }

    // Cancel streaming reader if active
    if (currentStreamReader) {
        try {
            currentStreamReader.cancel();
        } catch (e) {
            console.log('Stream reader already closed');
        }
        currentStreamReader = null;
    }

    // Reset request flag
    requestInProgress = false;
}

function interruptCurrentAction() {
    // First, abort any ongoing server requests
    abortCurrentRequest();

    // Stop any currently playing audio
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }

    // Cancel any ongoing animations
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }

    // Remove all active states
    voiceBtn.classList.remove('processing', 'speaking');
    voiceVisualizer.classList.remove('active', 'speaking');

    // Re-enable text inputs
    if (textInput) textInput.disabled = false;
    if (sendBtn) sendBtn.disabled = false;

    // Reset flags
    isProcessing = false;
    requestInProgress = false;

    // Hide close button
    hideCloseButton();

    // Reset wave bars
    const waveBars = waveContainer.querySelectorAll('.wave-bar');
    waveBars.forEach(bar => {
        bar.style.height = '15px';
    });

    // Clear audio queue
    audioQueue = [];
    isPlayingQueue = false;
    partialSentenceBuffer = "";
    processedSentencesCount = 0;
    nextAudioToPlay = 0;

    // Show chat history
    showChatHistory();
}

function cancelRecording() {
    if (!isRecording || !mediaRecorder) return;

    try {
        // Stop the media recorder
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }

        // Stop all media tracks
        if (mediaRecorder && mediaRecorder.stream) {
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }

        isRecording = false;

        // Stop animation
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }

        // Close audio context
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }

        // Clear audio chunks
        audioChunks = [];

        // Reset UI
        voiceBtn.classList.remove('recording');
        voiceVisualizer.classList.remove('active', 'recording');
        setStatus(config.text.statusReady, 'default');

        // Hide close button
        hideCloseButton();

    } catch (error) {
        console.error('Error canceling recording:', error);
        resetUIState();
    }
}

async function startRecording() {
    if (isRecording) return;

    // Ensure any previous requests are fully aborted
    abortCurrentRequest();

    // Clear flags to allow new recording
    isProcessing = false;
    requestInProgress = false;

    try {
        // Use 16kHz — Whisper's native sample rate. This reduces upload size
        // and transcription latency without any loss in ASR accuracy.
        const asrSampleRate = (config.asr && config.asr.sampleRate) ? config.asr.sampleRate : 16000;
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: asrSampleRate
            }
        });

        audioChunks = [];
        recordingStartTime = Date.now();

        mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm'
        });

        // Setup audio context for visualization
        if (config.features.showWaveform) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.8;
        }

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(track => track.stop());

            if (audioContext) {
                audioContext.close();
                audioContext = null;
            }

            // Check recording duration
            const recordingDuration = Date.now() - recordingStartTime;

            if (recordingDuration < MIN_RECORDING_TIME) {
                setStatus(config.text.errorRecordingShort, 'error');
                resetUIState();
                return;
            }

            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

            // Only process if we have meaningful audio
            if (audioBlob.size > 2000) { // At least 2KB
                await processAudio(audioBlob);
            } else {
                setStatus(config.text.errorRecordingShort, 'error');
                resetUIState();
            }
        };

        mediaRecorder.start();
        isRecording = true;

        // Update UI
        voiceBtn.classList.add('recording');
        voiceBtn.classList.remove('processing', 'speaking');
        voiceVisualizer.classList.add('active', 'recording');
        voiceVisualizer.classList.remove('speaking');
        setStatus(config.text.statusRecording, 'recording');

        showActiveChunk('<span class="muted-text">Agent</span><br><strong>Listening...</strong>');

        // Show close button
        showCloseButton();

        // Start visualization
        if (config.features.showWaveform) {
            visualizeAudio();
        }

    } catch (error) {
        setStatus('Error accessing microphone', 'error');
        console.error('Recording error:', error);
        resetUIState();
    }
}

function stopRecording() {
    if (!isRecording || !mediaRecorder) return;

    try {
        mediaRecorder.stop();
        isRecording = false;

        // Stop animation
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }

        // Update UI
        voiceBtn.classList.remove('recording');
        voiceVisualizer.classList.remove('recording');

        // Hide close button
        hideCloseButton();

    } catch (error) {
        console.error('Error stopping recording:', error);
        resetUIState();
    }
}

function visualizeAudio() {
    if (!isRecording || !analyser) {
        return;
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const waveBars = waveContainer.querySelectorAll('.wave-bar');

    function animate() {
        if (!isRecording) {
            // Reset bars
            waveBars.forEach(bar => {
                bar.style.height = '15px';
            });
            return;
        }

        animationFrame = requestAnimationFrame(animate);
        analyser.getByteFrequencyData(dataArray);

        // Calculate step for distributing frequency data across bars
        const step = Math.floor(bufferLength / waveBars.length);

        waveBars.forEach((bar, index) => {
            // Get average of frequency range for this bar
            let sum = 0;
            for (let i = 0; i < step; i++) {
                sum += dataArray[index * step + i];
            }
            const average = sum / step;

            // Calculate height (min 15px, max 140px)
            const height = Math.max(15, Math.min(140, (average / 255) * 140));
            bar.style.height = height + 'px';
        });
    }

    animate();
}

async function processAudio(audioBlob) {
    // Prevent rapid repeated requests
    const now = Date.now();
    if (now - lastRequestTime < REQUEST_COOLDOWN && !requestInProgress) {
        console.log('Request too soon, please wait');
        resetUIState();
        return;
    }
    lastRequestTime = now;

    // Prevent multiple simultaneous requests
    if (requestInProgress) {
        console.log('Request already in progress, aborting previous request');
        abortCurrentRequest();
    }

    // Abort any existing requests before starting new one
    abortCurrentRequest();

    requestInProgress = true;
    isProcessing = true;
    voiceBtn.classList.add('processing');
    voiceVisualizer.classList.remove('active');

    // Show thinking placeholder
    showActiveChunk('<span class="muted-text">Agent</span><br><strong>Thinking...</strong>');

    // Create new AbortController for this request
    currentAbortController = new AbortController();

    try {
        setStatus(config.text.statusProcessing, 'active');

        // Transcribe audio
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        // Pass language so Whisper uses the correct acoustic/language model
        const asrLanguage = (config.asr && config.asr.language) ? config.asr.language : 'el';
        formData.append('language', asrLanguage);

        const transcribeResponse = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData,
            signal: currentAbortController.signal
        });

        if (!transcribeResponse.ok) {
            const errorData = await transcribeResponse.json();
            throw new Error(errorData.error || 'Transcription failed');
        }

        const transcribeData = await transcribeResponse.json();
        const userText = transcribeData.text.trim();

        lastUserMessage = userText;
        lastBotMessage = "";

        // Remove typing indicator if we were showing one
        removeTypingIndicator();

        if (userTranscript && userText) {
            const cleanedUserText = cleanText(userText);
            appendChatBubble(cleanedUserText, 'user');

            // Show typing indicator while waiting for bot response
            showTypingIndicator();
        }

        if (!userText) {
            setStatus(config.text.errorNoSpeech, 'error');
            resetUIState();
            requestInProgress = false;
            return;
        }

        // Immediately start getting response (no delay)
        await getChatResponse(userText);

    } catch (error) {
        // Check if the error is due to abort
        if (error.name === 'AbortError') {
            console.log('Request was aborted by user');
            setStatus(config.text.statusInterrupted, 'default');
        } else {
            setStatus(config.text.errorGeneric + ': ' + error.message, 'error');
            console.error('Process audio error:', error);
        }
        resetUIState();
        requestInProgress = false;
    }
}

async function sendTextMessage() {
    // Prevent rapid repeated requests
    const now = Date.now();
    if (now - lastRequestTime < REQUEST_COOLDOWN && !requestInProgress) {
        console.log('Request too soon, please wait');
        return;
    }
    lastRequestTime = now;

    // Prevent multiple simultaneous requests
    if (requestInProgress) {
        console.log('Request already in progress, aborting previous request');
        abortCurrentRequest();
    }

    const text = textInput.value.trim();

    if (!text) return;

    lastUserMessage = text;
    lastBotMessage = "";

    // Abort any existing requests
    abortCurrentRequest();

    // Create new AbortController for this request
    currentAbortController = new AbortController();

    requestInProgress = true;
    isProcessing = true;
    if (voiceBtn) voiceBtn.classList.add('processing');
    textInput.value = '';
    textInput.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    // Show thinking if auto-play is enabled so it masks the chat history
    if (config.features.autoPlayVoice || (autoPlayToggle && autoPlayToggle.checked)) {
        showActiveChunk('<span class="muted-text">Agent</span><br><strong>Thinking...</strong>');
    }

    if (userTranscript) {
        appendChatBubble(text, 'user');
        if (!config.features.autoPlayVoice && !(autoPlayToggle && autoPlayToggle.checked)) {
            showTypingIndicator();
        }
    }

    setStatus(config.text.statusProcessing, 'active');

    await getChatResponse(text);
}

async function getChatResponse(message) {
    try {
        // Use streaming if enabled
        if (config.features.useStreaming) {
            await getChatResponseStreaming(message);
        } else {
            await getChatResponseNonStreaming(message);
        }
    } catch (error) {
        // Check if the error is due to abort
        if (error.name === 'AbortError') {
            console.log('Chat request was aborted by user');
            setStatus(config.text.statusInterrupted, 'default');
        } else {
            setStatus('Error: ' + error.message, 'error');
            console.error('Chat error:', error);
        }
        resetUIState();
        requestInProgress = false;
    }
}

async function getChatResponseNonStreaming(message) {
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message }),
        signal: currentAbortController.signal
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Chat request failed');
    }

    const data = await response.json();
    const botResponse = data.response;

    lastBotMessage = botResponse;

    removeTypingIndicator();
    if (userTranscript) {
        appendChatBubble(cleanText(botResponse), 'agent');
    }

    // Text-to-speech if enabled
    if (config.features.autoPlayVoice || (autoPlayToggle && autoPlayToggle.checked)) {
        await speakText(botResponse);
    } else {
        showFinalTranscript();
        setStatus(config.text.statusReady, 'default');
        resetUIState();
        requestInProgress = false;
    }
}

async function getChatResponseStreaming(message) {
    const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message }),
        signal: currentAbortController.signal
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Chat request failed');
    }

    const reader = response.body.getReader();
    currentStreamReader = reader; // Store for cancellation
    const decoder = new TextDecoder();
    let fullResponse = '';
    let messageElement = null;

    setStatus(config.text.statusReceiving, 'active');

    removeTypingIndicator();

    // Create new agent bubble for streaming
    if (userTranscript) {
        messageElement = document.createElement('div');
        messageElement.className = 'chat-message-bubble agent-bubble';
        messageElement.innerHTML = `<strong></strong>`;
        userTranscript.appendChild(messageElement);
        scrollToBottom();
    }

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = JSON.parse(line.slice(6));

                    if (data.error) {
                        throw new Error(data.error);
                    }

                    if (data.content) {
                        const content = data.content;
                        fullResponse += content;

                        // Update message in real-time with markdown rendering
                        if (messageElement) {
                            messageElement.innerHTML = renderMarkdown(fullResponse);
                            scrollToBottom();
                        }

                        // Process for sentence-by-sentence TTS if enabled
                        if (config.features.streamSentences && (config.features.autoPlayVoice || (autoPlayToggle && autoPlayToggle.checked))) {
                            processContentForStreaming(content);
                        }
                    }

                    if (data.done) {
                        lastBotMessage = fullResponse;

                        // Clear stream reader reference
                        currentStreamReader = null;

                        // Process any remaining text in buffer
                        if (config.features.streamSentences && partialSentenceBuffer.trim()) {
                            queueSentenceForTTS(partialSentenceBuffer.trim());
                            partialSentenceBuffer = "";
                        }

                        // Response complete, now speak it (if not already streaming sentences)
                        if (!config.features.streamSentences && (config.features.autoPlayVoice || (autoPlayToggle && autoPlayToggle.checked))) {
                            await speakTextStreaming(fullResponse);
                        } else if (!config.features.autoPlayVoice && !(autoPlayToggle && autoPlayToggle.checked)) {
                            showFinalTranscript();
                            setStatus(config.text.statusReady, 'default');
                            resetUIState();
                            requestInProgress = false;
                        }
                    }
                }
            }
        }
    } catch (error) {
        // Clear stream reader reference on error
        currentStreamReader = null;
        throw error;
    }
}

function appendChatBubble(text, sender) {
    if (!userTranscript) return;

    const bubble = document.createElement('div');
    bubble.className = `chat-message-bubble ${sender}-bubble`;

    if (sender === 'agent') {
        // Render markdown for agent responses
        bubble.innerHTML = renderMarkdown(text);
    } else {
        // User messages: plain text, escape HTML
        const p = document.createElement('p');
        p.textContent = text;
        bubble.appendChild(p);
    }

    userTranscript.appendChild(bubble);
    scrollToBottom();
}

function showActiveChunk(html) {
    if (activeChunkDisplay) {
        activeChunkDisplay.innerHTML = html;
        activeChunkDisplay.style.display = 'block';
    }
    if (userTranscript) {
        userTranscript.style.display = 'none';
    }
}

function showChatHistory() {
    if (activeChunkDisplay) {
        activeChunkDisplay.style.display = 'none';
        activeChunkDisplay.innerHTML = '<span class="muted-text">Agent</span><br><strong>Ready to help.</strong>';
    }
    if (userTranscript) {
        userTranscript.style.display = 'flex';
        scrollToBottom();
    }
}

function showTypingIndicator() {
    if (!userTranscript) return;

    const indicator = document.createElement('div');
    indicator.className = 'chat-message-bubble agent-bubble typing-indicator';
    indicator.id = 'activeTypingIndicator';
    indicator.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    `;

    userTranscript.appendChild(indicator);
    scrollToBottom();
}

function removeTypingIndicator() {
    const indicator = document.getElementById('activeTypingIndicator');
    if (indicator) {
        indicator.remove();
    }
}

function scrollToBottom() {
    if (userTranscript) {
        const transcriptSection = userTranscript.closest('.transcript-section');
        if (transcriptSection) {
            transcriptSection.scrollTop = transcriptSection.scrollHeight;
        }
    }
}

async function speakText(text) {
    try {
        setStatus(config.text.statusGeneratingVoice, 'active');

        // Stop any currently playing audio
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }

        const response = await fetch('/api/speak', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text }),
            signal: currentAbortController.signal
        });

        if (!response.ok) {
            throw new Error('Text-to-speech failed');
        }

        const audioBlob = await response.blob();
        await playAudio(audioBlob);

    } catch (error) {
        // Check if the error is due to abort
        if (error.name === 'AbortError') {
            console.log('TTS request was aborted by user');
            setStatus(config.text.statusInterrupted, 'default');
        } else {
            setStatus(config.text.errorGeneric + ': ' + error.message, 'error');
            console.error('TTS error:', error);
        }
        resetUIState();
        requestInProgress = false;
    }
}

async function speakTextStreaming(text) {
    try {
        // No status update here - start immediately

        // Stop any currently playing audio
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }

        const response = await fetch('/api/speak/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text }),
            signal: currentAbortController.signal
        });

        if (!response.ok) {
            throw new Error('Text-to-speech failed');
        }

        const audioBlob = await response.blob();
        await playAudio(audioBlob);

    } catch (error) {
        // Check if the error is due to abort
        if (error.name === 'AbortError') {
            console.log('TTS streaming request was aborted by user');
            setStatus(config.text.statusInterrupted, 'default');
        } else {
            setStatus(config.text.errorGeneric + ': ' + error.message, 'error');
            console.error('TTS error:', error);
        }
        resetUIState();
        requestInProgress = false;
    }
}

/**
 * Splits incoming text into sentences and queues them for TTS
 */
function processContentForStreaming(content) {
    partialSentenceBuffer += content;

    // Look for sentence boundaries: . ? ! followed by space or newline
    // Or just a newline
    const sentenceEndRegex = /([.?!])\s+|[\n\r]+/g;
    let match;
    let lastIndex = 0;

    while ((match = sentenceEndRegex.exec(partialSentenceBuffer)) !== null) {
        const sentence = partialSentenceBuffer.substring(lastIndex, match.index + match[0].length).trim();
        if (sentence) {
            queueSentenceForTTS(sentence);
        }
        lastIndex = match.index + match[0].length;
    }

    // Keep the remaining part in buffer
    partialSentenceBuffer = partialSentenceBuffer.substring(lastIndex);
}

/**
 * Fetches TTS for a specific sentence and adds it to the playback queue
 */
async function queueSentenceForTTS(sentence) {
    const sentenceIndex = processedSentencesCount++;
    console.log(`Queuing sentence ${sentenceIndex}: "${sentence}"`);

    try {
        const response = await fetch('/api/speak/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: sentence }),
            signal: currentAbortController.signal
        });

        if (!response.ok) return;

        const audioBlob = await response.blob();

        // Add to queue at correct position (index)
        audioQueue[sentenceIndex] = { blob: audioBlob, text: sentence };

        // Trigger queue processing
        processAudioQueue();

    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('TTS queue error:', error);
        }
    }
}

/**
 * Processes the audio queue and plays segments sequentially
 */
async function processAudioQueue() {
    if (isPlayingQueue || !audioQueue[nextAudioToPlay]) return;

    isPlayingQueue = true;
    const item = audioQueue[nextAudioToPlay];
    const blob = item.blob;
    const text = item.text;

    try {
        await playAudio(blob, text);
        // After playback finished (onended), this function will be called again
        // But we need to handle the increment and loop
    } catch (error) {
        console.error('Queue playback error:', error);
        isPlayingQueue = false;
    }
}

async function playAudio(audioBlob, sentenceText) {
    const audioUrl = URL.createObjectURL(audioBlob);

    currentAudio = new Audio(audioUrl);
    // Store sentence text for onplay display
    currentAudio.sentenceText = sentenceText;

    // Setup audio context for speaking visualization
    if (config.features.showWaveform) {
        if (!audioContext || audioContext.state === 'closed') {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaElementSource(currentAudio);
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.8;
    }

    currentAudio.onplay = () => {
        setStatus(config.text.statusSpeaking, 'speaking');
        voiceBtn.classList.remove('processing');
        voiceBtn.classList.add('speaking');
        voiceVisualizer.classList.add('active', 'speaking');

        // Show close button during playback
        showCloseButton();

        if (config.features.showWaveform) {
            visualizeSpeaking();
        }

        // Show AI response in chunk area if needed
        if (activeChunkDisplay) {
            const cleanedText = cleanText(currentAudio.sentenceText);
            showActiveChunk(`<span class="muted-text">Agent</span><br><strong>${cleanedText || '...'}</strong>`);
        }
    };

    currentAudio.onended = () => {
        URL.revokeObjectURL(audioUrl);

        // If we are in streaming mode, continue to next segment
        if (config.features.streamSentences && nextAudioToPlay < processedSentencesCount) {
            nextAudioToPlay++;
            isPlayingQueue = false;
            processAudioQueue();

            // If this was the last expected segment, clean up
            if (nextAudioToPlay >= processedSentencesCount && !currentStreamReader) {
                finishPlayback();
            }
            return;
        }

        finishPlayback();
    };

    function finishPlayback() {
        setStatus(config.text.statusReady, 'default');
        voiceBtn.classList.remove('speaking');
        voiceVisualizer.classList.remove('active', 'speaking');

        // Hide close button
        hideCloseButton();

        showChatHistory();
        resetUIState();
        requestInProgress = false; // Clear request flag when fully complete

        // Reset queue counters
        nextAudioToPlay = 0;
        processedSentencesCount = 0;
        isPlayingQueue = false;
    }

    currentAudio.onerror = () => {
        setStatus(config.text.errorGeneric + ': Audio playback failed', 'error');
        voiceBtn.classList.remove('speaking');
        voiceVisualizer.classList.remove('active', 'speaking');

        // Hide close button
        hideCloseButton();

        URL.revokeObjectURL(audioUrl);
        resetUIState();
        requestInProgress = false; // Clear request flag on error
    };

    await currentAudio.play();
}

/**
 * Cleans AI text for TTS/voice: removes citations 【...】 and strips markdown.
 * Use this for audio output only.
 */
function cleanText(text) {
    if (!text) return "";

    // Remove citations like 【8:0†group-policies-gdpr-WPn3mgtf.txt】
    let cleaned = text.replace(/【[^】]*】/g, '');

    // Strip markdown bold/italic but keep the text
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1'); // bold
    cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');    // italic
    cleaned = cleaned.replace(/__([^_]+)__/g, '$1');    // bold
    cleaned = cleaned.replace(/_([^_]+)_/g, '$1');      // italic
    // Strip headers
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

    return cleaned.trim();
}

/**
 * Converts a subset of Markdown to safe HTML for display in chat bubbles.
 * Handles: bold, italic, unordered lists, ordered lists, headers, paragraphs.
 * Citations (【...】) are stripped first.
 * Does NOT use innerHTML directly on user input — only used on server responses.
 */
function renderMarkdown(text) {
    if (!text) return '';

    // 1. Remove citations
    let t = text.replace(/【[^】]*】/g, '');

    // 2. Escape HTML entities to prevent XSS
    t = t
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // 3. Process block elements line by line
    const lines = t.split(/\r?\n/);
    const outputParts = [];
    let inUl = false;
    let inOl = false;

    const closeOpenList = () => {
        if (inUl) { outputParts.push('</ul>'); inUl = false; }
        if (inOl) { outputParts.push('</ol>'); inOl = false; }
    };

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Headers
        const h3Match = line.match(/^###\s+(.+)/);
        const h2Match = line.match(/^##\s+(.+)/);
        const h1Match = line.match(/^#\s+(.+)/);

        if (h1Match) { closeOpenList(); outputParts.push(`<h1>${inlineMarkdown(h1Match[1])}</h1>`); continue; }
        if (h2Match) { closeOpenList(); outputParts.push(`<h2>${inlineMarkdown(h2Match[1])}</h2>`); continue; }
        if (h3Match) { closeOpenList(); outputParts.push(`<h3>${inlineMarkdown(h3Match[1])}</h3>`); continue; }

        // Unordered list items
        const ulMatch = line.match(/^[-*]\s+(.+)/);
        if (ulMatch) {
            if (inOl) { outputParts.push('</ol>'); inOl = false; }
            if (!inUl) { outputParts.push('<ul>'); inUl = true; }
            outputParts.push(`<li>${inlineMarkdown(ulMatch[1])}</li>`);
            continue;
        }

        // Ordered list items
        const olMatch = line.match(/^\d+\.\s+(.+)/);
        if (olMatch) {
            if (inUl) { outputParts.push('</ul>'); inUl = false; }
            if (!inOl) { outputParts.push('<ol>'); inOl = true; }
            outputParts.push(`<li>${inlineMarkdown(olMatch[1])}</li>`);
            continue;
        }

        // Empty line: close lists, skip (paragraph break handled by <p>)
        if (line.trim() === '') {
            closeOpenList();
            continue;
        }

        // Regular paragraph line
        closeOpenList();
        outputParts.push(`<p>${inlineMarkdown(line)}</p>`);
    }

    closeOpenList();
    return outputParts.join('');
}

/**
 * Converts inline markdown (bold, italic) within a single line of already-HTML-escaped text.
 */
function inlineMarkdown(line) {
    // Bold: **text** or __text__
    line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    line = line.replace(/__(.+?)__/g, '<strong>$1</strong>');
    // Italic: *text* or _text_
    line = line.replace(/\*(.+?)\*/g, '<em>$1</em>');
    line = line.replace(/_(.+?)_/g, '<em>$1</em>');
    return line;
}

function visualizeSpeaking() {
    if (!currentAudio || currentAudio.paused || currentAudio.ended || !analyser) {
        return;
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const waveBars = waveContainer.querySelectorAll('.wave-bar');

    function animate() {
        if (!currentAudio || currentAudio.paused || currentAudio.ended) {
            // Reset bars
            waveBars.forEach(bar => {
                bar.style.height = '15px';
            });
            return;
        }

        animationFrame = requestAnimationFrame(animate);
        analyser.getByteFrequencyData(dataArray);

        const step = Math.floor(bufferLength / waveBars.length);

        waveBars.forEach((bar, index) => {
            let sum = 0;
            for (let i = 0; i < step; i++) {
                sum += dataArray[index * step + i];
            }
            const average = sum / step;

            const height = Math.max(15, Math.min(140, (average / 255) * 140));
            bar.style.height = height + 'px';
        });
    }

    animate();
}

function addMessage(text, sender) {
    if (!config.features.showChatHistory) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';

    if (sender === 'user') {
        avatarDiv.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
        `;
    } else {
        avatarDiv.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-9h10v2H7z"/>
                <circle cx="9" cy="9" r="1.5"/>
                <circle cx="15" cy="9" r="1.5"/>
            </svg>
        `;
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const textPara = document.createElement('p');
    textPara.textContent = text;

    contentDiv.appendChild(textPara);
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function clearConversation() {
    if (!confirm(config.text.clearConfirm)) {
        return;
    }

    try {
        const response = await fetch('/api/clear', {
            method: 'POST'
        });

        if (response.ok && config.features.showChatHistory) {
            chatMessages.innerHTML = `
                <div class="message bot-message">
                    <div class="message-avatar">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-9h10v2H7z"/>
                            <circle cx="9" cy="9" r="1.5"/>
                            <circle cx="15" cy="9" r="1.5"/>
                        </svg>
                    </div>
                    <div class="message-content">
                        <p>${config.text.welcomeMessage}</p>
                    </div>
                </div>
            `;
            setStatus('Conversation cleared', 'default');
        }
    } catch (error) {
        setStatus('Error clearing conversation', 'error');
        console.error('Clear error:', error);
    }
}

function resetUIState() {
    isProcessing = false;
    if (voiceBtn) voiceBtn.classList.remove('processing', 'recording', 'speaking');
    if (voiceVisualizer) voiceVisualizer.classList.remove('active', 'recording', 'speaking');

    showChatHistory();

    if (textInput) textInput.disabled = false;
    if (sendBtn) sendBtn.disabled = false;

    // Cancel any ongoing animations
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }

    // Reset wave bars to idle state
    const waveBars = waveContainer.querySelectorAll('.wave-bar');
    waveBars.forEach(bar => {
        bar.style.height = '15px';
    });

    // Note: requestInProgress is managed separately based on request lifecycle
    // Don't auto-reset it here to prevent race conditions
}

function setStatus(message, type = 'default') {
    if (!config.features.showStatusText) return;

    statusText.textContent = message;
    statusText.className = 'status-pill';

    if (type !== 'default') {
        statusText.classList.add(type);
    }
}