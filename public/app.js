const tokenKey = "botzin.config.token";

const state = {
  accounts: [],
  characters: [],
  machines: [],
  hunts: [],
  skills: [],
  assignments: [],
  huntSkillRules: [],
  learningMethods: [],
  learningSources: [],
  learningMethodSources: [],
  learningSessions: []
};

const statusEl = document.querySelector("#status");
const snapshotEl = document.querySelector("#snapshot");
const loginPanel = document.querySelector("#loginPanel");
const configApp = document.querySelector("#configApp");
const currentUserEl = document.querySelector("#currentUser");
const refreshButton = document.querySelector("#refreshButton");
const logoutButton = document.querySelector("#logoutButton");

refreshButton.addEventListener("click", loadConfig);
logoutButton.addEventListener("click", logout);

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  const response = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  localStorage.setItem(tokenKey, response.token);
  await showAuthenticated(response.user);
});

bindForm("#accountForm", "/api/accounts");
bindForm("#characterForm", "/api/characters");
bindForm("#machineForm", "/api/machines");
bindForm("#huntForm", "/api/hunts");
bindForm("#skillForm", "/api/skills");
bindForm("#assignmentForm", "/api/assignments");
bindForm("#huntSkillRuleForm", "/api/hunt-skill-rules");
bindForm("#learningMethodForm", "/api/learning-methods");
bindForm("#learningSessionForm", "/api/learning-sessions");
bindForm("#learningSourceForm", "/api/learning-sources");
bindForm("#learningMethodSourceForm", "/api/learning-method-sources");
bindUploadForm("#videoUploadForm", "/api/learning-sources/upload-video");

await boot();

async function boot() {
  hideConfig();
  const token = localStorage.getItem(tokenKey);

  if (!token) {
    showLogin();
    return;
  }

  try {
    const response = await authFetchJson("/api/auth/me");
    await showAuthenticated(response.user);
  } catch {
    logout();
  }
}

async function showAuthenticated(user) {
  loginPanel.classList.add("hidden");
  configApp.classList.remove("hidden");
  refreshButton.classList.remove("hidden");
  logoutButton.classList.remove("hidden");
  currentUserEl.textContent = `${user.displayName} (${user.role})`;
  await loadConfig();
}

function showLogin() {
  loginPanel.classList.remove("hidden");
  hideConfig();
}

function hideConfig() {
  configApp.classList.add("hidden");
  refreshButton.classList.add("hidden");
  logoutButton.classList.add("hidden");
  currentUserEl.textContent = "";
}

function logout() {
  localStorage.removeItem(tokenKey);
  showLogin();
}

function bindForm(selector, endpoint) {
  document.querySelector(selector).addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());

    for (const [key, value] of Object.entries(payload)) {
      if (value === "") {
        payload[key] = null;
      }
    }

    await authFetchJson(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    form.reset();
    await loadConfig();
    setStatus("Configuracao salva.");
  });
}

function bindUploadForm(selector, endpoint) {
  document.querySelector(selector).addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    setStatus("Enviando video...");

    await authFetchJson(endpoint, {
      method: "POST",
      body: formData
    });

    form.reset();
    await loadConfig();
    setStatus("Video enviado e fonte cadastrada.");
  });
}

async function loadConfig() {
  const data = await authFetchJson("/api/config");
  Object.assign(state, data);
  renderSelects();
  renderSnapshot();
  setStatus("Configuracao carregada.");
}

function renderSelects() {
  fillSelect("#characterForm select[name='accountId']", state.accounts, (item) => item.name);
  fillSelect("#assignmentForm select[name='machineId']", state.machines, (item) => item.name);
  fillSelect("#assignmentForm select[name='characterId']", state.characters, (item) => item.name);
  fillSelect("#assignmentForm select[name='huntId']", state.hunts, (item) => item.name);
  fillSelect("#huntSkillRuleForm select[name='huntId']", state.hunts, (item) => item.name);
  fillSelect("#huntSkillRuleForm select[name='skillId']", state.skills, (item) => `${item.name} (${item.manaCost} mana, lvl ${item.requiredLevel})`);
  fillSelect("#learningMethodForm select[name='huntId']", [{ id: "", name: "Nenhuma" }, ...state.hunts], (item) => item.name);
  fillSelect("#learningMethodForm select[name='characterId']", [{ id: "", name: "Nenhum" }, ...state.characters], (item) => item.name);
  fillSelect("#learningSessionForm select[name='methodId']", state.learningMethods, (item) => item.name);
  fillSelect("#learningSessionForm select[name='assignmentId']", [{ id: "", name: "Nenhuma" }, ...state.assignments], renderAssignmentOption);
  fillSelect("#learningMethodSourceForm select[name='methodId']", state.learningMethods, (item) => item.name);
  fillSelect("#learningMethodSourceForm select[name='sourceId']", state.learningSources, (item) => `${item.name} (${item.sourceType})`);
}

