import React from 'react';

// Wrap React.lazy to auto-recover when a code-split chunk fails to load (e.g., after HMR or new deploy)
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  const load = () =>
    factory().catch((error: any) => {
      const name = error?.name || '';
      const message = error?.message || '';
      const isChunkLoadError = /ChunkLoadError/i.test(name) || /Loading chunk .* failed/i.test(message);

      if (isChunkLoadError && typeof window !== 'undefined') {
        // Force a hard reload to fetch the latest chunk map
        window.location.reload();
      }

      throw error;
    });

  return React.lazy(load);
}
