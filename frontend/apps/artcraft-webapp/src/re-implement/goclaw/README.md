# GoClaw integration for the ArtCraft webapp

This directory contains the custom GoClaw settings, browser-local connection state, and media generation helper. The existing Settings modal and Create Image/Video/Audio pages contain only the integration points needed to expose it.

Agent type is assigned by the user because GoClaw's agent list returns an ID, name and description without a reliable image/video/audio capability field. Settings persist the URL and agent assignments in local storage and the token in session storage. A configured ArtCraft backend is required to list agents and generate media; a static UI deployment alone cannot complete those requests.

Agents can be entered manually by ID to preview model pickers on a static deployment. This does not verify an agent or enable generation without the backend.
