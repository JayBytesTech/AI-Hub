import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf-8"));
}

async function git(args) {
  const { stdout } = await execFileAsync("git", ["-C", repoRoot, ...args]);
  return stdout.trim();
}

async function sha256ForFile(filePath) {
  const data = await fs.readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
}

async function listFilesRecursive(rootDir) {
  const results = [];
  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }
  if (!existsSync(rootDir)) {
    return results;
  }
  await walk(rootDir);
  return results.sort((a, b) => a.localeCompare(b));
}

function toPosixRelative(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

async function collectArtifacts() {
  const candidates = [
    path.join(repoRoot, "apps/hub/dist"),
    path.join(repoRoot, "crates/tools-runner/target/release"),
    path.join(repoRoot, "apps/desktop/src-tauri/target/release/bundle")
  ];

  const artifacts = [];
  for (const candidate of candidates) {
    const files = await listFilesRecursive(candidate);
    for (const filePath of files) {
      const stats = await fs.stat(filePath);
      artifacts.push({
        path: toPosixRelative(filePath),
        bytes: stats.size,
        sha256: await sha256ForFile(filePath)
      });
    }
  }
  return artifacts;
}

async function main() {
  const rootPkg = await readJson(path.join(repoRoot, "package.json"));
  const commit = await git(["rev-parse", "HEAD"]);
  const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const dirty = (await git(["status", "--porcelain"])).length > 0;
  const version = rootPkg.version;
  const releaseTag = `v${version}`;

  const artifacts = await collectArtifacts();
  const manifest = {
    generatedAt: new Date().toISOString(),
    release: {
      version,
      tag: releaseTag,
      commit,
      branch,
      dirty
    },
    artifacts
  };

  const outDir = path.join(repoRoot, "releases");
  await fs.mkdir(outDir, { recursive: true });
  const shortSha = commit.slice(0, 8);
  const outPath = path.join(outDir, `manifest-${version}-${shortSha}.json`);
  await fs.writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Release manifest written: ${toPosixRelative(outPath)}`);
  console.log(`Artifacts indexed: ${artifacts.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
