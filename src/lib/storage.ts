// Web: use the browser's own localStorage (undefined during any server-side render).
export const authStorage = typeof window !== 'undefined' ? window.localStorage : undefined;
