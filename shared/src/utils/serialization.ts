export function safeJsonStringify(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export function safeJsonParse<T>(text: string): T {
  return JSON.parse(text) as T
}
