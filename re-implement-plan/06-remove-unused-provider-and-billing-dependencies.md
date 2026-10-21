# Plan 6: Remove unused Storyteller AI provider and billing dependencies

## Goal

Ensure GoClaw generation does not require Storyteller AI providers or an AI subscription, while keeping any unrelated account or billing features the owner chooses to retain.

## Work

- [x] Confirm in-scope image/video/audio generation uses the GoClaw endpoint and does not require provider costs or credits (Plan 1 implementation).
- [x] Remove ArtCraft subscription redirects after Google signup/login, Google sign-in from the generation prompt, and password reset. Password login and desktop login bridge already continued without a subscription check.
- [x] Keep GoClaw usage limits and provider costs under the GoClaw deployment; its Settings page documents this and generation does not debit ArtCraft AI credits.
- [x] Keep legacy billing and non-GoClaw generation paths unchanged; document that Stripe/provider placeholders satisfy startup parsing only.
- [x] Inventory known external dependencies in the self-host guide: providers for out-of-scope generation, Stripe, Resend, Google OAuth, direct segmentation, funnel/CDN targets, and the development-only API proxy default.
- [ ] Configure, replace, or disable each retained external integration before claiming the entire product is independent of Storyteller/provider/billing services.

## Acceptance criteria

- GoClaw generation does not require an ArtCraft subscription, credit balance, or provider credential.
- Remaining legacy billing behavior is documented as retained for non-GoClaw features and non-operational without Stripe configuration.
- In-scope generation does not fall back to Storyteller AI providers.
- Known remaining external service calls and the feature paths that retain them are inventoried.

## Dependencies

- Plan 1 defines generation paths in scope.
- Plan 3 defines account and billing behavior for the self-hosted deployment.
- Plan 5 defines the frontend API destination.

## Verification to perform during implementation

- [x] Review GoClaw generation handlers and frontend submissions for provider and billing gates.
- [x] Inspect frontend/backend configuration for known remaining Storyteller.ai/provider dependencies.
- [ ] Verify service destinations in the deployed browser network.

This plan covers GoClaw generation and subscription redirects that would block
self-hosted accounts. It does not remove Stripe or provider integrations used by
unrelated ArtCraft features. The whole application is not yet independent of external
services; see the self-host deployment guide's dependency list. No repository code was
run or built.
