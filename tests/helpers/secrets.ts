export const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ["plaid access token", /access-(sandbox|production)-[0-9a-f]{8}-[0-9a-f]{4}-/i],
  ["plaid link token", /link-(sandbox|production)-[0-9a-f]{8}-/i],
  ["plaid public token", /public-(sandbox|production)-[0-9a-f]{8}-/i],
  ["PLAID_SECRET value", /PLAID_SECRET\s*[=:]\s*["']?[0-9a-f]{20,}/i],
  ["PLAID_CLIENT_ID value", /PLAID_CLIENT_ID\s*[=:]\s*["']?[0-9a-f]{20,}/i],
  ["github token", /gh[pousr]_[A-Za-z0-9]{30,}/],
  ["github fine-grained", /github_pat_[A-Za-z0-9_]{30,}/],
  ["secret key", /sk_(live|test)_[A-Za-z0-9]{10,}/],
  ["aws key", /AKIA[0-9A-Z]{16}/],
  ["slack token", /xox[abprs]-[A-Za-z0-9-]{10,}/],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["bearer", /Bearer\s+[A-Za-z0-9._-]{30,}/],
];

export function scanText(text: string): string[] {
  return SECRET_PATTERNS.filter(([, re]) => re.test(text)).map(([n]) => n);
}

