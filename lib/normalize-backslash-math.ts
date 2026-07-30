const FENCE_RE = /^\s*(`{3,}|~{3,})/;
const CODE_SPAN_OR_MATH_RE = /(`+)[\s\S]*?\1|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g;

function convertOutsideCode(text: string): string {
  return text.replace(CODE_SPAN_OR_MATH_RE, (match, _ticks, display, inline) => {
    if (display !== undefined) return `$$${display}$$`;
    if (inline !== undefined) return `$${inline}$`;
    return match;
  });
}

export function normalizeBackslashMath(markdown: string): string {
  const lines = markdown.split("\n");
  const segments: { code: boolean; text: string }[] = [];
  let buffer: string[] = [];
  let inFence = false;
  let fenceChar = "";

  const flush = () => {
    if (buffer.length > 0) {
      segments.push({ code: inFence, text: buffer.join("\n") });
      buffer = [];
    }
  };

  for (const line of lines) {
    const fence = line.match(FENCE_RE);
    if (fence && (!inFence || fence[1][0] === fenceChar)) {
      if (inFence) {
        buffer.push(line);
        flush();
        inFence = false;
      } else {
        flush();
        inFence = true;
        fenceChar = fence[1][0];
        buffer.push(line);
      }
    } else {
      buffer.push(line);
    }
  }
  flush();

  return segments
    .map((segment) => (segment.code ? segment.text : convertOutsideCode(segment.text)))
    .join("\n");
}
