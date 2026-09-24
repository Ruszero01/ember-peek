/** The active view plus the three most recently visited views can continue loading. */
export const RECENT_VIEW_LIMIT = 4;

export function visitView(recent: string[], id: string): string[] {
  return [id, ...recent.filter((candidate) => candidate !== id)].slice(0, RECENT_VIEW_LIMIT);
}

export function keepViewMounted(
  session: {
    id: string;
    available: boolean;
    pending: boolean;
    status: string;
    viewReady: boolean;
  },
  activeId: string | undefined,
  recent: readonly string[],
): boolean {
  if (session.id === activeId || session.pending) return true;
  return session.available && recent.includes(session.id) &&
    (session.status === "loading" || (session.status === "ready" && !session.viewReady));
}
