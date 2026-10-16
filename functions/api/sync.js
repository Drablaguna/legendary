import { neon } from "@neondatabase/serverless";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(),
  });
}

function rowToItem(row) {
  let sessions = [];
  if (Array.isArray(row.sessions)) {
    sessions = row.sessions;
  } else if (typeof row.sessions === "string") {
    try {
      sessions = JSON.parse(row.sessions);
    } catch (e) {
      sessions = [];
    }
  }

  return {
    id: row.id,
    domain: row.domain_id || "client",
    parentId: row.parent_id || null,
    tier: Number(row.tier),
    title: row.title,
    notes: row.notes || "",
    done: Boolean(row.done),
    dueAt: row.due_at != null ? Number(row.due_at) : undefined,
    target: row.target || undefined,
    timeSpent: row.time_spent != null ? Number(row.time_spent) : undefined,
    sessions,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    completedAt: row.completed_at != null ? Number(row.completed_at) : undefined,
  };
}

function rowToTrashEntry(row) {
  let payload = row.payload;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch (e) {
      payload = [];
    }
  }
  const items = Array.isArray(payload)
    ? payload
    : payload && Array.isArray(payload.items)
    ? payload.items
    : [];

  return {
    id: row.id,
    rootId: row.root_id,
    deletedAt: Number(row.deleted_at),
    items,
    updatedAt: Number(row.updated_at),
  };
}

