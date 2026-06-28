// One-off migration: import the Luis Ventura memorial data from the legacy
// LUIS database into the platform DB (netlifydb) as the `luisventura` tenant.
//
// Idempotent: re-running does not duplicate (users upsert by email; tenant,
// messages, and reach graph are only seeded when not already present). No
// deletes. Run:
//   LUIS_URL='<luis conn>' DATABASE_URL='<netlifydb conn>' node lib/db/migrate-luis.mjs
import pg from "pg";

const { Pool } = pg;
const LUIS_URL = process.env.LUIS_URL;
const TARGET_URL = process.env.DATABASE_URL;
if (!LUIS_URL || !TARGET_URL) {
  console.error("LUIS_URL and DATABASE_URL are required");
  process.exit(1);
}

const OWNER_EMAIL = "crivas@cikume.com";
const SLUG = "luisventura";

const pageConfig = {
  version: 1,
  theme: { palette: "warm", accent: "#7a4a1f", font: "serif" },
  hero: { heroPhotoPath: null, showDates: true },
  story: {
    enabled: true,
    blocks: [
      {
        heading: "An extraordinary engineer, a visionary leader, a generous soul.",
        body: "He built the foundations we stand on and lifted everyone around him.",
      },
    ],
  },
  sections: { order: ["story", "wall", "reach"], story: true, wall: true, reach: true },
  reachSummary: [
    { label: "Lives touched", value: "1,200,000" },
    { label: "Years of service", value: "20+" },
    { label: "Wonders visited", value: 7 },
    { label: "Memories", derived: "nodeCount" },
  ],
  cta: { primaryLabel: "Leave a tribute", wallLabel: "Read tributes" },
};

// --- Luis reach graph (ported from the original static reach.ts) ---
const reachNodes = [
  { id: "lcp", label: "LCPtracker — Orange, CA", category: "project", lat: 33.7878, lng: -117.8531, note: "117 E Chapman Ave, Orange, CA 92866 — the platform Luis architected, used by hundreds of thousands." },
  { id: "cikume", label: "Cikume — San Salvador", category: "project", lat: 13.6929, lng: -89.2406, note: "Insigne Building, Av. Las Magnolias, San Salvador 1101 — the company Luis founded; 70+ people carrying his vision forward." },
  { id: "p-schools", label: "Public Schools", category: "project" },
  { id: "p-transit", label: "Transit & Rail", category: "project" },
  { id: "p-highways", label: "Highways & Bridges", category: "project" },
  { id: "p-housing", label: "Affordable Housing", category: "project" },
  { id: "p-water", label: "Water & Utilities", category: "project" },
  { id: "p-hospitals", label: "Hospitals", category: "project" },
  { id: "p-airports", label: "Airports", category: "project" },
  { id: "p-parks", label: "Parks & Civic Spaces", category: "project" },
  { id: "c-la", label: "Los Angeles, CA", category: "city", lat: 34.0522, lng: -118.2437 },
  { id: "c-sf", label: "San Francisco, CA", category: "city", lat: 37.7749, lng: -122.4194 },
  { id: "c-sd", label: "San Diego, CA", category: "city", lat: 32.7157, lng: -117.1611 },
  { id: "c-sac", label: "Sacramento, CA", category: "city", lat: 38.5816, lng: -121.4944 },
  { id: "c-nyc", label: "New York, NY", category: "city", lat: 40.7128, lng: -74.006 },
  { id: "c-chi", label: "Chicago, IL", category: "city", lat: 41.8781, lng: -87.6298 },
  { id: "c-hou", label: "Houston, TX", category: "city", lat: 29.7604, lng: -95.3698 },
  { id: "c-dal", label: "Dallas, TX", category: "city", lat: 32.7767, lng: -96.797 },
  { id: "c-phx", label: "Phoenix, AZ", category: "city", lat: 33.4484, lng: -112.074 },
  { id: "c-sea", label: "Seattle, WA", category: "city", lat: 47.6062, lng: -122.3321 },
  { id: "c-den", label: "Denver, CO", category: "city", lat: 39.7392, lng: -104.9903 },
  { id: "c-atl", label: "Atlanta, GA", category: "city", lat: 33.749, lng: -84.388 },
  { id: "c-mia", label: "Miami, FL", category: "city", lat: 25.7617, lng: -80.1918 },
  { id: "c-bos", label: "Boston, MA", category: "city", lat: 42.3601, lng: -71.0589 },
  { id: "c-dc", label: "Washington, DC", category: "city", lat: 38.9072, lng: -77.0369 },
  { id: "c-por", label: "Portland, OR", category: "city", lat: 45.5152, lng: -122.6784 },
  { id: "c-min", label: "Minneapolis, MN", category: "city", lat: 44.9778, lng: -93.265 },
  { id: "c-nas", label: "Nashville, TN", category: "city", lat: 36.1627, lng: -86.7816 },
  { id: "c-aus", label: "Austin, TX", category: "city", lat: 30.2672, lng: -97.7431 },
  { id: "c-slc", label: "Salt Lake City, UT", category: "city", lat: 40.7608, lng: -111.891 },
  { id: "c-okc", label: "Oklahoma City, OK", category: "city", lat: 35.4676, lng: -97.5164 },
  { id: "c-cle", label: "Cleveland, OH", category: "city", lat: 41.4993, lng: -81.6944 },
  { id: "c-phi", label: "Philadelphia, PA", category: "city", lat: 39.9526, lng: -75.1652 },
  { id: "c-det", label: "Detroit, MI", category: "city", lat: 42.3314, lng: -83.0458 },
  { id: "a-dot", label: "State Departments of Transportation", category: "agency" },
  { id: "a-public-works", label: "City & County Public Works", category: "agency" },
  { id: "a-housing", label: "Housing Authorities", category: "agency" },
  { id: "a-schools", label: "School Districts", category: "agency" },
  { id: "a-water", label: "Water & Power Districts", category: "agency" },
  { id: "co-workers", label: "Construction Workers", category: "community", note: "Every craftsperson whose hours and pay flow through the platform." },
  { id: "co-families", label: "Families", category: "community", note: "Households supported by paychecks the platform helps protect." },
  { id: "co-team-lcp", label: "LCPtracker Team", category: "team" },
  { id: "co-team-cikume", label: "Cikume Team", category: "team" },
  { id: "w-greatwall", label: "Great Wall of China", category: "wonder", lat: 40.4319, lng: 116.5704, note: "Walked the ramparts at dawn." },
  { id: "w-petra", label: "Petra, Jordan", category: "wonder", lat: 30.3285, lng: 35.4444, note: "Through the Siq to Al-Khazneh." },
  { id: "w-christ", label: "Christ the Redeemer, Rio", category: "wonder", lat: -22.9519, lng: -43.2105, note: "Above Rio with arms wide open." },
  { id: "w-machu", label: "Machu Picchu, Peru", category: "wonder", lat: -13.1631, lng: -72.545, note: "Cloud forest and Inca stonework." },
  { id: "w-chichen", label: "Chichén Itzá, Mexico", category: "wonder", lat: 20.6843, lng: -88.5678, note: "El Castillo on the spring equinox." },
  { id: "w-colosseum", label: "Roman Colosseum, Italy", category: "wonder", lat: 41.8902, lng: 12.4922, note: "Two thousand years of stone." },
  { id: "w-taj", label: "Taj Mahal, India", category: "wonder", lat: 27.1751, lng: 78.0421, note: "Marble glowing at sunrise." },
];

