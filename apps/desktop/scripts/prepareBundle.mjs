import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

const hubDistDir = path.join(repoRoot, "apps/hub/dist");
const hubPackageJson = path.join(repoRoot, "apps/hub/package.json");
const runnerReleaseExe = path.join(
  repoRoot,
  "crates/tools-runner/target/release/tools-runner.exe"
);

const tauriResourcesHubDir = path.join(repoRoot, "apps/desktop/src-tauri/resources/hub");
const tauriBinDir = path.join(repoRoot, "apps/desktop/src-tauri/bin");
const tauriRunnerExe = path.join(
  tauriBinDir,
  "tools-runner-x86_64-pc-windows-msvc.exe"
);

async function ensureExists(targetPath, message) {
  try {
    await fs.access(targetPath);
  } catch {
    throw new Error(message);
  }
}

async function main() {
  await ensureExists(
    hubDistDir,
    "Hub build output missing. Run `pnpm --filter @ai-hub/hub build` first."
  );
  await ensureExists(
    runnerReleaseExe,
    "Rust runner release binary missing. Run `cargo build --release --manifest-path crates/tools-runner/Cargo.toml` first."
  );

  await fs.rm(tauriResourcesHubDir, { recursive: true, force: true });
  await fs.mkdir(tauriResourcesHubDir, { recursive: true });
  await fs.cp(hubDistDir, path.join(tauriResourcesHubDir, "dist"), { recursive: true });
  await fs.copyFile(hubPackageJson, path.join(tauriResourcesHubDir, "package.json"));

  await fs.mkdir(tauriBinDir, { recursive: true });
  await fs.copyFile(runnerReleaseExe, tauriRunnerExe);

  console.log("Prepared Tauri bundle resources:");
  console.log(`- Hub files -> ${tauriResourcesHubDir}`);
  console.log(`- Tools runner -> ${tauriRunnerExe}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

