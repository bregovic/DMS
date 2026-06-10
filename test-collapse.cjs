require("dotenv").config();
const { Client } = require("pg");
const bcrypt = require("bcryptjs");
const BASE = "https://dokumenty.up.railway.app";
const email = "co@dms.local", pass = "test12345";
const U = "co_u", P = "co_p", V = "co_v";
const jar = {};
const sc = (r) => { for (const c of r.headers.getSetCookie?.() ?? []) { const [p] = c.split(";"); const i = p.indexOf("="); jar[p.slice(0, i)] = p.slice(i + 1); } };
const ch = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
async function cleanup(c) {
  await c.query('DELETE FROM dms."Vendor" WHERE id=$1', [V]);
  await c.query('DELETE FROM dms."Project" WHERE id=$1', [P]);
  await c.query('DELETE FROM dms."User" WHERE id=$1', [U]);
}
async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect(); await cleanup(c);
  const hash = await bcrypt.hash(pass, 10);
  await c.query('INSERT INTO dms."User"(id,name,email,"passwordHash","createdAt") VALUES($1,$2,$3,$4,now())', [U, "CO", email, hash]);
  await c.query('INSERT INTO dms."Project"(id,"ownerId",name,type,color,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,now(),now())', [P, U, "CO Proj", "other", "#000"]);
  await c.query('INSERT INTO dms."Vendor"(id,"ownerId",name,email,category,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,now(),now())', [V, U, "Skryty Dodavatel", "sk@x.cz", "construction"]);
  await c.query('INSERT INTO dms."_ProjectVendors"("A","B") VALUES($1,$2)', [P, V]);

  let r = await fetch(`${BASE}/api/auth/csrf`); sc(r);
  const { csrfToken } = await r.json();
  r = await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: ch() }, body: new URLSearchParams({ csrfToken, email, password: pass, callbackUrl: BASE }) }); sc(r);
  const html = await (await fetch(`${BASE}/projects/${P}`, { headers: { Cookie: ch() } })).text();

  const checks = {
    "panel titulek pritomen": html.includes("přístup"),
    "panel SBALENY (napoveda skryta)": !html.includes("Aktivní dodavatel se přihlásí") && !html.includes("Skryty Dodavatel"),
  };
  console.log(JSON.stringify(checks, null, 2));
  const ok = Object.values(checks).every(Boolean);
  console.log(ok ? "\n✅ PANEL SBALENY DEFAULTNE OK" : "\n❌ (mozna jeste stary deploy)");
  await cleanup(c); await c.end();
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error("ERR", e.name + ":", e.message); process.exit(1); });
