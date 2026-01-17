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
      writeFileSync(skillFile, SKILL_TEMPLATE);
      console.log(`[pipedrive] Created skill template: ${skillFile}`);
      console.log("[pipedrive] Customize this file with your organization's workflows.");
    } else {
      const existing = readFileSync(skillFile, "utf-8");
      if (existing !== SKILL_TEMPLATE) {
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
  siteUrl?: string; // alias for domain
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
  description: "Interact with Pipedrive deals, persons, organizations, and activities (API v2)",
  version: "2.0.0",

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
        help: "The subdomain of your Pipedrive account (e.g., 'acme' from acme.pipedrive.com). Also accepts 'siteUrl' as alias.",
      },
    },
  },

  register(api) {
    setupSkillTemplate();

    const cfg = api.pluginConfig as PipedriveConfig;
    const domain = cfg.domain || cfg.siteUrl; // accept both domain and siteUrl

    if (!cfg.apiKey || !domain) {
      console.warn("[pipedrive] Plugin not configured: missing apiKey or domain/siteUrl");
      return;
    }

    const baseUrlV2 = `https://${domain}.pipedrive.com/api/v2`;
    const baseUrlV1 = `https://${domain}.pipedrive.com/api/v1`; // For endpoints not yet in v2

    async function pipedriveRequest(endpoint: string, options?: RequestInit & { useV1?: boolean }) {
      const baseUrl = options?.useV1 ? baseUrlV1 : baseUrlV2;
      const url = new URL(`${baseUrl}${endpoint}`);
      url.searchParams.set("api_token", cfg.apiKey!);

      const { useV1, ...fetchOptions } = options || {};
      const res = await fetch(url.toString(), {
        ...fetchOptions,
        headers: {
          "Content-Type": "application/json",
          ...fetchOptions?.headers,
        },
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(`Pipedrive API error (${res.status}): ${error}`);
      }
      return res.json();
    }

    // ============ DEALS (v2) ============

    api.registerTool({
      name: "pipedrive_search_deals",
      description: "Search Pipedrive deals by term",
      parameters: Type.Object({
        term: Type.String({ description: "Search term" }),
        status: Type.Optional(
          Type.String({ description: "Filter by status: open, won, lost, deleted" })
        ),
        limit: Type.Optional(Type.Number({ description: "Number of results (default 100)" })),
      }),
      async execute(_id, params) {
        const { term, status, limit } = params as { term: string; status?: string; limit?: number };
        const query = new URLSearchParams({ term });
        if (status) query.set("status", status);
        if (limit) query.set("limit", String(limit));
        const data = await pipedriveRequest(`/deals/search?${query}`);
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
        status: Type.Optional(Type.String({ description: "Filter by status: open, won, lost, deleted" })),
        stage_id: Type.Optional(Type.Number({ description: "Filter by pipeline stage ID" })),
        owner_id: Type.Optional(Type.Number({ description: "Filter by owner user ID" })),
        person_id: Type.Optional(Type.Number({ description: "Filter by person ID" })),
        org_id: Type.Optional(Type.Number({ description: "Filter by organization ID" })),
        pipeline_id: Type.Optional(Type.Number({ description: "Filter by pipeline ID" })),
        limit: Type.Optional(Type.Number({ description: "Number of results (default 100, max 500)" })),
        cursor: Type.Optional(Type.String({ description: "Pagination cursor from previous response" })),
        sort_by: Type.Optional(Type.String({ description: "Sort by: id, add_time, update_time" })),
        sort_direction: Type.Optional(Type.String({ description: "Sort direction: asc, desc" })),
      }),
      async execute(_id, params) {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined) query.set(key, String(value));
        }
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
        owner_id: Type.Optional(Type.Number({ description: "Owner user ID" })),
        pipeline_id: Type.Optional(Type.Number({ description: "Pipeline ID" })),
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
        owner_id: Type.Optional(Type.Number({ description: "New owner user ID" })),
        pipeline_id: Type.Optional(Type.Number({ description: "Move to pipeline ID" })),
        expected_close_date: Type.Optional(Type.String({ description: "Expected close date (YYYY-MM-DD)" })),
        lost_reason: Type.Optional(Type.String({ description: "Reason for losing (when status=lost)" })),
      }),
      async execute(_id, params) {
        const { id, ...updateParams } = params as { id: number } & Record<string, unknown>;
        const data = await pipedriveRequest(`/deals/${id}`, {
          method: "PATCH", // v2 uses PATCH instead of PUT
          body: JSON.stringify(updateParams),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_delete_deal",
      description: "Delete a deal (marks as deleted, 30-day retention)",
      parameters: Type.Object({
        id: Type.Number({ description: "Deal ID to delete" }),
      }),
      async execute(_id, params) {
        const { id } = params as { id: number };
        const data = await pipedriveRequest(`/deals/${id}`, { method: "DELETE" });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    // ============ PERSONS (v2) ============

    api.registerTool({
      name: "pipedrive_search_persons",
      description: "Search for persons/contacts by name, email, phone, or notes",
      parameters: Type.Object({
        term: Type.String({ description: "Search term (name, email, phone)" }),
        limit: Type.Optional(Type.Number({ description: "Number of results" })),
      }),
      async execute(_id, params) {
        const { term, limit } = params as { term: string; limit?: number };
        const query = new URLSearchParams({ term });
        if (limit) query.set("limit", String(limit));
        const data = await pipedriveRequest(`/persons/search?${query}`);
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
      name: "pipedrive_list_persons",
      description: "List all persons with optional filters",
      parameters: Type.Object({
        owner_id: Type.Optional(Type.Number({ description: "Filter by owner user ID" })),
        org_id: Type.Optional(Type.Number({ description: "Filter by organization ID" })),
        limit: Type.Optional(Type.Number({ description: "Number of results (default 100)" })),
        cursor: Type.Optional(Type.String({ description: "Pagination cursor" })),
        sort_by: Type.Optional(Type.String({ description: "Sort by: id, add_time, update_time, name" })),
        sort_direction: Type.Optional(Type.String({ description: "Sort direction: asc, desc" })),
      }),
      async execute(_id, params) {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined) query.set(key, String(value));
        }
        const data = await pipedriveRequest(`/persons?${query}`);
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
        owner_id: Type.Optional(Type.Number({ description: "Owner user ID" })),
      }),
      async execute(_id, params) {
        // v2 expects email/phone as arrays of objects
        const { email, phone, ...rest } = params as { email?: string; phone?: string } & Record<string, unknown>;
        const body: Record<string, unknown> = { ...rest };
        if (email) body.emails = [{ value: email, primary: true, label: "work" }];
        if (phone) body.phones = [{ value: phone, primary: true, label: "work" }];

        const data = await pipedriveRequest("/persons", {
          method: "POST",
          body: JSON.stringify(body),
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
        owner_id: Type.Optional(Type.Number({ description: "New owner user ID" })),
      }),
      async execute(_id, params) {
        const { id, email, phone, ...rest } = params as { id: number; email?: string; phone?: string } & Record<string, unknown>;
        const body: Record<string, unknown> = { ...rest };
        if (email) body.emails = [{ value: email, primary: true, label: "work" }];
        if (phone) body.phones = [{ value: phone, primary: true, label: "work" }];

        const data = await pipedriveRequest(`/persons/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_delete_person",
      description: "Delete a person (marks as deleted, 30-day retention)",
      parameters: Type.Object({
        id: Type.Number({ description: "Person ID to delete" }),
      }),
      async execute(_id, params) {
        const { id } = params as { id: number };
        const data = await pipedriveRequest(`/persons/${id}`, { method: "DELETE" });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    // ============ ORGANIZATIONS (v2) ============

    api.registerTool({
      name: "pipedrive_search_organizations",
      description: "Search for organizations by name, address, or notes",
      parameters: Type.Object({
        term: Type.String({ description: "Search term (organization name)" }),
        limit: Type.Optional(Type.Number({ description: "Number of results" })),
      }),
      async execute(_id, params) {
        const { term, limit } = params as { term: string; limit?: number };
        const query = new URLSearchParams({ term });
        if (limit) query.set("limit", String(limit));
        const data = await pipedriveRequest(`/organizations/search?${query}`);
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
      name: "pipedrive_list_organizations",
      description: "List all organizations with optional filters",
      parameters: Type.Object({
        owner_id: Type.Optional(Type.Number({ description: "Filter by owner user ID" })),
        limit: Type.Optional(Type.Number({ description: "Number of results (default 100)" })),
        cursor: Type.Optional(Type.String({ description: "Pagination cursor" })),
        sort_by: Type.Optional(Type.String({ description: "Sort by: id, add_time, update_time, name" })),
        sort_direction: Type.Optional(Type.String({ description: "Sort direction: asc, desc" })),
      }),
      async execute(_id, params) {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined) query.set(key, String(value));
        }
        const data = await pipedriveRequest(`/organizations?${query}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_create_organization",
      description: "Create a new organization",
      parameters: Type.Object({
        name: Type.String({ description: "Organization name (required)" }),
        address: Type.Optional(Type.String({ description: "Address" })),
        owner_id: Type.Optional(Type.Number({ description: "Owner user ID" })),
      }),
      async execute(_id, params) {
        const data = await pipedriveRequest("/organizations", {
          method: "POST",
          body: JSON.stringify(params),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_update_organization",
      description: "Update an existing organization",
      parameters: Type.Object({
        id: Type.Number({ description: "Organization ID to update (required)" }),
        name: Type.Optional(Type.String({ description: "New name" })),
        address: Type.Optional(Type.String({ description: "New address" })),
        owner_id: Type.Optional(Type.Number({ description: "New owner user ID" })),
      }),
      async execute(_id, params) {
        const { id, ...updateParams } = params as { id: number } & Record<string, unknown>;
        const data = await pipedriveRequest(`/organizations/${id}`, {
          method: "PATCH",
          body: JSON.stringify(updateParams),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_delete_organization",
      description: "Delete an organization (marks as deleted, 30-day retention)",
      parameters: Type.Object({
        id: Type.Number({ description: "Organization ID to delete" }),
      }),
      async execute(_id, params) {
        const { id } = params as { id: number };
        const data = await pipedriveRequest(`/organizations/${id}`, { method: "DELETE" });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    // ============ ACTIVITIES (v2) ============

    api.registerTool({
      name: "pipedrive_list_activities",
      description: "List activities (tasks, calls, meetings) with optional filters",
      parameters: Type.Object({
        deal_id: Type.Optional(Type.Number({ description: "Filter by deal ID" })),
        person_id: Type.Optional(Type.Number({ description: "Filter by person ID" })),
        org_id: Type.Optional(Type.Number({ description: "Filter by organization ID" })),
        owner_id: Type.Optional(Type.Number({ description: "Filter by owner user ID" })),
        done: Type.Optional(Type.Boolean({ description: "Filter by completion: true = done, false = not done" })),
        type: Type.Optional(Type.String({ description: "Filter by type: call, meeting, task, deadline, email, lunch" })),
        limit: Type.Optional(Type.Number({ description: "Number of results (default 100)" })),
        cursor: Type.Optional(Type.String({ description: "Pagination cursor" })),
        sort_by: Type.Optional(Type.String({ description: "Sort by: id, add_time, update_time, due_date" })),
        sort_direction: Type.Optional(Type.String({ description: "Sort direction: asc, desc" })),
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
        done: Type.Optional(Type.Boolean({ description: "Mark as done: true = done, false = not done" })),
        owner_id: Type.Optional(Type.Number({ description: "Owner user ID" })),
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
        done: Type.Optional(Type.Boolean({ description: "Mark as done: true = done, false = not done" })),
        note: Type.Optional(Type.String({ description: "New notes" })),
        owner_id: Type.Optional(Type.Number({ description: "New owner user ID" })),
      }),
      async execute(_id, params) {
        const { id, ...updateParams } = params as { id: number } & Record<string, unknown>;
        const data = await pipedriveRequest(`/activities/${id}`, {
          method: "PATCH",
          body: JSON.stringify(updateParams),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_delete_activity",
      description: "Delete an activity (marks as deleted, 30-day retention)",
      parameters: Type.Object({
        id: Type.Number({ description: "Activity ID to delete" }),
      }),
      async execute(_id, params) {
        const { id } = params as { id: number };
        const data = await pipedriveRequest(`/activities/${id}`, { method: "DELETE" });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    // ============ PIPELINES (v2) ============

    api.registerTool({
      name: "pipedrive_list_pipelines",
      description: "List all pipelines",
      parameters: Type.Object({
        limit: Type.Optional(Type.Number({ description: "Number of results" })),
        cursor: Type.Optional(Type.String({ description: "Pagination cursor" })),
      }),
      async execute(_id, params) {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined) query.set(key, String(value));
        }
        const endpoint = query.toString() ? `/pipelines?${query}` : "/pipelines";
        const data = await pipedriveRequest(endpoint);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_get_pipeline",
      description: "Get details of a specific pipeline by ID",
      parameters: Type.Object({
        id: Type.Number({ description: "Pipeline ID" }),
      }),
      async execute(_id, params) {
        const { id } = params as { id: number };
        const data = await pipedriveRequest(`/pipelines/${id}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    // ============ STAGES (v2) ============

    api.registerTool({
      name: "pipedrive_list_stages",
      description: "List all stages, optionally filtered by pipeline",
      parameters: Type.Object({
        pipeline_id: Type.Optional(Type.Number({ description: "Filter by pipeline ID" })),
        limit: Type.Optional(Type.Number({ description: "Number of results" })),
        cursor: Type.Optional(Type.String({ description: "Pagination cursor" })),
      }),
      async execute(_id, params) {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined) query.set(key, String(value));
        }
        const endpoint = query.toString() ? `/stages?${query}` : "/stages";
        const data = await pipedriveRequest(endpoint);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_get_stage",
      description: "Get details of a specific stage by ID",
      parameters: Type.Object({
        id: Type.Number({ description: "Stage ID" }),
      }),
      async execute(_id, params) {
        const { id } = params as { id: number };
        const data = await pipedriveRequest(`/stages/${id}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    // ============ NOTES (v1 - no v2 available yet) ============

    api.registerTool({
      name: "pipedrive_list_notes",
      description: "List notes for a deal, person, or organization",
      parameters: Type.Object({
        deal_id: Type.Optional(Type.Number({ description: "Filter by deal ID" })),
        person_id: Type.Optional(Type.Number({ description: "Filter by person ID" })),
        org_id: Type.Optional(Type.Number({ description: "Filter by organization ID" })),
        limit: Type.Optional(Type.Number({ description: "Number of results" })),
        start: Type.Optional(Type.Number({ description: "Pagination offset" })),
      }),
      async execute(_id, params) {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined) query.set(key, String(value));
        }
        const data = await pipedriveRequest(`/notes?${query}`, { useV1: true });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_get_note",
      description: "Get details of a specific note by ID",
      parameters: Type.Object({
        id: Type.Number({ description: "Note ID" }),
      }),
      async execute(_id, params) {
        const { id } = params as { id: number };
        const data = await pipedriveRequest(`/notes/${id}`, { useV1: true });
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
          useV1: true,
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_update_note",
      description: "Update an existing note",
      parameters: Type.Object({
        id: Type.Number({ description: "Note ID to update (required)" }),
        content: Type.String({ description: "New content" }),
      }),
      async execute(_id, params) {
        const { id, ...updateParams } = params as { id: number } & Record<string, unknown>;
        const data = await pipedriveRequest(`/notes/${id}`, {
          method: "PUT", // v1 uses PUT
          body: JSON.stringify(updateParams),
          useV1: true,
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_delete_note",
      description: "Delete a note",
      parameters: Type.Object({
        id: Type.Number({ description: "Note ID to delete" }),
      }),
      async execute(_id, params) {
        const { id } = params as { id: number };
        const data = await pipedriveRequest(`/notes/${id}`, { method: "DELETE", useV1: true });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    // ============ USERS (v1 - mostly no v2 available) ============

    api.registerTool({
      name: "pipedrive_list_users",
      description: "List all users in the Pipedrive account",
      parameters: Type.Object({}),
      async execute() {
        const data = await pipedriveRequest("/users", { useV1: true });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_get_current_user",
      description: "Get the current authenticated user's details",
      parameters: Type.Object({}),
      async execute() {
        const data = await pipedriveRequest("/users/me", { useV1: true });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    api.registerTool({
      name: "pipedrive_get_user",
      description: "Get details of a specific user by ID",
      parameters: Type.Object({
        id: Type.Number({ description: "User ID" }),
      }),
      async execute(_id, params) {
        const { id } = params as { id: number };
        const data = await pipedriveRequest(`/users/${id}`, { useV1: true });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    });

    const v2Tools = 22;
    const v1Tools = 6;
    console.log(`[pipedrive] Registered ${v2Tools + v1Tools} tools (${v2Tools} v2, ${v1Tools} v1) for ${domain}.pipedrive.com`);
  },
};

export default plugin;
