"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStudioAssets = getStudioAssets;
exports.runServe = runServe;
exports.startStudioServer = startStudioServer;
const node_http_1 = require("node:http");
const node_path_1 = __importDefault(require("node:path"));
const init_1 = require("./init");
const skill_1 = require("../lib/skill");
const templates_1 = require("../lib/templates");
const workflow_1 = require("../lib/workflow");
function getStudioAssets() {
    return {
        html: HTML_PAGE,
        css: CSS_PAGE,
        js: JS_PAGE
    };
}
async function runServe(options) {
    const handle = await startStudioServer(options);
    const shutdown = async () => {
        await handle.close();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    console.log(`OpenClaw Skill Studio running at ${handle.url}`);
    console.log("Press Ctrl+C to stop.");
    return handle;
}
async function startStudioServer(options) {
    const server = (0, node_http_1.createServer)((request, response) => {
        void handleRequest(request, response);
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(options.port, options.host, () => {
            server.off("error", reject);
            resolve();
        });
    });
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("Failed to determine studio server address.");
    }
    const port = address.port;
    return {
        port,
        url: `http://${options.host}:${port}`,
        close: () => new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        })
    };
}
async function handleRequest(request, response) {
    try {
        const method = request.method ?? "GET";
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
            sendHtml(response, HTML_PAGE);
            return;
        }
        if (method === "GET" && url.pathname === "/styles.css") {
            sendText(response, CSS_PAGE, "text/css; charset=utf-8");
            return;
        }
        if (method === "GET" && url.pathname === "/app.js") {
            sendText(response, JS_PAGE, "application/javascript; charset=utf-8");
            return;
        }
        if (method === "GET" && url.pathname === "/api/state") {
            const examples = await (0, workflow_1.listExampleSkills)();
            sendJson(response, 200, {
                cwd: process.cwd(),
                templates: Object.keys(templates_1.TEMPLATE_MODES),
                examples
            });
            return;
        }
        if (method === "POST" && url.pathname === "/api/init") {
            const body = await readJsonBody(request);
            const template = parseTemplate(body.template);
            const targetDir = requireString(body.targetDir, "targetDir");
            const resources = Array.isArray(body.resources) ? body.resources.filter((value) => typeof value === "string") : [];
            const initialized = await (0, init_1.runInit)({
                targetDir,
                name: typeof body.name === "string" ? body.name : undefined,
                description: typeof body.description === "string" ? body.description : undefined,
                template,
                resources,
                force: body.force === true
            });
            sendJson(response, 200, {
                ...initialized
            });
            return;
        }
        if (method === "POST" && url.pathname === "/api/lint") {
            const body = await readJsonBody(request);
            const targetDir = requireString(body.targetDir, "targetDir");
            const resolvedDir = node_path_1.default.resolve(targetDir);
            const result = await (0, skill_1.lintSkill)(resolvedDir);
            const summary = (0, workflow_1.summarizeLintResult)(result);
            sendJson(response, 200, {
                ok: summary.errors === 0,
                skillDir: result.skillDir,
                fileCount: result.fileCount,
                summary,
                focusAreas: (0, workflow_1.summarizeFocusAreas)(result),
                nextSteps: (0, workflow_1.buildActionPlan)(result, resolvedDir),
                issues: result.issues
            });
            return;
        }
        if (method === "POST" && url.pathname === "/api/pack") {
            const body = await readJsonBody(request);
            const targetDir = requireString(body.targetDir, "targetDir");
            const outputPath = typeof body.outputPath === "string" && body.outputPath.trim() ? body.outputPath : undefined;
            const packed = await (0, workflow_1.packSkill)(targetDir, outputPath);
            sendJson(response, 200, {
                archivePath: packed.destination,
                normalizedOutputPath: packed.normalizedOutputPath,
                archiveSizeBytes: packed.archiveSizeBytes,
                archiveSizeLabel: packed.archiveSizeLabel,
                reportMarkdown: (0, workflow_1.buildArchiveReport)({
                    archivePath: packed.destination,
                    manifest: packed.manifest
                }),
                warnings: packed.warnings,
                manifest: packed.manifest
            });
            return;
        }
        if (method === "POST" && url.pathname === "/api/review") {
            const body = await readJsonBody(request);
            const targetDir = requireString(body.targetDir, "targetDir");
            const outputPath = typeof body.outputPath === "string" && body.outputPath.trim() ? body.outputPath : undefined;
            const review = await (0, workflow_1.reviewSkill)(targetDir, outputPath);
            sendJson(response, 200, {
                ...review,
                reportMarkdown: (0, workflow_1.buildReviewReport)(review)
            });
            return;
        }
        if (method === "POST" && url.pathname === "/api/inspect") {
            const body = await readJsonBody(request);
            const archivePath = requireString(body.archivePath, "archivePath");
            const inspected = typeof body.sourceDir === "string" && body.sourceDir.trim()
                ? await (0, workflow_1.compareArchiveToSource)(archivePath, body.sourceDir)
                : await (0, workflow_1.inspectSkillArchive)(archivePath);
            sendJson(response, 200, {
                ...inspected,
                reportMarkdown: (0, workflow_1.buildArchiveReport)(inspected)
            });
            return;
        }
        sendJson(response, 404, {
            error: "Not found"
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        sendJson(response, 400, {
            error: message
        });
    }
}
async function readJsonBody(request) {
    const chunks = [];
    for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks).toString("utf8").trim();
    if (!raw) {
        return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Request body must be a JSON object.");
    }
    return parsed;
}
function requireString(value, field) {
    if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`Expected "${field}" to be a non-empty string.`);
    }
    return value;
}
function parseTemplate(value) {
    if (typeof value !== "string" || !(value in templates_1.TEMPLATE_MODES)) {
        throw new Error(`Template must be one of: ${Object.keys(templates_1.TEMPLATE_MODES).join(", ")}.`);
    }
    return value;
}
function sendHtml(response, html) {
    sendText(response, html, "text/html; charset=utf-8");
}
function sendText(response, body, contentType) {
    response.writeHead(200, {
        "content-type": contentType,
        "cache-control": "no-store"
    });
    response.end(body);
}
function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
    });
    response.end(JSON.stringify(payload, null, 2));
}
const HTML_PAGE = String.raw `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OpenClaw Skill Studio</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <div class="page-shell">
      <header class="hero">
        <div class="hero-copy">
          <p class="eyebrow">Official Workflow</p>
          <h1>OpenClaw Skill Studio</h1>
          <p class="subtitle">
            The local authoring surface for OpenClaw skills. Start from a real scaffold, validate the skill, package
            it, and inspect the final artifact before you share it.
          </p>
          <div class="hero-actions">
            <span class="hero-badge">Runs fully local</span>
            <span class="hero-badge">Uses the same workflow as the CLI</span>
          </div>
        </div>
        <div class="hero-stats">
          <div class="stat-card">
            <span class="stat-label">Surfaces</span>
            <strong>CLI and Studio stay aligned</strong>
          </div>
          <div class="stat-card">
            <span class="stat-label">Best for</span>
            <strong>Demos, onboarding, and local skill reviews</strong>
          </div>
        </div>
      </header>

      <section class="workflow-strip panel panel-wide">
        <div class="panel-header compact">
          <div>
            <p class="eyebrow">Workflow</p>
            <h2>One Clear Skill Pipeline</h2>
          </div>
          <p class="workflow-summary">Create or load a skill, lint it, package it, then inspect the shipped archive.</p>
        </div>
        <div class="step-grid">
          <article class="step-card">
            <span class="step-index">01</span>
            <strong>Create</strong>
            <p>Initialize a new skill or use an example to prefill the studio.</p>
          </article>
          <article class="step-card">
            <span class="step-index">02</span>
            <strong>Validate</strong>
            <p>Run lint to catch metadata, structure, content, and reference issues early.</p>
          </article>
          <article class="step-card">
            <span class="step-index">03</span>
            <strong>Package</strong>
            <p>Produce a real <code>.skill</code> archive only after validation passes.</p>
          </article>
          <article class="step-card">
            <span class="step-index">04</span>
            <strong>Inspect</strong>
            <p>Review the packaged manifest so the final artifact is easy to trust.</p>
          </article>
        </div>
      </section>

      <section class="status-banner panel panel-wide">
        <div>
          <p class="eyebrow">Studio Status</p>
          <strong id="status-title">Ready to author</strong>
          <p id="status-body" class="status-copy">Pick an example or initialize a new skill. Each panel will prefill the next step as you go.</p>
        </div>
        <code id="cwd"></code>
      </section>

      <main class="grid">
        <section class="panel panel-wide">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Examples</p>
              <h2>Start From a Real Skill</h2>
              <p class="panel-copy">Use an example to preload the authoring and archive fields with a working skill.</p>
            </div>
          </div>
          <div id="example-list" class="example-grid"></div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Create</p>
              <h2>Initialize a Skill</h2>
              <p class="panel-copy">Scaffold a clean starting point with the same templates available from the CLI.</p>
            </div>
          </div>
          <form id="init-form" class="stack">
            <label>
              <span>Target directory</span>
              <input name="targetDir" id="init-target-dir" placeholder="./skills/customer-support" required />
              <small>Create a new skill folder or point at an existing draft you want to re-scaffold.</small>
            </label>
            <label>
              <span>Skill name</span>
              <input name="name" id="init-name" placeholder="customer-support" />
            </label>
            <label>
              <span>Description</span>
              <textarea name="description" id="init-description" rows="3" placeholder="Skill for support triage workflows"></textarea>
            </label>
            <label>
              <span>Template</span>
              <select name="template" id="template-select"></select>
            </label>
            <fieldset>
              <legend>Extra resources</legend>
              <div class="check-grid">
                <label><input type="checkbox" name="resources" value="references" /> references/</label>
                <label><input type="checkbox" name="resources" value="scripts" /> scripts/</label>
                <label><input type="checkbox" name="resources" value="assets" /> assets/</label>
              </div>
            </fieldset>
            <label class="checkbox-row"><input type="checkbox" name="force" /> Overwrite existing SKILL.md if present</label>
            <button type="submit">Create skill</button>
          </form>
          <pre id="init-result" class="result-card muted">No skill initialized yet.

Recommended flow:
1. Choose a target directory and template.
2. Create the scaffold.
3. Edit SKILL.md, then lint, package, and review it.</pre>
        </section>

        <section class="panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Validate</p>
              <h2>Lint and Package</h2>
              <p class="panel-copy">Keep the working directory and output archive together so the next step stays obvious.</p>
            </div>
          </div>
          <form id="lint-form" class="stack">
            <label>
              <span>Skill directory</span>
              <input name="targetDir" id="skill-dir-input" placeholder="./examples/weather-research-skill" required />
              <small>Point this at the root folder that contains <code>SKILL.md</code>.</small>
            </label>
            <div class="button-row">
              <button type="submit">Run lint</button>
              <button type="button" id="pack-button" class="secondary">Package skill</button>
              <button type="button" id="review-button" class="secondary">Review readiness</button>
            </div>
          </form>
          <label>
            <span>Archive output path</span>
            <input id="output-path-input" placeholder="./artifacts/customer-support.skill" />
          </label>
          <pre id="lint-result" class="result-card muted">Lint output will appear here.

Expected outcome:
- zero blocking errors
- a short action plan
- a clear pack or review command when the skill is ready</pre>
          <pre id="pack-result" class="result-card muted">Pack output will appear here.

When packaging succeeds, the inspect form will be prefilled automatically and the next inspect command will be obvious.</pre>
          <pre id="review-result" class="result-card muted">Review output will appear here.

Use this when you want one release-readiness verdict with lint, packaging, and artifact checks together.</pre>
        </section>

        <section class="panel panel-wide">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Inspect</p>
              <h2>Review a Packaged Archive</h2>
              <p class="panel-copy">Inspect the shipped manifest, not just the source folder, before handing the skill off.</p>
            </div>
          </div>
          <form id="inspect-form" class="stack inline-form">
            <label class="grow">
              <span>Archive path</span>
              <input name="archivePath" id="archive-path-input" placeholder="./examples/weather-research-skill.skill" required />
            </label>
            <button type="submit">Inspect archive</button>
          </form>
          <label>
            <span>Compare with source skill directory</span>
            <input id="inspect-source-input" placeholder="./examples/weather-research-skill" />
            <small>Optional. Detect drift between the packaged artifact and the current skill directory.</small>
          </label>
          <pre id="inspect-result" class="result-card muted">Manifest details will appear here.

Use this after packaging to verify the final archive contents, metadata, and source-to-artifact drift.</pre>
        </section>
      </main>
    </div>

    <script src="/app.js" type="module"></script>
  </body>
</html>
`;
const CSS_PAGE = String.raw `:root {
  color-scheme: light;
  --bg: #f4efe7;
  --panel: rgba(255, 252, 247, 0.9);
  --panel-border: rgba(36, 42, 36, 0.14);
  --text: #172019;
  --muted: #5b685d;
  --accent: #0f6c52;
  --accent-strong: #094836;
  --ink-soft: #d9e3d4;
  --danger: #9f2f1f;
  --shadow: 0 20px 60px rgba(34, 35, 25, 0.12);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  color: var(--text);
  font-family: "IBM Plex Sans", "Segoe UI", "Helvetica Neue", sans-serif;
  background:
    radial-gradient(circle at top left, rgba(15, 108, 82, 0.14), transparent 28%),
    radial-gradient(circle at top right, rgba(201, 128, 50, 0.18), transparent 24%),
    linear-gradient(180deg, #f7f3ea 0%, var(--bg) 100%);
}

.page-shell {
  max-width: 1240px;
  margin: 0 auto;
  padding: 32px 20px 56px;
}

.hero {
  display: grid;
  grid-template-columns: 1.4fr 0.8fr;
  gap: 20px;
  margin-bottom: 24px;
}

.hero-copy,
.hero-stats,
.panel {
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 24px;
  box-shadow: var(--shadow);
  backdrop-filter: blur(10px);
}

.hero-copy {
  padding: 28px;
}

.hero-stats {
  padding: 18px;
  display: grid;
  gap: 12px;
  align-content: stretch;
}

.stat-card {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(21, 28, 22, 0.04);
}

.stat-label,
.eyebrow,
label span,
legend {
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

h1,
h2 {
  margin: 0;
  font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  font-weight: 700;
  letter-spacing: -0.03em;
}

h1 {
  font-size: clamp(2.2rem, 5vw, 4rem);
  line-height: 0.95;
  margin-top: 8px;
}

h2 {
  font-size: 1.55rem;
}

.subtitle {
  max-width: 55ch;
  margin: 18px 0 0;
  font-size: 1.02rem;
  line-height: 1.6;
  color: var(--muted);
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 20px;
}

.hero-badge {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(15, 108, 82, 0.1);
  color: var(--accent-strong);
  font-size: 0.88rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.panel {
  padding: 22px;
}

.panel-wide {
  grid-column: 1 / -1;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 18px;
}

.panel-header.compact {
  margin-bottom: 14px;
}

.panel-copy,
.workflow-summary,
.status-copy,
small {
  margin: 8px 0 0;
  color: var(--muted);
  line-height: 1.5;
}

small {
  display: block;
  font-size: 0.9rem;
}

.workflow-strip,
.status-banner {
  margin-bottom: 20px;
}

.status-banner {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: end;
}

.step-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.step-card {
  padding: 16px;
  border-radius: 18px;
  background: rgba(21, 28, 22, 0.04);
  border: 1px solid rgba(36, 42, 36, 0.08);
}

.step-card strong,
.step-card p {
  display: block;
}

.step-card p {
  margin: 8px 0 0;
  color: var(--muted);
  line-height: 1.5;
}

.step-index {
  display: inline-block;
  margin-bottom: 10px;
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  color: var(--accent-strong);
}

.example-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}

.example-card {
  padding: 18px;
  border-radius: 20px;
  border: 1px solid rgba(36, 42, 36, 0.1);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(244, 239, 231, 0.92));
}

.example-card p,
.example-card code {
  margin: 0;
}

.card-title {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 10px;
}

.pill-row,
.button-row,
.check-grid {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.pill {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(15, 108, 82, 0.1);
  color: var(--accent-strong);
  font-size: 0.8rem;
}

.example-notes {
  display: grid;
  gap: 10px;
  margin: 14px 0;
}

.example-note {
  margin: 0;
  color: var(--muted);
  line-height: 1.5;
}

.command-card {
  margin: 0;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(23, 32, 25, 0.06);
  overflow: auto;
}

.command-card code {
  color: var(--text);
}

.stack {
  display: grid;
  gap: 14px;
}

.inline-form {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
}

.grow {
  min-width: 0;
}

label,
fieldset {
  display: grid;
  gap: 8px;
}

fieldset {
  border: 1px solid rgba(36, 42, 36, 0.12);
  border-radius: 16px;
  padding: 14px;
}

input,
textarea,
select,
button {
  font: inherit;
}

input,
textarea,
select {
  width: 100%;
  border: 1px solid rgba(36, 42, 36, 0.16);
  background: rgba(255, 255, 255, 0.8);
  border-radius: 14px;
  padding: 12px 14px;
  color: var(--text);
}

input:focus,
textarea:focus,
select:focus {
  outline: 2px solid rgba(15, 108, 82, 0.22);
  border-color: rgba(15, 108, 82, 0.4);
}

button {
  border: 0;
  border-radius: 14px;
  padding: 12px 16px;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  cursor: pointer;
  transition: transform 120ms ease, opacity 120ms ease;
}

button.secondary {
  color: var(--text);
  background: rgba(23, 32, 25, 0.08);
}

button:hover {
  transform: translateY(-1px);
}

button:disabled {
  opacity: 0.65;
  cursor: progress;
  transform: none;
}

.checkbox-row {
  grid-template-columns: auto 1fr;
  align-items: center;
}

.checkbox-row input,
.check-grid input {
  width: auto;
}

.result-card {
  min-height: 120px;
  margin: 14px 0 0;
  padding: 16px;
  border-radius: 18px;
  background: #18221b;
  color: #edf6ef;
  overflow: auto;
  white-space: pre-wrap;
  line-height: 1.5;
  font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
}

.result-card.muted {
  color: #bac8bb;
}

.status-error {
  color: #ffc7ba;
}

.result-card.status-ok {
  color: #edf6ef;
}

code {
  font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
  font-size: 0.92rem;
  color: var(--muted);
}

@media (max-width: 960px) {
  .hero,
  .grid {
    grid-template-columns: 1fr;
  }

  .step-grid {
    grid-template-columns: 1fr;
  }

  .status-banner {
    flex-direction: column;
    align-items: flex-start;
  }

  .inline-form {
    grid-template-columns: 1fr;
  }
}
`;
const JS_PAGE = String.raw `const state = {
  templates: [],
  examples: []
};

const exampleList = document.querySelector("#example-list");
const cwdLabel = document.querySelector("#cwd");
const templateSelect = document.querySelector("#template-select");
const initForm = document.querySelector("#init-form");
const initTargetDirInput = document.querySelector("#init-target-dir");
const initNameInput = document.querySelector("#init-name");
const initDescriptionInput = document.querySelector("#init-description");
const lintForm = document.querySelector("#lint-form");
const inspectForm = document.querySelector("#inspect-form");
const skillDirInput = document.querySelector("#skill-dir-input");
const outputPathInput = document.querySelector("#output-path-input");
const archivePathInput = document.querySelector("#archive-path-input");
const inspectSourceInput = document.querySelector("#inspect-source-input");
const initResult = document.querySelector("#init-result");
const lintResult = document.querySelector("#lint-result");
const packResult = document.querySelector("#pack-result");
const reviewResult = document.querySelector("#review-result");
const inspectResult = document.querySelector("#inspect-result");
const packButton = document.querySelector("#pack-button");
const reviewButton = document.querySelector("#review-button");
const statusTitle = document.querySelector("#status-title");
const statusBody = document.querySelector("#status-body");

boot().catch((error) => {
  renderResult(initResult, error.message, true);
  setStatus("Studio failed to load", error.message, "error");
});

async function boot() {
  const payload = await api("/api/state");
  state.templates = payload.templates;
  state.examples = payload.examples;
  cwdLabel.textContent = payload.cwd;
  templateSelect.innerHTML = state.templates.map((template) => '<option value="' + template + '">' + template + "</option>").join("");
  renderExamples();
  setStatus("Ready to author", "Pick an example or initialize a new skill. Each result card will point you to the next action.", "neutral");
}

function renderExamples() {
  if (state.examples.length === 0) {
    exampleList.innerHTML = '<article class="example-card"><strong>No examples found</strong><p>Use the Create panel to scaffold a first skill, or add example skills to the repository for faster demos and onboarding.</p></article>';
    return;
  }

  exampleList.innerHTML = state.examples.map((example) => {
    const pills = ['<span class="pill">template: ' + escapeHtml(example.recommendedTemplate) + "</span>"]
      .concat(example.resources.map((resource) => '<span class="pill">' + resource + '</span>'))
      .join("");
    const bestFor = example.useCases[0] || example.description || "Adapt this pattern to a similar workflow.";
    const workflowPreview = example.workflowPreview || "Review the example workflow and adapt its first step.";

    return '<article class="example-card">' +
      '<div class="card-title"><strong>' + escapeHtml(example.title) + '</strong><span class="pill">v' + escapeHtml(example.version || "n/a") + '</span></div>' +
      '<p>' + escapeHtml(example.description || "No description") + '</p>' +
      '<p><code>' + escapeHtml(example.relativePath) + '</code></p>' +
      '<div class="pill-row" style="margin: 12px 0 0;">' + pills + '</div>' +
      '<div class="example-notes">' +
      '<p class="example-note"><strong>Best for:</strong> ' + escapeHtml(bestFor) + '</p>' +
      '<p class="example-note"><strong>Workflow starts:</strong> ' + escapeHtml(workflowPreview) + '</p>' +
      '<p class="command-card"><code>' + escapeHtml(example.starterCommand) + '</code></p>' +
      "</div>" +
      '<div class="button-row">' +
      '<button type="button" class="secondary" data-prefill-example="' + escapeHtml(example.name) + '">Prefill create form</button>' +
      '<button type="button" data-use-path="' + escapeHtml(example.absolutePath) + '">Use skill</button>' +
      '<button type="button" class="secondary" data-use-archive="' + escapeHtml(example.absolutePath + ".skill") + '" data-source-path="' + escapeHtml(example.absolutePath) + '">Use archive path</button>' +
      "</div>" +
      "</article>";
  }).join("");

  for (const button of exampleList.querySelectorAll("[data-use-path]")) {
    button.addEventListener("click", () => {
      const value = button.getAttribute("data-use-path");
      skillDirInput.value = value;
      outputPathInput.value = value + ".skill";
      inspectSourceInput.value = value;
      setStatus("Example loaded", "The skill directory and archive path are prefilled. Run lint when you are ready to validate it.", "ok");
    });
  }

  for (const button of exampleList.querySelectorAll("[data-use-archive]")) {
    button.addEventListener("click", () => {
      const value = button.getAttribute("data-use-archive");
      archivePathInput.value = value;
      inspectSourceInput.value = button.getAttribute("data-source-path") || inspectSourceInput.value;
      setStatus("Archive path loaded", "The inspect form is prefilled with an example archive path.", "ok");
    });
  }

  for (const button of exampleList.querySelectorAll("[data-prefill-example]")) {
    button.addEventListener("click", () => {
      const name = button.getAttribute("data-prefill-example");
      const example = state.examples.find((entry) => entry.name === name);
      if (!example) {
        return;
      }

      initTargetDirInput.value = example.suggestedTargetDir;
      initNameInput.value = example.name;
      initDescriptionInput.value = example.description || "";
      templateSelect.value = example.recommendedTemplate;
      setResourceSelections([]);
      setStatus(
        "Create form prefilled",
        "The init form now mirrors this example's structure so you can scaffold a first draft without copying paths by hand.",
        "ok"
      );
    });
  }
}

initForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = initForm.querySelector('button[type="submit"]');
  setBusy(submitButton, true);

  try {
    const formData = new FormData(initForm);
    const payload = {
      targetDir: formData.get("targetDir"),
      name: formData.get("name") || undefined,
      description: formData.get("description") || undefined,
      template: formData.get("template"),
      resources: formData.getAll("resources"),
      force: formData.get("force") === "on"
    };
    const result = await api("/api/init", payload);
    skillDirInput.value = result.targetDir;
    outputPathInput.value = result.targetDir + ".skill";
    inspectSourceInput.value = result.targetDir;
    renderResult(initResult, [
      "Skill scaffold created",
      "",
      "READY TO AUTHOR",
      "",
      "Target: " + result.skillDir,
      "Skill file: " + result.skillFile,
      "Template: " + result.template,
      "Resources: " + formatList(result.resources, "none"),
      "Reference example: " + result.exampleSkill,
      "",
      "Next:",
      "1. Replace scaffold copy in SKILL.md with real instructions.",
      "2. Run lint in the Validate panel.",
      "3. Run review before handing the skill off."
    ].join("\n"));
    setStatus("Skill initialized", "The working directory, archive path, and inspect source field have been prefilled for the next steps.", "ok");
  } catch (error) {
    renderResult(initResult, error.message, true);
    setStatus("Init failed", error.message, "error");
  } finally {
    setBusy(submitButton, false);
  }
});

lintForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = lintForm.querySelector('button[type="submit"]');
  setBusy(submitButton, true);

  try {
    const result = await api("/api/lint", {
      targetDir: skillDirInput.value
    });
    renderResult(lintResult, formatLintResult(result), !result.ok);
    setStatus(
      result.summary.errors === 0 && result.summary.warnings === 0 ? "Ready to package" : result.ok ? "Packable with warnings" : "Lint found issues",
      result.ok
        ? result.summary.warnings === 0
          ? "This skill is clean. Package it now or run review for one release-readiness verdict."
          : "Packaging is allowed, but review the warnings before handoff."
        : "Review the issues and action plan in the lint output before packaging.",
      result.ok ? "ok" : "error"
    );
  } catch (error) {
    renderResult(lintResult, error.message, true);
    setStatus("Lint failed", error.message, "error");
  } finally {
    setBusy(submitButton, false);
  }
});

packButton.addEventListener("click", async () => {
  setBusy(packButton, true);

  try {
    const result = await api("/api/pack", {
      targetDir: skillDirInput.value,
      outputPath: outputPathInput.value || undefined
    });
    archivePathInput.value = result.archivePath;
    inspectSourceInput.value = skillDirInput.value;
    renderResult(packResult, formatPackResult(result));
    setStatus("Archive packaged", "The inspect form now points at the new archive and source directory so you can verify drift immediately.", "ok");
  } catch (error) {
    renderResult(packResult, error.message, true);
    setStatus("Packaging failed", error.message, "error");
  } finally {
    setBusy(packButton, false);
  }
});

reviewButton.addEventListener("click", async () => {
  setBusy(reviewButton, true);

  try {
    const result = await api("/api/review", {
      targetDir: skillDirInput.value,
      outputPath: outputPathInput.value || undefined
    });

    if (result.archive) {
      archivePathInput.value = result.archive.destination;
      inspectSourceInput.value = result.skillDir;
    }

    renderResult(reviewResult, formatReviewResult(result), result.readiness === "not-ready");
    setStatus(
      result.readiness === "ready"
        ? "Ready to ship"
        : result.readiness === "ready-with-warnings"
          ? "Ready with warnings"
          : "Not ready",
      result.readiness === "not-ready"
        ? "Resolve the blocking issues in the review output before handing the skill off."
        : "The review output now captures lint, archive, and artifact verification in one place.",
      result.readiness === "not-ready" ? "error" : "ok"
    );
  } catch (error) {
    renderResult(reviewResult, error.message, true);
    setStatus("Review failed", error.message, "error");
  } finally {
    setBusy(reviewButton, false);
  }
});

inspectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = inspectForm.querySelector('button[type="submit"]');
  setBusy(submitButton, true);

  try {
    const result = await api("/api/inspect", {
      archivePath: archivePathInput.value,
      sourceDir: inspectSourceInput.value || undefined
    });
    renderResult(inspectResult, formatInspectResult(result));
    setStatus(
      result.comparison && !result.comparison.matches ? "Artifact drift detected" : "Archive inspected",
      result.comparison
        ? result.comparison.matches
          ? "The packaged artifact matches the selected source skill."
          : "The packaged artifact differs from the selected source skill."
        : "You are looking at the packaged manifest rather than the source directory.",
      result.comparison && !result.comparison.matches ? "error" : "ok"
    );
  } catch (error) {
    renderResult(inspectResult, error.message, true);
    setStatus("Inspect failed", error.message, "error");
  } finally {
    setBusy(submitButton, false);
  }
});

async function api(url, body) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

function formatLintResult(result) {
  const lines = [
    result.summary.errors > 0 ? "BLOCKED" : result.summary.warnings > 0 ? "PACKABLE WITH WARNINGS" : "READY TO PACKAGE",
    "",
    "Directory: " + result.skillDir,
    "Files checked: " + result.fileCount,
    "Summary: " + result.summary.errors + " error(s), " + result.summary.warnings + " warning(s)"
  ];

  if (result.focusAreas.length) {
    lines.push("", "Focus areas:");
    for (const area of result.focusAreas) {
      lines.push("- " + area.label + ": " + area.errors + " error(s), " + area.warnings + " warning(s)");
    }
  }

  if (result.issues.length) {
    lines.push("", "Issues:");
    for (const issue of result.issues) {
      lines.push("- " + issue.level.toUpperCase() + " [" + issue.code + "] " + issue.message);
      if (issue.suggestion) {
        lines.push("  Fix: " + issue.suggestion);
      }
    }
  }

  if (result.nextSteps.length) {
    lines.push("", "Next steps:");
    result.nextSteps.forEach((step, index) => lines.push((index + 1) + ". " + step));
  }

  if (result.ok && result.summary.warnings === 0) {
    lines.push("", "Confidence:", "No blocking issues or warnings were found.");
  }

  return lines.join("\n");
}

function formatPackResult(result) {
  const lines = [
    "PACKAGED SUCCESSFULLY",
    "",
    "Archive ready: " + result.archivePath,
    "Size: " + result.archiveSizeLabel,
    "Manifest schema: v" + result.manifest.schemaVersion,
    "Skill: " + result.manifest.skill.name + "@" + result.manifest.skill.version,
    "Entries: " + result.manifest.entryCount,
    "Confidence: embedded manifest written into the archive for later inspection."
  ];

  if (result.warnings.length) {
    lines.push("", "Warnings:");
    for (const warning of result.warnings) {
      lines.push("- " + warning.message);
    }
  }

  lines.push("", "Contents:");
  for (const entry of result.manifest.entries) {
    lines.push("- " + entry.path + " (" + entry.size + " B, sha256 " + (entry.sha256 ? entry.sha256.slice(0, 12) : "n/a") + "...)");
  }

  lines.push("", "Next steps:");
  lines.push("1. Inspect the artifact: openclaw-skillkit inspect " + result.archivePath);
  lines.push("2. Check source parity: openclaw-skillkit inspect " + result.archivePath + " --source ./path-to-skill");
  lines.push("", "Release report:");
  lines.push(result.reportMarkdown);

  return lines.join("\n");
}

function formatInspectResult(result) {
  const manifest = result.manifest;
  const lines = [
    result.comparison ? result.comparison.matches ? "ARCHIVE MATCHES SOURCE" : "DRIFT DETECTED" : "ARCHIVE VERIFIED",
    "",
    "Archive: " + result.archivePath,
    "Manifest schema: v" + manifest.schemaVersion,
    "Skill: " + manifest.skill.name + "@" + manifest.skill.version,
    "Description: " + manifest.skill.description,
    "Packaged at: " + manifest.packagedAt,
    "Entries: " + manifest.entryCount,
    ""
  ];

  for (const entry of manifest.entries) {
    lines.push("- " + entry.path + " (" + entry.size + " B, sha256 " + (entry.sha256 ? entry.sha256.slice(0, 12) : "n/a") + "...)");
  }

  if (result.comparison) {
    lines.push(
      "",
      "Source comparison",
      "Source: " + result.comparison.sourceDir,
      "Status: " + (result.comparison.matches ? "matches source" : "drift detected"),
      "Matched entries: " + result.comparison.matchedEntries + "/" + result.comparison.entryCount
    );

    if (result.comparison.metadataDifferences.length) {
      lines.push("", "Metadata drift:");
      for (const difference of result.comparison.metadataDifferences) {
        lines.push("- " + difference.field + ': archive="' + difference.archiveValue + '" source="' + difference.sourceValue + '"');
      }
    }

    if (result.comparison.changedEntries.length) {
      lines.push("", "Changed files:");
      for (const entry of result.comparison.changedEntries) {
        lines.push("- " + entry.path + " (" + entry.reason + ")");
      }
    }

    if (result.comparison.missingFromSource.length) {
      lines.push("", "Missing from source:");
      for (const entry of result.comparison.missingFromSource) {
        lines.push("- " + entry);
      }
    }

    if (result.comparison.extraSourceEntries.length) {
      lines.push("", "New in source:");
      for (const entry of result.comparison.extraSourceEntries) {
        lines.push("- " + entry);
      }
    }
  }

  if (!result.comparison) {
    lines.push("", "Next step:", "openclaw-skillkit inspect " + result.archivePath + " --source ./path-to-skill");
  }

  lines.push("", "Release report:");
  lines.push(result.reportMarkdown);

  return lines.join("\n");
}

function formatReviewResult(result) {
  const lines = [
    "Release readiness review",
    "",
    "Directory: " + result.skillDir,
    "Verdict: " + formatReadiness(result.readiness),
    "Lint summary: " + result.lint.summary.errors + " error(s), " + result.lint.summary.warnings + " warning(s)",
    "Files checked: " + result.lint.fileCount,
    "Confidence: " + formatReviewConfidence(result)
  ];

  if (result.lint.focusAreas.length) {
    lines.push("", "Focus areas:");
    for (const area of result.lint.focusAreas) {
      lines.push("- " + area.label + ": " + area.errors + " error(s), " + area.warnings + " warning(s)");
    }
  }

  if (result.archive) {
    lines.push(
      "",
      "Archive",
      "Archive ready: " + result.archive.destination,
      "Size: " + result.archive.archiveSizeLabel,
      "Artifact check: " + (result.archive.comparison.matches ? "matches source" : "drift detected"),
      "Matched entries: " + result.archive.comparison.matchedEntries + "/" + result.archive.comparison.entryCount
    );
  } else {
    lines.push("", "Archive", "Archive not created because blocking lint errors remain.");
  }

  if (result.lint.issues.length) {
    lines.push("", "Issues:");
    for (const issue of result.lint.issues) {
      lines.push("- " + issue.level.toUpperCase() + " [" + issue.code + "] " + issue.message);
      if (issue.suggestion) {
        lines.push("  Fix: " + issue.suggestion);
      }
    }
  }

  if (result.lint.nextSteps.length) {
    lines.push("", "Next steps:");
    result.lint.nextSteps.forEach((step, index) => lines.push((index + 1) + ". " + step));
  }

  lines.push("", "Review report:");
  lines.push(result.reportMarkdown);

  return lines.join("\n");
}

function renderResult(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle("status-error", Boolean(isError));
  element.classList.toggle("status-ok", !isError);
  element.classList.remove("muted");
}

function setStatus(title, body, tone) {
  statusTitle.textContent = title;
  statusBody.textContent = body;
  statusBody.classList.toggle("status-error", tone === "error");
}

function setBusy(button, isBusy) {
  button.disabled = isBusy;
  if (button.dataset.label === undefined) {
    button.dataset.label = button.textContent;
  }

  button.textContent = isBusy ? "Working..." : button.dataset.label;
}

function setResourceSelections(resources) {
  for (const input of initForm.querySelectorAll('input[name="resources"]')) {
    input.checked = resources.includes(input.value);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatList(values, emptyLabel) {
  return values.length ? values.join(", ") : emptyLabel;
}

function formatReadiness(readiness) {
  if (readiness === "ready") {
    return "ready to ship";
  }

  if (readiness === "ready-with-warnings") {
    return "ready with warnings";
  }

  return "not ready";
}

function formatReviewConfidence(result) {
  if (result.readiness === "ready") {
    return "lint passed cleanly, the archive was created, and the artifact matches the source.";
  }

  if (result.readiness === "ready-with-warnings") {
    return "the skill can ship, but warnings still deserve a final pass.";
  }

  if (result.archive && result.archive.comparison && !result.archive.comparison.matches) {
    return "the packaged artifact differs from the current source.";
  }

  return "blocking issues remain, so the skill is not ready to hand off.";
}
`;
