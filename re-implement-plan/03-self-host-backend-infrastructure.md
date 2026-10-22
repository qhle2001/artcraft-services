# Plan 3: Deploy the ArtCraft backend and its required infrastructure

## Goal

Run the backend and supporting services on infrastructure controlled by the project owner, without depending on Storyteller.ai runtime services.

## Work

- Identify required services from the selected backend features: `storyteller-web`, MySQL, media/object storage, CDN or equivalent file delivery, and any required Redis, queues, or workers.
- Separate required services from optional ArtCraft features that will not be operated.
- Define deployment configuration, domains, TLS, networking, resource sizing, backups, monitoring, and recovery procedures.
- Configure application secrets and service credentials outside source control.
- Configure user authentication and account behavior for the self-hosted deployment.
- Decide whether existing billing/credits features are retained, replaced, or disabled for GoClaw generation.
- Document deployment and upgrade procedures for backend services and database schema.

## Acceptance criteria

- The selected backend features have a complete dependency list and deployment configuration.
- Persistent user and media data have backup and recovery plans.
- Backend and GoClaw can communicate over the intended private or secured network path.
- No required runtime dependency points to Storyteller.ai infrastructure.

## Dependencies

- Plans 1, 2, and 4 define generation, GoClaw, and media requirements.
- The operator provides infrastructure and domain details.

## Verification to perform during implementation

- Review the runtime dependency graph and deployment configuration.
- Confirm backend health, database access, media persistence, and GoClaw connectivity in the deployed environment.

## Implementation status

- [x] Add a production-oriented Compose profile with MySQL, migrations, Redis, Elasticsearch, SeaweedFS, and `storyteller-web` under `build/selfhost/re-implement/`.
- [x] Keep database, cache, search, and object-storage ports private; publish the API on loopback for a host TLS reverse proxy.
- [x] Seed standard `user`, `mod`, and `admin` roles idempotently after migrations.
- [x] Configure a self-hosted HTTPS media origin for browser links and GoClaw reference files.
- [x] Add production cookie/database/storage templates and a backend-only GoClaw JSON config mounted read-only; include startup-required integration placeholders.
- [x] Document account/email setup, moderator bootstrap, billing behavior, backup/restore, upgrades, monitoring endpoint, and current worker/network limitations.
- [ ] Complete browser-facing API host setup in Plan 5 and media delivery design in Plan 4 before production use.
- [ ] Replace the current Resend password-reset dependency and hard-coded `getartcraft.com` reset link if the deployment must have no external service besides GoClaw.
- [ ] Deploy and verify the stack on operator-provided infrastructure. No domain, server, email sender, or backup destination was provided, so these remain deployment-time values.
