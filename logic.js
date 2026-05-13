// ═══════════════════════════════════════════════════════
// SUBTASK FIELD INHERITANCE - ClickUp → Zapier Code Step
// ═══════════════════════════════════════════════════════

// ⬇️ REPLACE WITH YOUR CLICKUP API TOKEN ⬇️
const API_TOKEN = "pk_YOUR_TOKEN_HERE";

const BASE_URL = "https://api.clickup.com/api/v2";
const TARGET_LIST_ID = "980200129712";

const FIELDS_TO_COPY = [
  { id: "3ab9bbf1-0dca-4e55-b56e-c04c1f7cf2ac", type: "short_text" },
  { id: "050e7134-acaa-4631-831c-9c6e0780ec2b", type: "drop_down" }
];

const TAG_TO_COPY = "perf-churn-risk";

// --- Helpers ---
async function apiGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Authorization": API_TOKEN }
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Authorization": API_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res;
}

// --- Main ---
const taskId = inputData.task_id;
if (!taskId) throw new Error("No task_id provided from webhook");

// 1. Fetch the subtask to get parent + list context
const subtask = await apiGet(`/task/${taskId}?include_subtasks=false`);

const listId = subtask.list?.id;
if (listId !== TARGET_LIST_ID) {
  return { status: "skipped", reason: `List ${listId} is not target list` };
}

const parentId = subtask.parent;
if (!parentId) {
  return { status: "skipped", reason: "Not a subtask (no parent)" };
}

// 2. Fetch the parent task
const parent = await apiGet(`/task/${parentId}?include_subtasks=false`);
const parentFields = parent.custom_fields || [];
const parentTags = (parent.tags || []).map(t => t.name.toLowerCase());

// 3. Copy custom fields (skip if parent value is blank)
let fieldsUpdated = 0;

for (const field of FIELDS_TO_COPY) {
  const pf = parentFields.find(f => f.id === field.id);
  if (!pf || pf.value === null || pf.value === undefined || pf.value === "") continue;

  await apiPost(`/task/${taskId}/field/${field.id}`, { value: pf.value });
  fieldsUpdated++;
}

// 4. Copy tag if present on parent
let tagApplied = false;
if (parentTags.includes(TAG_TO_COPY.toLowerCase())) {
  await apiPost(`/task/${taskId}/tag/${encodeURIComponent(TAG_TO_COPY)}`, {});
  tagApplied = true;
}

return { status: "success", fieldsUpdated, tagApplied, parentId };
