import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

// A curated, humble representation of the breadth of work Luis Ventura's code
// helped support — public agencies, projects, and the cities they served.
// Names are illustrative of the kind of public works that LCPtracker Pro tracks
// across the United States; not a claim of an exhaustive client list.
const nodes = [
  // Anchor
  { id: "lcp", label: "LCPtracker — Orange, CA", category: "project", weight: 6, lat: 33.7878, lng: -117.8531, note: "117 E Chapman Ave, Orange, CA 92866 — the platform Luis architected, used by hundreds of thousands." },
  { id: "cikume", label: "Cikume — San Salvador", category: "project", weight: 5, lat: 13.6929, lng: -89.2406, note: "Insigne Building, Av. Las Magnolias, San Salvador 1101 — the company Luis founded; 70+ people carrying his vision forward." },

  // Project types tracked through the platform
  { id: "p-schools", label: "Public Schools", category: "project", weight: 4 },
  { id: "p-transit", label: "Transit & Rail", category: "project", weight: 4 },
  { id: "p-highways", label: "Highways & Bridges", category: "project", weight: 4 },
  { id: "p-housing", label: "Affordable Housing", category: "project", weight: 4 },
  { id: "p-water", label: "Water & Utilities", category: "project", weight: 3 },
  { id: "p-hospitals", label: "Hospitals", category: "project", weight: 3 },
  { id: "p-airports", label: "Airports", category: "project", weight: 3 },
  { id: "p-parks", label: "Parks & Civic Spaces", category: "project", weight: 3 },

  // Communities & cities (illustrative spread across the US)
  { id: "c-la", label: "Los Angeles, CA", category: "city", weight: 4, lat: 34.0522, lng: -118.2437 },
  { id: "c-sf", label: "San Francisco, CA", category: "city", weight: 3, lat: 37.7749, lng: -122.4194 },
  { id: "c-sd", label: "San Diego, CA", category: "city", weight: 3, lat: 32.7157, lng: -117.1611 },
  { id: "c-sac", label: "Sacramento, CA", category: "city", weight: 3, lat: 38.5816, lng: -121.4944 },
  { id: "c-nyc", label: "New York, NY", category: "city", weight: 4, lat: 40.7128, lng: -74.006 },
  { id: "c-chi", label: "Chicago, IL", category: "city", weight: 3, lat: 41.8781, lng: -87.6298 },
  { id: "c-hou", label: "Houston, TX", category: "city", weight: 3, lat: 29.7604, lng: -95.3698 },
  { id: "c-dal", label: "Dallas, TX", category: "city", weight: 3, lat: 32.7767, lng: -96.797 },
  { id: "c-phx", label: "Phoenix, AZ", category: "city", weight: 3, lat: 33.4484, lng: -112.074 },
  { id: "c-sea", label: "Seattle, WA", category: "city", weight: 3, lat: 47.6062, lng: -122.3321 },
  { id: "c-den", label: "Denver, CO", category: "city", weight: 3, lat: 39.7392, lng: -104.9903 },
  { id: "c-atl", label: "Atlanta, GA", category: "city", weight: 3, lat: 33.749, lng: -84.388 },
  { id: "c-mia", label: "Miami, FL", category: "city", weight: 3, lat: 25.7617, lng: -80.1918 },
  { id: "c-bos", label: "Boston, MA", category: "city", weight: 3, lat: 42.3601, lng: -71.0589 },
  { id: "c-dc", label: "Washington, DC", category: "city", weight: 3, lat: 38.9072, lng: -77.0369 },
  { id: "c-por", label: "Portland, OR", category: "city", weight: 2, lat: 45.5152, lng: -122.6784 },
  { id: "c-min", label: "Minneapolis, MN", category: "city", weight: 2, lat: 44.9778, lng: -93.265 },
  { id: "c-nas", label: "Nashville, TN", category: "city", weight: 2, lat: 36.1627, lng: -86.7816 },
  { id: "c-aus", label: "Austin, TX", category: "city", weight: 2, lat: 30.2672, lng: -97.7431 },
  { id: "c-slc", label: "Salt Lake City, UT", category: "city", weight: 2, lat: 40.7608, lng: -111.891 },
  { id: "c-okc", label: "Oklahoma City, OK", category: "city", weight: 2, lat: 35.4676, lng: -97.5164 },
  { id: "c-cle", label: "Cleveland, OH", category: "city", weight: 2, lat: 41.4993, lng: -81.6944 },
  { id: "c-phi", label: "Philadelphia, PA", category: "city", weight: 2, lat: 39.9526, lng: -75.1652 },
  { id: "c-det", label: "Detroit, MI", category: "city", weight: 2, lat: 42.3314, lng: -83.0458 },

  // Agencies (illustrative public-works classes)
  { id: "a-dot", label: "State Departments of Transportation", category: "agency", weight: 5 },
  { id: "a-public-works", label: "City & County Public Works", category: "agency", weight: 5 },
  { id: "a-housing", label: "Housing Authorities", category: "agency", weight: 4 },
  { id: "a-schools", label: "School Districts", category: "agency", weight: 4 },
  { id: "a-water", label: "Water & Power Districts", category: "agency", weight: 3 },

  // Communities
  { id: "co-workers", label: "Construction Workers", category: "community", weight: 6, note: "Every craftsperson whose hours and pay flow through the platform." },
  { id: "co-families", label: "Families", category: "community", weight: 6, note: "Households supported by paychecks the platform helps protect." },
  { id: "co-team-lcp", label: "LCPtracker Team", category: "team", weight: 5 },
  { id: "co-team-cikume", label: "Cikume Team", category: "team", weight: 5 },

  // Wonders of the World — Luis visited every single one.
  { id: "w-greatwall", label: "Great Wall of China", category: "wonder", weight: 4, lat: 40.4319, lng: 116.5704, note: "Walked the ramparts at dawn." },
  { id: "w-petra", label: "Petra, Jordan", category: "wonder", weight: 4, lat: 30.3285, lng: 35.4444, note: "Through the Siq to Al-Khazneh." },
  { id: "w-christ", label: "Christ the Redeemer, Rio", category: "wonder", weight: 4, lat: -22.9519, lng: -43.2105, note: "Above Rio with arms wide open." },
  { id: "w-machu", label: "Machu Picchu, Peru", category: "wonder", weight: 4, lat: -13.1631, lng: -72.5450, note: "Cloud forest and Inca stonework." },
  { id: "w-chichen", label: "Chichén Itzá, Mexico", category: "wonder", weight: 4, lat: 20.6843, lng: -88.5678, note: "El Castillo on the spring equinox." },
  { id: "w-colosseum", label: "Roman Colosseum, Italy", category: "wonder", weight: 4, lat: 41.8902, lng: 12.4922, note: "Two thousand years of stone." },
  { id: "w-taj", label: "Taj Mahal, India", category: "wonder", weight: 4, lat: 27.1751, lng: 78.0421, note: "Marble glowing at sunrise." },
];

