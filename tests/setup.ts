// Tests must never touch the network. Any accidental global fetch fails loudly.
globalThis.fetch = (() => {
  throw new Error("NETWORK DISABLED IN TESTS: global fetch was called");
}) as unknown as typeof fetch;
