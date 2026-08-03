import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB per image
const MAX_TOTAL_IMAGE_BYTES = 50 * 1024 * 1024; // 50 MB total
const MAX_IMAGES = 20;
// -auto_identifiers evita que pandoc inserte bookmarks (anclas) en los encabezados
const PANDOC_FROM_FORMAT = "markdown+tex_math_single_backslash-auto_identifiers";
const REFERENCE_DOC = path.join(process.cwd(), "pandoc", "reference.docx");

// Prefer binaries downloaded by the postinstall script (bin/), fall back to system PATH
// On Windows, binaries have a .exe extension that must be included for existsSync to find them
const EXE = process.platform === "win32" ? ".exe" : "";
const LOCAL_PANDOC = path.join(process.cwd(), "bin", `pandoc${EXE}`);
const LOCAL_TYPST = path.join(process.cwd(), "bin", `typst${EXE}`);
const PANDOC_BIN = existsSync(LOCAL_PANDOC) ? LOCAL_PANDOC : "pandoc";
const TYPST_BIN = existsSync(LOCAL_TYPST) ? LOCAL_TYPST : "typst";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"]);

type OutputFormat = "docx" | "pdf";

const FORMAT_CONFIG: Record<
  OutputFormat,
  { extension: string; contentType: string; extraArgs: string[] }
> = {
  docx: {
    extension: "docx",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extraArgs: ["--reference-doc", REFERENCE_DOC],
  },
  pdf: {
    extension: "pdf",
    contentType: "application/pdf",
    // PDF is handled in two steps (see convertToPdf) so no --pdf-engine here
    extraArgs: [],
  },
};

class ConvertError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function sanitizeFilename(name: string): string {
  const base = name.replace(/\.(md|markdown|docx|pdf)$/i, "");
  const safe = base.replace(/[^a-zA-Z0-9áéíóúñüÁÉÍÓÚÑÜ._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe || "documento";
}

// Pandoc writes absolute paths (with drive letters on Windows, e.g. "C:/Users/...")
// into the intermediate .typ file. Typst cannot parse Windows drive letters in
// image() calls, so we convert absolute paths to relative ones from the workDir.
function fixTypstPaths(typContent: string, workDir: string): string {
  const cwd = path.resolve(workDir).replace(/\\/g, "/");
  return typContent.replace(/image\("([^"]+)"\)/g, (match, imgPath: string) => {
    const normalized = imgPath.replace(/\\/g, "/");
    if (path.isAbsolute(normalized)) {
      const relative = path.relative(cwd, normalized).replace(/\\/g, "/");
      return `image("${relative}")`;
    }
    return match;
  });
}

async function convertToPdf(workDir: string, inputPath: string, resourcePathArgs: string[]): Promise<void> {
  // Step 1: Generate .typ file with Pandoc (no --pdf-engine)
  const typPath = "intermediate.typ";
  try {
    await execFileAsync(
      PANDOC_BIN,
      [
        inputPath,
        "--from",
        PANDOC_FROM_FORMAT,
        ...resourcePathArgs,
        "-o",
        typPath,
      ],
      {
        cwd: workDir,
        timeout: 30_000,
        maxBuffer: 8 * 1024 * 1024,
      }
    );
  } catch (err) {
    const stderr =
      err instanceof Error && "stderr" in err ? String((err as { stderr: unknown }).stderr) : "";
    throw new ConvertError(500, `Pandoc falló: ${stderr || "error desconocido"}`);
  }

  // Step 2: Fix absolute paths in the .typ file (Windows drive-letter issue)
  const typContent = await readFile(path.join(workDir, typPath), "utf-8");
  const fixedContent = fixTypstPaths(typContent, workDir);
  await writeFile(path.join(workDir, typPath), fixedContent, "utf-8");

  // Step 3: Compile .typ to PDF with Typst
  try {
    await execFileAsync(
      TYPST_BIN,
      ["compile", "--root", ".", typPath, "output.pdf"],
      {
        cwd: workDir,
        timeout: 30_000,
        maxBuffer: 8 * 1024 * 1024,
      }
    );
  } catch (err) {
    const stderr =
      err instanceof Error && "stderr" in err ? String((err as { stderr: unknown }).stderr) : "";
    throw new ConvertError(500, `Typst falló: ${stderr || "error desconocido"}`);
  }
}

function parseFormat(value: unknown): OutputFormat {
  if (value === "pdf") return "pdf";
  return "docx"; // default
}

function isImageFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

type ExtractedRequest = {
  markdown: string;
  filename: string;
  format: OutputFormat;
  images: { name: string; data: Buffer }[];
};

