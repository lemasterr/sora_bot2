export function resolveSessionCdpPort(
  session: { cdpPort?: number | null; id?: string; name?: string },
  fallback = 9222
): number {
  if (session.cdpPort !== undefined && session.cdpPort !== null && Number.isFinite(session.cdpPort)) {
    return Number(session.cdpPort);
  }
  if (Number.isFinite(fallback)) {
    return Number(fallback);
  }
  return 9222;
}
