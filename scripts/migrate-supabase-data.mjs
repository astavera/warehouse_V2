import { createClient } from '@supabase/supabase-js';

const requiredEnv = [
  'SOURCE_SUPABASE_URL',
  'SOURCE_SUPABASE_SERVICE_ROLE_KEY',
  'TARGET_SUPABASE_URL',
  'TARGET_SUPABASE_SERVICE_ROLE_KEY',
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const source = createClient(
  process.env.SOURCE_SUPABASE_URL,
  process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const target = createClient(
  process.env.TARGET_SUPABASE_URL,
  process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const TABLES = [
  'carriers',
  'employees',
  'suppliers',
  'receipt_batches',
  'receipt_items',
  'receipt_photos',
];

const EMPLOYEE_PASSCODES = process.env.EMPLOYEE_PASSCODES_JSON
  ? JSON.parse(process.env.EMPLOYEE_PASSCODES_JSON)
  : {};

function buildFallbackPasscode(row, usedPasscodes) {
  let seed = 0;
  const source = `${row.id}-${row.name}`;
  for (const char of source) {
    seed = (seed * 31 + char.charCodeAt(0)) % 10000;
  }

  let candidate = String(seed).padStart(4, '0');
  while (usedPasscodes.has(candidate)) {
    candidate = String((Number(candidate) + 1) % 10000).padStart(4, '0');
  }

  return candidate;
}

async function fetchAllRows(client, table) {
  const pageSize = 1000;
  let from = 0;
  let rows = [];

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await client.from(table).select('*').range(from, to);
    if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
    rows = rows.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function truncateTargetTable(table) {
  const { error } = await target.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) {
    throw new Error(`Failed clearing ${table} on target: ${error.message}`);
  }
}

async function insertRows(table, rows) {
  if (!rows.length) {
    console.log(`Skipping ${table}: no rows found`);
    return;
  }

  const preparedRows =
    table === 'employees'
      ? (() => {
          const usedPasscodes = new Set(rows.map(row => row.passcode).filter(Boolean));
          return rows.map(row => {
          const passcode =
            row.passcode ||
            EMPLOYEE_PASSCODES[row.name] ||
            buildFallbackPasscode(row, usedPasscodes);
          usedPasscodes.add(passcode);
          return { ...row, passcode };
        });
        })()
      : rows;

  const chunkSize = 500;
  for (let i = 0; i < preparedRows.length; i += chunkSize) {
    const chunk = preparedRows.slice(i, i + chunkSize);
    const { error } = await target.from(table).insert(chunk);
    if (error) throw new Error(`Failed inserting into ${table}: ${error.message}`);
  }

  console.log(`Inserted ${preparedRows.length} row(s) into ${table}`);
}

async function listAllStoragePaths(client, bucket, prefix = '') {
  const pageSize = 100;
  let offset = 0;
  let all = [];

  while (true) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) throw new Error(`Failed listing storage ${bucket}/${prefix}: ${error.message}`);

    const entries = data || [];
    all = all.concat(entries);

    if (entries.length < pageSize) break;
    offset += pageSize;
  }

  const files = [];
  for (const entry of all) {
    if (!entry.id) {
      const nestedPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
      const nestedFiles = await listAllStoragePaths(client, bucket, nestedPrefix);
      files.push(...nestedFiles);
    } else {
      files.push(prefix ? `${prefix}/${entry.name}` : entry.name);
    }
  }

  return files;
}

async function ensureBucketExists(bucket) {
  const { data, error } = await target.storage.listBuckets();
  if (error) throw new Error(`Failed to list target buckets: ${error.message}`);

  if (data.some(item => item.name === bucket)) {
    return;
  }

  const { error: createError } = await target.storage.createBucket(bucket, {
    public: true,
  });
  if (createError) throw new Error(`Failed creating bucket ${bucket}: ${createError.message}`);
}

async function copyStorageBucket(bucket) {
  await ensureBucketExists(bucket);
  const files = await listAllStoragePaths(source, bucket);

  if (!files.length) {
    console.log(`Skipping storage bucket ${bucket}: no files found`);
    return;
  }

  for (const path of files) {
    const { data, error } = await source.storage.from(bucket).download(path);
    if (error) throw new Error(`Failed downloading ${bucket}/${path}: ${error.message}`);

    const { error: uploadError } = await target.storage.from(bucket).upload(path, data, {
      upsert: true,
      contentType: data.type || undefined,
    });
    if (uploadError) throw new Error(`Failed uploading ${bucket}/${path}: ${uploadError.message}`);
  }

  console.log(`Copied ${files.length} file(s) in bucket ${bucket}`);
}

async function main() {
  console.log('Starting Supabase migration');

  const rowsByTable = {};
  for (const table of TABLES) {
    rowsByTable[table] = await fetchAllRows(source, table);
    console.log(`Fetched ${rowsByTable[table].length} row(s) from ${table}`);
  }

  for (const table of [...TABLES].reverse()) {
    await truncateTargetTable(table);
  }

  for (const table of TABLES) {
    await insertRows(table, rowsByTable[table]);
  }

  await copyStorageBucket('receipts_photos');

  console.log('Supabase migration completed successfully');
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
