# ownCloud Integrator on Vercel

A password-protected web interface for the repository's ownCloud MCP
connector. It uses Anthropic for chat and the configured ownCloud MCP account
for file access. Conversations are kept in the browser only.

The app exposes file listing, metadata, reading, search, write, create-folder,
move, and copy tools. It does not expose delete or administration tools.
Every write/create/move/copy request is shown for review and requires a
separate confirmation before it is sent to ownCloud.

## Deploy

Import `Mangga-web/owncloud.online` as a Vercel project and set **Root
Directory** to `vercel-agent`. Use Node.js 22 or later. Once the Git repository
is connected, Vercel can automatically redeploy this app when changes are
pushed to the selected branch.

Add these environment variables in the Vercel project settings:

| Variable | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `ANTHROPIC_MODEL` | Optional; defaults to `claude-sonnet-5-5` |
| `OWNCLOUD_MCP_URL` | Full URL ending in `/apps/oco_mcp/mcp` |
| `OWNCLOUD_MCP_USERNAME` | Dedicated ownCloud service-account name |
| `OWNCLOUD_MCP_APP_PASSWORD` | App/device password for that account |
| `APP_ACCESS_PASSWORD` | Random access password, at least 20 characters |
| `APP_SESSION_SECRET` | Random signing secret, at least 32 characters |

Generate the two application secrets locally; do not commit or send them in
chat:

```sh
openssl rand -base64 32
openssl rand -hex 32
```

Set the first output as `APP_ACCESS_PASSWORD` and the second as
`APP_SESSION_SECRET`. Keep production credentials out of Preview deployments,
or use a separate test account and ownCloud instance for Preview.

## ownCloud setup

Enable the `oco_mcp` app on the ownCloud instance and create a dedicated account
with access only to the files the assistant may handle. Create an app/device
password for that account and use it as `OWNCLOUD_MCP_APP_PASSWORD`.

The MCP connector is read-only by default. To permit its file write tools, an
ownCloud administrator must enable writing and explicitly allow the dedicated
account's group:

```sh
occ config:app:set oco_mcp enable_write --value=yes
occ config:app:set oco_mcp write_groups --value='mcp-writers'
```

Add the dedicated account to `mcp-writers`. The web app still requires a human
confirmation for each write-like operation, and does not expose file deletion
or user/group administration.

## Data and access notes

- Files read by the assistant are sent to Anthropic as part of the requested
  conversation. Use only an account and data that are approved for that use.
- Protect the Vercel project with Deployment Protection where available, and
  use a strong `APP_ACCESS_PASSWORD`; the app's login is a shared-password
  gate, not individual user identity.
- The MCP URL is fixed in server-side configuration. The app does not accept
  arbitrary server URLs from chat prompts.
- The MCP service account's ownCloud permissions are the effective access
  boundary. Do not use an administrator account.
- The app does not store chats in a database. Browser refresh clears the chat.
