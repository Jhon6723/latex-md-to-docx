"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { normalizeBackslashMath } from "@/lib/normalize-backslash-math";
import "katex/dist/katex.min.css";

const SAMPLE_MARKDOWN = `# Documento de prueba

Escribe **Markdown** con formulas *LaTeX* a la izquierda y mira el resultado aqui.

## Formulas inline

La energia es $E = mc^2$ y el teorema de Pitagoras dice que $a^2 + b^2 = c^2$.

## Formulas en bloque

$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

## Tambien funciona con delimitadores de backslash

\\[\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}\\]

## Tablas

| Funcion | Derivada |
| ------- | -------- |
| $x^n$   | $nx^{n-1}$ |
| $e^x$   | $e^x$ |
| $\\sin x$ | $\\cos x$ |

## Imagenes

Para incluir una imagen en tu documento:

1. Haz clic en **Cargar imagenes** y selecciona el archivo
2. Escribe una referencia en el markdown: \`![descripcion](nombre-del-archivo.png)\`
3. La imagen aparecera en la vista previa y quedara embebida en el documento exportado

Ejemplo: \`![Grafico de la funcion](grafico.png)\`
`;

const IMAGE_EXTENSIONS = ".png,.jpg,.jpeg,.gif,.svg,.webp,.bmp";

type UploadedImage = {
  file: File;
  url: string;
};

function urlTransform(url: string): string {
  if (url.startsWith("blob:")) return url;
  if (!url.includes(":")) return url; // relative path / filename (e.g. uploaded image)
  return defaultUrlTransform(url);
}

export default function Home() {
  const [markdown, setMarkdown] = useState(SAMPLE_MARKDOWN);
  const [filename, setFilename] = useState("documento");
  const [format, setFormat] = useState<"docx" | "pdf">("docx");
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const previewMarkdown = useMemo(() => normalizeBackslashMath(markdown), [markdown]);

  // Revoke object URLs only on unmount (not when images change, to avoid
  // destroying URLs that are still in use by the preview)
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(() => {
    return () => {
      imagesRef.current.forEach((img) => URL.revokeObjectURL(img.url));
    };
  }, []);

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setMarkdown(text);
    setFilename(file.name.replace(/\.(md|markdown)$/i, "") || "documento");
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const newImages = files.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setImages((prev) => [...prev, ...newImages]);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function removeImage(index: number) {
    setImages((prev) => {
      const removed = prev[index];
      URL.revokeObjectURL(removed.url);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleConvert() {
    setConverting(true);
    setError(null);
    try {
      let res: Response;

      if (images.length > 0) {
        // Use multipart when there are images to upload
        const formData = new FormData();
        const mdBlob = new Blob([markdown], { type: "text/markdown" });
        formData.append("file", mdBlob, `${filename || "documento"}.md`);
        formData.append("format", format);
        for (const img of images) {
          formData.append("images", img.file, img.file.name);
        }
        res = await fetch("/api/convert", { method: "POST", body: formData });
      } else {
        // No images: use JSON (simpler, smaller payload)
        res = await fetch("/api/convert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdown, filename, format }),
        });
      }

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Error del servidor (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename || "documento"}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido al convertir");
    } finally {
      setConverting(false);
    }
  }

  // Resolve uploaded image filenames to blob URLs when rendering <img> in the preview
  const imgRenderer = useMemo(() => {
    return function MarkdownImage({
      src,
      alt,
      ...props
    }: React.ImgHTMLAttributes<HTMLImageElement>) {
      const matched = images.find((img) => img.file.name === src);
      return <img src={matched ? matched.url : src} alt={alt} {...props} />;
    };
  }, [images]);

  return (
    <main className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">LaTeX MD → DOCX / PDF</h1>
          <p className="text-sm text-zinc-400">
            Markdown con formulas LaTeX convertido a ecuaciones nativas de Word o PDF
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,text/markdown"
            className="hidden"
            onChange={handleFileUpload}
          />
          <input
            ref={imageInputRef}
            type="file"
            accept={IMAGE_EXTENSIONS}
            multiple
            className="hidden"
            onChange={handleImageUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-800"
          >
            Cargar .md
          </button>
          <button
            onClick={() => imageInputRef.current?.click()}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-800"
          >
            Cargar imagenes
          </button>
          <input
            type="text"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="nombre-archivo"
            className="w-44 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as "docx" | "pdf")}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          >
            <option value="docx">DOCX</option>
            <option value="pdf">PDF</option>
          </select>
          <button
            onClick={handleConvert}
            disabled={converting || markdown.trim() === ""}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {converting ? "Convirtiendo..." : `Descargar .${format}`}
          </button>
        </div>
      </header>

      {error && (
        <div className="border-b border-red-900 bg-red-950/60 px-6 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {images.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-6 py-3">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Imagenes ({images.length}):
          </span>
          {images.map((img, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
            >
              <img
                src={img.url}
                alt={img.file.name}
                className="h-6 w-6 rounded object-cover"
              />
              <span className="max-w-32 truncate text-zinc-400">{img.file.name}</span>
              <button
                onClick={() => removeImage(i)}
                className="text-zinc-500 hover:text-red-400"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 md:grid-cols-2">
        <section className="flex flex-col border-b border-zinc-800 md:border-b-0 md:border-r">
          <div className="border-b border-zinc-800 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Editor Markdown
          </div>
          <textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            spellCheck={false}
            className="min-h-[60vh] flex-1 resize-none bg-transparent p-4 font-mono text-sm leading-relaxed outline-none"
            placeholder="# Escribe aqui tu markdown con $formulas$ LaTeX..."
          />
        </section>

        <section className="flex flex-col bg-zinc-900/40">
          <div className="border-b border-zinc-800 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Vista previa
          </div>
          <article className="prose prose-invert max-w-none flex-1 overflow-y-auto p-6 text-zinc-100 [&_.katex]:text-zinc-100">
            <ReactMarkdown
              remarkPlugins={[remarkMath, remarkGfm]}
              rehypePlugins={[rehypeKatex]}
              urlTransform={urlTransform}
              components={{ img: imgRenderer }}
            >
              {previewMarkdown}
            </ReactMarkdown>
          </article>
        </section>
      </div>
    </main>
  );
}
