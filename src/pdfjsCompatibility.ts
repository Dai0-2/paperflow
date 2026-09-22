type MapExtensions = {
  getOrInsert(key: unknown, value: unknown): unknown;
  getOrInsertComputed(key: unknown, callback: (key: unknown) => unknown): unknown;
};

const mapPrototype = Map.prototype as unknown as Partial<MapExtensions>;

if (!mapPrototype.getOrInsert) {
  Object.defineProperty(Map.prototype, 'getOrInsert', {
    configurable: true,
    writable: true,
    value(this: Map<unknown, unknown>, key: unknown, value: unknown) {
      if (this.has(key)) return this.get(key);
      this.set(key, value);
      return value;
    },
  });
}

if (!mapPrototype.getOrInsertComputed) {
  Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
    configurable: true,
    writable: true,
    value(this: Map<unknown, unknown>, key: unknown, callback: (key: unknown) => unknown) {
      if (this.has(key)) return this.get(key);
      const value = callback(key);
      this.set(key, value);
      return value;
    },
  });
}
