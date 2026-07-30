#!/usr/bin/env node
/**
 * postinstall script: downloads Pandoc and Typst binaries into bin/ so the
 * project is self-contained after `npm install`. No system-level install needed.
 *
 * Skipped automatically when the binaries already exist or when SKIP_BIN_DOWNLOAD=1.
 */
import { createWriteStream, existsSync, mkdirSync, chmodSync, renameSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_DIR = path.join(__dirname, "..", "bin");

const PANDOC_VERSION = "3.10.1";
const TYPST_VERSION = "0.15.1";

const PLATFORMS = {
  "linux-x64": {
    pandoc: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-amd64.tar.gz`,
    pandocBin: (extracted) => path.join(extracted, "bin", "pandoc"),
    typst: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz`,
    typstBin: (extracted) => path.join(extracted, "typst"),
  },
  "linux-arm64": {
    pandoc: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-arm64.tar.gz`,
    pandocBin: (extracted) => path.join(extracted, "bin", "pandoc"),
    typst: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-aarch64-unknown-linux-musl.tar.xz`,
    typstBin: (extracted) => path.join(extracted, "typst"),
  },
  "darwin-x64": {
    pandoc: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-x86_64-macOS.zip`,
    pandocBin: (extracted) => path.join(extracted, "bin", "pandoc"),
    typst: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-apple-darwin.tar.xz`,
    typstBin: (extracted) => path.join(extracted, "typst"),
  },
  "darwin-arm64": {
    pandoc: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-arm64-macOS.zip`,
    pandocBin: (extracted) => path.join(extracted, "bin", "pandoc"),
    typst: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-aarch64-apple-darwin.tar.xz`,
    typstBin: (extracted) => path.join(extracted, "typst"),
  },
  "win32-x64": {
    pandoc: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-windows-x86_64.zip`,
    pandocBin: (extracted) => path.join(extracted, "pandoc.exe"),
    typst: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-pc-windows-msvc.zip`,
    typstBin: (extracted) => path.join(extracted, "typst.exe"),
  },
};

function getPlatformKey() {
  const platform = process.platform;
  const arch = process.arch;
  const key = `${platform}-${arch}`;
  if (!(key in PLATFORMS)) {
    throw new Error(`Unsupported platform: ${key}. Please install Pandoc and Typst manually.`);
  }
  return key;
}

async function downloadFile(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  const ws = createWriteStream(dest);
  await pipeline(res.body, ws);
}

async function extractArchive(archivePath, destDir, isZip) {
  const { execFileSync } = await import("node:child_process");
  mkdirSync(destDir, { recursive: true });
  if (isZip) {
    execFileSync("unzip", ["-q", "-o", archivePath, "-d", destDir], { stdio: "inherit" });
  } else if (archivePath.endsWith(".tar.xz")) {
    execFileSync("tar", ["xf", archivePath, "-C", destDir, "--strip-components=1"], { stdio: "inherit" });
  } else {
    execFileSync("tar", ["xzf", archivePath, "-C", destDir, "--strip-components=1"], { stdio: "inherit" });
  }
}

async function installBinary(name, url, binFinder, isZip) {
  const binPath = path.join(BIN_DIR, process.platform === "win32" ? `${name}.exe` : name);
  if (existsSync(binPath)) {
    console.log(`  ${name}: already present, skipping`);
    return;
  }

  console.log(`  ${name}: downloading from ${url}`);
  const archivePath = path.join(BIN_DIR, path.basename(new URL(url).pathname));
  await downloadFile(url, archivePath);

  const extractDir = path.join(BIN_DIR, `${name}-extract`);
  await extractArchive(archivePath, extractDir, isZip);

  const extractedBin = binFinder(extractDir);
  if (!existsSync(extractedBin)) {
    throw new Error(`Binary not found at expected path after extraction: ${extractedBin}`);
  }
  renameSync(extractedBin, binPath);
  if (process.platform !== "win32") chmodSync(binPath, 0o755);

  // cleanup
  const { rmSync } = await import("node:fs");
  rmSync(extractDir, { recursive: true, force: true });
  rmSync(archivePath, { force: true });
  console.log(`  ${name}: installed at ${path.relative(process.cwd(), binPath)}`);
}

async function main() {
  if (process.env.SKIP_BIN_DOWNLOAD === "1") {
    console.log("Skipping binary download (SKIP_BIN_DOWNLOAD=1)");
    return;
  }

  mkdirSync(BIN_DIR, { recursive: true });

  const key = getPlatformKey();
  const cfg = PLATFORMS[key];
  console.log(`Installing binaries for ${key}...`);

  const isZipPandoc = cfg.pandoc.endsWith(".zip");
  const isZipTypst = cfg.typst.endsWith(".zip");

  await installBinary("pandoc", cfg.pandoc, cfg.pandocBin, isZipPandoc);
  await installBinary("typst", cfg.typst, cfg.typstBin, isZipTypst);

  console.log("All binaries installed.");
}

main().catch((err) => {
  console.error("Binary installation failed:", err.message);
  console.error("You can install Pandoc and Typst manually and add them to your PATH.");
  process.exit(0); // don't fail npm install
});
