# GoClaw integration for the ArtCraft webapp

This directory contains the custom GoClaw settings, browser-local agent selections, and media generation helper. The existing Settings modal and Create Image/Video/Audio pages contain only the integration points needed to expose it.

Agent type is assigned by the user because GoClaw's agent list returns an ID, name and description without a reliable image/video/audio capability field. The browser saves agent selections locally. It sends the token only when an administrator saves or rotates the instance configuration; the API never returns that token. The backend owns agent listing and generation using its stored configuration.

Agents can be entered manually by ID to preview model pickers on a static deployment. This does not verify an agent or enable generation without the backend.