function fillSelect(selector, items, labelFactory) {
  const select = document.querySelector(selector);
  select.innerHTML = "";

  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = labelFactory(item);
    select.appendChild(option);
  }
}

function renderSnapshot() {
  snapshotEl.innerHTML = "";
  snapshotEl.append(
    renderList("Contas", state.accounts, (item) => `${item.name} - ${item.loginIdentifier}`),
    renderList("Chars", state.characters, (item) => `${item.name} - conta #${item.accountId}`),
    renderList("Maquinas", state.machines, (item) => `${item.name} - ${item.nodeId}`),
    renderList("Hunts", state.hunts, (item) => `${item.name}${item.city ? ` - ${item.city}` : ""}`),
    renderList("Skills", state.skills, renderSkill),
    renderList("Atribuicoes", state.assignments, renderAssignment),
    renderList("Regras de skill", state.huntSkillRules, renderHuntSkillRule),
    renderList("Metodos de aprendizado", state.learningMethods, renderLearningMethod),
    renderList("Fontes de ensino", state.learningSources, renderLearningSource),
    renderList("Fontes por metodo", state.learningMethodSources, renderLearningMethodSource),
    renderList("Sessoes de ensino", state.learningSessions, renderLearningSession)
  );
}

function renderList(title, items, labelFactory) {
  const box = document.createElement("div");
  box.className = "list";
  const heading = document.createElement("h3");
  heading.textContent = title;
  box.appendChild(heading);

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "item";
    empty.textContent = "Nenhum registro.";
    box.appendChild(empty);
    return box;
  }

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "item";
    row.textContent = labelFactory(item);
    box.appendChild(row);
  }

  return box;
}

function renderAssignment(item) {
  const machine = state.machines.find((entry) => entry.id === item.machineId);
  const character = state.characters.find((entry) => entry.id === item.characterId);
  const hunt = state.hunts.find((entry) => entry.id === item.huntId);
  return `${machine?.name ?? item.machineId} -> ${character?.name ?? item.characterId} -> ${hunt?.name ?? item.huntId} (${item.status})`;
}

function renderSkill(item) {
  return `${item.name} - ${item.manaCost} mana - lvl ${item.requiredLevel} - ${item.allowedVocations.join(", ")}`;
}

function renderHuntSkillRule(item) {
  const hunt = state.hunts.find((entry) => entry.id === item.huntId);
  const skill = state.skills.find((entry) => entry.id === item.skillId);
  return `${hunt?.name ?? item.huntId} -> ${skill?.name ?? item.skillId} prioridade ${item.priority}`;
}

function renderLearningMethod(item) {
  return `${item.name} - ${item.methodType} - ${item.scope} - ${item.mode} - peso ${item.weight}`;
}

function renderLearningSession(item) {
  const method = state.learningMethods.find((entry) => entry.id === item.methodId);
  return `${item.name} - ${method?.name ?? item.methodId} - ${item.status}`;
}

function renderLearningSource(item) {
  return `${item.name} - ${item.sourceType} - ${item.status} - confianca ${item.trustLevel}`;
}

function renderLearningMethodSource(item) {
  const method = state.learningMethods.find((entry) => entry.id === item.methodId);
  const source = state.learningSources.find((entry) => entry.id === item.sourceId);
  return `${method?.name ?? item.methodId} <- ${source?.name ?? item.sourceId} (${item.role}, peso ${item.weight})`;
}

function renderAssignmentOption(item) {
  if (item.id === "") {
    return item.name;
  }

  return renderAssignment(item);
}

async function authFetchJson(url, options = {}) {
  const token = localStorage.getItem(tokenKey);
  const headers = new Headers(options.headers ?? {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetchJson(url, { ...options, headers });
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Erro na requisicao.");
  }

  return payload;
}

function setStatus(message) {
  statusEl.textContent = message;
}
