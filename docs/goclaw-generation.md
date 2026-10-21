# GoClaw generation integration

ArtCraft calls the separate public generation service deployed alongside GoClaw.
That service selects and runs the requested GoClaw agent and owns provider
selection, provider credentials, and generation. ArtCraft authenticates the
user, resolves reference media tokens to CDN URLs, forwards the user's ArtCraft
token as the GoClaw user identity, and imports returned images into the user's
ArtCraft media library.

## Configuration

Set these variables on the `storyteller-web` service. Both are required to
enable the integration; omit both to leave it disabled.

```text
GOCLAW_GENERATION_SERVICE_URL=https://goclaw.example.com
GOCLAW_API_TOKEN=<service credential authorized for generation>
```

## Image generation endpoint

`POST /v1/omni_gen/generate/goclaw` accepts the user's selected GoClaw agent,
prompt, and optional ArtCraft image references:

```json
{
  "idempotency_token": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "agent_id": "image-agent",
  "prompt": "A red fox in a snowy forest",
  "reference_media_tokens": []
}
```

The response contains any assistant text and the ArtCraft media tokens created
from image outputs. The browser can load these with the existing media APIs.
The ArtCraft endpoint currently waits for the generation service call to finish.

## Generation service contract

The ArtCraft adapter expects the GoClaw-side service to implement these routes:

- `POST /v1/generations` with `{ "request_id", "agent_id", "user_id", "prompt", "reference_media": [{ "type": "image", "url": "..." }] }`.
- The response includes `{ "generation_id", "content", "media": [{ "id", "mime_type", "file_name" }] }` after the agent completes.
- `GET /v1/generations/{generation_id}/media/{media_id}` returns the generated image bytes.

All requests use `Authorization: Bearer <GOCLAW_API_TOKEN>`. The generation
service should make `request_id` idempotent and authorize agent access using
`user_id`.
