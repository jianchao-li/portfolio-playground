// Next.js compiles client code (workers included) with `typeof window` replaced
// by "object", which strips libraries' "is there a window?" guards. Web Workers
// have no `window`, so web-llm's bundled logger would throw on startup. Alias it
// to the worker's global scope before any library code runs.
// This must be the worker's first import.
(self as unknown as { window: typeof self }).window = self;

export {};
