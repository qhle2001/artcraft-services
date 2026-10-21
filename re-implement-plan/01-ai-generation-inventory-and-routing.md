# Plan 1: Inventory and route AI generation through GoClaw

## Goal

Identify every AI generation flow in the frontend and backend, then make the selected ArtCraft generation features use the self-hosted GoClaw path instead of Storyteller AI provider routes.

## Work

- Inventory image, video, audio, mesh, splat, editing, prompt, and other generation entry points that are in scope.
- Trace each frontend flow through its API client, backend endpoint, worker/job path, and provider client.
- Decide which media types and workflows GoClaw agents will support.
- Route supported workflows through a GoClaw backend endpoint; keep unsupported workflows unavailable or explicitly out of scope.
- Remove or hide Storyteller AI provider model choices for the workflows being migrated.
- Preserve request behavior needed by the UI, including reference media, result count, progress, retries, and error display where supported.
- Document workflows intentionally left unchanged.

## Implemented scope

- The Create Image, Create Video, and Create Audio pages now offer configured GoClaw agents as their only generation choices.
- Those pages select the first configured agent for the media type by default and require a configured agent before submission.
- Image generation submits only to `/v1/omni_gen/generate/goclaw`; video and audio use the existing GoClaw helper and the same backend route.
- Provider cost estimates, model-specific output controls, and batch-count controls are hidden for these GoClaw flows because the current GoClaw request contract accepts a prompt and reference media, then returns one or more files.
- The existing backend GoClaw route already supports image, video, and audio request types, so this pass reuses it without adding a backend source file.
- This pass uses the existing request contract, which still sends the GoClaw URL/token from the browser. Complete Plan 2 before treating the connection flow as backend-managed or production-hardened.

## Remaining generation workflows

The following workflows still use their existing ArtCraft-specific generation paths and need a separate routing decision because their request/result contracts are not covered by the current GoClaw media endpoint:

- Mesh and splat generation.
- PageDraw image editing and background removal.
- VFX background-change generation.
- PageScene and other specialized generation adapters.

These are explicitly outside the implemented scope of this pass. Do not treat Plan 1 as a complete removal of every ArtCraft AI route until these workflows are migrated or disabled.

## Acceptance criteria

- Every in-scope generation action has a documented request path that ends at GoClaw.
- No in-scope action silently falls back to a Storyteller AI provider.
- Unsupported GoClaw capabilities are clearly handled in the UI.

## Dependencies

- GoClaw API capabilities and agent contracts are known.
- Plan 2 defines secure backend-to-GoClaw configuration.
- Plan 3 defines backend job and media dependencies.

## Verification to perform during implementation

- Review each generation call site and its destination endpoint.
- Exercise the supported generation paths against a self-hosted GoClaw instance after the project owner authorizes runtime checks.
