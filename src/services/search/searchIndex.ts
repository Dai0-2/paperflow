import MiniSearch from 'minisearch';

export interface SearchIndexDocument {
  id: string;
  title: string;
  authors: string;
  abstract: string;
  tags: string;
  collections: string;
  body: string;
}

function tokenize(value: string): string[] {
  const normalized = value.toLocaleLowerCase().normalize('NFKC');
  const latin = normalized.match(/[\p{Script=Latin}\p{N}]{2,}/gu) || [];
  const cjkRuns = normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu) || [];
  const cjk = cjkRuns.flatMap((run) => {
    if (run.length < 2) return [run];
    return Array.from({ length: run.length - 1 }, (_, index) => run.slice(index, index + 2));
  });
  return [...new Set([...latin, ...cjk])];
}

export class PaperSearchIndex {
  private readonly index = new MiniSearch<SearchIndexDocument>({
    fields: ['title', 'authors', 'abstract', 'tags', 'collections', 'body'],
    storeFields: ['id'],
    tokenize,
    processTerm: (term) => term,
  });

  clear(): void {
    this.index.removeAll();
  }

  add(documents: SearchIndexDocument[]): void {
    if (documents.length) this.index.addAll(documents);
  }

  upsert(document: SearchIndexDocument): void {
    if (this.index.has(document.id)) this.index.replace(document);
    else this.index.add(document);
  }

  remove(id: string): void {
    if (this.index.has(id)) this.index.discard(id);
  }

  search(query: string, limit = 10_000): string[] {
    if (!query.trim()) return [];
    return this.index.search(query, {
      combineWith: 'AND',
      prefix: true,
      fuzzy: 0.15,
    }).slice(0, limit).map((result) => String(result.id));
  }
}
