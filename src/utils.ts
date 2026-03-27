// F7: Shared utility — single source for ID generation
export function generateId(): string {
  return crypto.randomUUID();
}
