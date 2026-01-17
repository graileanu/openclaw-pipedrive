# clawdbot-pipedrive

Pipedrive CRM integration plugin for [Clawdbot](https://clawd.bot).

## Features

- **Deals**: Search, list, create, update, delete deals
- **Persons**: Search, get, create, update contacts
- **Organizations**: Search, get, create companies
- **Activities**: List, create, update, delete tasks/calls/meetings
- **Pipelines & Stages**: List pipelines and stages
- **Notes**: List and create notes on any entity
- **Users**: List users, get current user

## Installation

```bash
clawdbot plugins install clawdbot-pipedrive
```

Or manually: copy to `~/.clawdbot/extensions/pipedrive/`

## Configuration

Add to your `~/.clawdbot/config.json`:

```json
{
  "plugins": {
    "entries": {
      "pipedrive": {
        "enabled": true,
        "config": {
          "apiKey": "your-pipedrive-api-token",
          "domain": "yourcompany"
        }
      }
    }
  }
}
```

### Getting your API Key

1. Log in to Pipedrive
2. Go to **Settings** (gear icon) → **Personal preferences** → **API**
3. Copy your **Personal API token**

### Finding your Domain

Your domain is the subdomain of your Pipedrive URL:
- If you access Pipedrive at `https://acme.pipedrive.com`, your domain is `acme`

## Available Tools

| Tool | Description |
|------|-------------|
| `pipedrive_search_deals` | Search deals by term |
| `pipedrive_get_deal` | Get deal details by ID |
| `pipedrive_list_deals` | List deals with filters |
| `pipedrive_create_deal` | Create a new deal |
| `pipedrive_update_deal` | Update an existing deal |
| `pipedrive_delete_deal` | Delete a deal |
| `pipedrive_search_persons` | Search contacts |
| `pipedrive_get_person` | Get contact details |
| `pipedrive_create_person` | Create a contact |
| `pipedrive_update_person` | Update a contact |
| `pipedrive_search_organizations` | Search organizations |
| `pipedrive_get_organization` | Get organization details |
| `pipedrive_create_organization` | Create an organization |
| `pipedrive_list_activities` | List activities with filters |
| `pipedrive_get_activity` | Get activity details |
| `pipedrive_create_activity` | Create a task/call/meeting |
| `pipedrive_update_activity` | Update an activity |
| `pipedrive_delete_activity` | Delete an activity |
| `pipedrive_list_pipelines` | List all pipelines |
| `pipedrive_list_stages` | List pipeline stages |
| `pipedrive_list_notes` | List notes |
| `pipedrive_create_note` | Create a note |
| `pipedrive_list_users` | List all users |
| `pipedrive_get_current_user` | Get current user |

## Custom Skills

For organization-specific workflows (naming conventions, required fields, etc.), create a skill:

```bash
# Copy the template
mkdir -p ~/.clawdbot/skills/pipedrive-crm
cp examples/SKILL-TEMPLATE.md ~/.clawdbot/skills/pipedrive-crm/SKILL.md

# Then customize with your pipeline stages, naming conventions, etc.
```

See [examples/SKILL-TEMPLATE.md](examples/SKILL-TEMPLATE.md) for a starting point.

## License

MIT
