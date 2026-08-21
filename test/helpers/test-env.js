/**
 * Import this FIRST in every test file.
 *
 * `src/config/index.js` reads the environment once at module load, so the
 * database path has to be redirected before anything imports it. ESM evaluates
 * imports in source order, which makes a bare side-effect import the reliable
 * way to do this.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "jfi-test-"));

process.env.JFI_DB_PATH = join(dir, "test.db");
process.env.JFI_LLM_PROVIDER = "mock";
process.env.ANTHROPIC_API_KEY = "";
process.env.JFI_LOG_LEVEL = "error";
process.env.JFI_RESPECT_ROBOTS = "false";
process.env.JFI_ADMIN_PASSWORD = "";

export const testDir = dir;
