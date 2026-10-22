# GoClaw integration for the ArtCraft webapp

This directory contains agent loading, an in-memory agent store, and the media generation helper used by Create Image/Video/Audio.

The backend administrator defines the URL, API token, and each agent's ID, name, description and media type in `build/selfhost/re-implement/goclaw/config.json`. The frontend automatically loads non-secret agent metadata from `GET /v1/omni_gen/goclaw/agents/configured` after login. The browser neither configures the connection nor receives its URL or token. Old browser configuration is discarded.

Generation still goes through the authenticated backend, which validates the selected agent against the file. Reload the page after editing the server file to refresh the model pickers. There is no GoClaw Settings tab or manual agent editor.
