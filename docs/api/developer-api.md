# Developer API

Admins and authors can generate API keys to allow external tools to create posts without a browser session.

## Access Developer Settings

1. Log in as Admin or Author
2. Go to **Dashboard → Developer**
3. Click **Generate New Key**, name it, and copy the key — shown only once

## API Key Format

Keys are prefixed with `fmblog_` followed by 64 hex characters. Only a SHA-256 hash is stored in the database.

## Endpoints

### POST /api/posts/create

Create a new post from any HTTP client.

**Headers:**
```
Authorization: Bearer fmblog_your_key_here
Content-Type: application/json
```

**Body:**

| Field              | Type                   | Required | Description                                            |
| ------------------ | ---------------------- | -------- | ------------------------------------------------------ |
| `title`            | string                 | Yes      | Post title                                             |
| `content`          | string                 | Yes      | HTML content (TipTap-compatible)                       |
| `slug`             | string                 | No       | Custom URL slug; normalized server-side. Omit for automatic generation. |
| `status`           | `draft` \| `published` | No       | Defaults to `draft`                                    |
| `excerpt`          | string                 | No       | Plain-text summary                                     |
| `meta_title`       | string                 | No       | SEO title — defaults to `title`                        |
| `meta_description` | string                 | No       | SEO description — defaults to `excerpt`                |
| `tags`             | string[]               | No       | Tag names — created automatically if they don't exist  |
| `category`         | string                 | No       | Category name — matched by name or slug                |
| `image_url`        | string                 | No       | Featured image URL                                     |

**Example:**
```bash
curl -X POST https://your-domain.com/api/posts/create \
  -H "Authorization: Bearer fmblog_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Hello from n8n",
    "content": "<p>This post was created via the API.</p>",
    "status": "draft",
    "tags": ["automation", "n8n"],
    "category": "Technology"
  }'
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Hello from n8n",
    "slug": "hello-from-n8n",
    "status": "draft"
  }
}
```

### POST /api/ai-assistant/generate

Generate a blog post headlessly using the AI assistant.

**Headers:**
```
Authorization: Bearer fmblog_your_key_here
Content-Type: application/json
```

### GET /api/posts

List posts with pagination and filters.

### GET /api/posts/[id]

Retrieve a single post by ID.

### PATCH /api/posts/[id]

Update a post by ID.

### DELETE /api/posts/[id]

Delete a post by ID.

## Security Notes

- Raw API keys are never stored — only SHA-256 hashes
- The key is shown exactly once after generation
- Keys can be revoked or deleted at any time from Developer Settings
- `author_id` is always set to the user who owns the API key
- API routes are rate-limited in-memory

See [publication and write contracts](publication-and-writes.md) for published requests, concurrency and idempotency. AI generation creates drafts requiring human editorial review.

Cover metadata uses `image_url` and optional `image_alt` (at most 1000 characters) on create/update. Read endpoints return both. See [post images](../features/post-images.md) for authenticated dashboard upload and storage policy.
