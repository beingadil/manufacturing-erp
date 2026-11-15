/**
 * Shown while a lazy route chunk is loading — a minimal centered spinner on
 * the app background so navigation feels instant rather than frozen.
 */
export default function RouteFallback() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background" role="status" aria-label="Loading page">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-primary" />
        <div className="text-xs text-muted-foreground">Loading…</div>
      </div>
    </div>
  );
}
