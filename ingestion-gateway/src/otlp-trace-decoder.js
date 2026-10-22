// Minimal decoder for the official OTLP ExportTraceServiceRequest wire format.
// It intentionally decodes only fields needed by the first analytics APIs.
function fields(buffer) {
  const result = []; let offset = 0;
  const readVarint = () => { let value = 0n; let shift = 0n; while (offset < buffer.length) { const byte = buffer[offset++]; value |= BigInt(byte & 127) << shift; if (!(byte & 128)) return value; shift += 7n; } throw new Error('truncated protobuf'); };
  while (offset < buffer.length) {
    const tag = Number(readVarint()); const field = tag >> 3; const wire = tag & 7;
    if (wire === 0) result.push([field, readVarint()]);
    else if (wire === 1) { const value = buffer.readBigUInt64LE(offset); offset += 8; result.push([field, value]); }
    else if (wire === 2) { const size = Number(readVarint()); const value = buffer.subarray(offset, offset + size); offset += size; result.push([field, value]); }
    else if (wire === 5) { const value = buffer.readUInt32LE(offset); offset += 4; result.push([field, value]); }
    else throw new Error(`unsupported protobuf wire type ${wire}`);
  }
  return result;
}
const byNumber = (items, field) => items.filter(([number]) => number === field).map(([, value]) => value);
const text = value => Buffer.isBuffer(value) ? value.toString('utf8') : '';
function attributes(message) {
  return decodeAttributes(byNumber(fields(message), 1));
}
function decodeAttributes(entries) { const values={}; for(const item of entries){const pair=fields(item),key=text(byNumber(pair,1)[0]),any=fields(byNumber(pair,2)[0]||Buffer.alloc(0)); const stringValue=text(byNumber(any,1)[0]); const intValue=byNumber(any,3)[0]; const doubleValue=byNumber(any,4)[0]; values[key]=stringValue||String(intValue??(Buffer.isBuffer(doubleValue)?doubleValue.readDoubleLE(0):doubleValue)??'');} return values; }
function asNanos(value) { return typeof value === 'bigint' ? value : Buffer.isBuffer(value) ? value.readBigUInt64LE(0) : BigInt(value || 0); }
function iso(value) { const nanos=asNanos(value); return `${new Date(Number(nanos / 1000000000n) * 1000).toISOString().slice(0,19).replace('T',' ')}.${String(nanos % 1000000000n).padStart(9,'0')}`; }
export function decodeTraceSpans(payload) {
  const output = [];
  for (const resourceSpans of byNumber(fields(payload), 1)) {
    const rs = fields(resourceSpans); const resource = fields(byNumber(rs, 1)[0] || Buffer.alloc(0));
    const resourceAttributes = attributes(byNumber(rs, 1)[0] || Buffer.alloc(0));
    const serviceName = resourceAttributes['service.name'] || 'unknown';
    for (const scopeSpans of byNumber(rs, 2)) for (const spanMessage of byNumber(fields(scopeSpans), 2)) {
      const span = fields(spanMessage); const start = asNanos(byNumber(span, 7)[0]); const end = asNanos(byNumber(span, 8)[0] || byNumber(span, 7)[0]);
      output.push({ trace_id: Buffer.from(byNumber(span, 1)[0] || []).toString('hex'), span_id: Buffer.from(byNumber(span, 2)[0] || []).toString('hex'), parent_span_id: Buffer.from(byNumber(span, 4)[0] || []).toString('hex'), service_name: serviceName, name: text(byNumber(span, 5)[0]), kind: Number(byNumber(span, 6)[0] || 0), start_time: iso(start), duration_ns: (end - start).toString(), status_code: Number(byNumber(fields(byNumber(span, 15)[0] || Buffer.alloc(0)), 3)[0] || 0) });
    }
  }
  return output;
}
