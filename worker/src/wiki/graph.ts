// Knowledge-graph data builder. Nodes are entity wiki pages (concepts,
// places, periods, etc.) — exhibits themselves are excluded so the graph
// reads as "your concept atlas" rather than a noisy bipartite blob. Edges
// are co-citation: two entities are connected if some exhibit cites both,
// with weight = number of shared exhibits.
//
// We additionally include direct entity→entity wiki_links (the LLM
// occasionally writes those — e.g. "see also") with a small constant
// weight so they don't get dropped when no exhibit shares the pair.

import { buildEncyclopedia } from "./encyclopedia";

export type GraphNode = {
  id: string;            // wiki path
  title: string;
  kind: string;
  domain: string;
  inbound: number;       // number of inbound exhibit links — used as size hint
};

export type GraphEdge = {
  source: string;        // wiki path
  target: string;
  weight: number;        // shared exhibits + direct-link bonus
  via: "shared" | "direct";
};

export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  domains: string[];     // distinct domains present
};

const ENTITY_KINDS = new Set([
  "concept", "place", "period", "person", "style",
  "material", "technique", "theme", "civilization",
]);

export async function buildKnowledgeGraph(
  db: D1Database,
  userId: string,
  opts: { minWeight?: number; maxNodes?: number } = {},
): Promise<GraphData> {
  const minWeight = opts.minWeight ?? 1;
  const maxNodes = opts.maxNodes ?? 600;

  // Reuse encyclopedia logic so a node's domain matches what the index page
  // shows.
  const enc = await buildEncyclopedia(db, userId);
  const nodeMap = new Map<string, GraphNode>();
  for (const sec of enc.sections) {
    for (const k of Object.keys(sec.byKind)) {
      for (const e of sec.byKind[k]) {
        nodeMap.set(e.path, {
          id: e.path,
          title: e.title,
          kind: e.kind,
          domain: sec.domain,
          inbound: e.inbound_links,
        });
      }
    }
  }

  // Co-citation edges: entity A and B share N exhibits → edge weight N.
  // The wp_a.path < wp_b.path predicate ensures we get each pair once.
  const coRes = await db
    .prepare(
      `SELECT wl1.dst_path AS a, wl2.dst_path AS b, COUNT(DISTINCT wl1.src_path) AS w
         FROM wiki_links wl1
         JOIN wiki_links wl2
           ON wl1.user_id = wl2.user_id AND wl1.src_path = wl2.src_path
         JOIN wiki_pages wp_src
           ON wp_src.user_id = wl1.user_id AND wp_src.path = wl1.src_path
        WHERE wl1.user_id = ?1
          AND wp_src.kind IN ('exhibit','exhibit_unknown')
          AND wl1.dst_path < wl2.dst_path
        GROUP BY wl1.dst_path, wl2.dst_path
        HAVING w >= ?2`,
    )
    .bind(userId, minWeight)
    .all<{ a: string; b: string; w: number }>();

  // Direct entity → entity wiki_links (small bonus weight)
  const directRes = await db
    .prepare(
      `SELECT wl.src_path AS a, wl.dst_path AS b
         FROM wiki_links wl
         JOIN wiki_pages wp_a
           ON wp_a.user_id = wl.user_id AND wp_a.path = wl.src_path
         JOIN wiki_pages wp_b
           ON wp_b.user_id = wl.user_id AND wp_b.path = wl.dst_path
        WHERE wl.user_id = ?1
          AND wp_a.kind NOT IN ('exhibit','exhibit_unknown','index','log')
          AND wp_b.kind NOT IN ('exhibit','exhibit_unknown','index','log')`,
    )
    .bind(userId)
    .all<{ a: string; b: string }>();

  const edgeKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;
  const edges = new Map<string, GraphEdge>();
  for (const r of coRes.results ?? []) {
    if (!nodeMap.has(r.a) || !nodeMap.has(r.b)) continue;
    edges.set(edgeKey(r.a, r.b), { source: r.a, target: r.b, weight: r.w, via: "shared" });
  }
  for (const r of directRes.results ?? []) {
    if (!nodeMap.has(r.a) || !nodeMap.has(r.b)) continue;
    const k = edgeKey(r.a, r.b);
    const cur = edges.get(k);
    if (cur) cur.weight += 1;
    else edges.set(k, { source: r.a, target: r.b, weight: 1, via: "direct" });
  }

  // Cap node count by inbound popularity so huge wikis still render.
  const sorted = Array.from(nodeMap.values()).sort((a, b) => b.inbound - a.inbound);
  const kept = new Set<string>(sorted.slice(0, maxNodes).map((n) => n.id));
  const nodes = sorted.filter((n) => kept.has(n.id));

  // Drop edges to dropped nodes
  const liveEdges: GraphEdge[] = [];
  for (const e of edges.values()) {
    if (kept.has(e.source) && kept.has(e.target)) liveEdges.push(e);
  }

  // Drop completely-isolated nodes — they clutter the layout
  const seenInEdges = new Set<string>();
  for (const e of liveEdges) { seenInEdges.add(e.source); seenInEdges.add(e.target); }
  const finalNodes = nodes.filter((n) => seenInEdges.has(n.id));

  const domains = Array.from(new Set(finalNodes.map((n) => n.domain)));

  return { nodes: finalNodes, edges: liveEdges, domains };
}
