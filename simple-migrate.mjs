import mysql from "mysql2/promise";
import { URL } from "url";

const dbUrl = new URL(process.env.DATABASE_URL);
const pool = mysql.createPool({
  host: dbUrl.hostname,
  port: parseInt(dbUrl.port || "4000"),
  user: dbUrl.username,
  password: dbUrl.password,
  database: dbUrl.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

const conn = await pool.getConnection();

try {
  // Create conversation_messages table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS conversation_messages (
      id int AUTO_INCREMENT NOT NULL PRIMARY KEY,
      threadId int NOT NULL,
      role enum('user','assistant') NOT NULL,
      content text NOT NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("✓ Created conversation_messages table");

  // Create conversation_threads table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS conversation_threads (
      id int AUTO_INCREMENT NOT NULL PRIMARY KEY,
      dealId int NOT NULL,
      userId int NOT NULL,
      title varchar(512),
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  console.log("✓ Created conversation_threads table");

  // Migrate chat messages
  const [deals] = await conn.query(`SELECT DISTINCT dealId FROM chat_messages`);
  console.log(`\nMigrating ${deals.length} deals...`);

  for (const deal of deals) {
    const dealId = deal.dealId;
    const [dealData] = await conn.query(`SELECT userId FROM deals WHERE id = ?`, [dealId]);
    
    if (dealData.length === 0) continue;
    
    const userId = dealData[0].userId;
    const [result] = await conn.query(
      `INSERT INTO conversation_threads (dealId, userId, title) VALUES (?, ?, ?)`,
      [dealId, userId, "Migrated Conversation"]
    );
    
    const threadId = result.insertId;
    const [messages] = await conn.query(
      `SELECT role, content, createdAt FROM chat_messages WHERE dealId = ? ORDER BY createdAt ASC`,
      [dealId]
    );
    
    for (const msg of messages) {
      await conn.query(
        `INSERT INTO conversation_messages (threadId, role, content, createdAt) VALUES (?, ?, ?, ?)`,
        [threadId, msg.role, msg.content, msg.createdAt]
      );
    }
    
    console.log(`✓ Deal ${dealId}: Created thread ${threadId} with ${messages.length} messages`);
  }
  
  console.log("\n✓ Migration complete!");
} catch (error) {
  console.error("✗ Migration failed:", error.message);
  process.exit(1);
} finally {
  await conn.release();
  await pool.end();
}
