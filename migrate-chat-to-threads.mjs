import mysql from "mysql2/promise";
import { URL } from "url";
import https from "https";

// Parse DATABASE_URL
const dbUrl = new URL(process.env.DATABASE_URL || "mysql://root:@localhost:4000/closing_room");
const pool = mysql.createPool({
  host: dbUrl.hostname,
  port: parseInt(dbUrl.port || "4000"),
  user: dbUrl.username,
  password: dbUrl.password,
  database: dbUrl.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function migrate() {
  const conn = await pool.getConnection();
  try {
    console.log("Starting migration of chat messages to conversation threads...");

    // Get all unique deals that have chat messages
    const [deals] = await conn.query(`
      SELECT DISTINCT dealId FROM chat_messages
    `);

    console.log(`Found ${deals.length} deals with existing chat messages`);

    for (const deal of deals) {
      const dealId = deal.dealId;

      // Check if a default thread already exists for this deal
      const [existingThreads] = await conn.query(
        `SELECT id FROM conversation_threads WHERE dealId = ? LIMIT 1`,
        [dealId]
      );

      let threadId;

      if (existingThreads.length > 0) {
        threadId = existingThreads[0].id;
        console.log(`Deal ${dealId}: Using existing thread ${threadId}`);
      } else {
        // Get the deal's user (owner)
        const [dealData] = await conn.query(
          `SELECT userId FROM deals WHERE id = ?`,
          [dealId]
        );

        if (dealData.length === 0) {
          console.log(`Deal ${dealId}: Deal not found, skipping`);
          continue;
        }

        const userId = dealData[0].userId;

        // Create a default thread for this deal
        const [result] = await conn.query(
          `INSERT INTO conversation_threads (dealId, userId, title, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW())`,
          [dealId, userId, "Migrated Conversation"]
        );

        threadId = result.insertId;
        console.log(`Deal ${dealId}: Created new thread ${threadId}`);
      }

      // Migrate all chat messages for this deal to the thread
      const [chatMessages] = await conn.query(
        `SELECT id, role, content, createdAt FROM chat_messages WHERE dealId = ? ORDER BY createdAt ASC`,
        [dealId]
      );

      if (chatMessages.length > 0) {
        for (const msg of chatMessages) {
          await conn.query(
            `INSERT INTO conversation_messages (threadId, role, content, createdAt) VALUES (?, ?, ?, ?)`,
            [threadId, msg.role, msg.content, msg.createdAt]
          );
        }
        console.log(`  Migrated ${chatMessages.length} messages to thread ${threadId}`);
      }
    }

    console.log("Migration complete!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await conn.release();
    await pool.end();
  }
}

migrate();
