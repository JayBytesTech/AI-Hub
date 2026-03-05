import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

async function git(args) {
  const { stdout } = await execFileAsync("git", ["-C", repoRoot, ...args]);
  return stdout.trim();
}

async function ensureRef(ref) {
  await git(["rev-parse", "--verify", ref]);
}

async function main() {
  const targetRef = process.argv[2];
  if (!targetRef) {
    throw new Error("Usage: node scripts/release/rollbackPlan.mjs <target-ref>");
  }

  await ensureRef(targetRef);
  const currentRef = await git(["rev-parse", "HEAD"]);
  const currentBranch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const targetSha = await git(["rev-parse", targetRef]);
  const summary = await git(["log", "--oneline", "--decorate", "-n", "8", `${targetSha}..${currentRef}`]);

  console.log("Rollback Plan");
  console.log(`- Current branch: ${currentBranch}`);
  console.log(`- Current commit: ${currentRef}`);
  console.log(`- Target ref: ${targetRef}`);
  console.log(`- Target commit: ${targetSha}`);
  console.log("");
  console.log("Commits that would be rolled back:");
  console.log(summary.length > 0 ? summary : "(none)");
  console.log("");
  console.log("Recommended rollback commands:");
  console.log(`1. git checkout ${currentBranch}`);
  console.log(`2. git pull --ff-only origin ${currentBranch}`);
  console.log(`3. git revert --no-edit ${targetSha}..${currentRef}`);
  console.log(`4. pnpm verify`);
  console.log(`5. git push origin ${currentBranch}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