function buildReachEdges() {
  const edges = [];
  const link = (a, b) => edges.push([a, b]);
  const projectTypes = ["p-schools", "p-transit", "p-highways", "p-housing", "p-water", "p-hospitals", "p-airports", "p-parks"];
  const cities = reachNodes.filter((n) => n.category === "city").map((n) => n.id);
  const agencies = ["a-dot", "a-public-works", "a-housing", "a-schools", "a-water"];
  for (const pt of projectTypes) link("lcp", pt);
  for (const a of agencies) link("lcp", a);
  link("lcp", "co-team-lcp");
  link("cikume", "co-team-cikume");
  link("lcp", "cikume");
  link("a-dot", "p-highways");
  link("a-dot", "p-transit");
  link("a-public-works", "p-water");
  link("a-public-works", "p-parks");
  link("a-public-works", "p-airports");
  link("a-housing", "p-housing");
  link("a-schools", "p-schools");
  link("a-water", "p-water");
  cities.forEach((c, i) => {
    link(projectTypes[i % projectTypes.length], c);
    link(projectTypes[(i * 3 + 2) % projectTypes.length], c);
    link(agencies[i % agencies.length], c);
  });
  link("co-workers", "lcp");
  link("co-families", "co-workers");
  for (const pt of projectTypes) link("co-workers", pt);
  const wonders = ["w-greatwall", "w-petra", "w-christ", "w-machu", "w-chichen", "w-colosseum", "w-taj"];
  for (let i = 0; i < wonders.length; i++) link(wonders[i], wonders[(i + 1) % wonders.length]);
  return edges;
}

