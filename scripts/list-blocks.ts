import { listActiveBlocks } from "../src/lib/state";

async function main() {
  const blocks = await listActiveBlocks();
  if (blocks.length === 0) {
    console.log("No active blocks or cooldowns.");
    return;
  }
  console.log(`${blocks.length} active block(s):\n`);
  for (const { hash, identity } of blocks) {
    const status = identity.permanentBlock === 1
      ? "PERMANENT"
      : `cooldown until ${new Date(identity.cooldownUntil).toISOString()}`;
    console.log(`identity=${hash}`);
    console.log(`  offenses: ${identity.offenseCount}`);
    console.log(`  status:   ${status}`);
    console.log();
  }
  console.log("To clear: npm run unblock <identity-hash>");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
