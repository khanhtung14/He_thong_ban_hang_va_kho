import axios, {
    AxiosError,
    InternalAxiosRequestConfig,
} from "axios";

/**
 * 
 *
 * User Story:
 * "Là người dùng của hệ thống, tôi muốn duy trì phiên đăng nhập
 * và đăng xuất an toàn, để không mất đơn đang gõ dở khi mạng ở
 * cửa hàng chập chờn."
 *
 * Đã bao phủ:
 * 1) Tự động gia hạn Access Token trước khi hết hạn.
 * 2) Refresh khi API trả 401/403, retry đúng 1 lần.
 * 3) Chỉ 1 refresh request chạy tại một thời điểm.
 * 4) Restore session sau reload.
 * 5) Logout gọi server để revoke session + clear client state.
 * 6) Session hết hạn -> Login + message rõ ràng.
 * 7) Online/offline recovery.
 * 8) Auto-save order draft vào localStorage.
 * 9) Restore draft theo user + temporaryOrderId.
 * 10) Đồng bộ draft khi online qua endpoint/callback cấu hình được.
 * 11) Idempotency-Key helper cho submit order.
 *
 * Backend contract cần có:
 * POST /api/auth/refresh  -> { accessToken: string }
 * POST /api/auth/logout   -> revoke/invalidate refresh session
 *
 * Nếu backend dùng HttpOnly cookie cho refresh token, withCredentials=true
 * sẽ gửi cookie tự động.
 */

const API_BASE_URL = "http://localhost:8080/api";
const ACCESS_TOKEN_REFRESH_BEFORE_MS = 60_000;
const MIN_PROACTIVE_REFRESH_DELAY_MS = 5_000;
const DEFAULT_DRAFT_AUTOSAVE_DELAY_MS = 500;

const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    timeout: 15_000,
});

let accessToken: string | null = null;
let refreshPromise: Promise<string> | null = null;
let restorePromise: Promise<boolean> | null = null;
let proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let networkCleanup: (() => void) | null = null;

export type SessionFailureReason =
    | "expired"
    | "network"
    | "unknown";

export interface LogoutResult {
    serverLogoutSucceeded: boolean;
}

export interface OrderDraft<T = Record<string, unknown>> {
    userId: string;
    temporaryOrderId: string;
    data: T;
    updatedAt: string;
    version: number;
    syncStatus: "LOCAL" | "PENDING_SYNC" | "SYNCED" | "FAILED";
}

type RetryableRequestConfig = InternalAxiosRequestConfig & {
    _retry?: boolean;
};

type DraftSyncFunction<T = unknown> = (
    draft: OrderDraft<T>,
) => Promise<boolean>;

let draftSyncFunction: DraftSyncFunction | null = null;
const reconnectHandlers: Array<() => Promise<void>> = [];

function isBrowser(): boolean {
    return typeof window !== "undefined";
}

export function isOnline(): boolean {
    return !isBrowser() || navigator.onLine;
}

export function getAccessToken(): string | null {
    return accessToken;
}

export function setAccessToken(token: string | null): void {
    accessToken = token;
    scheduleProactiveRefresh(token);
}

function clearRefreshTimer(): void {
    if (proactiveRefreshTimer !== null) {
        clearTimeout(proactiveRefreshTimer);
        proactiveRefreshTimer = null;
    }
}

function isAuthEndpoint(url?: string): boolean {
    if (!url) return false;

    return (
        url.includes("/auth/login") ||
        url.includes("/auth/refresh") ||
        url.includes("/auth/logout")
    );
}

function isSessionExpiredError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;
    const status = error.response?.status;
    return status === 401 || status === 403;
}

function redirectToLogin(message = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."): void {
    if (!isBrowser()) return;
    if (window.location.pathname === "/login") return;

    const params = new URLSearchParams({
        sessionExpired: "true",
        message,
    });

    window.location.replace(`/login?${params.toString()}`);
}

function getTokenExpiryMs(token: string): number | null {
    try {
        const parts = token.split(".");
        if (parts.length !== 3) return null;

        const normalized = parts[1]
            .replace(/-/g, "+")
            .replace(/_/g, "/");
        const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);

        const payloadText = decodeURIComponent(
            Array.from(atob(padded))
                .map((char) =>
                    `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`,
                )
                .join(""),
        );

        const payload = JSON.parse(payloadText) as { exp?: number };
        return typeof payload.exp === "number" ? payload.exp * 1000 : null;
    } catch {
        return null;
    }
}

function scheduleProactiveRefresh(token: string | null): void {
    clearRefreshTimer();

    if (!token || !isBrowser()) return;

    const expiryMs = getTokenExpiryMs(token);
    if (!expiryMs) return;

    const delay = Math.max(
        MIN_PROACTIVE_REFRESH_DELAY_MS,
        expiryMs - Date.now() - ACCESS_TOKEN_REFRESH_BEFORE_MS,
    );

    proactiveRefreshTimer = setTimeout(async () => {
        if (!isOnline()) return;

        try {
            await refreshSession(true);
        } catch {
            // refreshSession đã xử lý lỗi xác thực khi cần.
        }
    }, delay);
}

