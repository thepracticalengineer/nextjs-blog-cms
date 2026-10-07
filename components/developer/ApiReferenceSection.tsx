'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

type ParamRow = {
  name: string
  type: string
  required: boolean
  description: string
  default?: string
}

type EndpointDef = {
  method: HttpMethod
  path: string
  description: string
  badge?: string
  paramLabel?: string
  params?: ParamRow[]
  request: string
  response: string
  responseStatus: number
}

// ─── Endpoint data ─────────────────────────────────────────────────────────────

const ENDPOINTS: EndpointDef[] = [
  {
    method: 'GET',
    path: '/api/posts',
    description: 'List posts with pagination & filters',
    paramLabel: 'Query Parameters',
    params: [
      { name: 'page',   type: 'integer', required: false, default: '1',          description: 'Page number' },
      { name: 'limit',  type: 'integer', required: false, default: '20',         description: 'Results per page (max 100)' },
      { name: 'status', type: 'string',  required: false, default: '—',          description: '"draft" or "published"' },
      { name: 'search', type: 'string',  required: false, default: '—',          description: 'Filter by title (partial match)' },
      { name: 'sort',   type: 'string',  required: false, default: 'created_at', description: '"created_at", "updated_at", or "title"' },
      { name: 'order',  type: 'string',  required: false, default: 'desc',       description: '"asc" or "desc"' },
    ],
    request: `GET /api/posts?status=published&page=1&limit=10
Authorization: Bearer fmblog_your_key_here`,
    response: `{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Getting Started with Next.js",
      "slug": "getting-started-with-nextjs",
      "status": "published",
      "category": "Technology",
      "tags": ["nextjs", "react"],
      "image_url": null,
      "created_at": "2026-04-14T09:00:00Z",
      "published_at": "2026-04-14T09:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "total_pages": 5,
    "has_next": true,
    "has_prev": false
  }
}`,
    responseStatus: 200,
  },
  {
    method: 'POST',
    path: '/api/posts/create',
    description: 'Create a draft or publish a reviewed article. Publication requires a title, unique slug, body, excerpt and named author; failures return 422 with details.field_errors.',
    paramLabel: 'Request Body',
    params: [
      { name: 'title',     type: 'string',   required: false, description: 'Required for publication: 10–160 readable characters' },
      { name: 'content',   type: 'string',   required: false, description: 'Required for publication: at least 200 readable words' },
      { name: 'status',    type: 'string',   required: false, default: 'draft',   description: '"draft" or "published"' },
      { name: 'excerpt',   type: 'string',   required: false, default: '—',       description: 'Required for publication: 40–500 readable characters' },
      { name: 'editorial_reviewed', type: 'boolean', required: false, default: 'false', description: 'Set true only after human review; required for publication and live edits' },
      { name: 'tags',      type: 'string[]', required: false, default: '—',       description: 'Tag names' },
      { name: 'category',  type: 'string',   required: false, default: '—',       description: 'Category name' },
      { name: 'image_url', type: 'string',   required: false, default: '—',       description: 'Cover image URL' },
    ],
    request: `POST /api/posts/create
Authorization: Bearer fmblog_your_key_here
Content-Type: application/json

{
  "title": "Getting Started with Next.js",
  "content": "<h2>Introduction</h2><p>Next.js is...</p>",
  "status": "draft",
  "excerpt": "A quick intro to Next.js App Router.",
  "tags": ["nextjs", "react"],
  "category": "Technology"
}`,
    response: `{
  "success": true,
  "data": {
    "post": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Getting Started with Next.js",
      "slug": "getting-started-with-nextjs",
      "status": "draft"
    }
  }
}`,
    responseStatus: 201,
  },
  {
    method: 'GET',
    path: '/api/posts/{id}',
    description: 'Get a post by ID or slug',
    paramLabel: 'Path Parameter',
    params: [
      { name: 'id', type: 'string', required: true, description: 'Post UUID or slug' },
    ],
    request: `GET /api/posts/getting-started-with-nextjs
Authorization: Bearer fmblog_your_key_here`,
    response: `{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Getting Started with Next.js",
    "slug": "getting-started-with-nextjs",
    "content": "<h2>Introduction</h2><p>...</p>",
    "excerpt": "A quick intro to Next.js.",
    "meta_title": "Getting Started with Next.js",
    "meta_description": "Learn the basics of Next.js App Router.",
    "status": "published",
    "category": "Technology",
    "tags": ["nextjs", "react"],
    "image_url": null,
    "created_at": "2026-04-14T09:00:00Z",
    "published_at": "2026-04-14T09:00:00Z"
  }
}`,
    responseStatus: 200,
  },
  {
    method: 'PATCH',
    path: '/api/posts/{id}',
    description: 'Update a post (partial). Publishing and live edits validate the entire resulting article before any write. Blocked requests return 422 with details.field_errors.',
    paramLabel: 'Request Body',
    params: [
      { name: 'editorial_reviewed', type: 'boolean', required: false, default: 'false', description: 'Required for publication and live edits after human review' },
      { name: 'title',            type: 'string',   required: false, default: '—', description: 'New title' },
      { name: 'content',          type: 'string',   required: false, default: '—', description: 'New HTML content' },
      { name: 'slug',             type: 'string',   required: false, default: '—', description: 'URL-safe slug (lowercase, hyphens)' },
      { name: 'excerpt',          type: 'string',   required: false, default: '—', description: 'Short summary' },
      { name: 'meta_title',       type: 'string',   required: false, default: '—', description: 'SEO title' },
      { name: 'meta_description', type: 'string',   required: false, default: '—', description: 'SEO description' },
      { name: 'status',           type: 'string',   required: false, default: '—', description: '"draft" or "published"' },
      { name: 'category',         type: 'string',   required: false, default: '—', description: 'Category name' },
      { name: 'tags',             type: 'string[]', required: false, default: '—', description: 'Replaces all existing tags' },
      { name: 'image_url',        type: 'string',   required: false, default: '—', description: 'Cover image URL' },
    ],
    request: `PATCH /api/posts/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer fmblog_your_key_here
Content-Type: application/json

{
  "status": "published",
  "editorial_reviewed": true,
  "title": "Updated Title"
}`,
    response: `{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Updated Title",
    "slug": "getting-started-with-nextjs",
    "status": "published",
    "published_at": "2026-04-14T09:05:00Z"
  }
}`,
    responseStatus: 200,
  },
  {
    method: 'DELETE',
    path: '/api/posts/{id}',
    description: 'Delete a post',
    paramLabel: 'Path Parameter',
    params: [
      { name: 'id', type: 'string', required: true, description: 'Post UUID' },
    ],
    request: `DELETE /api/posts/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer fmblog_your_key_here`,
    response: `{
  "success": true,
  "message": "Post deleted successfully."
}`,
    responseStatus: 200,
  },
  {
    method: 'POST',
    path: '/api/ai-assistant/generate',
    description: 'Generate a post from a topic using AI',
    badge: 'AI',
    paramLabel: 'Request Body',
    params: [
      { name: 'topic',          type: 'string',  required: true,  description: 'Blog post topic' },
      { name: 'context',        type: 'string',  required: false, default: '—',            description: 'Additional context or instructions' },
      { name: 'tone',           type: 'string',  required: false, default: 'professional', description: 'Writing tone' },
      { name: 'word_count',     type: 'integer', required: false, default: '800',          description: 'Target word count' },
      { name: 'llm_provider',   type: 'string',  required: false, default: 'auto',         description: '"claude" or "gemini" (auto-selects if omitted)' },
      { name: 'llm_model',      type: 'string',  required: false, default: '—',            description: 'Specific model ID (e.g. "claude-sonnet-4-6")' },
      { name: 'post_overrides', type: 'object',  required: false, default: '—',            description: 'Override AI values: title, category, tags, image_url' },
    ],
    request: `POST /api/ai-assistant/generate
Authorization: Bearer fmblog_your_key_here
Content-Type: application/json

{
  "topic": "The future of AI in web development",
  "tone": "professional",
  "word_count": 1200,
  "post_overrides": {
    "category": "Technology"
  }
}`,
    response: `{
  "success": true,
  "data": {
    "post": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "title": "The Future of AI in Web Development",
      "slug": "the-future-of-ai-in-web-development",
      "status": "draft",
      "created_at": "2026-04-14T09:01:00Z"
    },
    "llm_provider": "claude",
    "llm_model": "claude-sonnet-4-6",
    "chat_id": "c1a2b3d4-e5f6-7890-abcd-ef1234567890"
  }
}`,
    responseStatus: 201,
  },
]

