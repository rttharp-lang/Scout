-- LOCAL data contract. SQLite (node:sqlite). Every research entity carries a
-- workspace_id so demo fixtures and live research never mix, plus JSON `data`
-- for the long tail of fields defined in the evidence/taxonomy contracts.

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'live', -- live | demo
  settings TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  password_hash TEXT NOT NULL, is_platform_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memberships (
  workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, -- admin | editor | viewer
  created_at TEXT NOT NULL, PRIMARY KEY (workspace_id, user_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leagues (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, short TEXT NOT NULL, calendar TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY, league_id TEXT NOT NULL, name TEXT NOT NULL, nickname TEXT NOT NULL,
  city TEXT NOT NULL, market TEXT NOT NULL, region TEXT, conference TEXT, arena TEXT, tz TEXT NOT NULL,
  colors TEXT NOT NULL DEFAULT '[]', first_season INTEGER, status TEXT NOT NULL DEFAULT 'active',
  history TEXT NOT NULL DEFAULT '[]', registry TEXT NOT NULL DEFAULT '{}', -- verification, sources, notes
  search_terms TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS seasons (
  id TEXT PRIMARY KEY, league_id TEXT NOT NULL, label TEXT NOT NULL, kind TEXT NOT NULL, -- competition | research | product
  starts_on TEXT, ends_on TEXT, milestones TEXT NOT NULL DEFAULT '[]', notes TEXT
);
CREATE TABLE IF NOT EXISTS team_state (
  workspace_id TEXT NOT NULL, team_id TEXT NOT NULL, owner_user_id TEXT, saved_by TEXT NOT NULL DEFAULT '[]',
  last_reviewed_at TEXT, coverage TEXT NOT NULL DEFAULT '{}', PRIMARY KEY (workspace_id, team_id)
);

-- Sources are the retrieved artifacts; evidence rows are claim-level excerpts within them.
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, team_id TEXT, url TEXT, locator TEXT, title TEXT,
  source_type TEXT NOT NULL, origin TEXT NOT NULL DEFAULT 'unknown', -- fan | team | paid | independent | league | internal | unknown
  publisher TEXT, author TEXT, published_at TEXT, event_at TEXT, retrieved_at TEXT, tz TEXT,
  language TEXT, family_id TEXT, content_hash TEXT, is_duplicate INTEGER NOT NULL DEFAULT 0,
  access TEXT NOT NULL DEFAULT '{}', retention TEXT NOT NULL DEFAULT '{}', connector_id TEXT,
  confidential INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sources_ws_team ON sources(workspace_id, team_id);
CREATE INDEX IF NOT EXISTS idx_sources_hash ON sources(workspace_id, content_hash);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, team_id TEXT, source_id TEXT NOT NULL,
  excerpt TEXT NOT NULL, position TEXT, place TEXT, topic TEXT, language TEXT,
  local_relevance_reason TEXT, geo_relevance TEXT NOT NULL DEFAULT 'unknown', -- verified | contextual | unknown
  evidence_mode TEXT NOT NULL DEFAULT 'interpretation', -- behavior | testimony | interpretation
  engagement TEXT, taxonomy_version INTEGER, community_id TEXT, validation_status TEXT NOT NULL DEFAULT 'unvalidated',
  alternatives TEXT NOT NULL DEFAULT '[]', confidential INTEGER NOT NULL DEFAULT 0,
  run_id TEXT, task_id TEXT, data TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_ws_team ON evidence(workspace_id, team_id);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, team_id TEXT NOT NULL, statement TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'hypothesis', -- observed | interpretation | hypothesis | proposal
  confidence TEXT NOT NULL DEFAULT 'low', confidence_rationale TEXT NOT NULL DEFAULT '{}',
  review_state TEXT NOT NULL DEFAULT 'draft', -- draft | needs_validation | validated | approved_for_brief | archived
  headline TEXT, section TEXT, prominence INTEGER NOT NULL DEFAULT 1, alternatives TEXT NOT NULL DEFAULT '[]',
  disconfirming TEXT, taxonomy_version INTEGER, run_id TEXT, version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT, data TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_claims_ws_team ON claims(workspace_id, team_id);

CREATE TABLE IF NOT EXISTS claim_evidence (
  claim_id TEXT NOT NULL, evidence_id TEXT NOT NULL, stance TEXT NOT NULL, -- supports | contradicts | context
  explanation TEXT, PRIMARY KEY (claim_id, evidence_id)
);

-- Generic typed entities that share the same envelope (workspace, team, status, version, data).
-- entity_type in: fan_community, moment, metric_observation, opportunity, brief_version, comment,
-- decision, fan_profile, motivation_hypothesis, growth_hypothesis, outcome_definition,
-- validation_study, research_response, upload, milestone, saved_view, notification, media
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, workspace_id TEXT NOT NULL, team_id TEXT,
  title TEXT, status TEXT NOT NULL DEFAULT 'draft', parent_id TEXT, version INTEGER NOT NULL DEFAULT 1,
  taxonomy_version INTEGER, confidential INTEGER NOT NULL DEFAULT 0, created_by TEXT,
  run_id TEXT, starts_at TEXT, ends_at TEXT, data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(workspace_id, entity_type, team_id);
CREATE INDEX IF NOT EXISTS idx_entities_parent ON entities(parent_id);

-- Many-to-many links between any records (taxonomy nodes, claims, evidence, entities).
CREATE TABLE IF NOT EXISTS links (
  from_type TEXT NOT NULL, from_id TEXT NOT NULL, to_type TEXT NOT NULL, to_id TEXT NOT NULL,
  relation TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL,
  PRIMARY KEY (from_type, from_id, to_type, to_id, relation)
);
CREATE INDEX IF NOT EXISTS idx_links_to ON links(to_type, to_id);

-- Taxonomy with versions and migration mappings.
CREATE TABLE IF NOT EXISTS taxonomy_versions (
  version INTEGER PRIMARY KEY, workspace_id TEXT, note TEXT, created_by TEXT, created_at TEXT NOT NULL,
  migrations TEXT NOT NULL DEFAULT '[]' -- [{from, to, kind: renamed|merged|split}]
);
CREATE TABLE IF NOT EXISTS taxonomy_nodes (
  id TEXT NOT NULL, version INTEGER NOT NULL, layer TEXT NOT NULL, parent_id TEXT, name TEXT NOT NULL,
  definition TEXT NOT NULL, inclusion TEXT NOT NULL DEFAULT '', exclusion TEXT NOT NULL DEFAULT '',
  synonyms TEXT NOT NULL DEFAULT '[]', examples TEXT NOT NULL DEFAULT '[]', counterexamples TEXT NOT NULL DEFAULT '[]',
  evidence_requirements TEXT NOT NULL DEFAULT '', owner TEXT, scope TEXT NOT NULL DEFAULT 'shared', -- shared | team:<id>
  team_id TEXT, status TEXT NOT NULL DEFAULT 'active', PRIMARY KEY (id, version)
);
CREATE TABLE IF NOT EXISTS taxonomy_changes (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, proposed_by TEXT, kind TEXT NOT NULL, -- add | edit | rename | merge | retire
  payload TEXT NOT NULL, rationale TEXT, status TEXT NOT NULL DEFAULT 'proposed', -- proposed | approved | rejected
  reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence_codes (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL,
  node_id TEXT NOT NULL, taxonomy_version INTEGER NOT NULL, coder TEXT NOT NULL, coder_kind TEXT NOT NULL, -- agent | human
  note TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_codes_target ON evidence_codes(target_type, target_id);

-- Research engine
CREATE TABLE IF NOT EXISTS research_runs (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, team_id TEXT NOT NULL, question TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '{}', budget TEXT NOT NULL DEFAULT '{}', spent TEXT NOT NULL DEFAULT '{}',
  state TEXT NOT NULL DEFAULT 'queued', plan TEXT NOT NULL DEFAULT '{}', summary TEXT NOT NULL DEFAULT '{}',
  created_by TEXT, parent_run_id TEXT, model_info TEXT NOT NULL DEFAULT '{}',
  started_at TEXT, finished_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, workspace_id TEXT NOT NULL, team_id TEXT NOT NULL,
  specialist TEXT NOT NULL, question TEXT NOT NULL, phase TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued',
  idempotency_key TEXT NOT NULL UNIQUE, attempt INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3,
  input TEXT NOT NULL DEFAULT '{}', output TEXT NOT NULL DEFAULT '{}', tools_used TEXT NOT NULL DEFAULT '[]',
  sources_found INTEGER NOT NULL DEFAULT 0, unresolved TEXT NOT NULL DEFAULT '[]', error TEXT,
  cost TEXT NOT NULL DEFAULT '{}', lease_until TEXT, started_at TEXT, finished_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_run ON agent_tasks(run_id, state);

CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL, -- connected | limited | credentials_required | unavailable | failed
  detail TEXT, capabilities TEXT NOT NULL DEFAULT '{}', last_checked_at TEXT, last_error TEXT
);
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, team_id TEXT, kind TEXT NOT NULL, -- refresh | watchlist
  frequency_hours INTEGER NOT NULL, config TEXT NOT NULL DEFAULT '{}', enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT, next_run_at TEXT, created_by TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id TEXT, user_id TEXT, action TEXT NOT NULL,
  target_type TEXT, target_id TEXT, detail TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_ws ON audit_events(workspace_id, created_at);
CREATE TABLE IF NOT EXISTS fetch_cache (
  url TEXT PRIMARY KEY, status INTEGER, content_type TEXT, body TEXT, fetched_at TEXT NOT NULL
);
