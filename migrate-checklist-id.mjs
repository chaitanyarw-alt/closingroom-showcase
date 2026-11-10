import { createConnection } from '/home/ubuntu/closing-room/node_modules/.pnpm/mysql2@3.15.1/node_modules/mysql2/promise.js';
const url = process.env.DATABASE_URL;
if (!url) { console.log('No DATABASE_URL'); process.exit(0); }
const conn = await createConnection(url);
// Check if column already exists
const [cols] = await conn.query("SHOW COLUMNS FROM `documents` LIKE 'checklistItemId'");
if (cols.length > 0) {
  console.log('Column checklistItemId already exists - no migration needed');
} else {
  await conn.query("ALTER TABLE `documents` ADD `checklistItemId` int");
  console.log('Migration applied: added checklistItemId to documents table');
}
await conn.end();
