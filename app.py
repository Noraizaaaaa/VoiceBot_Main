from flask import Flask, render_template, request, jsonify, send_file, Response, stream_with_context
from openai import OpenAI
import os
from pathlib import Path
import tempfile
from datetime import datetime
from dotenv import load_dotenv
import json
import io
import time
import math
from config import (
    CHAT_CONFIG, SYSTEM_PROMPT, CONVERSATION_HISTORY_LIMIT,
    RAG_CHUNK_SIZE, RAG_CHUNK_OVERLAP, RAG_TOP_K, RAG_KNOWLEDGE_FILE,
    WHISPER_LANGUAGE
)

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

# ─────────────────────────────────────────────────────────────
# OpenAI Client Initialization
# ─────────────────────────────────────────────────────────────
api_key = os.environ.get("OPENAI_API_KEY")
if not api_key:
    print("WARNING: OPENAI_API_KEY not found in environment variables!")
    client = None
else:
    try:
        client = OpenAI(api_key=api_key)
    except Exception as e:
        print(f"ERROR initializing OpenAI client: {e}")
        client = None

# Whisper language — env variable overrides config.py value
# This is mutable so the /api/set-language endpoint can update it at runtime
# without restarting the server.
WHISPER_LANG = os.environ.get("WHISPER_LANGUAGE", WHISPER_LANGUAGE)

# ─────────────────────────────────────────────────────────────
# In-Process RAG — Knowledge Base Loader
# ─────────────────────────────────────────────────────────────

# Storage for chunked knowledge base
_knowledge_chunks = []

def _load_knowledge_base():
    """Load knowledge_base.txt and split it into overlapping chunks at startup."""
    global _knowledge_chunks
    kb_path = Path(__file__).parent / RAG_KNOWLEDGE_FILE

    if not kb_path.exists():
        print(f"WARNING: Knowledge base file not found at {kb_path}. RAG will return empty context.")
        _knowledge_chunks = []
        return

    text = kb_path.read_text(encoding='utf-8')

    # Split into chunks with overlap
    chunks = []
    start = 0
    while start < len(text):
        end = start + RAG_CHUNK_SIZE
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start += RAG_CHUNK_SIZE - RAG_CHUNK_OVERLAP  # Move forward with overlap

    _knowledge_chunks = chunks
    print(f"RAG: Loaded {len(chunks)} chunks from {kb_path.name}")


def _retrieve_context(query: str, top_k: int = RAG_TOP_K) -> str:
    """
    Simple keyword-overlap retrieval. Scores each chunk by how many
    unique query words appear in it (case-insensitive). Returns the
    top_k chunks joined as a single context string.

    No external vector DB or ML library required — uses stdlib only.
    """
    if not _knowledge_chunks:
        return ""

    # Tokenise query: lower, split on whitespace/punctuation
    query_words = set(
        w.lower().strip('.,!?;:()"\'')
        for w in query.split()
        if len(w) > 2  # Skip very short words
    )

    if not query_words:
        # Fall back to returning the first top_k chunks
        return "\n\n".join(_knowledge_chunks[:top_k])

    scored = []
    for chunk in _knowledge_chunks:
        chunk_lower = chunk.lower()
        score = sum(1 for w in query_words if w in chunk_lower)
        scored.append((score, chunk))

    # Sort by descending score; tie-break preserves original order
    scored.sort(key=lambda x: x[0], reverse=True)

    top_chunks = [chunk for _, chunk in scored[:top_k] if chunk]
    return "\n\n".join(top_chunks)


# Load knowledge base at startup
_load_knowledge_base()

# ─────────────────────────────────────────────────────────────
# Conversation History (custom mode)
# ─────────────────────────────────────────────────────────────
conversation_history = []

# Thread ID (assistant mode — kept for backwards compatibility)
current_thread_id = None


# ─────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/config', methods=['GET'])
def get_config():
    """Get current chatbot configuration"""
    return jsonify({
        'whisper_language': WHISPER_LANG,
    })


