# Plan 5: Point the frontend at the self-hosted backend

## Goal

Configure the deployed webapp to call the owner-controlled backend instead of the default Storyteller API host.

## Work

- [x] Require `VITE_API_HOST` in production webapp builds; validate it as an HTTPS origin and route shared API clients through `StorytellerApiHostStore`.
- [x] Validate API host values as HTTP(S) origins without credentials, query, fragment, or path.
- [x] Let the Vite development proxy use `VITE_API_HOST`, retaining the upstream default only for local development.
- [x] Add exact `CORS_ALLOWED_ORIGINS` entries to backend CORS and the self-host Compose environment; keep credentialed CORS restricted to listed origins.
- [x] Document frontend build-time API configuration, backend CORS, and cookie domain requirements in the self-host deployment guide.
- [x] Inventory direct service URLs: `SegmentationApi` still calls `hax.storyteller.ai`; `FUNNEL_API` still names `style.storyteller.ai`. `CDN_API` is an upstream API target, while first-party media URLs use the self-host `MEDIA_CDN_BASE_URL` configured in Plan 4.
- [ ] Build and redeploy the frontend, then verify browser network requests, CORS, login/session, and media on the operator's domains.

## Acceptance criteria

- Production webapp API clients use the configured self-hosted backend origin, and a missing host does not silently fall back to `api.storyteller.ai`.
- Browser calls from configured frontend origins pass the backend's exact-origin credentialed CORS policy.
- Deployment browser checks confirm login/session and media work across the configured domains.

## Dependencies

- Plan 3 provides the backend origin and TLS configuration.
- Plan 6 inventories remaining external service dependencies.

## Verification to perform during implementation

- [x] Inspect source configuration paths and self-host environment wiring (no build performed).
- [ ] Inspect generated frontend configuration and browser network destinations after a reviewed build/deploy.
- [ ] Confirm CORS, credentials, and session behavior against the deployed backend.

The build and live checks remain pending because they require the operator's domain
configuration and deployment. Do not claim full self-hosting of segmentation, funnel,
or CDN services until those dependencies are separately replaced or disabled.
