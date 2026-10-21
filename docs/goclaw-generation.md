# Self-hosted GoClaw image generation

ArtCraft can use agents from a separately hosted GoClaw instance. Users connect from the Create Image page; no shared GoClaw URL or token is configured in ArtCraft's `.env`.

## Connect

1. Open **Create Image** and select the cable icon next to the model picker.
2. Enter the public HTTPS URL of your GoClaw instance and a GoClaw API token with permission to list and wake agents.
3. Select **Connect and load agents**. ArtCraft calls GoClaw `GET /v1/agents` and shows the returned agents in the existing model picker under **GoClaw Agents**.
4. Choose an agent and generate as usual. The browser remembers only the URL in local storage. The token stays in page memory and must be entered again after the page is reloaded.

The GoClaw gateway must be reachable from the ArtCraft backend, use HTTPS, and present a valid TLS certificate. Requests reject non-public DNS/IP destinations and redirects. ArtCraft sends the token only in the `Authorization: Bearer` header to the configured GoClaw instance.

## Generation flow

ArtCraft sends the selected agent ID, prompt, and the user's reference image CDN URLs in a `POST /v1/agents/{id}/wake` message. GoClaw runs that agent and returns text. To import results into the user's ArtCraft library, the agent must return generated images as Markdown image links hosted by the same GoClaw instance, for example:

```markdown
![Generated image](https://goclaw.example.com/v1/files/generated/image.png)
```

ArtCraft downloads only links from the configured GoClaw origin under `/v1/files/` or `/v1/media/`, authenticates those downloads with the same Bearer token, validates the file as an image, and uploads it to the signed-in ArtCraft user's media library. The agent's returned text is included in the API response.

## API endpoints

- `POST /v1/omni_gen/goclaw/agents` — accepts `goclaw_url` and `goclaw_api_token`; returns agents visible to that GoClaw credential.
- `POST /v1/omni_gen/generate/goclaw` — accepts the GoClaw connection, `agent_id`, prompt, idempotency token, and optional ArtCraft reference media tokens; wakes the agent and imports image links.

Both endpoints require an authenticated ArtCraft session or API key. The GoClaw token is not stored in ArtCraft's database or environment configuration.
