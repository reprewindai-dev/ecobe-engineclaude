/**
 * RFC 8785 JSON Canonicalization Scheme (JCS).
 *
 * Deliberately dependency-free: an independent verifier must be able to copy
 * this file (or use any conforming JCS library) and reproduce the same bytes.
 *
 * Interop rules:
 * - non-finite numbers and BigInt are rejected (they have no JSON form)
 * - numbers are IEEE-754 doubles as RFC 8785 requires (1e30 -> "1e+30"); values
 *   that must stay exact beyond 2^53 (ids, counters) belong in strings
 * - object properties whose value is `undefined` are omitted (as JSON.stringify does);
 *   `undefined` inside an array is rejected because it has no unambiguous encoding
 */

export class JcsError extends Error {
  constructor(message: string, readonly path: string) {
    super(`${message} at ${path}`)
    this.name = 'JcsError'
  }
}

function serialize(value: unknown, path: string): string {
  if (value === null) return 'null'

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false'
    case 'string':
      // ES2019+ JSON.stringify string escaping is exactly the RFC 8785 form.
      return JSON.stringify(value)
    case 'number':
      if (!Number.isFinite(value)) {
        throw new JcsError('Non-finite number cannot be canonicalized', path)
      }
      // ECMAScript Number serialization is the RFC 8785 number form (-0 -> "0").
      return JSON.stringify(value)
    case 'bigint':
      throw new JcsError('BigInt cannot be canonicalized; encode as string', path)
    case 'undefined':
    case 'function':
    case 'symbol':
      throw new JcsError(`Unsupported value of type ${typeof value}`, path)
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new JcsError('Invalid Date cannot be canonicalized', path)
    }
    return JSON.stringify(value.toISOString())
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry, index) => serialize(entry, `${path}[${index}]`)).join(',')}]`
  }

  const record = value as Record<string, unknown>
  // Default sort compares UTF-16 code units, which is what RFC 8785 requires.
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${serialize(record[key], `${path}.${key}`)}`)
    .join(',')}}`
}

export function jcsCanonicalize(value: unknown): string {
  return serialize(value, '$')
}
