export interface ScriptToken {
  kind: 'text' | 'sup' | 'sub';
  value: string;
}

interface ScriptParseResult {
  value: string;
  nextIndex: number;
}

function parseScriptValue(text: string, index: number): ScriptParseResult | null {
  const first = text[index];
  if (!first) return null;

  if (first === '{') {
    let depth = 1;
    let cursor = index + 1;
    while (cursor < text.length) {
      const char = text[cursor];
      if (!char) break;
      if (char === '\\') {
        cursor += 2;
        continue;
      }
      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return {
            value: text.slice(index + 1, cursor),
            nextIndex: cursor + 1,
          };
        }
      }
      cursor += 1;
    }
    return null;
  }

  const match = text.slice(index).match(/^[A-Za-z0-9]+/);
  if (!match) return null;

  return {
    value: match[0],
    nextIndex: index + match[0].length,
  };
}

export function parseTextScripts(content: string): ScriptToken[] {
  if (!content) return [];

  const tokens: ScriptToken[] = [];
  let buffer = '';
  let i = 0;

  const flushBuffer = () => {
    if (!buffer) return;
    tokens.push({ kind: 'text', value: buffer });
    buffer = '';
  };

  while (i < content.length) {
    const char = content[i];
    if (!char) break;

    if (char === '\\' && (content[i + 1] === '^' || content[i + 1] === '_')) {
      buffer += content[i + 1];
      i += 2;
      continue;
    }

    if (char === '^' || char === '_') {
      const parsed = parseScriptValue(content, i + 1);
      if (!parsed) {
        buffer += char;
        i += 1;
        continue;
      }

      flushBuffer();
      tokens.push({
        kind: char === '^' ? 'sup' : 'sub',
        value: parsed.value,
      });
      i = parsed.nextIndex;
      continue;
    }

    buffer += char;
    i += 1;
  }

  flushBuffer();
  return tokens;
}

