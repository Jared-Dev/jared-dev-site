import { parseJdUrl, fetchJobDescription } from "../src/lib/jd-fetch";
import { classify } from "../src/lib/classifier";
import { startEvalStream } from "../src/lib/eval";

async function main() {
  const input = process.argv.slice(2).join(" ").trim();
  if (!input) {
    console.error("Usage: npm run debug-fit -- <url-or-text>");
    process.exit(1);
  }

  let effectiveInput = input;
  const url = parseJdUrl(input);
  if (url) {
    console.log(`[1] URL detected: ${url.href}`);
    const fetched = await fetchJobDescription(url);
    if (!fetched.ok) {
      console.error(`[FETCH FAILED] ${fetched.reason}`);
      process.exit(1);
    }
    console.log(
      `[2] Fetched ${fetched.text.length} chars from ${fetched.sourceUrl}`,
    );
    effectiveInput = `Source URL: ${fetched.sourceUrl}\n\n${fetched.text}`;
  } else {
    console.log(`[1] No URL detected, treating as raw text (${input.length} chars)`);
  }

  console.log(`[3] Classifying (${effectiveInput.length} chars)...`);
  const verdict = await classify([], effectiveInput);
  console.log(
    `[4] VERDICT: ${verdict.verdict} / TYPE: ${verdict.type} / REASON: ${verdict.reason}`,
  );

  if (verdict.verdict !== "SAFE") {
    console.log("[STOP] Non-SAFE verdict, the bot would rebuff/redirect.");
    return;
  }

  console.log(`\n[5] Streaming main eval response...\n---\n`);
  const stream = startEvalStream([], effectiveInput);
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      process.stdout.write(event.delta.text);
    }
  }
  console.log("\n---\n[6] Done.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