// ─── Method badge ──────────────────────────────────────────────────────────────

const METHOD_STYLES: Record<HttpMethod, string> = {
  GET:    'bg-emerald-50 text-emerald-700',
  POST:   'bg-blue-50 text-blue-700',
  PATCH:  'bg-amber-50 text-amber-700',
  DELETE: 'bg-red-50 text-red-700',
}

// ─── EndpointCard ──────────────────────────────────────────────────────────────

function EndpointCard({ ep }: { ep: EndpointDef }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'request' | 'response'>('request')

  // Render {id} path segments in blue
  const pathParts = ep.path.split(/(\{[^}]+\})/)

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Header — always visible */}
      <button
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={cn(
            'text-[11px] font-bold px-2 py-0.5 rounded-sm font-mono w-14 text-center shrink-0',
            METHOD_STYLES[ep.method]
          )}
        >
          {ep.method}
        </span>

        <code className="text-sm text-gray-800 font-medium flex-1">
          {pathParts.map((part, i) =>
            part.startsWith('{') ? (
              <span key={i} className="text-blue-500">{part}</span>
            ) : (
              <span key={i}>{part}</span>
            )
          )}
        </code>

        <div className="flex items-center gap-2 shrink-0">
          {ep.badge && (
            <span className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
              {ep.badge}
            </span>
          )}
          <span className="text-xs text-gray-400 hidden sm:block">{ep.description}</span>
        </div>

        <ChevronDown
          className={cn(
            'h-4 w-4 text-gray-400 shrink-0 transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>

      {/* Expanded body */}
      {open && (
        <div className="border-t border-gray-100 p-5 space-y-5">
          {/* Params table */}
          {ep.params && ep.params.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {ep.paramLabel}
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left pb-1.5 pr-4 text-gray-400 font-medium">Field</th>
                      <th className="text-left pb-1.5 pr-4 text-gray-400 font-medium">Type</th>
                      <th className="text-left pb-1.5 pr-4 text-gray-400 font-medium">Required</th>
                      <th className="text-left pb-1.5 text-gray-400 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {ep.params.map((p) => (
                      <tr key={p.name}>
                        <td className="py-1.5 pr-4 font-mono text-blue-700">{p.name}</td>
                        <td className="py-1.5 pr-4 text-gray-500">{p.type}</td>
                        <td className="py-1.5 pr-4">
                          {p.required ? (
                            <span className="text-red-500 font-medium">required</span>
                          ) : (
                            <span className="text-gray-400">{p.default ?? '—'}</span>
                          )}
                        </td>
                        <td className="py-1.5 text-gray-600">{p.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Request / Response tabs */}
          <div>
            <div className="flex gap-4 border-b border-gray-100 mb-3">
              {(['request', 'response'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'text-xs py-1.5 capitalize transition-colors',
                    tab === t
                      ? 'border-b-2 border-blue-500 text-blue-600 font-semibold -mb-px'
                      : 'text-gray-400 hover:text-gray-600'
                  )}
                >
                  {t === 'response' ? `Response ${ep.responseStatus}` : 'Request'}
                </button>
              ))}
            </div>
            <pre className="bg-slate-950 text-slate-100 rounded-lg p-4 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre">
              {tab === 'request' ? ep.request : ep.response}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ApiReferenceSection ───────────────────────────────────────────────────────

export function ApiReferenceSection() {
  return (
    <Card className="p-6 space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">API Reference</h2>
        <p className="text-xs text-muted-foreground">
          All endpoints require an API key passed as a Bearer token in the Authorization header.
        </p>
      </div>

      {/* Auth banner */}
      <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 shrink-0">
          Auth
        </span>
        <div>
          <code className="text-xs text-slate-700">
            Authorization: Bearer fmblog_your_key_here
          </code>
          <p className="text-xs text-slate-500 mt-0.5">
            Rate limit: 60 req/min for CRUD endpoints · 10 req/min for AI generation
          </p>
        </div>
      </div>

      {/* Endpoint cards */}
      <div className="space-y-2">
        {ENDPOINTS.map((ep) => (
          <EndpointCard key={`${ep.method}-${ep.path}`} ep={ep} />
        ))}
      </div>
    </Card>
  )
}
