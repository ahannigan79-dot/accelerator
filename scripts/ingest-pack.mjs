#!/usr/bin/env node
/**
 * Ingest a sample intake pack into a running Factory over HTTP.
 *   node scripts/ingest-pack.mjs http://localhost:3000 samples/krishna-industries
 * Creates the engagement from manifest.json, then uploads every file as an evidence record with its raw content.
 */
import fs from "node:fs";
import path from "node:path";

const [base = "http://localhost:3000", dir = "samples/krishna-industries"] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
const actor = { userId: "c.rivera", role: "CONSULTANT" };

const created = await fetch(`${base}/api/engagements`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...manifest.engagement, actor }) }).then((r) => r.json());
if (!created.ok) throw new Error(created.error);
const id = created.engagementId;
console.log(`Engagement ${id} created`);

const records = manifest.records.map((r) => ({ ...r, fileName: r.file, content: fs.readFileSync(path.join(dir, r.file), "utf8") }));
const res = await fetch(`${base}/api/engagements/${id}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actionType: "UPLOAD_EVIDENCE", actor, payload: { records } }) }).then((r) => r.json());
if (!res.ok) throw new Error(`${res.code}: ${res.error}`);
console.log(res.message);
for (const e of res.events) console.log(" -", e);
console.log(`Next: ${res.nextHumanAction.title} → ${base}${res.nextHumanAction.route}`);
