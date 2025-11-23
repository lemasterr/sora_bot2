export function resolveSessionCdpPort(
  session: { cdpPort?: number | null; id?: string; name?: string },
  fallback = 9222
): number {
  if (session.cdpPort !== undefined && session.cdpPort !== null && Number.isFinite(session.cdpPort)) {
    return Number(session.cdpPort);
  }

  const base = Number.isFinite(fallback) ? Number(fallback) : 9222;
  const key = session.id ?? session.name ?? 'session';
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  const offset = hash % 1000;
  return base + offset;
}
