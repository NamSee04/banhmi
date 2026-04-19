# Guide: Building a Skill for OpenClaw

This guide walks through creating a custom OpenClaw skill from scratch, using the `promql-query` skill as a worked example.

---

## 1. What Is a Skill?

A skill is a folder containing a `SKILL.md` file that teaches the OpenClaw agent how and when to use a tool. It follows the [AgentSkills](https://agentskills.io/) spec: YAML frontmatter for metadata, markdown body for instructions.

```
skills/
└── promql-query/
    ├── SKILL.md              # Required — frontmatter + instructions
    └── references/
        └── vm-extensions.md  # Optional — supporting docs
```

---

## 2. Where Skills Live (Precedence)

OpenClaw loads skills from multiple locations. Higher = wins on name conflict:

| Location | Precedence | Scope |
|----------|------------|-------|
| `<workspace>/skills/` | Highest | Per-agent |
| `<workspace>/.agents/skills/` | High | Per-workspace agent |
| `~/.agents/skills/` | Medium | Personal agent profile |
| `~/.openclaw/skills/` | Medium | Shared (all agents) |
| Bundled (shipped with OpenClaw) | Low | Global |
| `skills.load.extraDirs` | Lowest | Custom shared folders |

For local development, use `<workspace>/skills/`. For machine-wide sharing, use `~/.openclaw/skills/`.

---

## 3. Write the SKILL.md

### 3.1 Frontmatter (Required)

At minimum you need `name` and `description`:

```yaml
---
name: promql-query
description: Query VictoriaMetrics using PromQL. Use when the user asks about metrics, alerts, CPU, memory, disk, network, or any infrastructure monitoring data.
---
```

### 3.2 Optional Frontmatter Keys

| Key | Default | Purpose |
|-----|---------|---------|
| `metadata` | — | JSON object for gating, installer specs, etc. |
| `user-invocable` | `true` | Expose as a slash command (`/promql-query`) |
| `disable-model-invocation` | `false` | Exclude from model prompt (still available via `/slash`) |
| `command-dispatch` | — | Set to `tool` to bypass the model and call a tool directly |
| `command-tool` | — | Tool name for `command-dispatch: tool` |
| `homepage` | — | URL shown in the macOS Skills UI |

### 3.3 Metadata Gating

Use `metadata` to gate when the skill is eligible:

```yaml
---
name: promql-query
description: Query VictoriaMetrics using PromQL...
metadata: { "openclaw": { "requires": { "bins": ["curl"] } } }
---
```

Available gates under `metadata.openclaw`:

| Gate | Type | Meaning |
|------|------|---------|
| `always` | `true` | Always include, skip other gates |
| `os` | `["darwin", "linux", "win32"]` | Only eligible on listed OS |
| `requires.bins` | `["curl", "jq"]` | All must exist on PATH |
| `requires.anyBins` | `["curl", "wget"]` | At least one must exist |
| `requires.env` | `["VM_USER"]` | Env vars must exist |
| `requires.config` | `["browser.enabled"]` | Config keys must be truthy |

### 3.4 Markdown Body (Instructions)

The body is free-form markdown. Write it as instructions for the AI agent — what endpoints to hit, what commands to run, what formats to use.

Tips:
- Be concise and direct — the agent reads this as part of its system prompt
- Use code blocks for exact commands the agent should run
- Use `{baseDir}` to reference files relative to the skill folder
- Include a table of common queries/commands for quick lookup
- Include all relevant API patterns (the agent can't guess endpoints)

Example (excerpt from `promql-query`):

```markdown
## Querying

### Instant query
\```bash
curl -sk -u "$VM_USER:$VM_PASS" \
  'https://10.10.0.2:8427/api/v1/query?query=<PROMQL>'
\```

### Range query
\```bash
curl -sk -u "$VM_USER:$VM_PASS" \
  'https://10.10.0.2:8427/api/v1/query_range?query=<PROMQL>&start=<START>&end=<END>&step=<STEP>'
\```
```

---

## 4. Configure Credentials in `openclaw.json`

**Never hardcode secrets in `SKILL.md`** — they end up in the model prompt and logs.

Use environment variable injection via `skills.entries` in `~/.openclaw/openclaw.json`:

```jsonc
{
  "skills": {
    "entries": {
      "promql-query": {
        "enabled": true,
        "env": {
          "VM_USER": "namsee",
          "VM_PASS": "your-password-here"
        }
      }
    }
  }
}
```

OpenClaw injects these env vars at the start of each agent run and cleans them up after. Your `SKILL.md` references them as `$VM_USER` / `$VM_PASS` in curl commands.

---

## 5. Deploy the Skill

Copy or symlink the skill folder into one of the skill locations:

```bash
# Option A: Workspace-level (highest precedence, per-agent)
cp -r docs/skills/promql-query <workspace>/skills/promql-query

# Option B: Machine-wide (shared across all agents)
cp -r docs/skills/promql-query ~/.openclaw/skills/promql-query
```

---

## 6. Load and Verify

OpenClaw snapshots skills at session start. After deploying, reload:

```bash
# Start a new session in chat
/new

# Or restart the gateway
openclaw gateway restart
```

Verify the skill is loaded:

```bash
openclaw skills list
```

You should see `promql-query` in the output.

---

## 7. Test

Send a message that should trigger the skill:

```bash
openclaw agent --message "show me current CPU usage across all hosts"
```

Or just chat with the agent:

> "Are there any firing alerts right now?"

The agent should use the curl commands from your skill to query VictoriaMetrics and return the results.

---

## 8. Multi-Agent Setup

In multi-agent setups, each agent has its own workspace. Use agent allowlists to control which agents can use the skill:

```jsonc
{
  "agents": {
    "defaults": {
      "skills": ["promql-query", "github"]
    },
    "list": [
      { "id": "infra-bot" },                         // inherits promql-query, github
      { "id": "code-reviewer", "skills": ["github"] } // only github, no promql-query
    ]
  }
}
```

---

## 9. Token Impact

Each skill adds to the system prompt. The cost per skill is roughly:

```
97 chars + len(name) + len(description) + len(location)
```

Plus a one-time 195-char overhead when ≥1 skill is active. Keep descriptions short.

---

## Quick Reference: File Structure

```
<workspace>/skills/promql-query/
├── SKILL.md                         # The skill definition
└── references/
    └── vm-extensions.md             # Referenced via {baseDir}/references/vm-extensions.md
```

## Quick Reference: Minimal SKILL.md Template

```markdown
---
name: my-skill
description: One-line description of what this skill does and when to use it.
metadata: { "openclaw": { "requires": { "bins": ["some-binary"] } } }
---

# My Skill

Instructions for the agent go here.
Use code blocks for commands the agent should run.
Use tables for quick-reference lookups.
Reference files in the skill folder with `{baseDir}/path/to/file`.
```

---

## Further Reading

- [Skills reference](https://docs.openclaw.ai/tools/skills) — loading, precedence, gating
- [Creating Skills](https://docs.openclaw.ai/tools/creating-skills) — official guide
- [Skills Config](https://docs.openclaw.ai/tools/skills-config) — `skills.*` config schema
- [ClawHub](https://clawhub.ai/) — public skill registry
