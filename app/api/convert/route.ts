import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024; // 2 MB
const PANDOC_FROM_FORMAT = "markdown+tex_math_single_backslash";

function sanitizeFilename(name: string): string {
  const base = name.replace(/\.(md|markdown)$/i, "");
  const safe = base.replace(/[^a-zA-Z0-9áéíóúñüÁÉÍÓÚÑÜ._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe || "documento";
}

async function extractMarkdown(req: NextRequest): Promise<{ markdown: string; filename: string }> {
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
    return { markdown: buffer.toString("utf-8"), filename: sanitizeFilename(file.name) };
  }

  const body = (await req.json().catch(() => null)) as { markdown?: unknown; filename?: unknown } | null;
  if (!body || typeof body.markdown !== "string" || body.markdown.trim() === "") {
    throw new ConvertError(400, "El cuerpo debe incluir 'markdown' como texto no vacío");
  }
  if (Buffer.byteLength(body.markdown, "utf-8") > MAX_MARKDOWN_BYTES) {
    throw new ConvertError(413, "El contenido supera el límite de 2 MB");
  }
  const filename = typeof body.filename === "string" ? sanitizeFilename(body.filename) : "documento";
  return { markdown: body.markdown, filename };
}

class ConvertError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function POST(req: NextRequest) {
  let workDir: string | null = null;

  try {
    const { markdown, filename } = await extractMarkdown(req);

    workDir = await mkdtemp(path.join(tmpdir(), "md2docx-"));
    const inputPath = path.join(workDir, "input.md");
    const outputPath = path.join(workDir, "output.docx");
    await writeFile(inputPath, markdown, "utf-8");

    try {
      await execFileAsync("pandoc", [inputPath, "--from", PANDOC_FROM_FORMAT, "-o", outputPath], {
        timeout: 30_000,
        maxBuffer: 8 * 1024 * 1024,
      });
    } catch (err) {
      const stderr = err instanceof Error && "stderr" in err ? String((err as { stderr: unknown }).stderr) : "";
      throw new ConvertError(500, `Pandoc falló: ${stderr || "error desconocido"}`);
    }

    const docx = await readFile(outputPath);

    return new NextResponse(new Uint8Array(docx), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}.docx"`,
        "Content-Length": String(docx.byteLength),
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
