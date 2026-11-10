import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(url);
try {
  // Check if column already exists
  const [rows] = await conn.execute(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'checklist_items' AND COLUMN_NAME = 'statusChangedAt'"
  );
  if (rows.length > 0) {
    console.log("Column statusChangedAt already exists — skipping.");
  } else {
    await conn.execute("ALTER TABLE checklist_items ADD COLUMN statusChangedAt bigint");
    console.log("Column statusChangedAt added successfully.");
  }
  // Backfill existing rows with createdAt timestamp (as ms)
  await conn.execute(
    "UPDATE checklist_items SET statusChangedAt = UNIX_TIMESTAMP(createdAt) * 1000 WHERE statusChangedAt IS NULL"
  );
  console.log("Backfilled existing rows with createdAt timestamp.");
} finally {
  await conn.end();
}
