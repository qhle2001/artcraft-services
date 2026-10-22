# GoClaw backend configuration

Copy `build/selfhost/re-implement/goclaw/config.example.json` to `config.json` in
the same directory. Set `url` to the GoClaw HTTPS origin, `api_token` to its bearer
token, and `agents` to the IDs and names you want to expose. Each agent needs a
`type`: `image`, `video`, or `audio`. `description` is optional. The same ID can be
listed once per media type when an agent supports more than one type. An empty
agent list disables all GoClaw generation choices.

The default path is relative to the repository root. Set `GOCLAW_CONFIG_FILE` to
an absolute file path when running from another directory. The production Compose
profile mounts `build/selfhost/re-implement/goclaw/` read-only into the backend
and sets `GOCLAW_CONFIG_FILE=/etc/artcraft/goclaw/config.json`.

The file contains the token in plaintext. Restrict filesystem access to the operator
and backend process, and protect its backups. The real `config.json` is gitignored;
keep it outside frontend assets and container images. The API exposes only agent
ID, name, description and type to authenticated users. The URL/token are never
serialized into its response. There is no web API for editing connection settings.

The backend reads and validates the file on every agent-list and generation request.
Replace it atomically when updating URL, token or agents; existing requests continue
with their original configuration. Reload the frontend page to refresh its agent
choices. No rebuild or restart is needed for file updates in the directory mount.
For token rotation, issue the new token in GoClaw, update the file, then revoke the
old token after in-flight requests have finished.

The legacy `goclaw_instance_settings` table and query files are retained for existing
database migration history but are no longer used by GoClaw request handling.
`GOCLAW_CONFIG_ENCRYPTION_KEY` is no longer required. Existing database settings
are not migrated automatically: copy the connection values into the private file.

Generation rejects agent IDs or media types absent from the current file. The
existing GoClaw client still requires HTTPS and public IP destinations. Missing or
invalid config disables GoClaw requests with a generic error; parser details and
file contents are not logged. Other application endpoints remain available.