@app.route('/api/transcribe', methods=['POST'])
def transcribe_audio():
    """
    Transcribe audio using Whisper.

    Accepts an optional 'language' field in the multipart form data
    (ISO 639-1 code, e.g. 'el' for Greek, 'en' for English).
    Falls back to the server-side WHISPER_LANG setting.
    """
    try:
        if not client:
            return jsonify({'error': 'OpenAI client not initialized. Check API key.'}), 500

        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400

        audio_file = request.files['audio']

        # Language: client-supplied > server config
        language = request.form.get('language', WHISPER_LANG).strip() or WHISPER_LANG

        # Use in-memory buffer (faster — no temp file I/O)
        audio_data = io.BytesIO(audio_file.read())
        audio_data.name = "recording.webm"

        # Build a language-specific contextual prompt for better accuracy
        whisper_prompt = _build_whisper_prompt(language)

        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_data,
            language=language,
            prompt=whisper_prompt,
        )

        return jsonify({
            'text': transcript.text,
            'language': language,
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _build_whisper_prompt(language: str) -> str:
    """
    Returns a language-appropriate contextual hint for Whisper.
    This seeds the vocabulary so Whisper correctly recognises
    domain-specific terms and avoids vowel-dropping in Greek.
    """
    prompts = {
        'el': (
            # Greek GDPR terms — prevents vowel elision by giving Whisper
            # examples of the exact words it should expect
            "GDPR, Γενικός Κανονισμός Προστασίας Δεδομένων Προσωπικού Χαρακτήρα, "
            "προσωπικά δεδομένα, επεξεργασία δεδομένων, ιδιωτικότητα, συμμόρφωση, "
            "υπεύθυνος επεξεργασίας, εκτελών επεξεργασία, δικαιώματα υποκειμένου, "
            "Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα, ΑΠΔΠΧ, "
            "ρήτρες ασφαλείας, συγκατάθεση, παραβίαση δεδομένων, ανωνυμοποίηση, "
            "ψευδωνυμοποίηση, εκτίμηση αντικτύπου, νομική βάση επεξεργασίας."
        ),
        'en': (
            "GDPR, General Data Protection Regulation, Data Privacy, Compliance, "
            "Data Controller, Data Processor, Data Subject Rights, Personal Data, "
            "Lawful Basis, Consent, Data Breach, Privacy Notice, DPO, DPIA."
        ),
        'de': (
            "DSGVO, Datenschutz-Grundverordnung, personenbezogene Daten, "
            "Datenschutzbeauftragter, Einwilligung, Datenpanne, Auftragsverarbeitung."
        ),
    }
    return prompts.get(language, prompts['en'])


@app.route('/api/chat', methods=['POST'])
def chat():
    """Get chat response from GPT (non-streaming)"""
    try:
        if not client:
            return jsonify({'error': 'OpenAI client not initialized. Check API key.'}), 500

        data = request.json
        user_message = data.get('message', '')

        if not user_message:
            return jsonify({'error': 'No message provided'}), 400

        # Add user message to history
        conversation_history.append({
            'role': 'user',
            'content': user_message
        })

        # Build system prompt with RAG context
        system_prompt = _build_system_prompt(user_message)

        response = client.responses.create(
            model=CHAT_CONFIG['model'],
            instructions=system_prompt,
            input=conversation_history,
            max_output_tokens=CHAT_CONFIG['max_tokens'],
            temperature=CHAT_CONFIG['temperature']
        )

        assistant_message = response.output_text

        conversation_history.append({
            'role': 'assistant',
            'content': assistant_message
        })

        if len(conversation_history) > CONVERSATION_HISTORY_LIMIT:
            conversation_history[:] = conversation_history[-CONVERSATION_HISTORY_LIMIT:]

        return jsonify({
            'response': assistant_message,
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/chat/stream', methods=['POST'])
def chat_stream():
    """Get streaming chat response from GPT or Assistant"""
    try:
        if not client:
            return jsonify({'error': 'OpenAI client not initialized. Check API key.'}), 500

        data = request.json
        user_message = data.get('message', '')

        if not user_message:
            return jsonify({'error': 'No message provided'}), 400

        return chat_stream_custom(user_message)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _build_system_prompt(user_message: str) -> str:
    """
    Retrieve relevant knowledge chunks for the user's message
    and inject them into the system prompt template.
    """
    context = _retrieve_context(user_message)
    if not context:
        context = "No specific knowledge base entry found. Answer from general GDPR knowledge."
    return SYSTEM_PROMPT.format(context=context)


def chat_stream_custom(user_message):
    """
    Custom GPT streaming mode with RAG context injection.
    Retrieves relevant knowledge chunks and injects them into
    the system prompt before calling Chat Completions.
    """
    # Build system prompt with RAG context for this specific query
    system_prompt = _build_system_prompt(user_message)

    # Add user message to history
    conversation_history.append({
        'role': 'user',
        'content': user_message
    })

    def generate():
        try:
            full_response = ""

            stream = client.responses.create(
                model=CHAT_CONFIG['model'],
                instructions=system_prompt,
                input=conversation_history,
                max_output_tokens=CHAT_CONFIG['max_tokens'],
                temperature=CHAT_CONFIG['temperature'],
                stream=True
            )

            for event in stream:
                if event.type == 'response.output_text.delta':
                    content = event.delta
                    full_response += content
                    yield f"data: {json.dumps({'content': content})}\n\n"

            # Add complete response to history
            conversation_history.append({
                'role': 'assistant',
                'content': full_response
            })

            # Keep only last N messages
            if len(conversation_history) > CONVERSATION_HISTORY_LIMIT:
                conversation_history[:] = conversation_history[-CONVERSATION_HISTORY_LIMIT:]

            yield f"data: {json.dumps({'done': True, 'full_response': full_response})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return Response(stream_with_context(generate()), mimetype='text/event-stream')


@app.route('/api/speak', methods=['POST'])
def text_to_speech():
    """Convert text to speech using OpenAI TTS"""
    try:
        if not client:
            return jsonify({'error': 'OpenAI client not initialized. Check API key.'}), 500

        data = request.json
        text = data.get('text', '')

        if not text:
            return jsonify({'error': 'No text provided'}), 400

        # tts-1 is significantly faster than tts-1-hd with negligible quality
        # difference for conversational voice bot use cases
        response = client.audio.speech.create(
            model="tts-1",
            voice="alloy",
            input=text,
            speed=1.0,
            response_format="mp3"
        )

        # Stream directly from memory — no temp file
        audio_data = io.BytesIO(response.content)
        audio_data.seek(0)

        return send_file(
            audio_data,
            mimetype='audio/mpeg',
            as_attachment=False,
            download_name='speech.mp3'
        )

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/speak/stream', methods=['POST'])
def text_to_speech_stream():
    """Convert text to speech using OpenAI TTS with streaming"""
    try:
        if not client:
            return jsonify({'error': 'OpenAI client not initialized. Check API key.'}), 500

        data = request.json
        text = data.get('text', '')

        if not text:
            return jsonify({'error': 'No text provided'}), 400

        # tts-1 is significantly faster than tts-1-hd
        response = client.audio.speech.create(
            model="tts-1",
            voice="alloy",
            input=text,
            speed=1.0,
            response_format="mp3"
        )

        def generate():
            for chunk in response.iter_bytes(chunk_size=4096):
                yield chunk

        return Response(
            generate(),
            mimetype='audio/mpeg',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no'
            }
        )

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/clear', methods=['POST'])
def clear_history():
    """Clear conversation history"""
    global current_thread_id

    if CHATBOT_MODE == 'assistant':
        try:
            if client:
                thread = client.beta.threads.create()
                current_thread_id = thread.id
                return jsonify({'message': 'Conversation thread reset'})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    else:
        conversation_history.clear()
        return jsonify({'message': 'Conversation history cleared'})


@app.route('/api/knowledge/reload', methods=['POST'])
def reload_knowledge():
    """Hot-reload the knowledge base without restarting the server"""
    try:
        _load_knowledge_base()
        return jsonify({
            'message': 'Knowledge base reloaded successfully',
            'chunk_count': len(_knowledge_chunks)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/set-language', methods=['POST'])
def set_language():
    """
    Update the Whisper ASR language at runtime without restarting the server.
    Called by the frontend language dropdown on change.
    Body: { "language": "el" }
    """
    global WHISPER_LANG
    data = request.json or {}
    new_lang = data.get('language', '').strip()

    if not new_lang:
        return jsonify({'error': 'No language provided'}), 400

    # Basic validation — ISO 639-1 codes are 2-3 chars
    if len(new_lang) > 5:
        return jsonify({'error': 'Invalid language code'}), 400

    WHISPER_LANG = new_lang
    print(f"Language updated to: {WHISPER_LANG}")
    return jsonify({'message': f'Language set to {WHISPER_LANG}', 'language': WHISPER_LANG})


if __name__ == '__main__':
    if not os.environ.get("OPENAI_API_KEY"):
        print("WARNING: OPENAI_API_KEY environment variable not set!")
        print("Please set it with: export OPENAI_API_KEY='your-api-key-here'")

    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)
