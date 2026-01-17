# Pipedrive CRM Workflows

> Copy this file to `~/.clawdbot/skills/pipedrive-crm/SKILL.md` and customize for your organization.

## Deal Naming Convention

When creating deals, use this format:
- **Title**: `[Company Name] - [Product/Plan] - [Value]`
- Example: `Acme Corp - Enterprise - $2,500/mo`

## Pipeline Stages

| Stage ID | Name | When to use |
|----------|------|-------------|
| 1 | Lead | Initial contact |
| 2 | Qualified | Confirmed interest |
| 3 | Proposal | Pricing sent |
| 4 | Negotiation | Active discussions |
| 5 | Closed Won | Deal signed |
| 6 | Closed Lost | Deal lost |

> **Note**: Replace stage IDs with your actual Pipedrive stage IDs.
> Find them via: `pipedrive_list_stages`

## Required Fields

When creating deals, always include:
- `title` - Following naming convention above
- `value` - Deal value in your currency
- `person_id` or `org_id` - Link to contact/company

## Activity Types

| Type | Use for | Subject format |
|------|---------|----------------|
| `call` | Phone calls | "Call: [topic]" |
| `meeting` | Demos, meetings | "Meeting: [purpose]" |
| `task` | Follow-ups, to-dos | "Task: [action]" |
| `email` | Email follow-ups | "Email: [subject]" |

## Common Workflows

### New Lead
1. Search if contact exists: `pipedrive_search_persons`
2. Create person if new: `pipedrive_create_person`
3. Create deal: `pipedrive_create_deal`
4. Schedule follow-up: `pipedrive_create_activity`

### After Demo
1. Update deal stage: `pipedrive_update_deal` with next stage_id
2. Add notes: `pipedrive_create_note`
3. Create follow-up task: `pipedrive_create_activity`

### Close Won
1. Update deal: `pipedrive_update_deal` with `status: "won"`
2. Add closing note: `pipedrive_create_note`

### Close Lost
1. Update deal: `pipedrive_update_deal` with `status: "lost"` and `lost_reason`

## Custom Fields

If you have custom fields in Pipedrive, document them here:
- Field X: Used for...
- Field Y: Used for...

## Tips

- Always search before creating to avoid duplicates
- Link deals to both person AND organization when possible
- Use notes liberally to document conversations
