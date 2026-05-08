import { randomUUID } from "node:crypto";

const SERVICE_NAME = "blue-moon";
const MAX_LOG_VALUE_LENGTH = 500;
const SENSITIVE_FIELD_PATTERN = /authorization|cookie|email|key|name|secret|token/i;

function cleanLogValue(value, maxLength = MAX_LOG_VALUE_LENGTH) {
  return String(value || "").trim().slice(0, maxLength);
}

function sanitizeLogValue(value) {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(sanitizeLogValue).filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_FIELD_PATTERN.test(key))
        .map(([key, item]) => [key, sanitizeLogValue(item)])
        .filter(([, item]) => item !== undefined)
    );
  }
  return cleanLogValue(value);
}

function sanitizeLogFields(fields) {
  return Object.fromEntries(
    Object.entries(fields || {})
      .filter(([key]) => !SENSITIVE_FIELD_PATTERN.test(key))
      .map(([key, value]) => [key, sanitizeLogValue(value)])
      .filter(([, value]) => value !== undefined)
  );
}

export function headerValue(headers, name) {
  if (!headers) return "";
  const lowerName = name.toLowerCase();
  if (typeof headers.get === "function") {
    return headers.get(name) || headers.get(lowerName) || "";
  }
  return headers[lowerName] || headers[name] || "";
}

export function requestMeta(request, route) {
  const requestId = cleanLogValue(
    headerValue(request.headers, "x-vercel-id")
      || headerValue(request.headers, "x-request-id")
      || randomUUID(),
    120
  );

  return {
    route,
    method: cleanLogValue(request.method, 20) || "UNKNOWN",
    requestId
  };
}

export function responseLevel(status) {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  return "info";
}

export function logApiEvent(level, event, fields = {}) {
  if (process.env.BLUE_MOON_LOG_SILENT === "1") return;

  const payload = {
    timestamp: new Date().toISOString(),
    service: SERVICE_NAME,
    level,
    event,
    ...sanitizeLogFields(fields)
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function respondJson(response, status, body, fields = {}) {
  const event = fields.event || "api.response";
  const level = fields.level || responseLevel(status);
  const { event: _event, level: _level, ...logFields } = fields;
  logApiEvent(level, event, {
    status,
    error: body?.error,
    reason: body?.reason,
    ...logFields
  });
  return response.status(status).json(body);
}
