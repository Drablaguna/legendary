import fs from "fs";
import { neon } from "@neondatabase/serverless";

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  const content = fs.readFileSync(path, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!dbUrl) {
  console.error("No DATABASE_URL found in .env or .env.local");
  process.exit(1);
}

console.log("Connecting to Neon Postgres via @neondatabase/serverless driver...");
const sql = neon(dbUrl);

const schemaSql = fs.readFileSync("schema.sql", "utf8");

// Split statements by semicolon while ignoring comments
const statements = schemaSql
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`Executing ${statements.length} statements from schema.sql...`);

for (const stmt of statements) {
  try {
    await sql.query(stmt);
  } catch (err) {
    console.error("Error executing statement:", stmt.slice(0, 60), "->", err.message);
    process.exit(1);
  }
}

console.log("Schema applied successfully to Neon Postgres!");

const tables = await sql`
  SELECT table_name 
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
  ORDER BY table_name;
`;
console.log("Verified tables in database:", tables.map((t) => t.table_name));
