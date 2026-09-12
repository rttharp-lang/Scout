// Seeding: leagues, seasons, verified team registry, taxonomy v1, bootstrap
// admin, the live workspace, and (optionally) the separately labeled demo
// workspace with synthetic fixtures. Idempotent.
import { getDb, q, one, run, now, uid, J, tx, audit } from "../db.js";
import { LEAGUES, TEAMS, SEASONS } from "./registry.js";
import { TAXONOMY_V1 } from "./taxonomy.js";
import { createUser, findUserByEmail } from "../auth.js";
import { seedDemo } from "./demo/index.js";

export function seedRegistry() {
  tx(() => {
    for (const l of LEAGUES) run("INSERT OR REPLACE INTO leagues(id,name,short,calendar) VALUES(?,?,?,?)", [l.id, l.name, l.short, J(l.calendar)]);
    for (const t of TEAMS) run(`INSERT OR REPLACE INTO teams(id,league_id,name,nickname,city,market,region,conference,arena,tz,colors,first_season,status,history,registry,search_terms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [t.id, t.league_id, t.name, t.nickname, t.city, t.market, t.region, t.conference, t.arena, t.tz, J(t.colors), t.first_season, t.status, J(t.history), J(t.registry), J(t.search_terms)]);
    for (const s of SEASONS) run("INSERT OR REPLACE INTO seasons(id,league_id,label,kind,starts_on,ends_on,milestones,notes) VALUES(?,?,?,?,?,?,?,?)", [s.id, s.league_id, s.label, s.kind, s.starts_on, s.ends_on, J(s.milestones), s.notes]);
  });
}
export function seedTaxonomy() {
  if (one("SELECT version FROM taxonomy_versions WHERE version=1")) return;
  tx(() => {
    run("INSERT INTO taxonomy_versions(version,workspace_id,note,created_by,created_at,migrations) VALUES(1,NULL,'Initial shared first-principles taxonomy','system',?, '[]')", [now()]);
    for (const n of TAXONOMY_V1) run(`INSERT INTO taxonomy_nodes(id,version,layer,parent_id,name,definition,inclusion,exclusion,synonyms,examples,counterexamples,evidence_requirements,owner,scope,team_id,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [n.id, 1, n.layer, n.parent_id, n.name, n.definition, n.inclusion, n.exclusion, J(n.synonyms), J(n.examples), J(n.counterexamples), n.evidence_requirements, n.owner, n.scope, n.team_id, n.status]);
  });
}
export function ensureWorkspace(id, name, kind = "live", settings = {}) {
  if (!one("SELECT id FROM workspaces WHERE id=?", [id])) run("INSERT INTO workspaces(id,name,kind,settings,created_at) VALUES(?,?,?,?,?)", [id, name, kind, J(settings), now()]);
  return one("SELECT * FROM workspaces WHERE id=?", [id]);
}
export function ensureMembership(workspace_id, user_id, role) {
  run("INSERT OR REPLACE INTO memberships(workspace_id,user_id,role,created_at) VALUES(?,?,?,?)", [workspace_id, user_id, role, now()]);
}

export function bootstrap({ demo = process.env.LOCAL_SEED_DEMO !== "false" } = {}) {
  getDb();
  seedRegistry();
  seedTaxonomy();
  const live = ensureWorkspace("ws_live", "Nike NBA & WNBA — LOCAL", "live", { product_milestones: [], source_maps: {} });
  const usersCount = one("SELECT COUNT(*) AS n FROM users").n;
  let admin = null;
  if (usersCount === 0) {
    const email = process.env.LOCAL_ADMIN_EMAIL || "admin@local.dev";
    const password = process.env.LOCAL_ADMIN_PASSWORD || "local-admin";
    admin = createUser({ email, name: "Workspace admin", password, is_platform_admin: 1 });
    ensureMembership(live.id, admin.id, "admin");
    if (!process.env.LOCAL_ADMIN_PASSWORD) console.warn(`[LOCAL] Bootstrapped admin ${email} with the default development password. Set LOCAL_ADMIN_EMAIL / LOCAL_ADMIN_PASSWORD in production.`);
    audit({ workspace_id: live.id, user_id: admin.id, action: "bootstrap.admin", detail: { email } });
  }
  if (demo) seedDemo({ adminId: admin?.id || one("SELECT id FROM users ORDER BY created_at LIMIT 1")?.id });
  return { live };
}
