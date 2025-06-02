// Simple ID generator for mock data
export const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9);
};

// Debounce function
// Change NodeJS.Timeout to number for browser compatibility
export function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeout: number | null = null;

  const debounced = (...args: Parameters<F>) => {
    if (timeout !== null) {
      // Fix: Use window.clearTimeout for browser compatibility and to ensure 'number' type for timeout ID
      window.clearTimeout(timeout);
      timeout = null;
    }
    // Fix: Use window.setTimeout for browser compatibility and to ensure 'number' type for timeout ID
    timeout = window.setTimeout(() => func(...args), waitFor);
  };

  return debounced as (...args: Parameters<F>) => ReturnType<F>;
}
