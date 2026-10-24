function asNanos(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string') {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  if (Buffer.isBuffer(value)) {
    return value.length >= 8 ? value.readBigUInt64LE(0) : 0n;
  }
  if (typeof value === 'number') return BigInt(Math.floor(value));
  return 0n;
}

function formatIsoNanos(nanos) {
  const sec = Number(nanos / 1000000000n);
  const frac = String(nanos % 1000000000n).padStart(9, '0');
  const d = new Date(sec * 1000);
  const dateStr = Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  return `${dateStr.slice(0, 19).replace('T', ' ')}.${frac}`;
}

function formatHexId(value, targetLength) {
  if (!value) return '';
  if (Buffer.isBuffer(value)) return value.toString('hex').padStart(targetLength, '0');
  if (typeof value === 'string') {
    if (/^[0-9a-fA-F]+$/.test(value)) return value.toLowerCase().padStart(targetLength, '0');
    return Buffer.from(value, 'base64').toString('hex').padStart(targetLength, '0');
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('hex').padStart(targetLength, '0');
  }
  return '';
}

function extractAnyValue(anyValue) {
  if (!anyValue) return null;
  if (anyValue.string_value !== undefined) return anyValue.string_value;
  if (anyValue.stringValue !== undefined) return anyValue.stringValue;
  if (anyValue.bool_value !== undefined) return anyValue.bool_value;
  if (anyValue.boolValue !== undefined) return anyValue.boolValue;
  if (anyValue.int_value !== undefined) return String(anyValue.int_value);
  if (anyValue.intValue !== undefined) return String(anyValue.intValue);
  if (anyValue.double_value !== undefined) return anyValue.double_value;
  if (anyValue.doubleValue !== undefined) return anyValue.doubleValue;
  if (anyValue.bytes_value !== undefined) return Buffer.from(anyValue.bytes_value).toString('base64');
  if (anyValue.bytesValue !== undefined) return Buffer.from(anyValue.bytesValue).toString('base64');

  const arrayVals = anyValue.array_value?.values || anyValue.arrayValue?.values;
  if (Array.isArray(arrayVals)) {
    return arrayVals.map(extractAnyValue);
  }

  const kvVals = anyValue.kvlist_value?.values || anyValue.kvlistValue?.values;
  if (Array.isArray(kvVals)) {
    const obj = {};
    for (const kv of kvVals) {
      if (kv && kv.key) obj[kv.key] = extractAnyValue(kv.value);
    }
    return obj;
  }

  if (typeof anyValue === 'object') {
    return JSON.stringify(anyValue);
  }
  return String(anyValue);
}

function extractAttributes(attributesList) {
  const out = {};
  if (!Array.isArray(attributesList)) return out;
  for (const item of attributesList) {
    if (item && item.key) {
      out[item.key] = extractAnyValue(item.value);
    }
  }
  return out;
}

function parseKind(kind) {
  if (typeof kind === 'number') return kind;
  if (typeof kind === 'string') {
    const map = {
      SPAN_KIND_UNSPECIFIED: 0,
      SPAN_KIND_INTERNAL: 1,
      SPAN_KIND_SERVER: 2,
      SPAN_KIND_CLIENT: 3,
      SPAN_KIND_PRODUCER: 4,
      SPAN_KIND_CONSUMER: 5,
    };
    return map[kind] ?? 0;
  }
  return 0;
}

function parseStatusCode(status) {
  if (!status) return 0;
  const code = status.code;
  if (typeof code === 'number') return code;
  if (typeof code === 'string') {
    if (code.includes('ERROR') || code === '2') return 2;
    if (code.includes('OK') || code === '1') return 1;
    return 0;
  }
  return 0;
}

function parseSeverityNumber(num) {
  if (typeof num === 'number') return num;
  if (typeof num === 'string') {
    const parsed = Number.parseInt(num, 10);
    if (!Number.isNaN(parsed)) return parsed;
    if (num.includes('ERROR') || num.includes('FATAL')) return 17;
    if (num.includes('WARN')) return 13;
    if (num.includes('INFO')) return 9;
    if (num.includes('DEBUG')) return 5;
    if (num.includes('TRACE')) return 1;
  }
  return 0;
}

export function mapOtlpTraces(request) {
  const spans = [];
  const resourceSpansList = request?.resource_spans || request?.resourceSpans || [];

  for (const rs of resourceSpansList) {
    const resAttrs = extractAttributes(rs?.resource?.attributes);
    const serviceName = String(resAttrs['service.name'] || 'unknown');

    const scopeSpansList = rs?.scope_spans || rs?.scopeSpans || [];
    for (const ss of scopeSpansList) {
      const spanList = ss?.spans || [];
      for (const span of spanList) {
        const traceId = formatHexId(span.trace_id || span.traceId, 32);
        const spanId = formatHexId(span.span_id || span.spanId, 16);
        const parentSpanId = formatHexId(span.parent_span_id || span.parentSpanId, 16);

        const startNanos = asNanos(span.start_time_unix_nano || span.startTimeUnixNano);
        const endNanos = asNanos(span.end_time_unix_nano || span.endTimeUnixNano || span.start_time_unix_nano || span.startTimeUnixNano);
        const durationNanos = endNanos >= startNanos ? endNanos - startNanos : 0n;

        spans.push({
          trace_id: traceId,
          span_id: spanId,
          parent_span_id: parentSpanId,
          service_name: serviceName,
          name: String(span.name || ''),
          kind: parseKind(span.kind),
          start_time: formatIsoNanos(startNanos),
          duration_ns: durationNanos.toString(),
          status_code: parseStatusCode(span.status),
        });
      }
    }
  }

  return spans;
}