async function main() {
  const src = new Pool({ connectionString: LUIS_URL });
  const tgt = new Pool({ connectionString: TARGET_URL });
  try {
    // 1) Users: upsert by email, preserving role + created_at.
    const luisUsers = (await src.query("select id, email, name, role, created_at from users")).rows;
    const emailToTargetId = new Map();
    const luisIdToEmail = new Map();
    for (const u of luisUsers) {
      luisIdToEmail.set(u.id, u.email);
      await tgt.query(
        `insert into users (email, name, role, created_at) values ($1,$2,$3,$4)
         on conflict (email) do nothing`,
        [u.email, u.name, u.role ?? "user", u.created_at],
      );
    }
    for (const u of luisUsers) {
      const r = await tgt.query("select id from users where email=$1", [u.email]);
      if (r.rows[0]) emailToTargetId.set(u.email, r.rows[0].id);
    }
    const ownerId = emailToTargetId.get(OWNER_EMAIL);
    if (!ownerId) throw new Error(`Owner ${OWNER_EMAIL} not found among migrated users`);
    console.log(`users: migrated ${luisUsers.length} (owner id=${ownerId})`);

    // 2) Tenant (create if missing).
    let t = await tgt.query("select id from tenants where slug=$1", [SLUG]);
    let tenantId;
    if (t.rows[0]) {
      tenantId = t.rows[0].id;
      console.log(`tenant: exists (id=${tenantId})`);
    } else {
      const ins = await tgt.query(
        `insert into tenants (slug, friend_name, birth_year, death_year, tagline, owner_user_id, status, page_config)
         values ($1,$2,$3,$4,$5,$6,'active',$7) returning id`,
        [SLUG, "Luis Ventura", 1965, 2026,
         "An extraordinary engineer, a visionary leader, and a generous soul.",
         ownerId, JSON.stringify(pageConfig)],
      );
      tenantId = ins.rows[0].id;
      console.log(`tenant: created (id=${tenantId})`);
    }

    // 3) Messages (only if none yet for this tenant).
    const existingMsgs = (await tgt.query("select count(*)::int n from messages where tenant_id=$1", [tenantId])).rows[0].n;
    if (existingMsgs === 0) {
      const msgs = (await src.query(
        "select user_id, type, body, author_name, relationship, location, video_path, photo_path, card, created_at from messages order by id",
      )).rows;
      for (const m of msgs) {
        const email = m.user_id != null ? luisIdToEmail.get(m.user_id) : null;
        const targetUserId = email ? emailToTargetId.get(email) ?? null : null;
        await tgt.query(
          `insert into messages (tenant_id, user_id, type, body, url, author_name, relationship, location, video_path, photo_path, node_id, card, created_at)
           values ($1,$2,$3,$4,null,$5,$6,$7,$8,$9,null,$10,$11)`,
          [tenantId, targetUserId, m.type, m.body, m.author_name, m.relationship, m.location,
           m.video_path, m.photo_path, m.card, m.created_at],
        );
      }
      console.log(`messages: imported ${msgs.length}`);
    } else {
      console.log(`messages: skipped (${existingMsgs} already present)`);
    }

    // 4) Reach graph (only if none yet for this tenant).
    const existingNodes = (await tgt.query("select count(*)::int n from reach_nodes where tenant_id=$1", [tenantId])).rows[0].n;
    if (existingNodes === 0) {
      const anchor = await tgt.query(
        `insert into reach_nodes (tenant_id, label, category, is_anchor, created_by_user_id)
         values ($1,'Luis Ventura','person',true,$2) returning id`,
        [tenantId, ownerId],
      );
      const anchorId = anchor.rows[0].id;
      const idMap = new Map();
      for (const n of reachNodes) {
        const r = await tgt.query(
          `insert into reach_nodes (tenant_id, label, category, lat, lng, note, is_anchor, created_by_user_id)
           values ($1,$2,$3,$4,$5,$6,false,$7) returning id`,
          [tenantId, n.label, n.category, n.lat ?? null, n.lng ?? null, n.note ?? null, ownerId],
        );
        idMap.set(n.id, r.rows[0].id);
      }
      let edgeCount = 0;
      const addEdge = async (sId, tId) => {
        if (sId == null || tId == null) return;
        await tgt.query(
          `insert into reach_edges (tenant_id, source_node_id, target_node_id, created_by_user_id)
           values ($1,$2,$3,$4) on conflict do nothing`,
          [tenantId, sId, tId, ownerId],
        );
        edgeCount++;
      };
      // anchor connects to the two cornerstone nodes
      await addEdge(anchorId, idMap.get("lcp"));
      await addEdge(anchorId, idMap.get("cikume"));
      for (const [a, b] of buildReachEdges()) {
        await addEdge(idMap.get(a), idMap.get(b));
      }
      console.log(`reach: ${reachNodes.length + 1} nodes, ${edgeCount} edges`);
    } else {
      console.log(`reach: skipped (${existingNodes} nodes already present)`);
    }

    console.log("DONE");
  } finally {
    await src.end();
    await tgt.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
