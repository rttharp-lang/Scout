// House date style in prose fields only: "Oct 21", never "Oct. 21" or "Oct 21st".
//   node scripts/nba/normalize-dates.mjs <repo>
import fs from "node:fs";
import path from "node:path";

const repo = process.argv[2];
const { targets, walk, readJSON } = await import(path.join(repo, "scripts/nba/prose.mjs"));
const MON = "Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
const FULL = "January|February|March|April|May|June|July|August|September|October|November|December";
const fix = (s) => s
  .replace(new RegExp(`\\b(${MON})\\.\\s(?=\\d)`, "g"), "$1 ")
  .replace(new RegExp(`\\b((?:${MON}|${FULL})\\s\\d{1,2})(?:st|nd|rd|th)\\b`, "g"), "$1");

let files = 0, edits = 0;
for (const t of targets(["--all"])) {
  const data = readJSON(t.file);
  const sets = [];
  walk(data, t.schema, (kind, at, key, value) => {
    if (kind === "prose" && fix(value) !== value) sets.push([at, fix(value)]);
  });
  if (!sets.length) continue;
  for (const [at, v] of sets) {
    const keys = at.slice(1).match(/\.[^.[\]]+|\[\d+\]/g).map((k) => (k[0] === "." ? k.slice(1) : Number(k.slice(1, -1))));
    let o = data;
    for (const k of keys.slice(0, -1)) o = o[k];
    o[keys[keys.length - 1]] = v;
  }
  fs.writeFileSync(t.file, JSON.stringify(data, null, 2) + "\n");
  files++; edits += sets.length;
}
console.log(`Normalized dates in ${edits} fields across ${files} files.`);
