# Plan 4: Handle reference and generated media in self-hosted storage

## Goal

Keep user-provided and GoClaw-generated files within the self-hosted media pipeline and return media data in the format the frontend expects.

## Work

- Trace media upload, lookup, authorization, storage, CDN URL generation, and deletion paths used by generation features.
- Ensure reference media can be made available to GoClaw through a controlled URL or upload mechanism.
- Import generated files from GoClaw into the self-hosted storage system.
- Enforce supported media types, file-size limits, URL/host restrictions, and request timeouts.
- Preserve ownership and access checks when returning generated media to users.
- Define behavior for expired GoClaw file URLs, partial results, duplicate submissions, and failed imports.
- Ensure generated media responses match the frontend API contract.

## Acceptance criteria

- Reference files are accessible to GoClaw only through the intended secure mechanism.
- Generated files are persisted in owner-controlled storage before the UI relies on them.
- Media access remains scoped to the requesting user/session.
- The frontend can display and retrieve generated media using the self-hosted backend/storage.

## Dependencies

- Plan 3 selects the database and media storage services.
- Plan 1 defines supported generation modalities and reference-media behavior.
- Plan 2 defines trusted GoClaw connectivity.

## Verification to perform during implementation

- Review access control, content validation, and outbound URL restrictions.
- Verify upload, import, retrieval, and failure cases in the self-hosted environment after runtime checks are authorized.

## Implementation status

- [x] Resolve reference media through the authenticated user's owned media tokens before passing their URLs to GoClaw. Duplicate references remain supported.
- [x] Import GoClaw output into the requesting user's media library before returning media tokens; only same-origin GoClaw file/media URLs are downloaded.
- [x] Limit reference count to 10, generated file count to 8, and each generated download to 100 MiB; validate imported bytes against the requested image, video, or audio MIME allowlist.
- [x] Fail the request if GoClaw returns no supported links or if any generated file cannot be downloaded or stored. Already imported files from a partially failed import may remain in the user's library.
- [x] Return the GoClaw content and self-hosted media tokens; store GoClaw output as generated media so Create galleries do not filter it as a user upload.
- [x] Use `MEDIA_CDN_BASE_URL` for media response URLs and reference links in the self-host profile.

The GoClaw client's configured-host HTTPS, public-address, redirect, and request-timeout checks apply to both agent calls and generated file downloads. Reference media links use the configured media origin; access is gated by ownership when the request is prepared, while the CDN objects themselves follow the existing bucket visibility policy. Custom media origins serve original thumbnail objects and do not require Cloudflare image transformations.
