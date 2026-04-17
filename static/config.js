const CONFIG = {
    // Feature toggles
    features: {
        showTextInput: true,           // Show/hide text input field
        showClearButton: true,         // Show/hide clear conversation button
        autoPlayVoice: true,            // Auto-play AI voice responses
        showStatusText: true,           // Show status text in bottom pill
        useStreaming: true,             // Use streaming for faster responses
        streamSentences: true,          // Stream TTS sentence-by-sentence
    },

    // UI settings
    ui: {
        waveformBars: 20,               // Kept for structural logic
    },

    // ASR / Language settings
    // ⚠️  DO NOT set language here — it is controlled from a single place:
    //       config.py  →  WHISPER_LANGUAGE = 'el'   (or set env var WHISPER_LANGUAGE)
    // The frontend fetches this value from /api/config on startup automatically.
    asr: {
        language: null,                 // Auto-populated from server (config.py WHISPER_LANGUAGE)
        sampleRate: 16000,              // 16kHz — Whisper's native rate (faster uploads)
    },

    // Text/Labels (Siri-Style)
    text: {
        statusReady: "Ready",
        statusRecording: "Recording... Click button again to send",
        statusProcessing: "Thinking...",
        statusReceiving: "Receiving...",
        statusGeneratingVoice: "Preparing voice...",
        statusSpeaking: "Speaking...",
        statusInterrupted: "Interrupted",
        welcomeMessage: "",
        clearConfirm: "Clear conversation?",
        errorMicDenied: "Mic access denied",
        errorRecordingShort: "Speak longer (min 0.5s)",
        errorNoSpeech: "No speech heard. Try again.",
        errorGeneric: "Error",
    }
};

// Export config
window.APP_CONFIG = CONFIG;
