export function useRealtimeSync(tables?: string[]) {
  // Offline ERP uses local database exclusively
  // Realtime sync is disabled
  return {
    mutate: async (...args: any[]) => {}
  };
}