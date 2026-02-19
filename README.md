# openclaw-pipedrive

Pipedrive CRM integration plugin for [OpenClaw](https://openclaw.dev).

Interact with your Pipedrive CRM — search deals, create contacts, manage activities, and automate your sales workflows through natural language commands.

**Uses Pipedrive API v2** — 50% lower token costs, better filtering, cursor-based pagination.

## Features

- **Deals**: Search, list, create, update, delete deals (v2)
- **Persons**: Search, list, create, update, delete contacts (v2)
- **Organizations**: Search, list, create, update, delete companies (v2)
- **Activities**: List, create, update, delete tasks/calls/meetings (v2)
- **Pipelines & Stages**: List pipelines and stages (v2)
- **Notes**: List, create, update, delete notes (v1)
- **Users**: List users, get current user, get user by ID (v1)

## Installation

```bash
openclaw plugins install openclaw-pipedrive
```

Or install from source:

```bash
openclaw plugins install https://github.com/graileanu/openclaw-pipedrive
```

## Configuration

Add to your `~/.openclaw/config.json`:

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
2. Go to **Settings** (gear icon) > **Personal preferences** > **API**
3. Copy your **Personal API token**

### Finding your Domain

Your domain is the subdomain of your Pipedrive URL:
- If you access Pipedrive at `https://acme.pipedrive.com`, your domain is `acme`

## Available Tools (35)

### Deals (v2)
| Tool | Description |
|------|-------------|
| `pipedrive_search_deals` | Search deals by term |
| `pipedrive_get_deal` | Get deal details by ID |
| `pipedrive_list_deals` | List deals with filters |
| `pipedrive_create_deal` | Create a new deal |
| `pipedrive_update_deal` | Update an existing deal |
| `pipedrive_delete_deal` | Delete a deal |

### Persons (v2)
| Tool | Description |
|------|-------------|
| `pipedrive_search_persons` | Search contacts |
| `pipedrive_get_person` | Get contact details |
| `pipedrive_list_persons` | List contacts with filters |
| `pipedrive_create_person` | Create a contact |
| `pipedrive_update_person` | Update a contact |
| `pipedrive_delete_person` | Delete a contact |

### Organizations (v2)
| Tool | Description |
|------|-------------|
| `pipedrive_search_organizations` | Search organizations |
| `pipedrive_get_organization` | Get organization details |
| `pipedrive_list_organizations` | List organizations with filters |
| `pipedrive_create_organization` | Create an organization |
| `pipedrive_update_organization` | Update an organization |
| `pipedrive_delete_organization` | Delete an organization |

### Activities (v2)
| Tool | Description |
|------|-------------|
| `pipedrive_list_activities` | List activities with filters |
| `pipedrive_get_activity` | Get activity details |
| `pipedrive_create_activity` | Create a task/call/meeting |
| `pipedrive_update_activity` | Update an activity |
| `pipedrive_delete_activity` | Delete an activity |

### Pipelines & Stages (v2)
| Tool | Description |
|------|-------------|
| `pipedrive_list_pipelines` | List all pipelines |
| `pipedrive_get_pipeline` | Get pipeline details |
| `pipedrive_list_stages` | List pipeline stages |
| `pipedrive_get_stage` | Get stage details |

### Notes (v1)
| Tool | Description |
|------|-------------|
| `pipedrive_list_notes` | List notes |
| `pipedrive_get_note` | Get note details |
| `pipedrive_create_note` | Create a note |
| `pipedrive_update_note` | Update a note |
| `pipedrive_delete_note` | Delete a note |

### Users (v1)
| Tool | Description |
|------|-------------|
| `pipedrive_list_users` | List all users |
| `pipedrive_get_current_user` | Get current user |
| `pipedrive_get_user` | Get user by ID |

## Support & Contact

- **GitHub Issues**: [github.com/graileanu/openclaw-pipedrive/issues](https://github.com/graileanu/openclaw-pipedrive/issues)
- **Email**: gr@remsys.com

## License

MIT
