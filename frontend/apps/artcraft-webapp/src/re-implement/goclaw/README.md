# GoClaw integration for the ArtCraft webapp

This directory contains the custom GoClaw settings, a standalone Settings page, browser-local connection state, and media generation helper. The sidebar links to `/settings/goclaw`; the existing Settings modal also has a GoClaw tab. The Create Image/Video/Audio pages expose configured agents in their model lists.

Agent type is assigned by the user because GoClaw's agent list returns an ID, name and description without a reliable image/video/audio capability field. Settings persist the URL and agent assignments in local storage and the token in session storage. A configured ArtCraft backend is required to list agents and generate media; a static UI deployment alone cannot complete those requests.

Agents can be entered manually by ID to preview model pickers on a static deployment. This does not verify an agent or enable generation without the backend.
