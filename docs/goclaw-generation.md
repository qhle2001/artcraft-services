# Self-hosted GoClaw image generation

ArtCraft can use agents from a separately hosted GoClaw instance. Users connect from the Create Image page; no shared GoClaw URL or token is configured in ArtCraft's `.env`.

## Connect

1. Open **Settings → GoClaw** from the top bar.
2. Enter the public HTTPS URL of your GoClaw instance and a GoClaw API token with permission to list and wake agents.
3. Select **Connect and load agents**. Assign each returned agent an Image, Video, or Audio type.
   You can also add an agent ID and display name manually to preview the picker before deploying the ArtCraft API; the ID must match a real GoClaw agent for generation.
4. Open the corresponding Create page and choose the agent from the model picker. The URL, agent list and type assignments persist in this browser's local storage. The token is stored for the current tab session only (session storage); it must be re-entered in a new browser session.

The GoClaw gateway must be reachable from the ArtCraft backend, use HTTPS, and present a valid TLS certificate. Requests reject non-public DNS/IP destinations and redirects. ArtCraft sends the token only in the `Authorization: Bearer` header to the configured GoClaw instance.

## Generation flow

ArtCraft sends the selected agent ID, media type, prompt, and the user's reference media CDN URLs in a `POST /v1/agents/{id}/wake` message. GoClaw runs that agent and returns text. To import results into the user's ArtCraft library, the agent must return generated media as Markdown links hosted by the same GoClaw instance, for example:

```markdown
![Generated image](https://goclaw.example.com/v1/files/generated/image.png)
[Generated video](https://goclaw.example.com/v1/files/generated/video.mp4)
[Generated audio](https://goclaw.example.com/v1/files/generated/audio.mp3)
```

ArtCraft downloads only links from the configured GoClaw origin under `/v1/files/` or `/v1/media/`, authenticates those downloads with the same Bearer token, validates the file against the selected media type, and uploads it to the signed-in ArtCraft user's media library. The agent's returned text is included in the API response.

## API endpoints

- `POST /v1/omni_gen/goclaw/agents` — accepts `goclaw_url` and `goclaw_api_token`; returns agents visible to that GoClaw credential.
- `POST /v1/omni_gen/generate/goclaw` — accepts the GoClaw connection, `agent_id`, `media_type` (`image`, `video`, or `audio`), prompt, idempotency token, and optional ArtCraft reference media tokens; wakes the agent and imports media links. Omitted `media_type` defaults to image for older clients.

Both endpoints require an authenticated ArtCraft session or API key. The GoClaw token is not stored in ArtCraft's database or environment configuration.
