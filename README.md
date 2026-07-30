# LaTeX MD → DOCX / PDF

A web app that converts **Markdown files with LaTeX math formulas into Word documents (.docx) or PDF** — with **native, editable Word equations** (OMML) when exporting to DOCX, and properly typeset math when exporting to PDF.

Built with Next.js (frontend + backend in one app), [Pandoc](https://pandoc.org) as the conversion engine, and [Typst](https://typst.app) as the PDF engine.

## Features

- **Markdown editor with live preview** — side-by-side editor and rendered preview powered by KaTeX
- **Full LaTeX math support** — inline and display formulas with all common delimiters:
  - `$...$` and `$$...$$`
  - `\(...\)` and `\[...\]`
- **Export to DOCX** — formulas are converted to OMML (`<m:oMath>`), so they can be edited directly in Microsoft Word
- **Export to PDF** — math is typeset natively by Typst, producing clean, print-ready PDFs
- **GFM tables** — GitHub Flavored Markdown tables convert to native Word tables (DOCX) or rendered tables (PDF)
- **File upload** — load an existing `.md` file or paste/type directly in the editor
- **Custom Word styling** — DOCX headings are exported in Arial, black color, without bookmark anchors
- **Clean output** — no Word bookmarks on headings, ready to submit or share

## How it works

```
.md file
   │
   ├─ Markdown content ──────────► Word XML / PDF (headings, lists, tables...)
   │
   └─ LaTeX formulas ────────────► OMML (DOCX) / typeset math (PDF)

              Powered by Pandoc + Typst (PDF) / custom reference.docx (DOCX)
```

The frontend sends the Markdown and desired format to the `/api/convert` endpoint, which runs Pandoc with:

- Input format: `markdown+tex_math_single_backslash-auto_identifiers`
- For DOCX: a custom style template (`pandoc/reference.docx`) that sets heading font to Arial and heading color to black
- For PDF: `--pdf-engine` pointing to the local Typst binary for native math typesetting

## Requirements

- **Node.js** 18+ (developed on v22)

**Pandoc** and **Typst** are downloaded automatically by a `postinstall` script into `bin/` — no manual installation or admin privileges needed. Just run `npm install` and everything is ready.

To skip the automatic download (e.g. in CI or if you have them installed system-wide):

```bash
SKIP_BIN_DOWNLOAD=1 npm install
```

The API falls back to system `PATH` if the local binaries are not found.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), write or upload your Markdown, choose **DOCX** or **PDF** from the dropdown, and click the download button.

## Project structure

```
├── app/
│   ├── page.tsx              # Editor + live preview UI
│   ├── layout.tsx            # App shell and metadata
│   ├── globals.css           # Tailwind + typography plugin
│   └── api/convert/route.ts  # POST endpoint: markdown -> pandoc -> docx/pdf
├── lib/
│   └── normalize-backslash-math.ts  # Converts \(...\) and \[...\] to $...$ for the preview
├── scripts/
│   └── install-binaries.mjs  # postinstall: downloads Pandoc and Typst into bin/
├── pandoc/
│   └── reference.docx        # Custom Word style template (Arial black headings)
└── AGENTS.md                 # Notes for AI agents working on this repo
```

## API

### `POST /api/convert`

Accepts either JSON or multipart form data.

**JSON body:**

```json
{
  "markdown": "# Title\n\nFormula: $E = mc^2$",
  "filename": "my-document",
  "format": "docx"
}
```

The `format` field accepts `"docx"` (default) or `"pdf"`.

**Multipart:** form field `file` with a `.md` file, plus an optional `format` field.

**Response:** the converted file as an attachment (`200 OK`), or a JSON error (`400`, `413`, `500`).

Example with curl (DOCX):

```bash
curl -X POST http://localhost:3000/api/convert \
  -H "Content-Type: application/json" \
  -d '{"markdown":"# Test\n\n$E=mc^2$","filename":"test","format":"docx"}' \
  -o test.docx
```

For PDF, just change `"format": "pdf"` and the output filename.

## Verification

- Typecheck: `npx tsc --noEmit`
- Build: `npm run build`
- Confirm equations are native OMML in the output:

```bash
unzip -p test.docx word/document.xml | grep -o oMath
```

## Tech stack

- [Next.js](https://nextjs.org) (App Router, TypeScript)
- [Pandoc](https://pandoc.org) — Markdown → DOCX/PDF conversion
- [Typst](https://typst.app) — PDF engine with native math typesetting
- [react-markdown](https://github.com/remarkjs/react-markdown) + [remark-math](https://github.com/remarkjs/remark-math) + [rehype-katex](https://github.com/remarkjs/remark-math) — live preview
- [KaTeX](https://katex.org) — fast math rendering
- [Tailwind CSS](https://tailwindcss.com) — styling
