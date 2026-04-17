# GDPR Voice Assistant

An intelligent voice-enabled chatbot that provides real-time assistance with GDPR-related questions. Built with OpenAI's Whisper (speech-to-text), Responses API (conversational AI), and TTS (text-to-speech) APIs, powered by a Flask backend and modern HTML/CSS/JavaScript frontend.

**Version 1.5**— Unified Responses API · RAG-powered knowledge base · Multi-language voice input

**Developed for [Inelso.co.uk](https://inelso.co.uk)**

![Python](https://img.shields.io/badge/Python-3.8+-blue)
![Flask](https://img.shields.io/badge/Flask-3.0-green)
![OpenAI](https://img.shields.io/badge/OpenAI-API-orange)
![Status](https://img.shields.io/badge/Status-Private-red)

---

## Features

- **Voice Input**— Click-to-speak with natural voice interaction
- **Text Input**— Toggle between voice and text with the mode switcher
- **Language Selector**— Runtime dropdown to switch voice input language (14 languages)
- **In-process RAG**— Grounded GDPR answers using an embedded knowledge base (no vector DB needed)
- **Streaming Responses**— Fast, sentence-by-sentence AI responses via SSE
- **Natural Voice Output**— AI responses spoken automatically with OpenAI TTS
- **Fully Responsive**— Optimised for desktop, tablet, and mobile
- **Siri-style UI**— Dark glass-morphism design with smooth micro-animations
- **Single-file Config**— All language and AI settings controlled from `config.py`
- **Conversation Context**— Maintains history for contextual, multi-turn responses
- **Interrupt Anytime**— Cancel recording or stop AI playback mid-sentence

---

## What's New in v1.5

### Native Responses API Integration
- **Unified Backend Architecture**— Fully migrated from legacy Chat Completions API to the new, modernized Responses API framework.
- **Legacy Overhead Removed**— Completely stripped out all deprecated Assistant API mode logic, persistent threads, and run orchestration to guarantee simple, predictable, and fast performance moving forward.

## What's New in v1.4

### RAG Knowledge Base
- **Embedded GDPR Knowledge**— `knowledge_base.txt` loaded at startup into in-memory chunks
- 🔍 **Keyword Retrieval**— Top-3 relevant chunks injected into every prompt (no external vector DB)
- ♻️ **Hot Reload**— Update `knowledge_base.txt` and call `POST /api/knowledge/reload` without restarting
- 🌍 **Language-aware answers**— Strict system prompt rule: the bot always responds in the user's language

### Multi-Language Voice Input
- **Runtime language switcher**— Globe-icon pill dropdown in the toolbar (14 languages)
- **Greek ASR fix**— Whisper now receives `language=el` + a Greek GDPR vocabulary prompt, solving vowel-elision issues
- **16 kHz recording**— Microphone captures at Whisper's native sample rate (smaller uploads, faster transcription)
- **Single point of control**— Change `WHISPER_LANGUAGE` in `config.py` (or `.env`) and the frontend auto-syncs on load

### Latency Improvements
- **Switched to `gpt-4o-mini`**— 3–5× faster than `gpt-4o` for conversational responses
- **Switched to `tts-1`**— Significantly faster TTS generation vs `tts-1-hd`
- **Responses API Refactor**— Eliminated legacy Chat Completions structures, reducing backend complexity.
- **In-memory TTS**— No temp-file I/O; audio streamed directly from memory

### UI/UX
- **Audio / Text mode toggle**— Heygen-style pill toggle switches between voice orb and text input
- **Language dropdown**— Glass-pill selector locks to the same height as the mode toggle
- **Markdown rendering**— Agent responses render bold, italic, lists, and headers in chat bubbles
- **No welcome message**— Chat starts clean; the "Agent — Ready to help" placeholder is shown instead

---

## Quick Start

### Prerequisites

- Python 3.8 or higher
- OpenAI API key ([Get one here](https://platform.openai.com/api-keys))
- Modern web browser with microphone support

### Installation

1. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Set up your API key**— create a `.env` file in the project root:
   ```env
   OPENAI_API_KEY=sk-your-api-key-here
   WHISPER_LANGUAGE=el
   ```

3. **Run the application**
   ```bash
   python app.py
   ```

4. **Open your browser**→ `http://localhost:5000`

5. **Start talking**
   - Grant microphone permission when prompted
   - Click the orb to start recording — click again to send
   - Listen to the AI's spoken response
   - Use the **Audio / Text**toggle to switch input modes
   - Use the **language picker**to change the voice input language live

---

## Project Structure

```
GDPR_VoiceBot/1.5/
├── app.py                  # Flask backend — RAG engine, Whisper, Responses API, TTS endpoints
├── config.py               # All AI and language settings (single source of truth)
├── knowledge_base.txt      # GDPR knowledge base — edit and hot-reload via API
├── requirements.txt        # Python dependencies
├── runtime.txt             # Python version
├── Procfile                # Deployment (gunicorn)
├── render.yaml             # Render deployment config
├── README.md               # This file
├── templates/
│   └── index.html          # Main HTML template
└── static/
    ├── config.js           # Frontend feature flags and labels
    ├── script.js           # Frontend logic (recording, streaming, UI state)
    └── style.css           # CSS — glass UI, animations, responsive layout
```

---

## Configuration

### Single Point of Control — `config.py`

All behaviour-critical settings live here:

```python
# Model and response settings
CHAT_CONFIG = {
    'model': 'gpt-4o-mini',   # fast & cost-efficient
    'max_tokens': 600,         # keep responses concise for voice
    'temperature': 0.5,
}

# RAG settings
RAG_TOP_K = 3               # number of knowledge chunks injected per prompt
RAG_CHUNK_SIZE = 800        # characters per chunk
RAG_KNOWLEDGE_FILE = 'knowledge_base.txt'

# Whisper ASR language — overrideable via WHISPER_LANGUAGE env var
# ISO 639-1: 'el'=Greek, 'en'=English, 'de'=German, 'fr'=French, etc.
WHISPER_LANGUAGE = 'el'
```

> **Tip:**Set `WHISPER_LANGUAGE` in your `.env` file to override without touching code.

### Frontend Flags — `static/config.js`

```javascript
const CONFIG = {
    features: {
        showTextInput: true,        // shows text input panel
        showClearButton: true,      // shows clear conversation button
        autoPlayVoice: true,        // auto-plays TTS responses
        useStreaming: true,          // uses SSE streaming
        streamSentences: true,       // sentence-by-sentence TTS
    },
    asr: {
        language: null,             // auto-populated from /api/config at startup
        sampleRate: 16000,          // Whisper native rate
    },
};
```

### Knowledge Base — `knowledge_base.txt`

The GDPR knowledge base is a plain-text file that powers the bot's RAG (Retrieval-Augmented Generation) system. It is the **primary source of truth**for all factual GDPR content the bot provides.

#### File Format

The file uses `== SECTION NAME ==` headers to logically group content. Each section is free-form plain text.

#### Adding or Editing Content

1. Open `knowledge_base.txt`
2. Add a new section or extend an existing one:
   ```
   == SECTION 16: DATA RETENTION POLICIES ==

   Organizations must not keep personal data longer than necessary
   for its original purpose (Storage Limitation principle)...
   ```
3. Save the file
4. Apply without restarting:
   ```bash
   curl -X POST http://localhost:5000/api/knowledge/reload
   ```
   Or restart the server — the file is always re-read on startup.

#### Tuning RAG Behaviour

Adjust these settings in `config.py`:

| Setting | Default | Effect |
|---------|---------|--------|
| `RAG_TOP_K` | `3` | Number of chunks injected per response. Higher = more context but slower prompt |
| `RAG_CHUNK_SIZE` | `800` | Characters per chunk. Smaller = more granular retrieval |
| `RAG_CHUNK_OVERLAP` | `100` | Overlap between adjacent chunks — prevents cutting mid-sentence |

> **Best practice:**Keep each section focused on a single topic. The retrieval scores by keyword overlap, so tightly scoped sections rank more accurately than large general-purpose blobs.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/config` | Returns current whisper language setting |
| `POST` | `/api/transcribe` | Whisper STT — accepts `audio` file + `language` form field |
| `POST` | `/api/chat/stream` | Streaming GPT response via SSE (RAG-injected) |
| `POST` | `/api/speak/stream` | Streaming TTS audio (mp3) |
| `POST` | `/api/speak` | Non-streaming TTS audio |
| `POST` | `/api/chat` | Non-streaming GPT response |
| `POST` | `/api/clear` | Clear conversation history |
| `POST` | `/api/set-language` | Update Whisper language at runtime `{ "language": "el" }` |
| `POST` | `/api/knowledge/reload` | Hot-reload `knowledge_base.txt` without restart |

---

## Supported Languages

The language dropdown supports 14 languages for voice input:

| Code | Language | Code | Language |
|------|----------|------|----------|
| `el` | Greek | `nl` | Dutch |
| `en` | English | `pl` | Polish |
| `de` | German | `ru` | Russian |
| `fr` | French | `ar` | Arabic |
| `es` | Spanish | `zh` | Chinese |
| `it` | Italian | `ja` | Japanese |
| `pt` | Portuguese | `tr` | Turkish |

Add more languages by appending `<option>` tags in `templates/index.html`.

---

## Usage Guide

### Voice Mode
1. **Click**the iridescent orb to start recording
2. **Speak**your GDPR question in the selected language
3. **Click again**to send (or X to cancel)
4. The AI responds in text and spoken voice in the same language

### Text Mode
1. Click **Text**in the mode toggle
2. Type your question and press **Enter**or click send
3. Response appears as a chat bubble with markdown formatting

### Changing Language
- Open the **language dropdown**in the toolbar
- Select any of the 14 supported languages
- The next voice recording immediately uses the new language — no reload needed

### Interrupting
- Click the orb or the **× button**at any time to cancel recording or stop playback

---

## Deployment

### Render (Recommended)

1. Create a [Render](https://render.com) account and connect your repository
2. Set environment variables:
   ```
   OPENAI_API_KEY=sk-your-key-here
   WHISPER_LANGUAGE=el
   ```
3. Deploy using the included `render.yaml`

**Build & Start commands:**
```
Build:  pip install --upgrade pip && pip install -r requirements.txt
Start:  gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120
```

### Other Platforms

The app runs on any Python-compatible host (Heroku, Railway, Fly.io, DigitalOcean, AWS, Azure, GCP).

Requirements:
- Python 3.8+
- `OPENAI_API_KEY` and `WHISPER_LANGUAGE` environment variables
- `gunicorn app:app --bind 0.0.0.0:$PORT`

---



## Security Best Practices

- Never commit `.env` or API keys to version control
- Add `.env` to `.gitignore`
- Use HTTPS in production (required for microphone access)
- Add rate limiting (e.g., Flask-Limiter) in production
- Rotate API keys regularly
- Set spending limits in OpenAI dashboard

**`.gitignore` additions:**
```
.env
*.pyc
__pycache__/
*.log
```

---

## Changelog

### v1.5 (Current)
- **Responses API Migration**— Shifted core backend to leverage OpenAI's new Responses API framework natively.
- **Deprecation Clean-up**— Successfully evaluated and purged all legacy Assistants API mode integration and multi-mode branch routing.
- **Configuration Simplification**— Removed unused system flags like `CHATBOT_MODE` and streamlined setup for a single fast RAG execution loop.

### v1.4
- In-process RAG with `knowledge_base.txt` — no external vector DB
- Greek ASR fix — correct Whisper language + Greek vocabulary prompt
- 16 kHz recording — matches Whisper native sample rate
- Runtime language dropdown (14 languages, no page reload)
- `WHISPER_LANGUAGE` — single config point, frontend auto-syncs
- Switched to `gpt-4o-mini` — 3–5× faster responses
- Switched to `tts-1` — faster TTS generation
- Audio / Text mode toggle (Heygen-style pill)
- Markdown rendering in chat bubbles
- Hot-reload knowledge base via API
- Language-aware system prompt (never mixes languages in responses)
- In-memory TTS (no temp files)



## License & Ownership

**© 2026 Inelso.co.uk — All Rights Reserved**

Private, proprietary project. Unauthorised copying, distribution, or use is strictly prohibited.

---

## Built With

- [OpenAI API](https://openai.com/api/) — Whisper STT, GPT-4o-mini, TTS-1
- [Flask](https://flask.palletsprojects.com/) — Python web framework
- [Gunicorn](https://gunicorn.org/) — WSGI production server
- Native Web APIs — MediaRecorder, Web Audio API, Server-Sent Events

---

*Developed for [Inelso.co.uk](https://inelso.co.uk)*
