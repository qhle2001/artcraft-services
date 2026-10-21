# GoClaw backend configuration

The `/v1/omni_gen/goclaw/settings` endpoints require a moderator session. Configure
`GOCLAW_CONFIG_ENCRYPTION_KEY` in the backend deployment secret store as Base64 for
exactly 32 random bytes (AES-256-GCM). Never put the key in the repository or expose
it to the frontend. GoClaw URL and API token are stored in the `goclaw_instance_settings`
MySQL table; the token is encrypted with a fresh nonce each time it is saved.

Apply the `create_goclaw_instance_settings` migration before deploying the backend.
Keep a protected backup of the encryption key alongside the database backup: the
database value cannot be recovered without that key. To rotate the key, while writes
to GoClaw settings are paused, decrypt and re-encrypt the stored token with the new
key before replacing the deployment secret. If the key is lost, clear and configure
the GoClaw token again. Use a separate key for each environment.

Settings changes and agent listing are moderator-only. Generation uses the stored
configuration for any authenticated session. The backend GoClaw client requires
HTTPS and rejects private or non-public destinations.
