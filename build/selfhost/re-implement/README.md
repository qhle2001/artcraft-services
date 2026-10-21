# Self-host deployment profile

This profile is the production-oriented Compose variant for the currently implemented
GoClaw generation flow. Its new deployment files are kept under `re-implement` so they
remain separate from upstream deployment assets.

## Runtime services

| Service                      | Required for this profile | Purpose                                                       |
|------------------------------|---------------------------|---------------------------------------------------------------|
| `storyteller-web`            | Yes                       | Login/session, media APIs, GoClaw configuration and generation |
| MySQL                        | Yes                       | Users, sessions, media metadata, settings and migrations      |
| Redis                        | Yes                       | Session cache, rate limits and server caches                  |
| Elasticsearch                | Yes                       | Backend search paths and startup dependency                   |
| SeaweedFS                    | Yes for this profile      | S3-compatible persistent media buckets                        |
| `migrate`, `storage-init`    | One-shot                  | Create the schema and required buckets                        |
| Background workers           | No for direct GoClaw       | Needed for queued jobs and background media tasks             |

For a small single-instance deployment, start with at least 4 vCPU, 8 GB RAM, and
20 GB local disk for the database, index, and container images. Media storage grows
separately with uploads; size and monitor it from expected user volume rather than
treating 20 GB as a media capacity target.

The web API is bound to loopback by default. Terminate TLS with a reverse proxy on the
host and proxy `https://api.example.com` to `127.0.0.1:12345`. Do not expose MySQL,
Redis, Elasticsearch, or the S3 endpoint publicly. Use HTTPS for both the frontend
and API, and set `COOKIE_DOMAIN` to their shared parent domain. Set
`CORS_ALLOWED_ORIGINS` to the exact frontend origin (for example
`https://app.example.com`), with no path or wildcard. Multiple origins may be
comma-separated. The backend enables credentialed CORS, so only list domains you
control.

Set `MEDIA_CDN_BASE_URL` to an HTTPS media domain served by your reverse proxy or
CDN. Route object paths on that host to the public media bucket in SeaweedFS or your
chosen S3-compatible store. Keep the S3 API itself private. The backend uses this base
for media links and GoClaw reference files; leaving it unset in this Compose profile
is an error.

## Frontend API host

The webapp's production bundle requires `VITE_API_HOST` and fails during startup if
it is missing. Set it to the API **origin** with HTTPS, without a path, before
building the frontend. For example, in PowerShell:

```powershell
$env:VITE_API_HOST = "https://api.example.com"
npx nx build artcraft-webapp --configuration=production
```

Deploy the generated static files after reviewing the source and build environment.
Static hosting does not read this variable at runtime; changing the API domain means
building and deploying a new frontend bundle. The Vite development proxy reads the
same variable and otherwise retains the upstream Storyteller API as its development
default. The production webapp does not use that fallback.

Set `COOKIE_DOMAIN` to a common parent domain of the frontend and API when using
cookie sessions (for example `.example.com` for `app.example.com` and
`api.example.com`). Keep `COOKIE_SECURE=true` behind HTTPS.

## Initial setup

1. Copy `.env.example` to `.env`; replace every `REPLACE_WITH_*` value and update all
   example domains. Store `.env` outside source control and restrict it to the deploy
   account. Set long random MySQL, S3, cookie, and sort-key secrets. Use URL-safe
   alphanumeric MySQL credentials because `MYSQL_URL` embeds the password in a URL.
   Docker Compose v2.23 or newer is required for the inline S3 config.
2. Generate a 32-byte GoClaw encryption key and Base64 encode it (for example,
   `openssl rand -base64 32`). Put it in `GOCLAW_CONFIG_ENCRYPTION_KEY`. Back it up
   separately from the database. Losing it makes the saved GoClaw token unrecoverable.
3. Set `RESEND_API_KEY` and configure the verified sender/domain required for account
   verification and password recovery. Current backend startup still requires the
   listed provider and Stripe environment variables. The `unset` placeholders allow
   configuration parsing but do not make those unrelated generation or billing
   features operational. GoClaw generation does not use those credentials or debit
   ArtCraft AI credits.
4. The migration service applies SQL migrations and seeds the standard `user`, `mod`,
   and `admin` roles idempotently. From this directory, run `docker compose --env-file .env -f compose.production.yml
   up --build -d`. Database migrations run before the API starts. This command builds
   the repository image; review the source and deployment environment before running
   it.
5. Configure the host reverse proxy for TLS and forward requests to `127.0.0.1:12345`.
   Set the frontend API host separately as described in Plan 5. Sign up through the
   deployed application, confirm the account email, and grant the owner account the
   existing moderator/admin role through a controlled database administration
   process before saving instance-wide GoClaw settings.
