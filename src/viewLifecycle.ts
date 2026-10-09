/** Serialize visibility updates across rapid unmount/remount of the same session. */
export function createViewVisibilityReporter(send: (id: string, visible: boolean) => Promise<unknown>) {
  const pending = new Map<string, Promise<unknown>>();
  return (id: string, visible: boolean) => {
    const next = (pending.get(id) ?? Promise.resolve()).catch(() => {}).then(() => send(id, visible));
    pending.set(id, next);
    void next.finally(() => { if (pending.get(id) === next) pending.delete(id); }).catch(() => {});
    return next;
  };
}
