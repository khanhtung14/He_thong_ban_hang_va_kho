const SESSION_TOKEN_KEY = "oms.session_token";

/** Send an API request with the current session and handle server invalidation. */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    window.location.assign("/login?reason=session-expired");
  }
  return response;
}

/** Revoke the session at the server, then discard the local credential. */
export async function logout(): Promise<void> {
  const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
  try {
    if (token) {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } finally {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    window.location.assign("/login");
  }
}
