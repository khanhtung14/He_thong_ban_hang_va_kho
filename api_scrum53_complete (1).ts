import axios, {
    AxiosError,
    InternalAxiosRequestConfig,
} from "axios";

/* =========================================================
 * SCRUM-53 - COMPLETE FRONTEND MODULE
 * Duy trì phiên đăng nhập, đăng xuất an toàn và bảo toàn
 * đơn hàng đang nhập khi mạng chập chờn.
 *
 * Backend prerequisites:
 * - POST /auth/refresh: đọc HttpOnly refresh cookie và trả
 *   { accessToken: string }
 * - POST /auth/logout: revoke/invalidate refresh session phía server
 * - Access Token nên chứa claim exp (JWT)
 *
 * Lưu ý:
 * File này không thể tự revoke session trên server nếu backend
 * chưa triển khai POST /auth/logout.
 * ========================================================= */

const api = axios.create({
    baseURL: "http://localhost:8080/api",
    withCredentials: true,
    timeout: 15000,
});

/* =========================================================
 * 1. AUTH SESSION
 * ========================================================= */

let accessToken: string | null = null;
let refreshPromise: Promise<string> | null = null;
let proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let stopNetworkListener: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
    accessToken = token;
    scheduleProactiveRefresh(token);
}

export function getAccessToken(): string | null {
    return accessToken;
}

type RetryableRequestConfig = InternalAxiosRequestConfig & {
    _retry?: boolean;
};

function isAuthEndpoint(url?: string): boolean {
    if (!url) return false;

    return (
        url.includes("/auth/login") ||
        url.includes("/auth/refresh") ||
        url.includes("/auth/logout")
    );
}

function clearProactiveRefreshTimer(): void {
    if (proactiveRefreshTimer !== null) {
        clearTimeout(proactiveRefreshTimer);
        proactiveRefreshTimer = null;
    }
}

function redirectToLogin(message = "Phiên đăng nhập đã hết hạn."): void {
    if (typeof window === "undefined") return;

    if (window.location.pathname === "/login") return;

    const query = new URLSearchParams({
        sessionExpired: "true",
        message,
    });

    window.location.href = `/login?${query.toString()}`;
}

/* Decode exp only để lập lịch refresh ở client.
 * Việc xác thực JWT vẫn phải do backend thực hiện. */
function getTokenExpiryMs(token: string): number | null {
    try {
        const parts = token.split(".");
        if (parts.length !== 3) return null;

        const base64 = parts[1]
            .replace(/-/g, "+")
            .replace(/_/g, "/");

        const padded = base64.padEnd(
            Math.ceil(base64.length / 4) * 4,
            "=",
        );

        const payload = JSON.parse(
            decodeURIComponent(
                Array.from(atob(padded))
                    .map((char) =>
                        `%${char.charCodeAt(0)
                            .toString(16)
                            .padStart(2, "0")}`,
                    )
                    .join(""),
            ),
        ) as { exp?: number };

        if (typeof payload.exp !== "number") {
            return null;
        }

        return payload.exp * 1000;
    } catch {
        return null;
    }
}

function scheduleProactiveRefresh(token: string | null): void {
    clearProactiveRefreshTimer();

    if (!token) return;
    if (typeof window === "undefined") return;

    const expiryMs = getTokenExpiryMs(token);
    if (!expiryMs) return;

    const REFRESH_BEFORE_EXPIRY_MS = 60_000;
    const MIN_DELAY_MS = 5_000;

    const delay = Math.max(
        MIN_DELAY_MS,
        expiryMs - Date.now() - REFRESH_BEFORE_EXPIRY_MS,
    );

    proactiveRefreshTimer = setTimeout(async () => {
        try {
            await refreshSession(false);
        } catch {
            // refreshSession đã xử lý việc đưa user về Login.
        }
    }, delay);
}

/**
 * Refresh Access Token.
 * Chỉ cho phép một refresh request chạy tại một thời điểm.
 */
export async function refreshSession(
    redirectOnFailure = true,
): Promise<string> {
    if (refreshPromise) {
        return refreshPromise;
    }

    refreshPromise = (async () => {
        try {
            const response = await api.post("/auth/refresh");
            const newToken = response.data?.accessToken;

            if (
                typeof newToken !== "string" ||
                newToken.trim().length === 0
            ) {
                throw new Error("Không nhận được Access Token mới.");
            }

            setAccessToken(newToken);
            return newToken;
        } catch (error) {
            setAccessToken(null);

            if (redirectOnFailure) {
                redirectToLogin(
                    "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
                );
            }

            throw error;
        } finally {
            refreshPromise = null;
        }
    })();

    return refreshPromise;
}