export function mapOtlpLogs(request) {
  const records = [];
  const resourceLogsList = request?.resource_logs || request?.resourceLogs || [];

  for (const rl of resourceLogsList) {
    const resAttrs = extractAttributes(rl?.resource?.attributes);
    const serviceName = String(resAttrs['service.name'] || 'unknown');

    const scopeLogsList = rl?.scope_logs || rl?.scopeLogs || [];
    for (const sl of scopeLogsList) {
      const logRecordsList = sl?.log_records || sl?.logRecords || [];
      for (const lr of logRecordsList) {
        const timeNanos = asNanos(lr.time_unix_nano || lr.timeUnixNano);
        const obsNanos = asNanos(lr.observed_time_unix_nano || lr.observedTimeUnixNano || lr.time_unix_nano || lr.timeUnixNano);

        const bodyVal = extractAnyValue(lr.body);
        const bodyStr = typeof bodyVal === 'string' ? bodyVal : JSON.stringify(bodyVal ?? '');
        const logAttrs = extractAttributes(lr.attributes);

        records.push({
          service_name: serviceName,
          time: formatIsoNanos(timeNanos),
          observed_time: formatIsoNanos(obsNanos),
          trace_id: formatHexId(lr.trace_id || lr.traceId, 32),
          span_id: formatHexId(lr.span_id || lr.spanId, 16),
          severity_number: parseSeverityNumber(lr.severity_number || lr.severityNumber),
          severity_text: String(lr.severity_text || lr.severityText || ''),
          body: bodyStr,
          attributes_json: JSON.stringify(logAttrs),
        });
      }
    }
  }

  return records;
}

export function mapOtlpMetrics(request) {
  const samples = [];
  const resourceMetricsList = request?.resource_metrics || request?.resourceMetrics || [];

  for (const rm of resourceMetricsList) {
    const resAttrs = extractAttributes(rm?.resource?.attributes);
    const serviceName = String(resAttrs['service.name'] || 'unknown');

    const scopeMetricsList = rm?.scope_metrics || rm?.scopeMetrics || [];
    for (const sm of scopeMetricsList) {
      const metricsList = sm?.metrics || [];
      for (const m of metricsList) {
        const metricName = String(m.name || '');

        const processNumberDataPoints = (dataPoints, metricType) => {
          if (!Array.isArray(dataPoints)) return;
          for (const dp of dataPoints) {
            const timeNanos = asNanos(dp.time_unix_nano || dp.timeUnixNano || dp.start_time_unix_nano || dp.startTimeUnixNano);
            let val = 0;
            if (dp.as_double !== undefined) val = dp.as_double;
            else if (dp.asDouble !== undefined) val = dp.asDouble;
            else if (dp.as_int !== undefined) val = Number(dp.as_int);
            else if (dp.asInt !== undefined) val = Number(dp.asInt);

            samples.push({
              service_name: serviceName,
              metric_name: metricName,
              metric_type: metricType,
              time: formatIsoNanos(timeNanos),
              value: Number(val),
              attributes_json: JSON.stringify(extractAttributes(dp.attributes)),
            });
          }
        };

        if (m.gauge?.data_points || m.gauge?.dataPoints) {
          processNumberDataPoints(m.gauge.data_points || m.gauge.dataPoints, 'gauge');
        }
        if (m.sum?.data_points || m.sum?.dataPoints) {
          processNumberDataPoints(m.sum.data_points || m.sum.dataPoints, 'sum');
        }
        if (m.histogram?.data_points || m.histogram?.dataPoints) {
          const dps = m.histogram.data_points || m.histogram.dataPoints;
          if (Array.isArray(dps)) {
            for (const dp of dps) {
              const timeNanos = asNanos(dp.time_unix_nano || dp.timeUnixNano);
              const countVal = Number(asNanos(dp.count || 0));
              samples.push({
                service_name: serviceName,
                metric_name: `${metricName}.count`,
                metric_type: 'histogram',
                time: formatIsoNanos(timeNanos),
                value: countVal,
                attributes_json: JSON.stringify(extractAttributes(dp.attributes)),
              });
              if (dp.sum !== undefined && dp.sum !== null) {
                samples.push({
                  service_name: serviceName,
                  metric_name: `${metricName}.sum`,
                  metric_type: 'histogram',
                  time: formatIsoNanos(timeNanos),
                  value: Number(dp.sum),
                  attributes_json: JSON.stringify(extractAttributes(dp.attributes)),
                });
              }
            }
          }
        }
      }
    }
  }

  return samples;
}
