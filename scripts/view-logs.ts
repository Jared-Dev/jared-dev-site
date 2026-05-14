import { recentEvents } from "../src/lib/state";

async function main() {
  const limit = Number(process.argv[2] ?? 50);
  const events = await recentEvents(limit);
  if (events.length === 0) {
    console.log("No non-SAFE events logged.");
    return;
  }
  console.log(`Most recent ${events.length} non-SAFE event(s):\n`);
  for (const e of events) {
    const ts = new Date(e.timestamp).toISOString();
    console.log(`[${ts}] ${e.verdict} / ${e.type} (turn ${e.turn}, strikes ${e.strikeCount})`);
    console.log(`  session=${e.sessionId}`);
    console.log(`  identity=${e.identityHash.slice(0, 16)}…`);
    console.log(`  reason: ${e.reason}`);
    const input = e.input.length > 200 ? e.input.slice(0, 200) + "…" : e.input;
    console.log(`  input:  ${JSON.stringify(input)}`);
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
