function normalizeInlineDelimiters(line: string): string {
  let result = '';
  let inlineCodeTicks = 0;
  for (let index = 0; index < line.length;) {
    if (line[index] === '`') {
      let ticks = 1;
      while (line[index + ticks] === '`') ticks += 1;
      if (inlineCodeTicks === 0) inlineCodeTicks = ticks;
      else if (inlineCodeTicks === ticks) inlineCodeTicks = 0;
      result += line.slice(index, index + ticks);
      index += ticks;
      continue;
    }
    if (inlineCodeTicks === 0 && line[index] === '\\') {
      const delimiter = line[index + 1];
      if (delimiter === '[' || delimiter === ']') {
        result += '$$';
        index += 2;
        continue;
      }
      if (delimiter === '(' || delimiter === ')') {
        result += '$';
        index += 2;
        continue;
      }
    }
    result += line[index];
    index += 1;
  }
  return result;
}

function looksLikeLatex(value: string): boolean {
  return /\\[a-zA-Z]+/.test(value);
}

function normalizeBareMath(line: string): string {
  if (line.includes('$')) return line;
  const display = line.match(/^(\s*)\[\s*(.*?)\s*\](\s*)$/);
  if (display && looksLikeLatex(display[2])) {
    return `${display[1]}$$\n${display[1]}${display[2]}\n${display[1]}$$${display[3]}`;
  }

  let result = '';
  let inlineCodeTicks = 0;
  for (let index = 0; index < line.length;) {
    if (line[index] === '`') {
      let ticks = 1;
      while (line[index + ticks] === '`') ticks += 1;
      if (inlineCodeTicks === 0) inlineCodeTicks = ticks;
      else if (inlineCodeTicks === ticks) inlineCodeTicks = 0;
      result += line.slice(index, index + ticks);
      index += ticks;
      continue;
    }
    if (inlineCodeTicks === 0 && line[index] === '(') {
      let depth = 1;
      let cursor = index + 1;
      while (cursor < line.length && depth > 0) {
        if (line[cursor] === '(') depth += 1;
        else if (line[cursor] === ')') depth -= 1;
        cursor += 1;
      }
      if (depth === 0) {
        const candidate = line.slice(index + 1, cursor - 1);
        if (looksLikeLatex(candidate)) {
          result += `$${candidate}$`;
          index = cursor;
          continue;
        }
      }
    }
    result += line[index];
    index += 1;
  }
  return result;
}

export function normalizeMathDelimiters(markdown: string): string {
  let fence: { marker: string; length: number } | undefined;
  let displayMath = false;
  return markdown.split('\n').map((line) => {
    const match = line.match(/^\s*(`{3,}|~{3,})/);
    if (match) {
      const marker = match[1][0];
      const length = match[1].length;
      if (!fence) fence = { marker, length };
      else if (fence.marker === marker && length >= fence.length) fence = undefined;
      return line;
    }
    if (fence) return line;
    const trimmed = line.trim();
    if (trimmed === '\\[') {
      displayMath = true;
      return line.replace('\\[', () => '$$');
    }
    if (trimmed === '\\]' && displayMath) {
      displayMath = false;
      return line.replace('\\]', () => '$$');
    }
    if (trimmed === '$$') {
      displayMath = !displayMath;
      return line;
    }
    return displayMath ? line : normalizeBareMath(normalizeInlineDelimiters(line));
  }).join('\n');
}
