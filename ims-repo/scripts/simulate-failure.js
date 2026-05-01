/**
 * Simulate a multi-stack failure scenario.
 * Run after `docker compose up`:
 *   node scripts/simulate-failure.js
 */
const API = process.env.API ?? "http://localhost:8080";

async function send(component_id, message, payload = {}) {
  await fetch(`${API}/signals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ component_id, message, payload }),
  }).catch(() => {});
}

async function burst(component_id, n, msg) {
  await Promise.all(Array.from({ length: n }, (_, i) =>
    send(component_id, `${msg} #${i+1}`, { code: "ERR_X", attempt: i+1 })));
  console.log(`✓ Sent ${n} signals to ${component_id}`);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log("⚡ T+0   RDBMS_PRIMARY: connection pool exhausted (50 signals)");
  await burst("RDBMS_PRIMARY", 50, "DB pool exhausted");

  await sleep(2000);
  console.log("⚡ T+2s  CACHE_CLUSTER_01: cache miss stampede (200 signals)");
  await burst("CACHE_CLUSTER_01", 200, "Cache miss stampede");

  await sleep(3000);
  console.log("⚡ T+5s  MCP_HOST_01: timeouts (80 signals)");
  await burst("MCP_HOST_01", 80, "MCP timeout");

  await sleep(12_000);
  console.log("⚡ T+17s CACHE_CLUSTER_01: SECOND wave (debounce closed → new WI)");
  await burst("CACHE_CLUSTER_01", 30, "Second cache wave");

  console.log("\n✅ Done. Check the dashboard at http://localhost:5173");
})();
