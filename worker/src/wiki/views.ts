// Cross-exhibit projections of the wiki: timeline + map data sources.
// Pulls from interactions table denorm columns (already mirrored from
// wiki page frontmatter by writePage's indexer step).

export type TimelinePoint = {
  id: string;
  title: string;
  approx_year: number;
  primary_domain: string | null;
  child_summary: string | null;
};

export type MapPoint = {
  id: string;
  title: string;
  lat: number;
  lon: number;
  primary_domain: string | null;
  child_summary: string | null;
};

export async function getTimelinePoints(
  db: D1Database,
  userId: string,
): Promise<TimelinePoint[]> {
  // We don't have a stored title on interactions yet — pull from wiki_pages.
  const res = await db
    .prepare(
      `SELECT i.id, i.approx_year, i.primary_domain, i.child_summary,
              COALESCE(wp.title, 'Exhibit ' || i.id) AS title
         FROM interactions i
         LEFT JOIN wiki_pages wp
           ON wp.user_id = i.user_id AND wp.path = 'exhibits/' || i.id
        WHERE i.user_id = ?1
          AND i.analysis_status = 'done'
          AND i.approx_year IS NOT NULL
        ORDER BY i.approx_year ASC`,
    )
    .bind(userId)
    .all<TimelinePoint>();
  return res.results ?? [];
}

export async function getMapPoints(
  db: D1Database,
  userId: string,
): Promise<MapPoint[]> {
  const res = await db
    .prepare(
      `SELECT i.id, i.origin_lat AS lat, i.origin_lon AS lon,
              i.primary_domain, i.child_summary,
              COALESCE(wp.title, 'Exhibit ' || i.id) AS title
         FROM interactions i
         LEFT JOIN wiki_pages wp
           ON wp.user_id = i.user_id AND wp.path = 'exhibits/' || i.id
        WHERE i.user_id = ?1
          AND i.analysis_status = 'done'
          AND i.origin_lat IS NOT NULL
          AND i.origin_lon IS NOT NULL`,
    )
    .bind(userId)
    .all<MapPoint>();
  return res.results ?? [];
}
