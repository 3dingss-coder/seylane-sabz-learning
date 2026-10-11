// Read-only Cloudflare usage report (GraphQL Analytics API). Needs CF_API_TOKEN (read-only) and
// CF_ACCOUNT_ID. Prints markdown; never prints the token. Each section is independent: one failing
// query shows its error text and the rest still run.
const token = process.env.CF_API_TOKEN;
const account = process.env.CF_ACCOUNT_ID;
const script = process.env.CF_SCRIPT || 'seylane-sabz-learning';
const dbId = process.env.CF_D1_ID || 'f7a2ed30-00f4-42e6-b26f-343c24fe1853';
const hours = Number(process.env.REPORT_HOURS || 24);
if (!token || !account) {
  console.log('CF_API_TOKEN / CF_ACCOUNT_ID not set; nothing to report.');
  process.exit(0);
}
const to = new Date();
const from = new Date(to.getTime() - hours * 3600_000);
const vars = { account, script, dbId, from: from.toISOString(), to: to.toISOString() };

async function gql(query) {
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: vars }),
  });
  const j = await r.json().catch(() => ({}));
  if (j.errors?.length) throw new Error(j.errors.map((e) => e.message).join(' | '));
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return j.data?.viewer?.accounts?.[0] ?? {};
}

const sections = [];
async function section(title, fn) {
  try {
    sections.push(`## ${title}\n\n${await fn()}`);
  } catch (e) {
    sections.push(`## ${title}\n\nERROR: ${String(e.message).slice(0, 500)}`);
  }
}
const table = (head, rows) =>
  `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}`;
const n = (x) => (x === null || x === undefined ? '-' : Math.round(Number(x) * 10) / 10);

await section(`Worker: requests, errors, latency by status (last ${hours} h)`, async () => {
  const a =
    await gql(`query($account:String!,$script:String!,$from:Time!,$to:Time!){viewer{accounts(filter:{accountTag:$account}){
    workersInvocationsAdaptive(limit:100,filter:{scriptName:$script,datetime_geq:$from,datetime_leq:$to}){
      dimensions{status} sum{requests errors subrequests}
      quantiles{cpuTimeP50 cpuTimeP99 wallTimeP50 wallTimeP99 requestDurationP50 requestDurationP99}}}}}`);
  return table(
    [
      'status',
      'requests',
      'errors',
      'subrequests',
      'cpu p50 ms',
      'cpu p99 ms',
      'wall p50 ms',
      'wall p99 ms',
    ],
    (a.workersInvocationsAdaptive ?? []).map((g) => [
      g.dimensions.status,
      g.sum.requests,
      g.sum.errors,
      g.sum.subrequests,
      n(g.quantiles.cpuTimeP50 / 1000),
      n(g.quantiles.cpuTimeP99 / 1000),
      n(g.quantiles.wallTimeP50 / 1000),
      n(g.quantiles.wallTimeP99 / 1000),
    ]),
  );
});

await section('Worker: per hour (requests / errors / wall p99 ms)', async () => {
  const a =
    await gql(`query($account:String!,$script:String!,$from:Time!,$to:Time!){viewer{accounts(filter:{accountTag:$account}){
    workersInvocationsAdaptive(limit:200,orderBy:[datetimeHour_ASC],filter:{scriptName:$script,datetime_geq:$from,datetime_leq:$to}){
      dimensions{datetimeHour} sum{requests errors} quantiles{wallTimeP99 cpuTimeP99}}}}}`);
  const by = new Map();
  for (const g of a.workersInvocationsAdaptive ?? []) {
    const k = g.dimensions.datetimeHour;
    const o = by.get(k) ?? { r: 0, e: 0, w: 0, c: 0 };
    o.r += g.sum.requests;
    o.e += g.sum.errors;
    o.w = Math.max(o.w, g.quantiles.wallTimeP99 / 1000);
    o.c = Math.max(o.c, g.quantiles.cpuTimeP99 / 1000);
    by.set(k, o);
  }
  return table(
    ['hour (UTC)', 'requests', 'errors', 'wall p99 ms', 'cpu p99 ms'],
    [...by].map(([k, o]) => [k, o.r, o.e, n(o.w), n(o.c)]),
  );
});

await section('D1: queries and rows', async () => {
  const a =
    await gql(`query($account:String!,$dbId:String!,$from:Time!,$to:Time!){viewer{accounts(filter:{accountTag:$account}){
    d1AnalyticsAdaptiveGroups(limit:100,filter:{databaseId:$dbId,datetime_geq:$from,datetime_leq:$to}){
      dimensions{databaseId} sum{readQueries writeQueries rowsRead rowsWritten}}}}}`);
  return table(
    ['read queries', 'write queries', 'rows read', 'rows written'],
    (a.d1AnalyticsAdaptiveGroups ?? []).map((g) => [
      g.sum.readQueries,
      g.sum.writeQueries,
      g.sum.rowsRead,
      g.sum.rowsWritten,
    ]),
  );
});

await section('D1: query latency', async () => {
  const a =
    await gql(`query($account:String!,$dbId:String!,$from:Time!,$to:Time!){viewer{accounts(filter:{accountTag:$account}){
    d1QueriesAdaptiveGroups(limit:100,filter:{databaseId:$dbId,datetime_geq:$from,datetime_leq:$to}){
      count quantiles{queryDurationMsP50 queryDurationMsP95 queryDurationMsP99}}}}}`);
  return table(
    ['queries', 'p50 ms', 'p95 ms', 'p99 ms'],
    (a.d1QueriesAdaptiveGroups ?? []).map((g) => [
      g.count,
      n(g.quantiles.queryDurationMsP50),
      n(g.quantiles.queryDurationMsP95),
      n(g.quantiles.queryDurationMsP99),
    ]),
  );
});

await section('R2: operations', async () => {
  const a =
    await gql(`query($account:String!,$from:Time!,$to:Time!){viewer{accounts(filter:{accountTag:$account}){
    r2OperationsAdaptiveGroups(limit:50,filter:{datetime_geq:$from,datetime_leq:$to}){
      dimensions{actionType} sum{requests}}}}}`);
  return table(
    ['action', 'requests'],
    (a.r2OperationsAdaptiveGroups ?? []).map((g) => [g.dimensions.actionType, g.sum.requests]),
  );
});

const out = `# Cloudflare report (${vars.from} .. ${vars.to})\n\n${sections.join('\n\n')}\n`;
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, out);
}