/* =========================================================
 * 2. REQUEST INTERCEPTOR
 * ========================================================= */

api.interceptors.request.use(
    (config) => {
        if (accessToken) {
            config.headers.Authorization = `Bearer ${accessToken}`;
        }

        return config;
    },
    (error) => Promise.reject(error),
);

/* =========================================================
 * 3. RESPONSE INTERCEPTOR
 *    401 -> refresh -> retry đúng 1 lần
 * ========================================================= */

api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest =
            error.config as RetryableRequestConfig | undefined;

        if (!originalRequest) {
            return Promise.reject(error);
        }

        if (error.response?.status !== 401) {
            return Promise.reject(error);
        }

        /* Không refresh chính login/refresh/logout */
        if (isAuthEndpoint(originalRequest.url)) {
            return Promise.reject(error);
        }

        /* Tránh retry vô hạn */
        if (originalRequest._retry) {
            return Promise.reject(error);
        }

        originalRequest._retry = true;

        try {
            const newToken = await refreshSession(true);

            originalRequest.headers.Authorization =
                `Bearer ${newToken}`;

            return api(originalRequest);
        } catch (refreshError) {
            return Promise.reject(refreshError);
        }
    },
);

/* =========================================================
 * 4. RESTORE SESSION KHI RELOAD
 * ========================================================= */

let restorePromise: Promise<boolean> | null = null;

export async function restoreSession(): Promise<boolean> {
    if (restorePromise) {
        return restorePromise;
    }

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

/* =========================================================
 * 5. LOGOUT AN TOÀN
 * ========================================================= */

export async function logout(options?: {
    redirect?: boolean;
}): Promise<void> {
    const shouldRedirect = options?.redirect ?? true;

    try {
        /* Backend phải revoke session/refresh token tại đây. */
        await api.post("/auth/logout");
    } catch {
        /* Vẫn phải xóa trạng thái client dù server request thất bại. */
    } finally {
        setAccessToken(null);
        refreshPromise = null;
        clearProactiveRefreshTimer();

        if (shouldRedirect && typeof window !== "undefined") {
            window.location.href = "/login?loggedOut=true";
        }
    }
}

/* =========================================================
 * 6. NETWORK ONLINE / OFFLINE
 * ========================================================= */

export function isOnline(): boolean {
    return typeof navigator === "undefined" || navigator.onLine;
}

export function onNetworkChange(
    callback: (online: boolean) => void,
): () => void {
    if (typeof window === "undefined") {
        return () => undefined;
    }

    const handleOnline = async () => {
        callback(true);

        /* Khi có mạng lại, cố gắng khôi phục session nếu cần. */
        if (accessToken) {
            try {
                await refreshSession(false);
            } catch {
                // Không redirect ở đây để tránh UX đột ngột.
            }
        }

        await runReconnectSyncHandlers();
    };

    const handleOffline = () => callback(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
    };
}

/* =========================================================
 * 7. ORDER DRAFT
 * ========================================================= */

export interface OrderDraft<T = Record<string, unknown>> {
    userId: string;
    temporaryOrderId: string;
    data: T;
    updatedAt: string;
    version: number;
    syncStatus: "LOCAL" | "PENDING_SYNC" | "SYNCED" | "FAILED";
}

function draftStorageKey(
    userId: string,
    temporaryOrderId: string,
): string {
    return `oms_order_draft:${userId}:${temporaryOrderId}`;
}

function isBrowser(): boolean {
    return typeof window !== "undefined";
}

export function saveOrderDraft<T>(
    userId: string,
    temporaryOrderId: string,
    data: T,
): void {
    if (!isBrowser()) return;

    const key = draftStorageKey(userId, temporaryOrderId);
    const previous = localStorage.getItem(key);

    let previousVersion = 0;

    if (previous) {
        try {
            const parsed = JSON.parse(previous) as OrderDraft<T>;
            previousVersion = Number(parsed.version) || 0;
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

    const raw = localStorage.getItem(
        draftStorageKey(userId, temporaryOrderId),
    );

    if (!raw) return null;

    try {
        const draft = JSON.parse(raw) as OrderDraft<T>;

        if (draft.userId !== userId) {
            return null;
        }

        return draft;
    } catch {
        return null;
    }
}

export function clearOrderDraft(
    userId: string,
    temporaryOrderId: string,
): void {
    if (!isBrowser()) return;

    localStorage.removeItem(
        draftStorageKey(userId, temporaryOrderId),
    );
}

export function hasOrderDraft(
    userId: string,
    temporaryOrderId: string,
): boolean {
    return (
        loadOrderDraft(userId, temporaryOrderId) !== null
    );
}

export function createDraftAutoSaver<T>(
    userId: string,
    temporaryOrderId: string,
    delay = 500,
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
            saveOrderDraft(
                userId,
                temporaryOrderId,
                latestData,
            );
        }
    };

    const schedule = (data: T): void => {
        latestData = data;

        if (timer !== null) {
            clearTimeout(timer);
        }

        timer = setTimeout(flush, delay);
    };

    const cancel = (): void => {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }

        latestData = null;
    };

    return { schedule, flush, cancel };
}

