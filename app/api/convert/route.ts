import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024; // 2 MB
// -auto_identifiers evita que pandoc inserte bookmarks (anclas) en los encabezados
const PANDOC_FROM_FORMAT = "markdown+tex_math_single_backslash-auto_identifiers";
const REFERENCE_DOC = path.join(process.cwd(), "pandoc", "reference.docx");

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
    extraArgs: ["--pdf-engine=typst"],
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

function parseFormat(value: unknown): OutputFormat {
  if (value === "pdf") return "pdf";
  return "docx"; // default
}

async function extractMarkdown(
  req: NextRequest
): Promise<{ markdown: string; filename: string; format: OutputFormat }> {
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
    return { markdown: buffer.toString("utf-8"), filename: sanitizeFilename(file.name), format };
  }

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
  return { markdown: body.markdown, filename, format };
}

export async function POST(req: NextRequest) {
  let workDir: string | null = null;

  try {
    const { markdown, filename, format } = await extractMarkdown(req);
    const config = FORMAT_CONFIG[format];

    workDir = await mkdtemp(path.join(tmpdir(), "md2docx-"));
    const inputPath = path.join(workDir, "input.md");
    const outputPath = path.join(workDir, `output.${config.extension}`);
    await writeFile(inputPath, markdown, "utf-8");

    try {
      await execFileAsync(
        "pandoc",
        [inputPath, "--from", PANDOC_FROM_FORMAT, ...config.extraArgs, "-o", outputPath],
        {
          timeout: 30_000,
          maxBuffer: 8 * 1024 * 1024,
        }
      );
    } catch (err) {
      const stderr = err instanceof Error && "stderr" in err ? String((err as { stderr: unknown }).stderr) : "";
      throw new ConvertError(500, `Pandoc falló: ${stderr || "error desconocido"}`);
    }

    const output = await readFile(outputPath);

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
