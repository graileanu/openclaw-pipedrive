import { Type } from "@sinclair/typebox";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// Skill template - embedded so it works without network access
const SKILL_TEMPLATE = `# Pipedrive CRM Workflows

> Customize this file for your organization's Pipedrive workflows.
> This file will NOT be overwritten by plugin updates.

## Deal Naming Convention

When creating deals, use this format:
- **Title**: \`[Company Name] - [Product/Plan] - [Value]\`
- Example: \`Acme Corp - Enterprise - $2,500/mo\`

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
> Find them via: \`pipedrive_list_stages\`

## Required Fields

When creating deals, always include:
- \`title\` - Following naming convention above
- \`value\` - Deal value in your currency
- \`person_id\` or \`org_id\` - Link to contact/company

## Activity Types

| Type | Use for | Subject format |
|------|---------|----------------|
| \`call\` | Phone calls | "Call: [topic]" |
| \`meeting\` | Demos, meetings | "Meeting: [purpose]" |
| \`task\` | Follow-ups, to-dos | "Task: [action]" |
| \`email\` | Email follow-ups | "Email: [subject]" |

## Common Workflows

### New Lead
1. Search if contact exists: \`pipedrive_search_persons\`
2. Create person if new: \`pipedrive_create_person\`
3. Create deal: \`pipedrive_create_deal\`
4. Schedule follow-up: \`pipedrive_create_activity\`

### After Demo
1. Update deal stage: \`pipedrive_update_deal\` with next stage_id
2. Add notes: \`pipedrive_create_note\`
3. Create follow-up task: \`pipedrive_create_activity\`

### Close Won
1. Update deal: \`pipedrive_update_deal\` with \`status: "won"\`
2. Add closing note: \`pipedrive_create_note\`

### Close Lost
1. Update deal: \`pipedrive_update_deal\` with \`status: "lost"\` and \`lost_reason\`
`;

/**
 * Sets up the skill template file
 * - Creates skill if it doesn't exist
 * - If skill exists, saves new template as .latest for comparison
 */
function setupSkillTemplate(): void {
  const skillDir = join(homedir(), ".clawdbot", "skills", "pipedrive");
  const skillFile = join(skillDir, "SKILL.md");
  const latestFile = join(skillDir, "SKILL.md.latest");

  try {
    mkdirSync(skillDir, { recursive: true });

    if (!existsSync(skillFile)) {
      // First install - create the skill file
      writeFileSync(skillFile, SKILL_TEMPLATE);
      console.log(`[pipedrive] Created skill template: ${skillFile}`);
      console.log("[pipedrive] Customize this file with your organization's workflows.");
    } else {
      // Skill exists - check if template has changed
      const existing = readFileSync(skillFile, "utf-8");
      if (existing !== SKILL_TEMPLATE) {
        // Save latest template for comparison
        writeFileSync(latestFile, SKILL_TEMPLATE);
        console.log(`[pipedrive] Skill file exists: ${skillFile} (not modified)`);
        console.log(`[pipedrive] New template available: ${latestFile}`);
        console.log("[pipedrive] Compare with: diff ~/.clawdbot/skills/pipedrive/SKILL.md{,.latest}");
      }
    }
  } catch (err) {
    console.warn("[pipedrive] Could not set up skill template:", err);
  }
}

type PipedriveConfig = {
  apiKey?: string;
  domain?: string;
};

