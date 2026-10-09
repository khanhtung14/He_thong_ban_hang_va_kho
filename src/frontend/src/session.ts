const TOKEN_KEY = "session_token";
const EXPIRY_KEY = "session_expires_at";
const ACCESS_TOKEN_KEY = "access_token";
const ACCESS_EXPIRY_KEY = "access_token_expires_at";
const REFRESH_BEFORE_MS = 2 * 60 * 1000;

export function clearSession(): void {
  if (typeof window === "undefined") return;
  for (const key of [
    TOKEN_KEY,
    EXPIRY_KEY,
    ACCESS_TOKEN_KEY,
    ACCESS_EXPIRY_KEY,
    "user_role",
    "user_name",
    "token",
  ]) {
    window.sessionStorage?.removeItem(key);
    window.localStorage?.removeItem(key);
  }
}

export function hasValidSession(): boolean {
  if (typeof window === "undefined") return false;
  const sessionToken =
    window.sessionStorage?.getItem(TOKEN_KEY) ||
    window.localStorage?.getItem(TOKEN_KEY) ||
    window.localStorage?.getItem("token");
  const accessToken =
    window.sessionStorage?.getItem(ACCESS_TOKEN_KEY) ||
    window.localStorage?.getItem(ACCESS_TOKEN_KEY);
  const sessionExpiry = Number(
    window.sessionStorage?.getItem(EXPIRY_KEY) ||
      window.localStorage?.getItem(EXPIRY_KEY) ||
      0,
  );

  if (!sessionToken && !accessToken) {
    return false;
  }
  if (sessionExpiry && sessionExpiry < Date.now()) {
    return false;
  }
  const role = getCurrentUserRole();
  if (!role) {
    return false;
  }
  return true;
}

export function getCurrentUserRole(): string | null {
  if (typeof window === "undefined") return null;
  return (
    window.sessionStorage?.getItem("user_role") ||
    window.localStorage?.getItem("user_role") ||
    null
  );
}

export function getCurrentUserName(): string | null {
  if (typeof window === "undefined") return null;
  return (
    window.sessionStorage?.getItem("user_name") ||
    window.localStorage?.getItem("user_name") ||
    null
  );
}

export function getDefaultPathForRole(roleCode?: string | null): string {
  const normalized = (roleCode ?? "").trim().toUpperCase().replace(/[ -]/g, "_");
  if (normalized === "SALES_MANAGER") return "/manager/dashboard";
  if (["SALES", "SALES_REP"].includes(normalized)) return "/sales/orders";
  if (["CUSTOMER"].includes(normalized)) return "/portal/orders";
  if (["WAREHOUSE"].includes(normalized)) return "/warehouse/picking";
  if (["WH_MANAGER", "WAREHOUSE_MANAGER"].includes(normalized)) return "/warehouse/dashboard";
  if (["ACCOUNTANT"].includes(normalized)) return "/accounting/debt-book";
  if (["ADMIN", "ADMINISTRATOR"].includes(normalized)) return "/admin/users";
  return "/login";
}

export function expireSession(): void {
  if (typeof window === "undefined") return;
  const currentPage = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  clearSession();
  window.location.assign(`/login?session=expired&redirect=${encodeURIComponent(currentPage)}`);
}

export async function refreshSession(token: string): Promise<boolean> {
  try {
    const response = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { expires_in: number; access_token?: string };
    const expiry = String(Date.now() + result.expires_in * 1000);
    window.sessionStorage?.setItem(EXPIRY_KEY, expiry);
    window.localStorage?.setItem(EXPIRY_KEY, expiry);
    if (result.access_token) {
      window.sessionStorage?.setItem(ACCESS_TOKEN_KEY, result.access_token);
      window.localStorage?.setItem(ACCESS_TOKEN_KEY, result.access_token);
      const accExp = String(Date.now() + 58 * 60 * 1000);
      window.sessionStorage?.setItem(ACCESS_EXPIRY_KEY, accExp);
      window.localStorage?.setItem(ACCESS_EXPIRY_KEY, accExp);
    }
    return true;
  } catch {
    return false;
  }
}

/** Send an API request with the current session and return expired users to login. */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  const pathname = new URL(requestUrl, window.location.origin).pathname;
  const usesAccessToken = [
    "/api/v1/products",
    "/api/v1/inventory",
    "/api/v1/reports",
    "/api/v1/customers",
    "/api/v1/orders",
  ].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const sessionToken =
    window.sessionStorage?.getItem(TOKEN_KEY) ||
    window.localStorage?.getItem(TOKEN_KEY) ||
    window.localStorage?.getItem("token");
  const sessionExpiry = Number(
    window.sessionStorage?.getItem(EXPIRY_KEY) ||
      window.localStorage?.getItem(EXPIRY_KEY) ||
      0,
  );
  const accessExpiry = Number(
    window.sessionStorage?.getItem(ACCESS_EXPIRY_KEY) ||
      window.localStorage?.getItem(ACCESS_EXPIRY_KEY) ||
      0,
  );
  const needsRefresh = Boolean(
    sessionToken &&
      ((sessionExpiry && sessionExpiry - Date.now() < REFRESH_BEFORE_MS) ||
        (usesAccessToken && (!accessExpiry || accessExpiry - Date.now() < REFRESH_BEFORE_MS))),
  );

  if (needsRefresh && sessionToken) {
    try {
      if (!(await refreshSession(sessionToken))) {
        expireSession();
        return new Response(null, { status: 401 });
      }
    } catch {
      // Keep session intact while offline
    }
  }
  const token = usesAccessToken
    ? window.sessionStorage?.getItem(ACCESS_TOKEN_KEY) || window.localStorage?.getItem(ACCESS_TOKEN_KEY)
    : window.sessionStorage?.getItem(TOKEN_KEY) ||
      window.localStorage?.getItem(TOKEN_KEY) ||
      window.localStorage?.getItem("token");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) {
    expireSession();
  }
  return response;
}

/** Ask the server to revoke the session, then clear the browser copy. */
export async function logout(): Promise<void> {
  const token =
    window.sessionStorage?.getItem(TOKEN_KEY) ||
    window.localStorage?.getItem(TOKEN_KEY) ||
    window.localStorage?.getItem("token");
  try {
    await fetch("/api/v1/auth/logout", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    // Ignore network error on logout
  } finally {
    clearSession();
    window.location.assign("/login?session=logged-out");
  }
}
