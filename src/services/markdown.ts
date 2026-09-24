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

export function normalizeMathDelimiters(markdown: string): string {
  let fence: { marker: string; length: number } | undefined;
  return markdown.split('\n').map((line) => {
    const match = line.match(/^\s*(`{3,}|~{3,})/);
    if (match) {
      const marker = match[1][0];
      const length = match[1].length;
      if (!fence) fence = { marker, length };
      else if (fence.marker === marker && length >= fence.length) fence = undefined;
      return line;
    }
    return fence ? line : normalizeInlineDelimiters(line);
  }).join('\n');
}
