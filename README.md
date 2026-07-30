# LaTeX MD → DOCX

A web app that converts **Markdown files with LaTeX math formulas into Word documents (.docx)** with **native, editable Word equations** (OMML) — not images.

Built with Next.js (frontend + backend in one app) and [Pandoc](https://pandoc.org) as the conversion engine.

## Features

- **Markdown editor with live preview** — side-by-side editor and rendered preview powered by KaTeX
- **Full LaTeX math support** — inline and display formulas with all common delimiters:
  - `$...$` and `$$...$$`
  - `\(...\)` and `\[...\]`
- **Native Word equations** — formulas are converted to OMML (`<m:oMath>`), so they can be edited directly in Microsoft Word
- **GFM tables** — GitHub Flavored Markdown tables convert to native Word tables
- **File upload** — load an existing `.md` file or paste/type directly in the editor
- **Custom Word styling** — headings are exported in Arial, black color, without bookmark anchors
- **Clean output** — no Word bookmarks on headings, ready to submit or share

## How it works

```
.md file
   │
   ├─ Markdown content ──────────► Word XML (headings, lists, tables...)
   │
   └─ LaTeX formulas ────────────► OMML (native Word equations)

              Powered by Pandoc + a custom reference.docx template
```

The frontend sends the Markdown to the `/api/convert` endpoint, which runs Pandoc with:

- Input format: `markdown+tex_math_single_backslash-auto_identifiers`
- A custom style template (`pandoc/reference.docx`) that sets heading font to Arial and heading color to black

## Requirements

- **Node.js** 18+ (developed on v22)
- **Pandoc** 3.x available on the system `PATH`

### Installing Pandoc

Ubuntu/Debian:

```bash
sudo apt install pandoc
```

Or use the standalone binary (no root needed):

```bash
curl -sL -o pandoc.tar.gz https://github.com/jgm/pandoc/releases/download/3.10.1/pandoc-3.10.1-linux-amd64.tar.gz
tar xzf pandoc.tar.gz
cp pandoc-3.10.1/bin/pandoc ~/.local/bin/
```

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), write or upload your Markdown, and click **Descargar .docx**.

## Project structure

```
├── app/
│   ├── page.tsx              # Editor + live preview UI
│   ├── layout.tsx            # App shell and metadata
│   ├── globals.css           # Tailwind + typography plugin
│   └── api/convert/route.ts  # POST endpoint: markdown -> pandoc -> docx
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
  "filename": "my-document"
}
```

**Multipart:** form field `file` with a `.md` file.

**Response:** the `.docx` file as an attachment (`200 OK`), or a JSON error (`400`, `413`, `500`).

Example with curl:

```bash
curl -X POST http://localhost:3000/api/convert \
  -H "Content-Type: application/json" \
  -d '{"markdown":"# Test\n\n$E=mc^2$","filename":"test"}' \
  -o test.docx
```

## Verification

- Typecheck: `npx tsc --noEmit`
- Build: `npm run build`
- Confirm equations are native OMML in the output:

```bash
unzip -p test.docx word/document.xml | grep -o oMath
```

## Tech stack

- [Next.js](https://nextjs.org) (App Router, TypeScript)
- [Pandoc](https://pandoc.org) — Markdown → DOCX conversion
- [react-markdown](https://github.com/remarkjs/react-markdown) + [remark-math](https://github.com/remarkjs/remark-math) + [rehype-katex](https://github.com/remarkjs/remark-math) — live preview
- [KaTeX](https://katex.org) — fast math rendering
- [Tailwind CSS](https://tailwindcss.com) — styling