const edges: { source: string; target: string }[] = [];
const link = (a: string, b: string) => edges.push({ source: a, target: b });

// LCPtracker → project types → agencies → cities
const projectTypes = ["p-schools","p-transit","p-highways","p-housing","p-water","p-hospitals","p-airports","p-parks"];
const cities = nodes.filter((n) => n.category === "city").map((n) => n.id);
const agencies = ["a-dot","a-public-works","a-housing","a-schools","a-water"];

for (const pt of projectTypes) link("lcp", pt);
for (const a of agencies) link("lcp", a);
link("lcp", "co-team-lcp");
link("cikume", "co-team-cikume");
link("lcp", "cikume");

// Loosely connect agencies to project types
link("a-dot", "p-highways");
link("a-dot", "p-transit");
link("a-public-works", "p-water");
link("a-public-works", "p-parks");
link("a-public-works", "p-airports");
link("a-housing", "p-housing");
link("a-schools", "p-schools");
link("a-water", "p-water");

// Spread cities across project types (deterministic, varied)
cities.forEach((c, i) => {
  const a = projectTypes[i % projectTypes.length]!;
  const b = projectTypes[(i * 3 + 2) % projectTypes.length]!;
  link(a, c);
  link(b, c);
  link(agencies[i % agencies.length]!, c);
});

// Communities
link("co-workers", "lcp");
link("co-families", "co-workers");
for (const pt of projectTypes) link("co-workers", pt);

// Wonders of the world — visited and witnessed by Luis. Linked into a soft ring
// so they form their own cluster on the map.
const wonders = ["w-greatwall","w-petra","w-christ","w-machu","w-chichen","w-colosseum","w-taj"];
for (let i = 0; i < wonders.length; i++) {
  link(wonders[i]!, wonders[(i + 1) % wonders.length]!);
}

router.get("/reach/nodes", (_req: Request, res: Response) => {
  res.json({
    nodes,
    edges,
    summary: {
      projects: projectTypes.length,
      agencies: agencies.length,
      cities: cities.length,
      livesTouched: 1_200_000,
      yearsOfService: 20,
      teamSize: 70,
      wonders: wonders.length,
    },
  });
});

export default router;
