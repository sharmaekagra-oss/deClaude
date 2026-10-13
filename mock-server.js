// Same as dev-server.js but /api/rewrite returns a canned response, so the UI can be tested without an API key.
process.env.MOCK = "1";
await import("./dev-server.js");