async function extractRequest(req: NextRequest): Promise<ExtractedRequest> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ConvertError(400, "No se recibió ningún archivo .md");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > MAX_MARKDOWN_BYTES) {
      throw new ConvertError(413, "El archivo supera el límite de 2 MB");
    }
    const format = parseFormat(form.get("format"));

    // Collect image files from "images" field (can be multiple)
    const images: { name: string; data: Buffer }[] = [];
    let totalImageBytes = 0;
    const entries = form.getAll("images");
    for (const entry of entries) {
      if (!(entry instanceof File)) continue;
      if (!isImageFile(entry.name)) continue;
      if (images.length >= MAX_IMAGES) {
        throw new ConvertError(413, `Máximo ${MAX_IMAGES} imágenes por conversión`);
      }
      const imgBuffer = Buffer.from(await entry.arrayBuffer());
      if (imgBuffer.byteLength > MAX_IMAGE_BYTES) {
        throw new ConvertError(413, `La imagen "${entry.name}" supera el límite de 10 MB`);
      }
      totalImageBytes += imgBuffer.byteLength;
      if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) {
        throw new ConvertError(413, "El total de imágenes supera el límite de 50 MB");
      }
      images.push({ name: entry.name, data: imgBuffer });
    }

    return { markdown: buffer.toString("utf-8"), filename: sanitizeFilename(file.name), format, images };
  }

  // JSON body (no images in this path)
  const body = (await req.json().catch(() => null)) as {
    markdown?: unknown;
    filename?: unknown;
    format?: unknown;
  } | null;
  if (!body || typeof body.markdown !== "string" || body.markdown.trim() === "") {
    throw new ConvertError(400, "El cuerpo debe incluir 'markdown' como texto no vacío");
  }
  if (Buffer.byteLength(body.markdown, "utf-8") > MAX_MARKDOWN_BYTES) {
    throw new ConvertError(413, "El contenido supera el límite de 2 MB");
  }
  const filename = typeof body.filename === "string" ? sanitizeFilename(body.filename) : "documento";
  const format = parseFormat(body.format);
  return { markdown: body.markdown, filename, format, images: [] };
}

export async function POST(req: NextRequest) {
  let workDir: string | null = null;

  try {
    const { markdown, filename, format, images } = await extractRequest(req);
    const config = FORMAT_CONFIG[format];

    workDir = await mkdtemp(path.join(tmpdir(), "md2docx-"));
    const inputPath = "input.md";
    const outputPath = `output.${config.extension}`;
    await writeFile(path.join(workDir, inputPath), markdown, "utf-8");

    // Save uploaded images into the workDir so Pandoc and Typst can find them
    // Images go in the same directory as input.md so relative paths work for both
    if (images.length > 0) {
      for (const img of images) {
        // Sanitize image filename to prevent path traversal
        const safeName = path.basename(img.name).replace(/[^a-zA-Z0-9._-]+/g, "-");
        await writeFile(path.join(workDir, safeName), img.data);
      }
    }

    // --resource-path tells Pandoc where to look for images referenced in the markdown.
    // Using "." (relative to cwd=workDir) ensures Pandoc generates relative paths in
    // the intermediate .typ file, which Typst can resolve without drive-letter issues.
    const resourcePathArgs = images.length > 0 ? ["--resource-path", "."] : [];

    if (format === "pdf") {
      // PDF uses a two-step process: Pandoc -> .typ -> fix paths -> Typst -> .pdf
      // This avoids Windows drive-letter issues in Typst's image() calls
      await convertToPdf(workDir, inputPath, resourcePathArgs);
    } else {
      try {
        await execFileAsync(
          PANDOC_BIN,
          [
            inputPath,
            "--from",
            PANDOC_FROM_FORMAT,
            ...config.extraArgs,
            ...resourcePathArgs,
            "-o",
            outputPath,
          ],
          {
            cwd: workDir,
            timeout: 30_000,
            maxBuffer: 8 * 1024 * 1024,
          }
        );
      } catch (err) {
        const stderr =
          err instanceof Error && "stderr" in err ? String((err as { stderr: unknown }).stderr) : "";
        throw new ConvertError(500, `Pandoc falló: ${stderr || "error desconocido"}`);
      }
    }

    const output = await readFile(path.join(workDir, outputPath));

    return new NextResponse(new Uint8Array(output), {
      status: 200,
      headers: {
        "Content-Type": config.contentType,
        "Content-Disposition": `attachment; filename="${filename}.${config.extension}"`,
        "Content-Length": String(output.byteLength),
      },
    });
  } catch (err) {
    if (err instanceof ConvertError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Error inesperado en /api/convert:", err);
    return NextResponse.json({ error: "Error interno al convertir el documento" }, { status: 500 });
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
