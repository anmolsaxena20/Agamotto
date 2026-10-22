function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required ingestion authentication configuration: ${name}`);
  return value;
}

// The control plane owns ingest-key hashes and tenant binding. This gateway
// never derives an organization from resource attributes or payload contents.
export function createKeyValidator() {
  const url = required('INGESTION_KEY_VALIDATION_URL');
  const token = required('INGESTION_KEY_VALIDATION_TOKEN');
  return async apiKey => {
    if (!apiKey) return null;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ apiKey }),
      signal: AbortSignal.timeout(Number.parseInt(process.env.INGESTION_KEY_VALIDATION_TIMEOUT_MS || '3000', 10)),
    });
    if (!response.ok) return null;
    const body = await response.json();
    return typeof body.organizationId === 'string' ? body.organizationId : null;
  };
}
