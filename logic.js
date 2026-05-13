// ═══════════════════════════════════════════════════════
// SUBTASK FIELD INHERITANCE - ClickUp → Zapier Code Step
// ═══════════════════════════════════════════════════════

// ❌ REMOVE INSIDE ZAP EDITOR
require("dotenv").config();

// ⬇️ TS SVC BOT API TOKEN ⬇️
const API_TOKEN = process.env.API_TOKEN;

const BASE_URL = "https://api.clickup-stg.com/api/v2";
const TARGET_LIST_ID = "980200129712";

const FIELDS_TO_COPY = [
  {
    id: "3ab9bbf1-0dca-4e55-b56e-c04c1f7cf2ac",
    name: "Workspace ID [Perf]",
    type: "short_text",
  },
  {
    id: "050e7134-acaa-4631-831c-9c6e0780ec2b",
    name: "[EE] Critical Bug",
    type: "drop_down",
  },
  {
    id: "f9943ab6-0012-401b-82ef-7dde5a370863",
    name: "[EE] Assigned",
    type: "users",
  },
  {
    id: "1730c02b-432d-454a-9a7b-1962664f7031",
    name: "Raw MRR",
    type: "currency",
  },
];

const TAG_TO_COPY = "perf-churn-risk";

// --- Helpers ---
async function apiGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: API_TOKEN },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: API_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`POST ${path} → ${res.status}: ${errBody}`);
  }
  return res;
}

// --- Main ---

// ts: ISO timestamp of when this Zap run executed.
// Useful for debugging race conditions when multiple subtasks
// are created in quick succession (e.g. from templates) and you
// need to correlate Zap history with parent task update timing.
const result = {
  ts: new Date().toISOString(),
  taskId: inputData.task_id || null,
  parentId: null,
  skipped: null,
  fetchSubtask: null,
  fetchParent: null,
  fields: {},
  tag: null,
};

const taskId = inputData.task_id;
if (!taskId) {
  result.skipped = "No task_id provided from webhook";
  return result;
}

// 1. Fetch the subtask
let subtask;
try {
  subtask = await apiGet(`/task/${taskId}?include_subtasks=false`);
  result.fetchSubtask = "ok";
} catch (e) {
  result.fetchSubtask = e.message;
  return result;
}

const listId = subtask.list?.id;
if (listId !== TARGET_LIST_ID) {
  result.skipped = `List ${listId} is not target list`;
  return result;
}

const parentId = subtask.parent;
if (!parentId) {
  result.skipped = "Not a subtask (no parent)";
  return result;
}
result.parentId = parentId;

// 2. Fetch the parent
let parent;
try {
  parent = await apiGet(`/task/${parentId}?include_subtasks=false`);
  result.fetchParent = "ok";
} catch (e) {
  result.fetchParent = e.message;
  return result;
}

const parentFields = parent.custom_fields || [];
const parentTags = (parent.tags || []).map((t) => t.name.toLowerCase());

// 3. Copy each custom field individually
for (const field of FIELDS_TO_COPY) {
  const pf = parentFields.find((f) => f.id === field.id);

  if (!pf || pf.value === null || pf.value === undefined || pf.value === "") {
    result.fields[field.name] = "skipped_empty";
    continue;
  }

  // For dropdown fields, the GET response returns the orderindex (integer)
  // but the SET endpoint expects the option UUID (string).
  // Resolve via type_config.options on the parent field object.
  let valueToSet = pf.value;
  if (field.type === "drop_down" && pf.type_config?.options) {
    const option = pf.type_config.options.find(
      (o) => o.orderindex === pf.value,
    );
    if (option) {
      valueToSet = option.id;
    } else {
      result.fields[field.name] =
        `skipped_no_option_for_orderindex_${pf.value}`;
      continue;
    }
  }

  // For People (users) fields, the GET response returns an array of user objects
  // e.g. [{ id: 123, username: "...", ... }]
  // but the SET endpoint expects { add: [123, 456], rem: [] }
  if (field.type === "users" && Array.isArray(pf.value)) {
    const userIds = pf.value.map((u) => u.id);
    if (userIds.length === 0) {
      result.fields[field.name] = "skipped_empty";
      continue;
    }
    valueToSet = { add: userIds, rem: [] };
  }

  try {
    await apiPost(`/task/${taskId}/field/${field.id}`, { value: valueToSet });
    result.fields[field.name] = "ok";
  } catch (e) {
    result.fields[field.name] = e.message;
  }
}

// 4. Copy tag if present on parent
if (parentTags.includes(TAG_TO_COPY.toLowerCase())) {
  try {
    await apiPost(`/task/${taskId}/tag/${encodeURIComponent(TAG_TO_COPY)}`, {});
    result.tag = "ok";
  } catch (e) {
    result.tag = e.message;
  }
} else {
  result.tag = "skipped_not_on_parent";
}

return result;
