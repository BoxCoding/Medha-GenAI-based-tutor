/* Playwright configuration for Medhā's browser tests.
 *
 * The suite runs against a real server started here with MEDHA_OFFLINE=1, so
 * it is deterministic, costs no Gemini calls, and needs no network.
 * MEDHA_PYTHON overrides the interpreter (CI installs deps onto PATH).
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const PORT = 8099;
// A scratch database, kept away from the developer's own medha.db. It is
// deliberately NOT deleted here: this file is re-evaluated in every worker
// process, so removing it would pull the file out from under the running
// server. Tests isolate themselves by registering a unique account instead.
const DATABASE = "/tmp/medha-e2e.db";

export default defineConfig({
  testDir: here,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `${process.env.MEDHA_PYTHON ?? ".venv/bin/python"} -m uvicorn backend.main:app --port ${PORT}`,
    cwd: projectRoot,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { MEDHA_OFFLINE: "1", MEDHA_DB: DATABASE },
  },
});
