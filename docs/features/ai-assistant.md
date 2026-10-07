# AI Writing Assistant

The AI assistant allows authors to upload a PDF book, chat with it using their preferred LLM, and generate a full blog post draft from the conversation.

**Supported providers:** Claude (Anthropic), Gemini (Google), OpenAI

**How it works:**

1. Navigate to **Dashboard → AI Assistant**
2. Add your LLM API key under **Dashboard → Developer → LLM Providers**
3. Start a new chat — upload a PDF and select a model
4. Chat with the book, then click **Generate Post** to create a draft

PDF text is extracted on upload and stored as plain text. The LLM receives the extracted text as context. API keys are encrypted with AES-256-GCM and never stored in plaintext.
