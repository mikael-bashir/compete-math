// What can each angel hold? Size, free space against the 512 MB cap, pgvector, and whether the new index tables exist.
import { neon } from "@neondatabase/serverless";
import { loadEnv } from "./env";
loadEnv();
const CAP = 512 * 1024 * 1024;
async function main() {
  const rows: string[] = [];
  await Promise.all(Array.from({ length: 20 }, (_, i) => i).map(async (i) => {
    const key = `ANGEL${i}_DATABASE_URL`;
    const url = process.env[key];
    if (!url) { rows.push(`${key.padEnd(22)} (not set)`); return; }
    try {
      const sql = neon(url);
      const [s] = await sql`SELECT pg_database_size(current_database())::bigint AS bytes`;
      const [v] = await sql`SELECT (SELECT count(*) FROM pg_available_extensions WHERE name = 'vector') AS avail, (SELECT count(*) FROM pg_extension WHERE extname = 'vector') AS installed`;
      const t = await sql`SELECT table_name, pg_total_relation_size(quote_ident(table_name))::bigint AS b FROM information_schema.tables WHERE table_schema = 'public' ORDER BY b DESC LIMIT 4`;
      const mb = Number(s.bytes) / 1048576;
      rows.push(`${key.padEnd(22)} ${mb.toFixed(0).padStart(4)} MB used, ${((CAP - Number(s.bytes)) / 1048576).toFixed(0).padStart(4)} MB free | vector avail=${v.avail} installed=${v.installed} | ${t.map((r) => `${r.table_name}:${(Number(r.b) / 1048576).toFixed(0)}MB`).join(" ")}`);
    } catch (e) { rows.push(`${key.padEnd(22)} ERROR ${(e as Error).message.slice(0, 80)}`); }
  }));
  console.log(rows.sort().join("\n"));
}
main();