6. Configure the GoClaw URL and token in Settings. The backend currently requires
   GoClaw to use HTTPS and resolve only to public IP addresses; a private-only GoClaw
   endpoint is not supported by the current client implementation.

The current direct GoClaw generation path does not debit ArtCraft credits and does not
check for an ArtCraft subscription. Web login, Google sign-in, and password reset
continue into the app without a subscription check. Existing non-GoClaw generation,
pricing, credit purchase, billing portal, and subscription screens keep their
upstream ArtCraft billing behavior. Stripe placeholders in this profile satisfy
startup configuration only; they do not make those flows operational. Do not expose
those purchase or subscription flows to users until you configure the corresponding
billing service or replace those screens and backend routes.

## Persistence, backup, and restore

MySQL and SeaweedFS volumes contain durable user and media data. Back them up to an
off-host encrypted location on a regular schedule and before upgrades. Use a consistent
MySQL backup (for example, `mysqldump --single-transaction`) and a SeaweedFS volume
snapshot/backup procedure appropriate to the storage backend. Keep the GoClaw
encryption key with the protected recovery materials, separately from the backup
destination. Redis is cache/session infrastructure and Elasticsearch is a search
index; the application may need users to sign in again if Redis is lost, and search
recovery/reindexing should be planned before treating Elasticsearch as disposable.
Perform restore drills on an isolated host and verify login, media retrieval, and a
GoClaw generation before replacing production.

For a database dump, stop API writes first, then run from this directory:

```sh
docker compose --env-file .env -f compose.production.yml exec -T mysql \
  sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction storyteller' \
  > storyteller.sql
```

Encrypt the dump before moving it off-host. Back up SeaweedFS using a volume-level
backup while its writes are stopped, or use the snapshot/replication mechanism of the
chosen production object-storage service. Keep a tested restore procedure; do not use
`docker compose down -v` for routine stops or upgrades.

Upgrade by backing up MySQL, media storage, and the GoClaw key; deploy the reviewed
new image; let the one-shot migration service apply pending migrations; then verify
`/_status`, authentication, media reads/writes, and GoClaw. Keep the previous image
available for rollback. A database migration may not be reversible after new writes,
so restore a coordinated database/media backup when rolling back across a breaking
schema change.

## Scope and remaining dependencies

This compose profile does not include background workers because Plan 1's selected
GoClaw generation handler runs synchronously in `storyteller-web`. Other ArtCraft
features that submit queued jobs will not complete without their matching workers.
The current backend still initializes provider clients, Stripe, and Resend at startup;
the placeholders only satisfy configuration parsing. The GoClaw path bypasses provider
generation and billing, but other ArtCraft workflows remain on the existing paths.
Known external service dependencies are:

- Provider generation paths outside Plan 1's GoClaw scope use configured provider
  credentials (FAL, GMICloud, Grok, Beeble, Seedance, OpenAI, and WorldLabs).
- Existing pricing, credit purchase, subscription, and portal routes use Stripe.
- Signup verification and password recovery use Resend; reset email links still point
  to `getartcraft.com` in production, as noted below.
- Google sign-in uses Google's OAuth service and needs a configured client ID.
- PageDraw segmentation still calls `hax.storyteller.ai` directly.
- API library service targets still include `style.storyteller.ai` (funnel) and
  `cdn.storyteller.ai` (CDN). Media delivery is still being addressed by Plan 4.
- The Vite development proxy retains `api.storyteller.ai` as its local-development
  default only. Production webapp builds require `VITE_API_HOST` (Plan 5).

These dependencies are retained for features outside the GoClaw generation scope;
they are not fallback paths for GoClaw generation. Configure, replace, or disable each
feature before presenting the deployment as independent of Storyteller services.
Plan 4 must settle browser-facing media delivery before this stack is production-ready
for persistent media access.

The app and GoClaw should communicate over an encrypted network path. At present the
GoClaw client rejects private IP destinations, so use its public HTTPS endpoint until
that policy is deliberately revised with appropriate SSRF protections.

The production profile is a deployment template, not a deployed service. Replace the
example domain names and secrets with values for the operator's infrastructure. The
frontend must be built with `VITE_API_HOST`, and the API must start with the matching
`CORS_ALLOWED_ORIGINS`; media delivery still depends on Plan 4. Starting this Compose
stack alone does not deploy or configure the frontend.

There are also two existing authentication limits to resolve before claiming a fully
self-hosted account flow: the backend sends password-reset email through Resend, and
the reset link is hard-coded to `getartcraft.com` for production. A custom
`WEBSITE_HOMEPAGE_REDIRECT` does not change that link. Thus this profile still has an
external email dependency for account recovery and needs a later backend change to
support the operator's own email service and frontend URL.
