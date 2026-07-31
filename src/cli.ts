/**
 * Standalone CLI entry: `let` / `bin/let`.
 */

import { runLet } from "./run.ts";

const result = await runLet(process.argv.slice(2));
process.stdout.write(result.text);
process.exit(result.code);
