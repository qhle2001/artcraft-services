# Plan 2: Manage GoClaw through a backend config file

## Goal

The operator manages the GoClaw URL, token and agent definitions in one private JSON
file. The backend owns the connection. The frontend automatically loads agent metadata
and submits generation requests without receiving the GoClaw credential.

## Implemented scope

- [x] Add `build/selfhost/re-implement/goclaw/config.example.json` with URL, token and
  agent IDs/names/descriptions/types. Copy it to gitignored `config.json` for deployment.
- [x] Read the file through `GOCLAW_CONFIG_FILE`, defaulting to the repository-relative
  `build/selfhost/re-implement/goclaw/config.json`.
- [x] Validate config and enforce the configured agent/media-type pairs at generation.
- [x] Return only non-secret agent metadata through an authenticated GET endpoint.
- [x] Remove frontend connection settings and browser-local agent editing/persistence.
- [x] Mount the config directory read-only in production Compose. Re-read the file
  per request so atomic updates apply without a rebuild or restart.
- [x] Remove the runtime dependency on the MySQL settings table and encryption key.
  Retain old migration/query files for database history; old settings are not read.
- [x] Document file permissions, backup and rotation in the backend GoClaw README.
- [ ] Perform browser and deployment checks after runtime verification is authorized.

## Acceptance criteria

- The browser never receives the configured URL or API token from the agent API.
- URL, token and agents are managed only by editing the backend file.
- The frontend model pickers reflect the file after a page reload.
- Credentials do not appear in API errors or config parser logs.
- Generation keeps existing authentication, reference ownership and trusted-host checks.
- Missing or invalid config rejects GoClaw requests without disabling unrelated APIs.

## Operational notes

The config file stores the token in plaintext and must be protected by filesystem
permissions and protected backups. Do not publish it in frontend assets or commit it.
Use a separate file/token for each environment. Existing GoClaw HTTPS/public-IP
restrictions still apply. No repository code was run, built or tested for this change.
