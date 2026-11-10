import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const conn = await mysql.createConnection(url);

try {
  // Step 1: Alter the enum column to include BOTH old and new values temporarily
  await conn.execute(
    "ALTER TABLE `checklist_items` MODIFY COLUMN `status` enum('Executed','Pending','Under Review','Outstanding','Waived') NOT NULL DEFAULT 'Pending'"
  );
  console.log("Step 1: Enum expanded to include both Pending and Under Review");

  // Step 2: Update existing rows
  const [updateResult] = await conn.execute(
    "UPDATE checklist_items SET status = 'Under Review' WHERE status = 'Pending'"
  );
  console.log(`Step 2: Updated ${updateResult.affectedRows} rows from Pending \u2192 Under Review`);

  // Step 3: Alter the enum column to remove Pending
  await conn.execute(
    "ALTER TABLE `checklist_items` MODIFY COLUMN `status` enum('Executed','Under Review','Outstanding','Waived') NOT NULL DEFAULT 'Under Review'"
  );
  console.log("Step 3: Enum column finalised (Pending removed)");

  // Step 3: Mark the migration as applied in drizzle journal
  await conn.execute(
    "INSERT IGNORE INTO `__drizzle_migrations` (hash, created_at) VALUES ('0006_normal_kulan_gath', UNIX_TIMESTAMP() * 1000)"
  );
  console.log("Migration recorded");
} catch (err) {
  console.error("Error:", err.message);
} finally {
  await conn.end();
}
