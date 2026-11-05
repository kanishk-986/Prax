// Applies db/schema.sql to the Supabase Postgres database in .env.local.
import { readFileSync } from "node:fs";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const url = process.env.POSTGRES_URL_NON_POOLING;
if (!url) throw new Error("POSTGRES_URL_NON_POOLING missing; run `vercel env pull .env.local --environment=production`");

// Use the IPv4 pooler host from POSTGRES_URL in session mode (port 5432), which allows DDL.
const e = process.env;
const ref = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(e.POSTGRES_HOST || "")?.[1];
if (!ref) throw new Error("Could not read project ref from POSTGRES_HOST");
let client;
for (const host of ["aws-1-ap-south-1.pooler.supabase.com", "aws-0-ap-south-1.pooler.supabase.com"]) {
  const c = new pg.Client({ host, user: `postgres.${ref}`, password: e.POSTGRES_PASSWORD, database: "postgres", port: 5432, ssl: { rejectUnauthorized: false } });
  try { await c.connect(); client = c; console.log("connected via", host); break; } catch (err) { console.log(host, "failed:", err.code || err.message); }
}
if (!client) throw new Error("No pooler host accepted the connection");
await client.query(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
const { rows } = await client.query("select table_name from information_schema.tables where table_schema='public' order by 1");
console.log("tables:", rows.map((r) => r.table_name).join(", "));
await client.end();