export function registerDraftBeforeUnload<T>(
    userId: string,
    temporaryOrderId: string,
    getCurrentData: () => T,
): () => void {
    if (!isBrowser()) {
        return () => undefined;
    }

    const handler = (): void => {
        try {
            saveOrderDraft(
                userId,
                temporaryOrderId,
                getCurrentData(),
            );
        } catch {
            // Không chặn việc đóng trang nếu localStorage lỗi.
        }
    };

    window.addEventListener("beforeunload", handler);

    return () => {
        window.removeEventListener("beforeunload", handler);
    };
}

/* =========================================================
 * 8. SYNC DRAFT KHI ONLINE
 *
 * Không tự bịa endpoint backend.
 * Gọi setOrderDraftSyncFunction() từ phần order của project
 * khi backend có API sync chính thức.
 * ========================================================= */

type DraftSyncFunction = (
    draft: OrderDraft,
) => Promise<boolean>;

let draftSyncFunction: DraftSyncFunction | null = null;

export function setOrderDraftSyncFunction(
    syncFunction: DraftSyncFunction | null,
): void {
    draftSyncFunction = syncFunction;
}

const reconnectSyncHandlers: Array<() => Promise<void>> = [];

export function registerReconnectSyncHandler(
    handler: () => Promise<void>,
): () => void {
    reconnectSyncHandlers.push(handler);

    return () => {
        const index = reconnectSyncHandlers.indexOf(handler);
        if (index >= 0) {
            reconnectSyncHandlers.splice(index, 1);
        }
    };
}

async function runReconnectSyncHandlers(): Promise<void> {
    if (!isOnline()) return;

    await Promise.allSettled(
        reconnectSyncHandlers.map((handler) => handler()),
    );
}

export async function syncOrderDraft<T>(
    userId: string,
    temporaryOrderId: string,
): Promise<boolean> {
    const draft = loadOrderDraft<T>(
        userId,
        temporaryOrderId,
    );

    if (!draft) return false;
    if (!draftSyncFunction) return false;
    if (!isOnline()) return false;

    try {
        const success = await draftSyncFunction(draft);

        if (!success) {
            throw new Error("Đồng bộ draft thất bại.");
        }

        const syncedDraft: OrderDraft<T> = {
            ...draft,
            syncStatus: "SYNCED",
            updatedAt: new Date().toISOString(),
        };

        localStorage.setItem(
            draftStorageKey(userId, temporaryOrderId),
            JSON.stringify(syncedDraft),
        );

        return true;
    } catch {
        const failedDraft: OrderDraft<T> = {
            ...draft,
            syncStatus: "FAILED",
        };

        localStorage.setItem(
            draftStorageKey(userId, temporaryOrderId),
            JSON.stringify(failedDraft),
        );

        return false;
    }
}

/* =========================================================
 * 9. INIT SCRUM-53
 *
 * Gọi một lần khi app khởi động:
 *
 * const cleanup = await initializeScrum53();
 *
 * Khi app unmount:
 * cleanup();
 * ========================================================= */

export async function initializeScrum53(
    onNetworkStatusChange?: (online: boolean) => void,
): Promise<() => void> {
    /* Khôi phục session nếu refresh cookie còn hợp lệ. */
    await restoreSession();

    /* Không đăng ký listener nhiều lần. */
    stopNetworkListener?.();

    stopNetworkListener = onNetworkChange(
        onNetworkStatusChange ?? (() => undefined),
    );

    /* Sync các handler đã đăng ký khi app vừa khởi động và đang online. */
    if (isOnline()) {
        await runReconnectSyncHandlers();
    }

    return () => {
        stopNetworkListener?.();
        stopNetworkListener = null;
    };
}

export default api;
