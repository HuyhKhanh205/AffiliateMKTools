// Android/iOS: expo-sqlite provides a persistent localStorage for the auth session
// (per https://docs.expo.dev/guides/using-supabase/).
import 'expo-sqlite/localStorage/install';

export const authStorage = localStorage;
