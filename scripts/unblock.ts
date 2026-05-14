import { clearIdentity, getIdentity } from "../src/lib/state";

async function main() {
  const hash = process.argv[2];
  if (!hash) {
    console.error("Usage: npm run unblock <identity-hash>");
    console.error("List active blocks: npm run list-blocks");
    process.exit(1);
  }
  const before = await getIdentity(hash);
  if (before.offenseCount === 0 && before.cooldownUntil === 0 && before.permanentBlock === 0) {
    console.log(`No record for identity ${hash}.`);
    return;
  }
  await clearIdentity(hash);
  console.log(`Cleared identity ${hash}.`);
  console.log(`  was offenses: ${before.offenseCount}`);
  console.log(`  was permanent: ${before.permanentBlock === 1}`);
  console.log(`  was cooldownUntil: ${before.cooldownUntil ? new Date(before.cooldownUntil).toISOString() : "none"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
