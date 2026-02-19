import { Type } from "@sinclair/typebox";

type PipedriveConfig = {
  apiKey?: string;
  domain?: string;
  siteUrl?: string; // backwards compat alias for domain (not documented)
};

export default function register(api: { pluginConfig: unknown; registerTool: (...args: any[]) => void }) {
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

  // ============ MAIL / EMAIL (v1 - not available in v2) ============

  api.registerTool({
    name: "pipedrive_list_deal_mail_messages",
    description: "List email messages linked to a specific deal. Returns email subjects, senders, recipients, timestamps, and body snippets.",
    parameters: Type.Object({
      deal_id: Type.Number({ description: "Deal ID (required)" }),
      start: Type.Optional(Type.Number({ description: "Pagination offset (default 0)" })),
      limit: Type.Optional(Type.Number({ description: "Number of results (default 100)" })),
    }),
    async execute(_id, params) {
      const { deal_id, start, limit } = params as { deal_id: number; start?: number; limit?: number };
      const query = new URLSearchParams();
      if (start !== undefined) query.set("start", String(start));
      if (limit !== undefined) query.set("limit", String(limit));
      const qs = query.toString() ? `?${query}` : "";
      const data = await pipedriveRequest(`/deals/${deal_id}/mailMessages${qs}`, { useV1: true });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });

  api.registerTool({
    name: "pipedrive_get_mail_message",
    description: "Get a specific email message by ID, including full body, headers, and attachments info",
    parameters: Type.Object({
      id: Type.Number({ description: "Mail message ID" }),
      include_body: Type.Optional(Type.Boolean({ description: "Include full email body (default true)" })),
    }),
    async execute(_id, params) {
      const { id, include_body } = params as { id: number; include_body?: boolean };
      const query = new URLSearchParams();
      if (include_body !== undefined) query.set("include_body", include_body ? "1" : "0");
      const qs = query.toString() ? `?${query}` : "";
      const data = await pipedriveRequest(`/mailbox/mailMessages/${id}${qs}`, { useV1: true });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });

  api.registerTool({
    name: "pipedrive_list_mail_threads",
    description: "List email threads from the Pipedrive mailbox. Threads group related email messages together.",
    parameters: Type.Object({
      folder: Type.Optional(Type.String({ description: "Mailbox folder: inbox, drafts, sent, archive (default inbox)" })),
      start: Type.Optional(Type.Number({ description: "Pagination offset (default 0)" })),
      limit: Type.Optional(Type.Number({ description: "Number of results (default 50)" })),
    }),
    async execute(_id, params) {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) query.set(key, String(value));
      }
      const qs = query.toString() ? `?${query}` : "";
      const data = await pipedriveRequest(`/mailbox/mailThreads${qs}`, { useV1: true });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });

  api.registerTool({
    name: "pipedrive_get_mail_thread",
    description: "Get a specific email thread by ID, including all messages in the thread",
    parameters: Type.Object({
      id: Type.Number({ description: "Mail thread ID" }),
    }),
    async execute(_id, params) {
      const { id } = params as { id: number };
      const data = await pipedriveRequest(`/mailbox/mailThreads/${id}`, { useV1: true });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });

  api.registerTool({
    name: "pipedrive_list_mail_thread_messages",
    description: "List all email messages within a specific mail thread",
    parameters: Type.Object({
      id: Type.Number({ description: "Mail thread ID" }),
    }),
    async execute(_id, params) {
      const { id } = params as { id: number };
      const data = await pipedriveRequest(`/mailbox/mailThreads/${id}/mailMessages`, { useV1: true });
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

  const v2Tools = 27;
  const v1Tools = 13;
  console.log(`[pipedrive] Registered ${v2Tools + v1Tools} tools (${v2Tools} v2, ${v1Tools} v1) for ${domain}.pipedrive.com`);
}
