<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Proyecto: latex-md-to-docx

Conversor web de Markdown con fórmulas LaTeX a DOCX (ecuaciones OMML nativas de Word) o PDF.

## Dependencias externas

- **Pandoc** y **Typst** se descargan automáticamente al directorio `bin/` del proyecto mediante el script `postinstall` (`scripts/install-binaries.mjs`). No se necesitan permisos de administrador ni instalación manual.
- Si los binarios no están en `bin/`, la API busca en el `PATH` del sistema como fallback.
- Para omitir la descarga automática: `SKIP_BIN_DOWNLOAD=1 npm install`.

## Plantilla de estilos DOCX

Se usa `--reference-doc pandoc/reference.docx` (solo para DOCX): plantilla propia (generada con `pandoc --print-default-data-file reference.docx`) con la fuente mayor del tema en **Arial** (`word/theme/theme1.xml`) y el color de los estilos Title/Subtitle/Heading1-9 en **negro** (`w:color w:val="000000"` en `word/styles.xml`). Para cambiar más estilos, editar esa plantilla (es un zip; modificar XML y re-empaquetar).

## Formato de salida

La API acepta un parámetro `format` (`"docx"` por defecto, o `"pdf"`) en el body JSON o como campo multipart. El frontend tiene un `<select>` para elegirlo.

## Comandos de verificación

- Typecheck: `npx tsc --noEmit`
- Build: `npm run build`
- Prueba manual de la API:
  ```sh
  npm run start &
  curl -X POST http://localhost:3000/api/convert \
    -H "Content-Type: application/json" \
    -d '{"markdown":"$E=mc^2$","filename":"test"}' -o test.docx
  unzip -p test.docx word/document.xml | grep -o oMath   # debe encontrar ecuaciones OMML
  ```

## Commits

Commit messages in English from now on. No AI tool attribution (no Co-Authored-By, no "Generated with").