type ClawdbotPluginApi = {
  pluginConfig: unknown;
  registerTool: (tool: {
    name: string;
    description: string;
    parameters: unknown;
    execute: (id: string, params: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>;
  }) => void;
};

type ClawdbotPluginDefinition = {
  id: string;
  name: string;
  description: string;
  version: string;
  configSchema: {
    parse: (v: unknown) => unknown;
    uiHints: Record<string, { label: string; sensitive?: boolean; placeholder?: string; help?: string }>;
  };
  register: (api: ClawdbotPluginApi) => void;
};

const plugin: ClawdbotPluginDefinition = {
  id: "pipedrive",
  name: "Pipedrive CRM",
  description: "Interact with Pipedrive deals, persons, organizations, and activities",
  version: "1.0.0",

  configSchema: {
    parse: (v) => v as PipedriveConfig,
    uiHints: {
      apiKey: {
        label: "API Key",
        sensitive: true,
        help: "Your Pipedrive API token (Settings > Personal preferences > API)",
      },
      domain: {
        label: "Company Domain",
        placeholder: "yourcompany",
        help: "The subdomain of your Pipedrive account (e.g., 'acme' from acme.pipedrive.com)",
      },
    },
  },

  register(api) {
    // Set up skill template on first run
    setupSkillTemplate();

    const cfg = api.pluginConfig as PipedriveConfig;

    if (!cfg.apiKey || !cfg.domain) {
      console.warn("[pipedrive] Plugin not configured: missing apiKey or domain");
      return;
    }

    const baseUrl = `https://${cfg.domain}.pipedrive.com/api/v1`;

    async function pipedriveRequest(endpoint: string, options?: RequestInit) {
      const url = new URL(`${baseUrl}${endpoint}`);
      url.searchParams.set("api_token", cfg.apiKey!);
      const res = await fetch(url.toString(), {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(`Pipedrive API error (${res.status}): ${error}`);
      }
      return res.json();
    }

    // ============ DEALS ============

    api.registerTool({
      name: "pipedrive_search_deals",
      description: "Search Pipedrive deals by term",
      parameters: Type.Object({
        term: Type.String({ description: "Search term" }),
        status: Type.Optional(
          Type.String({ description: "Filter by status: open, won, lost, deleted, all_not_deleted" })
        ),
      }),
      async execute(_id, params) {
        const { term, status } = params as { term: string; status?: string };
        let endpoint = `/deals/search?term=${encodeURIComponent(term)}`;
        if (status) endpoint += `&status=${status}`;
        const data = await pipedriveRequest(endpoint);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_get_deal",
      description: "Get details of a specific deal by ID",
      parameters: Type.Object({
        id: Type.Number({ description: "Deal ID" }),
      }),
      async execute(_id, params) {
        const { id } = params as { id: number };
        const data = await pipedriveRequest(`/deals/${id}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_list_deals",
      description: "List deals with optional filters",
      parameters: Type.Object({
        status: Type.Optional(Type.String({ description: "Filter by status: open, won, lost, deleted, all_not_deleted" })),
        stage_id: Type.Optional(Type.Number({ description: "Filter by pipeline stage ID" })),
        user_id: Type.Optional(Type.Number({ description: "Filter by owner user ID" })),
        limit: Type.Optional(Type.Number({ description: "Number of results (default 100, max 500)" })),
        start: Type.Optional(Type.Number({ description: "Pagination start (default 0)" })),
      }),
      async execute(_id, params) {
        const { status, stage_id, user_id, limit, start } = params as {
          status?: string;
          stage_id?: number;
          user_id?: number;
          limit?: number;
          start?: number;
        };
        const query = new URLSearchParams();
        if (status) query.set("status", status);
        if (stage_id) query.set("stage_id", String(stage_id));
        if (user_id) query.set("user_id", String(user_id));
        if (limit) query.set("limit", String(limit));
        if (start) query.set("start", String(start));
        const data = await pipedriveRequest(`/deals?${query}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_create_deal",
      description: "Create a new deal in Pipedrive",
      parameters: Type.Object({
        title: Type.String({ description: "Deal title (required)" }),
        value: Type.Optional(Type.Number({ description: "Deal value" })),
        currency: Type.Optional(Type.String({ description: "Currency code (e.g., USD, EUR)" })),
        person_id: Type.Optional(Type.Number({ description: "Associated person/contact ID" })),
        org_id: Type.Optional(Type.Number({ description: "Associated organization ID" })),
        stage_id: Type.Optional(Type.Number({ description: "Pipeline stage ID" })),
        user_id: Type.Optional(Type.Number({ description: "Owner user ID" })),
        expected_close_date: Type.Optional(Type.String({ description: "Expected close date (YYYY-MM-DD)" })),
      }),
      async execute(_id, params) {
        const data = await pipedriveRequest("/deals", {
          method: "POST",
          body: JSON.stringify(params),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_update_deal",
      description: "Update an existing deal",
      parameters: Type.Object({
        id: Type.Number({ description: "Deal ID to update (required)" }),
        title: Type.Optional(Type.String({ description: "New title" })),
        value: Type.Optional(Type.Number({ description: "New value" })),
        currency: Type.Optional(Type.String({ description: "Currency code" })),
        status: Type.Optional(Type.String({ description: "Status: open, won, lost, deleted" })),
        stage_id: Type.Optional(Type.Number({ description: "Move to stage ID" })),
        user_id: Type.Optional(Type.Number({ description: "New owner user ID" })),
        expected_close_date: Type.Optional(Type.String({ description: "Expected close date (YYYY-MM-DD)" })),
        lost_reason: Type.Optional(Type.String({ description: "Reason for losing (when status=lost)" })),
      }),
      async execute(_id, params) {
        const { id, ...updateParams } = params as { id: number } & Record<string, unknown>;
        const data = await pipedriveRequest(`/deals/${id}`, {
          method: "PUT",
          body: JSON.stringify(updateParams),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_delete_deal",
      description: "Delete a deal",
      parameters: Type.Object({
        id: Type.Number({ description: "Deal ID to delete" }),
      }),
      async execute(_id, params) {
        const { id } = params as { id: number };
        const data = await pipedriveRequest(`/deals/${id}`, { method: "DELETE" });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    // ============ PERSONS (CONTACTS) ============

    api.registerTool({
      name: "pipedrive_search_persons",
      description: "Search for persons/contacts in Pipedrive",
      parameters: Type.Object({
        term: Type.String({ description: "Search term (name, email, phone)" }),
      }),
      async execute(_id, params) {
        const { term } = params as { term: string };
        const data = await pipedriveRequest(`/persons/search?term=${encodeURIComponent(term)}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_get_person",
      description: "Get details of a specific person by ID",
      parameters: Type.Object({
        id: Type.Number({ description: "Person ID" }),
      }),
      async execute(_id, params) {
        const { id } = params as { id: number };
        const data = await pipedriveRequest(`/persons/${id}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_create_person",
      description: "Create a new person/contact",
      parameters: Type.Object({
        name: Type.String({ description: "Person name (required)" }),
        email: Type.Optional(Type.String({ description: "Email address" })),
        phone: Type.Optional(Type.String({ description: "Phone number" })),
        org_id: Type.Optional(Type.Number({ description: "Associated organization ID" })),
      }),
      async execute(_id, params) {
        const data = await pipedriveRequest("/persons", {
          method: "POST",
          body: JSON.stringify(params),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_update_person",
      description: "Update an existing person/contact",
      parameters: Type.Object({
        id: Type.Number({ description: "Person ID to update (required)" }),
        name: Type.Optional(Type.String({ description: "New name" })),
        email: Type.Optional(Type.String({ description: "New email" })),
        phone: Type.Optional(Type.String({ description: "New phone" })),
        org_id: Type.Optional(Type.Number({ description: "New organization ID" })),
      }),
      async execute(_id, params) {
        const { id, ...updateParams } = params as { id: number } & Record<string, unknown>;
        const data = await pipedriveRequest(`/persons/${id}`, {
          method: "PUT",
          body: JSON.stringify(updateParams),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    // ============ ORGANIZATIONS ============

    api.registerTool({
      name: "pipedrive_search_organizations",
      description: "Search for organizations in Pipedrive",
      parameters: Type.Object({
        term: Type.String({ description: "Search term (organization name)" }),
      }),
      async execute(_id, params) {
        const { term } = params as { term: string };
        const data = await pipedriveRequest(`/organizations/search?term=${encodeURIComponent(term)}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_get_organization",
      description: "Get details of a specific organization by ID",
      parameters: Type.Object({
        id: Type.Number({ description: "Organization ID" }),
      }),
      async execute(_id, params) {
        const { id } = params as { id: number };
        const data = await pipedriveRequest(`/organizations/${id}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_create_organization",
      description: "Create a new organization",
      parameters: Type.Object({
        name: Type.String({ description: "Organization name (required)" }),
        address: Type.Optional(Type.String({ description: "Address" })),
      }),
      async execute(_id, params) {
        const data = await pipedriveRequest("/organizations", {
          method: "POST",
          body: JSON.stringify(params),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    // ============ ACTIVITIES ============

    api.registerTool({
      name: "pipedrive_list_activities",
      description: "List activities (tasks, calls, meetings) with optional filters",
      parameters: Type.Object({
        deal_id: Type.Optional(Type.Number({ description: "Filter by deal ID" })),
        person_id: Type.Optional(Type.Number({ description: "Filter by person ID" })),
        org_id: Type.Optional(Type.Number({ description: "Filter by organization ID" })),
        done: Type.Optional(Type.Number({ description: "Filter by completion: 0 = not done, 1 = done" })),
        type: Type.Optional(Type.String({ description: "Filter by type: call, meeting, task, deadline, email, lunch" })),
        limit: Type.Optional(Type.Number({ description: "Number of results (default 100)" })),
        start: Type.Optional(Type.Number({ description: "Pagination start" })),
      }),
      async execute(_id, params) {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined) query.set(key, String(value));
        }
        const data = await pipedriveRequest(`/activities?${query}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_get_activity",
      description: "Get details of a specific activity by ID",
      parameters: Type.Object({
        id: Type.Number({ description: "Activity ID" }),
      }),
      async execute(_id, params) {
        const { id } = params as { id: number };
        const data = await pipedriveRequest(`/activities/${id}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_create_activity",
      description: "Create a new activity (task, call, meeting, etc.)",
      parameters: Type.Object({
        subject: Type.String({ description: "Activity subject/title (required)" }),
        type: Type.String({ description: "Activity type: call, meeting, task, deadline, email, lunch (required)" }),
        due_date: Type.Optional(Type.String({ description: "Due date in YYYY-MM-DD format" })),
        due_time: Type.Optional(Type.String({ description: "Due time in HH:MM format" })),
        duration: Type.Optional(Type.String({ description: "Duration in HH:MM format" })),
        deal_id: Type.Optional(Type.Number({ description: "Associated deal ID" })),
        person_id: Type.Optional(Type.Number({ description: "Associated person ID" })),
        org_id: Type.Optional(Type.Number({ description: "Associated organization ID" })),
        note: Type.Optional(Type.String({ description: "Activity notes/description" })),
        done: Type.Optional(Type.Number({ description: "Mark as done: 0 = not done, 1 = done" })),
      }),
      async execute(_id, params) {
        const data = await pipedriveRequest("/activities", {
          method: "POST",
          body: JSON.stringify(params),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_update_activity",
      description: "Update an existing activity",
      parameters: Type.Object({
        id: Type.Number({ description: "Activity ID to update (required)" }),
        subject: Type.Optional(Type.String({ description: "New subject" })),
        type: Type.Optional(Type.String({ description: "New type" })),
        due_date: Type.Optional(Type.String({ description: "New due date (YYYY-MM-DD)" })),
        due_time: Type.Optional(Type.String({ description: "New due time (HH:MM)" })),
        done: Type.Optional(Type.Number({ description: "Mark as done: 0 = not done, 1 = done" })),
        note: Type.Optional(Type.String({ description: "New notes" })),
      }),
      async execute(_id, params) {
        const { id, ...updateParams } = params as { id: number } & Record<string, unknown>;
        const data = await pipedriveRequest(`/activities/${id}`, {
          method: "PUT",
          body: JSON.stringify(updateParams),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_delete_activity",
      description: "Delete an activity",
      parameters: Type.Object({
        id: Type.Number({ description: "Activity ID to delete" }),
      }),
      async execute(_id, params) {
        const { id } = params as { id: number };
        const data = await pipedriveRequest(`/activities/${id}`, { method: "DELETE" });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    // ============ PIPELINES & STAGES ============

    api.registerTool({
      name: "pipedrive_list_pipelines",
      description: "List all pipelines",
      parameters: Type.Object({}),
      async execute() {
        const data = await pipedriveRequest("/pipelines");
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_list_stages",
      description: "List all stages, optionally filtered by pipeline",
      parameters: Type.Object({
        pipeline_id: Type.Optional(Type.Number({ description: "Filter by pipeline ID" })),
      }),
      async execute(_id, params) {
        const { pipeline_id } = params as { pipeline_id?: number };
        let endpoint = "/stages";
        if (pipeline_id) endpoint += `?pipeline_id=${pipeline_id}`;
        const data = await pipedriveRequest(endpoint);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    // ============ NOTES ============

    api.registerTool({
      name: "pipedrive_list_notes",
      description: "List notes for a deal, person, or organization",
      parameters: Type.Object({
        deal_id: Type.Optional(Type.Number({ description: "Filter by deal ID" })),
        person_id: Type.Optional(Type.Number({ description: "Filter by person ID" })),
        org_id: Type.Optional(Type.Number({ description: "Filter by organization ID" })),
        limit: Type.Optional(Type.Number({ description: "Number of results" })),
      }),
      async execute(_id, params) {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined) query.set(key, String(value));
        }
        const data = await pipedriveRequest(`/notes?${query}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_create_note",
      description: "Create a note on a deal, person, or organization",
      parameters: Type.Object({
        content: Type.String({ description: "Note content (required)" }),
        deal_id: Type.Optional(Type.Number({ description: "Attach to deal ID" })),
        person_id: Type.Optional(Type.Number({ description: "Attach to person ID" })),
        org_id: Type.Optional(Type.Number({ description: "Attach to organization ID" })),
      }),
      async execute(_id, params) {
        const data = await pipedriveRequest("/notes", {
          method: "POST",
          body: JSON.stringify(params),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    // ============ USERS ============

    api.registerTool({
      name: "pipedrive_list_users",
      description: "List all users in the Pipedrive account",
      parameters: Type.Object({}),
      async execute() {
        const data = await pipedriveRequest("/users");
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_get_current_user",
      description: "Get the current authenticated user's details",
      parameters: Type.Object({}),
      async execute() {
        const data = await pipedriveRequest("/users/me");
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    console.log(`[pipedrive] Registered ${22} tools for ${cfg.domain}.pipedrive.com`);
  },
};

export default plugin;
