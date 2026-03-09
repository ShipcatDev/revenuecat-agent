import Database from "better-sqlite3";
import { config } from "../config.js";
import fs from "fs";
import path from "path";

let db: Database.Database | null = null;

/**
 * Initialize the SQLite memory database.
 * Creates tables if they don't exist.
 */
function getDb(): Database.Database {
  if (db) return db;

  // Ensure data directory exists
  const dataDir = path.dirname(config.paths.memory);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(config.paths.memory);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
    CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      user_message TEXT NOT NULL,
      agent_response TEXT NOT NULL,
      agent_name TEXT DEFAULT 'orchestrator',
      tool_calls TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel);
    CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at);
  `);

  return db;
}

// ─── Memory CRUD ─────────────────────────────────────────────

export interface Memory {
  id: number;
  category: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Save a memory to the store.
 */
export function saveMemory(
  category: string,
  content: string,
  metadata: Record<string, unknown> = {}
): Memory {
  const database = getDb();
  const stmt = database.prepare(
    `INSERT INTO memories (category, content, metadata) VALUES (?, ?, ?)`
  );
  const result = stmt.run(category, content, JSON.stringify(metadata));

  return {
    id: result.lastInsertRowid as number,
    category,
    content,
    metadata,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Search memories by category and/or keyword.
 */
export function searchMemories(opts: {
  category?: string;
  keyword?: string;
  limit?: number;
}): Memory[] {
  const database = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.category) {
    conditions.push("category = ?");
    params.push(opts.category);
  }

  if (opts.keyword) {
    conditions.push("content LIKE ?");
    params.push(`%${opts.keyword}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = opts.limit || 20;

  const rows = database
    .prepare(
      `SELECT * FROM memories ${where} ORDER BY created_at DESC LIMIT ?`
    )
    .all(...params, limit) as Array<{
    id: number;
    category: string;
    content: string;
    metadata: string;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    ...row,
    metadata: JSON.parse(row.metadata),
  }));
}

/**
 * Get all memories in a category.
 */
export function getMemoriesByCategory(
  category: string,
  limit = 50
): Memory[] {
  return searchMemories({ category, limit });
}

/**
 * Delete a memory by ID.
 */
export function deleteMemory(id: number): boolean {
  const database = getDb();
  const result = database
    .prepare("DELETE FROM memories WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

// ─── Conversation Logging ───────────────────────────────────

export interface ConversationEntry {
  id: number;
  channel: string;
  user_message: string;
  agent_response: string;
  agent_name: string;
  tool_calls: Array<{ name: string; input: unknown; result: unknown }>;
  created_at: string;
}

/**
 * Log a conversation exchange.
 */
export function logConversation(entry: {
  channel: string;
  userMessage: string;
  agentResponse: string;
  agentName?: string;
  toolCalls?: Array<{ name: string; input: unknown; result: unknown }>;
}): void {
  const database = getDb();
  database
    .prepare(
      `INSERT INTO conversations (channel, user_message, agent_response, agent_name, tool_calls)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      entry.channel,
      entry.userMessage,
      entry.agentResponse,
      entry.agentName || "orchestrator",
      JSON.stringify(entry.toolCalls || [])
    );
}

/**
 * Get recent conversations.
 */
export function getRecentConversations(
  limit = 10,
  channel?: string
): ConversationEntry[] {
  const database = getDb();
  const where = channel ? "WHERE channel = ?" : "";
  const params = channel ? [channel, limit] : [limit];

  const rows = database
    .prepare(
      `SELECT * FROM conversations ${where} ORDER BY created_at DESC LIMIT ?`
    )
    .all(...params) as Array<{
    id: number;
    channel: string;
    user_message: string;
    agent_response: string;
    agent_name: string;
    tool_calls: string;
    created_at: string;
  }>;

  return rows.map((row) => ({
    ...row,
    tool_calls: JSON.parse(row.tool_calls),
  }));
}

// ─── Context Builder ────────────────────────────────────────

/**
 * Build relevant context from memory for a given query.
 * Returns a string to inject into the system prompt.
 */
export function buildMemoryContext(query: string): string {
  const parts: string[] = [];

  // Get relevant memories
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);

  const relevantMemories: Memory[] = [];
  for (const keyword of keywords) {
    const found = searchMemories({ keyword, limit: 5 });
    for (const m of found) {
      if (!relevantMemories.find((r) => r.id === m.id)) {
        relevantMemories.push(m);
      }
    }
  }

  if (relevantMemories.length > 0) {
    parts.push("## Relevant Memories");
    for (const m of relevantMemories.slice(0, 10)) {
      parts.push(`- [${m.category}] ${m.content}`);
    }
  }

  // Get recent conversations for context continuity
  const recent = getRecentConversations(3);
  if (recent.length > 0) {
    parts.push("\n## Recent Conversation History");
    for (const c of recent.reverse()) {
      parts.push(`User: ${c.user_message.substring(0, 100)}`);
      parts.push(`Shipcat: ${c.agent_response.substring(0, 150)}`);
      parts.push("");
    }
  }

  return parts.join("\n");
}

/**
 * Get stats about the memory store.
 */
export function getMemoryStats(): {
  totalMemories: number;
  totalConversations: number;
  categories: Array<{ category: string; count: number }>;
} {
  const database = getDb();

  const memCount = database
    .prepare("SELECT COUNT(*) as count FROM memories")
    .get() as { count: number };

  const convCount = database
    .prepare("SELECT COUNT(*) as count FROM conversations")
    .get() as { count: number };

  const categories = database
    .prepare(
      "SELECT category, COUNT(*) as count FROM memories GROUP BY category ORDER BY count DESC"
    )
    .all() as Array<{ category: string; count: number }>;

  return {
    totalMemories: memCount.count,
    totalConversations: convCount.count,
    categories,
  };
}

/**
 * Close the database connection.
 */
export function closeMemory(): void {
  if (db) {
    db.close();
    db = null;
  }
}