/**
 * Refresh session dùng chung cho proactive refresh, restore và 401/403.
 * Chỉ có một request refresh được chạy tại một thời điểm.
 */
export async function refreshSession(
    redirectOnExpired = true,
): Promise<string> {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
        try {
            const response = await api.post("/auth/refresh");
            const newToken = response.data?.accessToken;

            if (typeof newToken !== "string" || newToken.trim().length === 0) {
                throw new Error("Server không trả về Access Token mới.");
            }

            setAccessToken(newToken);
            return newToken;
        } catch (error) {
            // Không coi lỗi mạng là session expired.
            if (redirectOnExpired && isSessionExpiredError(error)) {
                setAccessToken(null);
                redirectToLogin();
            }

            throw error;
        } finally {
            refreshPromise = null;
        }
    })();

    return refreshPromise;
}

/** Khôi phục session khi reload/F5. */
export async function restoreSession(): Promise<boolean> {
    if (restorePromise) return restorePromise;

    restorePromise = (async () => {
        try {
            await refreshSession(false);
            return true;
        } catch {
            setAccessToken(null);
            return false;
        } finally {
            restorePromise = null;
        }
    })();

    return restorePromise;
}

/**
 * Đọc message mà Login page có thể dùng.
 * Ví dụ: const notice = getLoginNotice();
 */
export function getLoginNotice(): string | null {
    if (!isBrowser()) return null;

    const params = new URLSearchParams(window.location.search);
    if (params.get("loggedOut") === "true") {
        return "Bạn đã đăng xuất thành công.";
    }

    if (params.get("sessionExpired") === "true") {
        return (
            params.get("message") ||
            "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
        );
    }

    return null;
}

/**
 * Xóa query status sau khi Login page đã đọc notice.
 */
export function clearLoginNotice(): void {
    if (!isBrowser()) return;

    const url = new URL(window.location.href);
    url.searchParams.delete("loggedOut");
    url.searchParams.delete("sessionExpired");
    url.searchParams.delete("message");
    window.history.replaceState({}, "", url.toString());
}

/* ========================= REQUEST INTERCEPTOR ========================= */
api.interceptors.request.use(
    (config) => {
        if (accessToken) {
            config.headers.Authorization = `Bearer ${accessToken}`;
        }
        return config;
    },
    (error: unknown) => Promise.reject(error),
);

/* ========================= RESPONSE INTERCEPTOR ======================== */
api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest =
            error.config as RetryableRequestConfig | undefined;

        if (!originalRequest) return Promise.reject(error);

        const status = error.response?.status;
        if (status !== 401 && status !== 403) {
            return Promise.reject(error);
        }

        if (isAuthEndpoint(originalRequest.url)) {
            return Promise.reject(error);
        }

        if (originalRequest._retry) {
            return Promise.reject(error);
        }

        originalRequest._retry = true;

        try {
            const newToken = await refreshSession(true);
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
        } catch (refreshError) {
            return Promise.reject(refreshError);
        }
    },
);

/* =============================== LOGOUT ================================ */
export async function logout(
    options?: { redirect?: boolean },
): Promise<LogoutResult> {
    const shouldRedirect = options?.redirect ?? true;
    let serverLogoutSucceeded = false;

    try {
        // Backend phải revoke/invalidate refresh session ở đây.
        await api.post("/auth/logout");
        serverLogoutSucceeded = true;
    } catch {
        // Client vẫn phải xóa state.
    } finally {
        setAccessToken(null);
        clearRefreshTimer();
        refreshPromise = null;
        restorePromise = null;

        if (shouldRedirect && isBrowser()) {
            const params = new URLSearchParams({
                loggedOut: "true",
                serverRevoked: String(serverLogoutSucceeded),
            });
            window.location.replace(`/login?${params.toString()}`);
        }
    }

    return { serverLogoutSucceeded };
}

/* =========================== NETWORK STATUS ============================ */
export function onNetworkChange(
    callback: (online: boolean) => void,
): () => void {
    if (!isBrowser()) return () => undefined;

    const handleOnline = async (): Promise<void> => {
        callback(true);

        if (accessToken) {
            try {
                await refreshSession(false);
            } catch {
                // Chỉ refresh lại khi API chứng minh session đã hết hạn.
            }
        }

        await runReconnectSyncHandlers();
    };

    const handleOffline = (): void => callback(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
    };
}

/* ============================= ORDER DRAFT ============================= */
function draftKey(userId: string, temporaryOrderId: string): string {
    return `oms_order_draft:${userId}:${temporaryOrderId}`;
}

