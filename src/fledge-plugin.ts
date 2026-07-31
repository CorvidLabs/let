/**
 * Fledge plugin host entry (fledge-v1 JSON-lines protocol).
 * Invoked as: fledge let <args...>
 */

import {
  type InitMessage,
  recvJson,
  sendError,
  sendOutput,
} from "./fledge-protocol.ts";
import { runLet } from "./run.ts";

async function main(): Promise<void> {
  process.env.FLEDGE_PLUGIN = "1";
  const init = await recvJson<InitMessage>();
  const args = init.args ?? [];
  const projectRoot = init.project?.root;

  try {
    const result = await runLet(args, {
      cwd: projectRoot,
    });
    // Fledge expects plugin output as protocol messages, not raw stdout JSON.
    sendOutput(result.text.trimEnd());
    // Flush then exit with status for the host
    await new Promise<void>((resolve) => {
      process.stdout.write("", () => resolve());
    });
    process.exit(result.code);
  } catch (err) {
    sendError(err instanceof Error ? err.message : String(err));
    process.exit(10);
  }
}

await main();
