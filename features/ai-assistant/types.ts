// features/ai-assistant/types.ts

export type LLMProvider = 'claude' | 'gemini' | 'openai'

export type LLMModel = {
  id: string
  name: string
  provider: LLMProvider
  description: string
  contextWindow: number
  free: boolean
}

export const AVAILABLE_MODELS: LLMModel[] = [
  // Claude — Anthropic
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'claude',
    description: 'Smart and fast — best for most articles',
    contextWindow: 200000,
    free: false,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'claude',
    description: 'Fastest Claude model',
    contextWindow: 200000,
    free: false,
  },

  // OpenAI
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    description: 'Most capable OpenAI model',
    contextWindow: 128000,
    free: false,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    description: 'Fast and cost-efficient',
    contextWindow: 128000,
    free: false,
  },

  // Gemini — Google
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    provider: 'gemini',
    description: 'Fast and cost-efficient',
    contextWindow: 1048576,
    free: true,
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    provider: 'gemini',
    description: 'Advanced reasoning and long document context',
    contextWindow: 1048576,
    free: false,
  },
]

export type AIBook = {
  id: string
  user_id: string
  title: string
  file_name: string
  page_count: number | null
  extracted_text: string
  word_count: number | null
  char_count: number | null
  created_at: string | null
  updated_at: string | null
}

export type AIChat = {
  id: string
  book_id: string | null
  user_id: string
  title: string
  llm_provider: LLMProvider
  llm_model: string
  created_at: string | null
  updated_at: string | null
  last_message_at: string | null
  book?: Pick<AIBook, 'id' | 'title' | 'file_name'>
}

export type AIMessage = {
  id: string
  chat_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string | null
}

export type GeneratedPostData = {
  title: string
  meta_title: string
  meta_description: string
  excerpt: string
  content: string          // HTML
  tags: string[]
  category: string
}

export type LLMProviderKeyRecord = {
  provider: LLMProvider
  key_preview: string | null
  is_valid: boolean | null
  last_verified_at: string | null
  chats_this_month: number
}

export type ProviderStatus = {
  provider: LLMProvider
  configured: boolean
  is_valid: boolean | null
}
