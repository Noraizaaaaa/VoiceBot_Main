# API Configuration for GDPR Voice Assistant
# This file contains all OpenAI API settings used across the application

# Chat completion settings (for custom RAG mode)
CHAT_CONFIG = {
    'model': 'gpt-4o-mini',  # Faster and cheaper than gpt-4o, ideal for voice bots
    'max_tokens': 600,        # Cap responses to keep TTS fast
    'temperature': 0.5,
}

# System prompt for the application (RAG mode)
# {context} placeholder is replaced at runtime with RAG-retrieved knowledge chunks
SYSTEM_PROMPT = (
    'You are a professional and helpful GDPR (General Data Protection Regulation) expert assistant. '
    'Your goal is to provide clear, accurate, and concise information about GDPR to users. '
    'Keep your voice responses natural, conversational, and easy to follow. '
    'Be concise — aim for 2-4 sentences per response for voice clarity. '
    'While you specialize in GDPR, if the user asks a simple general question, answer it briefly and then gently steer them back to GDPR. '
    'For complex non-GDPR topics, politely explain that you are specialized in GDPR.\n\n'
    'CRITICAL LANGUAGE RULE: Always detect the language of the user\'s question and respond ENTIRELY in that same language. '
    'Never mix languages within a single response. '
    'The knowledge base below is written in English — use it only as a source of facts, but translate and express your answer naturally in the user\'s language. '
    'Do NOT copy English sentences verbatim from the knowledge base into a non-English response.\n\n'
    'Use the following knowledge base excerpts to answer accurately:\n'
    '---\n'
    '{context}\n'
    '---'
)

# Conversation history settings (for custom mode)
CONVERSATION_HISTORY_LIMIT = 10

# RAG (Retrieval-Augmented Generation) settings
RAG_CHUNK_SIZE = 800        # Characters per knowledge chunk
RAG_CHUNK_OVERLAP = 100     # Characters of overlap between adjacent chunks
RAG_TOP_K = 3               # Number of top relevant chunks to inject into context
RAG_KNOWLEDGE_FILE = 'knowledge_base.txt'  # Path relative to app root

# Whisper ASR settings
# Set language to the primary language of your users.
# Use ISO 639-1 codes: 'el' = Greek, 'en' = English, 'de' = German, etc.
# Can be overridden by WHISPER_LANGUAGE environment variable.
WHISPER_LANGUAGE = 'el'  # Greek (primary language for this deployment)
