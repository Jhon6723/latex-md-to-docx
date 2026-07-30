<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Proyecto: latex-md-to-docx

Conversor web de Markdown con fórmulas LaTeX a DOCX con ecuaciones OMML nativas de Word.

## Dependencia externa: Pandoc

La conversión la ejecuta el binario de **Pandoc** (instalado en `~/.local/bin/pandoc`, v3.10.1), invocado desde `app/api/convert/route.ts` con `--from markdown+tex_math_single_backslash` para soportar `$...$`, `$$...$$`, `\(...\)` y `\[...\]`. Si Pandoc no está en el PATH, la API devuelve 500.

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

Sin atribución a herramientas de IA en los mensajes (sin Co-Authored-By ni "Generated with").

