// Checks that Supabase is set up correctly for the app.
// Usage: npm run check:supabase   (reads .env.local)
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let failed = false;
const ok = (msg) => console.log(`  ✅ ${msg}`);
const bad = (msg, hint) => {
  failed = true;
  console.log(`  ❌ ${msg}${hint ? `\n     → ${hint}` : ""}`);
};

console.log("\nChecking Supabase setup…\n");

if (!url || !anonKey || !serviceKey || url.includes("your-project")) {
  bad("Missing values in .env.local", "Fill in all three variables (see .env.example)");
  process.exit(1);
}
if (anonKey === serviceKey) bad("The public key and the service key are the same", "NEXT_PUBLIC_SUPABASE_ANON_KEY should be the anon/publishable key; SUPABASE_SERVICE_ROLE_KEY the service_role/secret key");
if (serviceKey.startsWith("sb_publishable_")) bad("SUPABASE_SERVICE_ROLE_KEY is a publishable key", "Use the service_role or sb_secret_ key there");
if (anonKey.startsWith("sb_secret_")) bad("NEXT_PUBLIC_SUPABASE_ANON_KEY is a SECRET key — it would be exposed to browsers!", "Swap the two keys");

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const pub = createClient(url, anonKey, { auth: { persistSession: false } });

// 1. Tables exist (service key)
for (const table of ["games", "players"]) {
  const { error } = await admin.from(table).select("id").limit(1);
  if (error) bad(`Can't read table "${table}": ${error.message}`, "Run supabase/schema.sql in the SQL Editor");
  else ok(`Table "${table}" exists`);
}

// 2. touch_game function exists
{
  const { error } = await admin.rpc("touch_game", { game_id: "00000000-0000-0000-0000-000000000000" });
  if (error) bad(`touch_game function: ${error.message}`, "Run supabase/schema.sql in the SQL Editor");
  else ok("touch_game function exists");
}

// 3. Row-level security keeps the public key out
{
  const { error } = await pub.from("games").insert({ id: crypto.randomUUID(), code: "TEST0", host_token_hash: "x", settings: {}, expires_at: new Date().toISOString() });
  if (!error) {
    bad("The public key could write to the games table!", "Make sure RLS is enabled: re-run supabase/schema.sql");
    await admin.from("games").delete().eq("code", "TEST0");
  } else ok("Public key is locked out of the tables (secrets are safe)");
}

// 4. Realtime broadcast: server sends, a "phone" receives
{
  const topic = `game-CHECK${Math.floor(Math.random() * 1e6)}`;
  const received = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 8000);
    const channel = pub
      .channel(topic)
      .on("broadcast", { event: "changed" }, () => {
        clearTimeout(timer);
        resolve(true);
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        const headers = { "Content-Type": "application/json", apikey: serviceKey };
        if (serviceKey.startsWith("eyJ")) headers.Authorization = `Bearer ${serviceKey}`;
        const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
          method: "POST",
          headers,
          body: JSON.stringify({ messages: [{ topic, event: "changed", payload: { version: 1 } }] }),
        });
        if (!res.ok) console.log(`     (broadcast endpoint said ${res.status}: ${await res.text()})`);
      });
    void channel;
  });
  if (await received) ok("Realtime: phones will update instantly");
  else bad("Realtime ping didn't arrive within 8s", 'In Supabase: Project Settings → Realtime → make sure "Allow public access" is on. (Phones still work without it — they poll every 15s.)');
  await pub.removeAllChannels();
}

console.log(failed ? "\nSome checks failed — see the hints above.\n" : "\nAll good! Supabase is ready. 🎉\n");
process.exit(failed ? 1 : 0);