export function saveOrderDraft<T>(
    userId: string,
    temporaryOrderId: string,
    data: T,
): void {
    if (!isBrowser()) return;

    const key = draftKey(userId, temporaryOrderId);
    const oldRaw = localStorage.getItem(key);
    let previousVersion = 0;

    if (oldRaw) {
        try {
            const oldDraft = JSON.parse(oldRaw) as Partial<OrderDraft<T>>;
            previousVersion = Number(oldDraft.version) || 0;
        } catch {
            previousVersion = 0;
        }
    }

    const draft: OrderDraft<T> = {
        userId,
        temporaryOrderId,
        data,
        updatedAt: new Date().toISOString(),
        version: previousVersion + 1,
        syncStatus: "PENDING_SYNC",
    };

    localStorage.setItem(key, JSON.stringify(draft));
}

export function loadOrderDraft<T>(
    userId: string,
    temporaryOrderId: string,
): OrderDraft<T> | null {
    if (!isBrowser()) return null;

    const raw = localStorage.getItem(draftKey(userId, temporaryOrderId));
    if (!raw) return null;

    try {
        const draft = JSON.parse(raw) as OrderDraft<T>;
        return draft.userId === userId ? draft : null;
    } catch {
        return null;
    }
}

export function clearOrderDraft(
    userId: string,
    temporaryOrderId: string,
): void {
    if (!isBrowser()) return;
    localStorage.removeItem(draftKey(userId, temporaryOrderId));
}

export function hasOrderDraft(
    userId: string,
    temporaryOrderId: string,
): boolean {
    return loadOrderDraft(userId, temporaryOrderId) !== null;
}

export function createDraftAutoSaver<T>(
    userId: string,
    temporaryOrderId: string,
    delay = DEFAULT_DRAFT_AUTOSAVE_DELAY_MS,
): {
    schedule: (data: T) => void;
    flush: () => void;
    cancel: () => void;
} {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let latestData: T | null = null;

    const flush = (): void => {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }

        if (latestData !== null) {
            saveOrderDraft(userId, temporaryOrderId, latestData);
        }
    };

    const schedule = (data: T): void => {
        latestData = data;
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(flush, delay);
    };

    const cancel = (): void => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        latestData = null;
    };

    return { schedule, flush, cancel };
}

export function registerDraftBeforeUnload<T>(
    userId: string,
    temporaryOrderId: string,
    getCurrentData: () => T,
): () => void {
    if (!isBrowser()) return () => undefined;

    const handler = (): void => {
        try {
            saveOrderDraft(userId, temporaryOrderId, getCurrentData());
        } catch {
            // Không chặn việc đóng trang.
        }
    };

    window.addEventListener("beforeunload", handler);

    return () => window.removeEventListener("beforeunload", handler);
}

/* ============================= ORDER SYNC ============================== */
export function setOrderDraftSyncFunction(
    syncFunction: DraftSyncFunction | null,
): void {
    draftSyncFunction = syncFunction;
}

export async function syncOrderDraft<T>(
    userId: string,
    temporaryOrderId: string,
): Promise<boolean> {
    const draft = loadOrderDraft<T>(userId, temporaryOrderId);

    if (!draft || !draftSyncFunction || !isOnline()) return false;

    try {
        const success = await draftSyncFunction(draft);
        if (!success) throw new Error("Đồng bộ draft thất bại.");

        const syncedDraft: OrderDraft<T> = {
            ...draft,
            syncStatus: "SYNCED",
            updatedAt: new Date().toISOString(),
        };

        localStorage.setItem(
            draftKey(userId, temporaryOrderId),
            JSON.stringify(syncedDraft),
        );

        return true;
    } catch {
        const failedDraft: OrderDraft<T> = {
            ...draft,
            syncStatus: "FAILED",
        };

        localStorage.setItem(
            draftKey(userId, temporaryOrderId),
            JSON.stringify(failedDraft),
        );

        return false;
    }
}

export function registerReconnectSyncHandler(
    handler: () => Promise<void>,
): () => void {
    reconnectHandlers.push(handler);

    return () => {
        const index = reconnectHandlers.indexOf(handler);
        if (index >= 0) reconnectHandlers.splice(index, 1);
    };
}

async function runReconnectSyncHandlers(): Promise<void> {
    if (!isOnline()) return;
    await Promise.allSettled(reconnectHandlers.map((handler) => handler()));
}

/* ============================ IDEMPOTENCY ============================== */
export function createIdempotencyKey(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
        .toString(36)
        .slice(2)}`;
}

export function withIdempotencyKey(
    headers: Record<string, string> = {},
): Record<string, string> {
    return {
        ...headers,
        "Idempotency-Key": createIdempotencyKey(),
    };
}

/* ============================== INITIALIZE ============================ */
export async function initializeScrum53(
    onNetworkStatusChange?: (online: boolean) => void,
): Promise<() => void> {
    await restoreSession();

    networkCleanup?.();
    networkCleanup = onNetworkChange(
        onNetworkStatusChange ?? (() => undefined),
    );

    if (isOnline()) {
        await runReconnectSyncHandlers();
    }

    return () => {
        networkCleanup?.();
        networkCleanup = null;
    };
}

export default api;
