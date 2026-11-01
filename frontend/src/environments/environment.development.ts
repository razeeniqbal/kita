export const environment = {
  /**
   * Local development only: if localStorage['kita-dev-token'] holds a token minted for a local test
   * backend, use it instead of Supabase sign-in. Production builds use environment.ts (false).
   */
  devAuth: true,
};
