// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Setup fake IndexedDB for testing
import 'fake-indexeddb/auto';

// Polyfill for structuredClone in Node.js environments that don't have it
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = (obj: any) => JSON.parse(JSON.stringify(obj));
}

// Minimal localStorage/sessionStorage polyfills for Jest (Node) environment
(() => {
  const makeStorage = () => {
    const store = new Map<string, string>();
    return {
      get length() { return store.size; },
      clear() { store.clear(); },
      getItem(key: string) { return store.has(key) ? store.get(key)! : null; },
      key(index: number) { return Array.from(store.keys())[index] ?? null; },
      removeItem(key: string) { store.delete(key); },
      setItem(key: string, value: string) { store.set(String(key), String(value)); }
    } as Storage;
  };
  if (typeof (globalThis as any).localStorage === 'undefined') {
    (globalThis as any).localStorage = makeStorage();
  }
  if (typeof (globalThis as any).sessionStorage === 'undefined') {
    (globalThis as any).sessionStorage = makeStorage();
  }
})();