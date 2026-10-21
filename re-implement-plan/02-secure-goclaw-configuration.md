# Plan 2: Manage GoClaw configuration through the backend

## Goal

Use the frontend Settings page only to submit and manage GoClaw connection settings. The backend owns the saved GoClaw URL and credential and uses them for agent listing and generation. The browser must not retain the token or resend it with each generation request.

## Work

- Add an authenticated backend settings flow to save, update, clear, and test the GoClaw URL and API token from the frontend Settings page.
- Decide whether this is an instance-wide setting managed by an administrator or a per-user setting; for this self-hosted instance, default to an administrator-managed instance setting unless product requirements say otherwise.
- Persist the token securely on the backend, encrypted at rest using a key supplied through deployment secrets. Never commit the token or encryption key.
- Return only non-secret status and connection metadata to the frontend; never return the saved token after submission.
- Update agent listing and generation handlers to load the saved backend configuration rather than accepting arbitrary URL/token values in each request.
- Restrict outbound GoClaw requests to the configured host and retain HTTPS validation.
- Remove browser-side token persistence and token fields from agent-list and generation request bodies after the backend flow is migrated.
- Provide safe error messages to clients while keeping sensitive details out of responses and logs.
- Document secret rotation, encryption-key backup/recovery, and configuration for local, staging, and production deployments.

## Acceptance criteria

- The frontend can save and test GoClaw connection settings, but cannot read the saved token back.
- Agent listing and generation requests use backend-managed settings and do not carry the GoClaw token.
- GoClaw credentials are encrypted at rest and available to backend request handling only.
- Non-administrators cannot modify instance-wide GoClaw configuration.
- Logs and API errors do not reveal tokens.

## Dependencies

- GoClaw deployment URL and authentication method are known.
- The self-hosted application has an administrator authorization mechanism.
- Plan 1 identifies all GoClaw request paths.

## Verification to perform during implementation

- Inspect browser network requests and storage to confirm the token is sent only when saving/testing settings and is not returned or persisted by the browser.
- Check administrator authorization for setting changes and ordinary authenticated access for generation.
- Check invalid configuration, expired credentials, and GoClaw outage behavior without logging secrets.

## Implementation status

- [x] Store instance-wide GoClaw URL and encrypted token in MySQL.
- [x] Require an authenticated session to read non-secret connection metadata and list agents; require moderator access to save or clear instance settings.
- [x] Make agent listing and generation use the stored backend configuration.
- [x] Remove token storage and per-generation credential fields from the browser.
- [x] Document deployment key setup and recovery/rotation in `crates/service/web/storyteller_web/src/re-implement/goclaw/README.md`.
- [ ] Run deployment and browser checks after the backend has been deployed. These checks are intentionally not run as part of this implementation.
