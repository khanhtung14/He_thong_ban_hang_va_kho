const TOKEN_KEY = "session_token";

/** Send an API request with the current session and return expired users to login. */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = window.sessionStorage.getItem(TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) {
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.location.assign("/login?session=expired");
  }
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
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.location.assign("/login");
  }
}
