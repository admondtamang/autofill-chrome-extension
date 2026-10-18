/**
 * Smoke test script for the ImmiFill CRM API.
 * Run with: npm run smoke
 *
 * Skipped entirely if CRM_TEST_EMAIL or CRM_TEST_PASSWORD is not set.
 * Prints ONLY: status codes, count, key names of first row (no values, no token).
 */

const email = process.env["CRM_TEST_EMAIL"];
const password = process.env["CRM_TEST_PASSWORD"];

if (!email || !password) {
  console.log("smoke test skipped");
  process.exit(0);
}

const BASE_URL = "https://api.successedu.com.au/success-crm";
const RECORD_TYPES = ["visaApplicant", "student", "lead"] as const;

type LoginResponse = {
  token: string;
  expiry: number;
  user: Record<string, unknown>;
};

type SearchEnvelope = {
  count: number;
  rows: Record<string, unknown>[];
};

async function post(path: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const json: unknown = await res.json();
  return { status: res.status, json };
}

async function get(
  path: string,
  params: Record<string, string | number>,
  token: string,
): Promise<{ status: number; json: unknown }> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const json: unknown = await res.json();
  return { status: res.status, json };
}

async function main(): Promise<void> {
  // Login
  const loginResult = await post("/auth/login", { email, password });
  console.log(`POST /auth/login → ${loginResult.status}`);

  if (loginResult.status !== 200) {
    console.error("Login failed, aborting smoke test");
    process.exit(1);
  }

  const loginData = loginResult.json as LoginResponse;
  const token = loginData.token;

  // Test each record type
  for (const recordType of RECORD_TYPES) {
    const path = `/${recordType}`;

    // limit=1
    const r1 = await get(path, { limit: 1, page: 1 }, token);
    const d1 = r1.json as SearchEnvelope;
    console.log(`GET ${path}?limit=1&page=1 → ${r1.status} count=${d1.count}`);
    if (d1.rows.length > 0) {
      const firstRow = d1.rows[0];
      if (firstRow !== undefined) {
        console.log(`  first row keys: [${Object.keys(firstRow).join(", ")}]`);
      }
    }

    // page=2
    const r2 = await get(path, { limit: 1, page: 2 }, token);
    const d2 = r2.json as SearchEnvelope;
    console.log(`GET ${path}?limit=1&page=2 → ${r2.status} count=${d2.count}`);

    // q=test
    const r3 = await get(path, { limit: 1, page: 1, q: "test" }, token);
    const d3 = r3.json as SearchEnvelope;
    console.log(`GET ${path}?limit=1&page=1&q=test → ${r3.status} count=${d3.count}`);
  }

  // Try raw-token auth header (no "Bearer" prefix)
  const url = new URL(`${BASE_URL}/visaApplicant`);
  url.searchParams.set("limit", "1");
  url.searchParams.set("page", "1");
  const rawRes = await fetch(url.toString(), {
    headers: { accept: "application/json", Authorization: token },
  });
  console.log(`GET /visaApplicant raw-token → ${rawRes.status}`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Smoke test error: ${message}`);
  process.exit(1);
});
