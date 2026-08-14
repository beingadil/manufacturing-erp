export function useRealtimeSync(_tables?: string[]) {
  // Offline ERP uses local database exclusively
  // Realtime sync is disabled
  return {
    mutate: async (..._args: any[]) => {}
  };
}