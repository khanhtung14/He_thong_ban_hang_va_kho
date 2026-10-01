const TOKEN_KEY = "session_token";
const EXPIRY_KEY = "session_expires_at";
const REFRESH_BEFORE_MS = 2 * 60 * 1000;

function clearSession(): void {
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(EXPIRY_KEY);
}

function expireSession(): void {
  const currentPage = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  clearSession();
  window.location.assign(`/login?session=expired&redirect=${encodeURIComponent(currentPage)}`);
}

async function refreshSession(token: string): Promise<boolean> {
  const response = await fetch("/api/v1/auth/refresh", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return false;
  const result = await response.json() as { expires_in: number };
  window.sessionStorage.setItem(EXPIRY_KEY, String(Date.now() + result.expires_in * 1000));
  return true;
}

/** Send an API request with the current session and return expired users to login. */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  let token = window.sessionStorage.getItem(TOKEN_KEY);
  const expiry = Number(window.sessionStorage.getItem(EXPIRY_KEY) || 0);
  if (token && expiry && expiry - Date.now() < REFRESH_BEFORE_MS) {
    try {
      if (!await refreshSession(token)) {
        expireSession();
        return new Response(null, { status: 401 });
      }
    } catch {
      // Keep the session and current work intact while the network is unavailable.
    }
    token = window.sessionStorage.getItem(TOKEN_KEY);
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) expireSession();
  return response;
}

/** Ask the server to revoke the session, then clear the browser copy. */
export async function logout(): Promise<void> {
  const token = window.sessionStorage.getItem(TOKEN_KEY);
  try {
    await fetch("/api/v1/auth/logout", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } finally {
    clearSession();
    window.location.assign("/login?session=logged-out");
  }
}