function rowToSettings(row) {
  let xp = row.xp_config;
  if (typeof xp === "string") {
    try {
      xp = JSON.parse(xp);
    } catch (e) {
      xp = null;
    }
  }
  return {
    theme: row.theme || "dark",
    xp: xp || { 1: 500, 2: 200, 3: 50, 4: 15, 5: 5 },
    updatedAt: Number(row.updated_at),
  };
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

export async function onRequestPost(context) {
  const dbUrl = (context.env && context.env.DATABASE_URL) || process.env.DATABASE_URL;

  if (!dbUrl) {
    return jsonResponse(
      {
        error: "DATABASE_URL environment variable is not configured.",
        appliedIds: [],
        serverChanges: {
          items: [],
          trash: [],
          settings: null,
          deletedItemIds: [],
          deletedTrashIds: [],
        },
        serverTime: Date.now(),
      },
      503
    );
  }

  let payload;
  try {
    payload = await context.request.json();
  } catch (err) {
    return jsonResponse({ error: "Invalid JSON request payload." }, 400);
  }

  const mutations = Array.isArray(payload.mutations) ? payload.mutations : [];
  const lastSyncedAt =
    typeof payload.lastSyncedAt === "number" && !isNaN(payload.lastSyncedAt)
      ? payload.lastSyncedAt
      : 0;

  const sql = neon(dbUrl);
  const appliedIds = [];

  try {
    // 1. Process batched mutations
    for (const m of mutations) {
      if (!m || !m.id || !m.table || !m.action || !m.entityId) continue;

      if (m.table === "items") {
        if (m.action === "UPSERT" && m.data) {
          const item = m.data;
          const domainId = item.domain || "client";
          const parentId = item.parentId || null;
          const tier = Number(item.tier) || 1;
          const title = String(item.title || "").slice(0, 255);
          const notes = String(item.notes || "");
          const done = Boolean(item.done);
          const dueAt = typeof item.dueAt === "number" ? item.dueAt : null;
          const target = typeof item.target === "string" ? item.target : null;
          const timeSpent = typeof item.timeSpent === "number" ? item.timeSpent : 0;
          const sessionsJson = JSON.stringify(Array.isArray(item.sessions) ? item.sessions : []);
          const createdAt = Number(item.createdAt) || Number(m.timestamp) || Date.now();
          const updatedAt = Number(item.updatedAt) || Number(m.timestamp) || Date.now();
          const completedAt = typeof item.completedAt === "number" ? item.completedAt : null;

          await sql.query(
            `INSERT INTO items (
              id, domain_id, parent_id, tier, title, notes, done, due_at, target, time_spent, sessions, created_at, updated_at, completed_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT (id) DO UPDATE SET
              domain_id = EXCLUDED.domain_id,
              parent_id = EXCLUDED.parent_id,
              tier = EXCLUDED.tier,
              title = EXCLUDED.title,
              notes = EXCLUDED.notes,
              done = EXCLUDED.done,
              due_at = EXCLUDED.due_at,
              target = EXCLUDED.target,
              time_spent = EXCLUDED.time_spent,
              sessions = EXCLUDED.sessions,
              updated_at = EXCLUDED.updated_at,
              completed_at = EXCLUDED.completed_at
            WHERE items.updated_at <= EXCLUDED.updated_at`,
            [
              item.id,
              domainId,
              parentId,
              tier,
              title,
              notes,
              done,
              dueAt,
              target,
              timeSpent,
              sessionsJson,
              createdAt,
              updatedAt,
              completedAt,
            ]
          );
          appliedIds.push(m.id);
        } else if (m.action === "DELETE") {
          const deletedAt = Number(m.timestamp) || Date.now();
          await sql.query(`DELETE FROM items WHERE id = $1`, [m.entityId]);
          await sql.query(
            `INSERT INTO deleted_records (entity_id, table_name, deleted_at)
             VALUES ($1, 'items', $2)
             ON CONFLICT (entity_id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at`,
            [m.entityId, deletedAt]
          );
          appliedIds.push(m.id);
        }
      } else if (m.table === "trash") {
        if (m.action === "UPSERT" && m.data) {
          const entry = m.data;
          const rootId = entry.rootId || m.entityId;
          const deletedAt = Number(entry.deletedAt) || Number(m.timestamp) || Date.now();
          const updatedAt = Number(entry.updatedAt) || deletedAt;
          const payloadJson = JSON.stringify(entry.items || entry);

          await sql.query(
            `INSERT INTO trash_entries (id, root_id, deleted_at, payload, updated_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET
               root_id = EXCLUDED.root_id,
               deleted_at = EXCLUDED.deleted_at,
               payload = EXCLUDED.payload,
               updated_at = EXCLUDED.updated_at
             WHERE trash_entries.updated_at <= EXCLUDED.updated_at`,
            [m.entityId, rootId, deletedAt, payloadJson, updatedAt]
          );
          appliedIds.push(m.id);
        } else if (m.action === "DELETE") {
          const deletedAt = Number(m.timestamp) || Date.now();
          await sql.query(`DELETE FROM trash_entries WHERE id = $1`, [m.entityId]);
          await sql.query(
            `INSERT INTO deleted_records (entity_id, table_name, deleted_at)
             VALUES ($1, 'trash', $2)
             ON CONFLICT (entity_id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at`,
            [m.entityId, deletedAt]
          );
          appliedIds.push(m.id);
        }
      } else if (m.table === "settings") {
        if (m.action === "UPSERT" && m.data) {
          const s = m.data;
          const key = m.entityId || "app_settings";
          const theme = s.theme === "light" ? "light" : "dark";
          const xpJson = JSON.stringify(s.xp || {});
          const updatedAt = Number(s.updatedAt) || Number(m.timestamp) || Date.now();

          await sql.query(
            `INSERT INTO settings (key, theme, xp_config, updated_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (key) DO UPDATE SET
               theme = EXCLUDED.theme,
               xp_config = EXCLUDED.xp_config,
               updated_at = EXCLUDED.updated_at
             WHERE settings.updated_at <= EXCLUDED.updated_at`,
            [key, theme, xpJson, updatedAt]
          );
          appliedIds.push(m.id);
        }
      }
    }

    // 2. Fetch server changes since lastSyncedAt
    const itemsRows = await sql.query(
      `SELECT * FROM items WHERE updated_at > $1 ORDER BY updated_at ASC`,
      [lastSyncedAt]
    );

    const trashRows = await sql.query(
      `SELECT * FROM trash_entries WHERE updated_at > $1 ORDER BY updated_at ASC`,
      [lastSyncedAt]
    );

    const settingsRows = await sql.query(
      `SELECT * FROM settings WHERE updated_at > $1 ORDER BY updated_at DESC LIMIT 1`,
      [lastSyncedAt]
    );

    const deletedRows = await sql.query(
      `SELECT entity_id, table_name FROM deleted_records WHERE deleted_at > $1`,
      [lastSyncedAt]
    );

    const serverItems = itemsRows.map(rowToItem);
    const serverTrash = trashRows.map(rowToTrashEntry);
    const serverSettings = settingsRows.length ? rowToSettings(settingsRows[0]) : null;

    const deletedItemIds = deletedRows
      .filter((r) => r.table_name === "items")
      .map((r) => r.entity_id);

    const deletedTrashIds = deletedRows
      .filter((r) => r.table_name === "trash")
      .map((r) => r.entity_id);

    return jsonResponse({
      appliedIds,
      serverChanges: {
        items: serverItems,
        trash: serverTrash,
        settings: serverSettings,
        deletedItemIds,
        deletedTrashIds,
      },
      serverTime: Date.now(),
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error.message || "Database sync query error",
        appliedIds,
        serverChanges: {
          items: [],
          trash: [],
          settings: null,
          deletedItemIds: [],
          deletedTrashIds: [],
        },
        serverTime: Date.now(),
      },
      500
    );
  }
}
