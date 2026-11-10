import mysql from "mysql2/promise";
import { URL } from "url";
import fs from "fs";

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

async function applyMigration() {
  const conn = await pool.getConnection();
  try {
    console.log("Applying migration 0011_volatile_vance_astro.sql...");
    
    const sql = fs.readFileSync("drizzle/0011_volatile_vance_astro.sql", "utf-8");
    const statements = sql.split("-->").map(s => s.trim()).filter(s => s && !s.startsWith("statement-breakpoint"));
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log("Executing:", statement.substring(0, 80) + "...");
        await conn.query(statement);
      }
    }
    
    console.log("Migration applied successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await conn.release();
    await pool.end();
  }
}

applyMigration();
