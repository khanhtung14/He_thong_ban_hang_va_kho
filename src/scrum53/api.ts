import axios from "axios";

const api = axios.create({
    baseURL: "http://localhost:8080/api",
    withCredentials: true,
});

let accessToken: string | null = null;

let isRefreshing = false;

let refreshSubscribers: Array<
    (token: string) => void
> = [];

export function setAccessToken(
    token: string | null
) {
    accessToken = token;
}

function subscribeTokenRefresh(
    callback: (token: string) => void
) {
    refreshSubscribers.push(callback);
}

function onRefreshSuccess(
    newToken: string
) {
    refreshSubscribers.forEach(
        callback => callback(newToken)
    );

    refreshSubscribers = [];
}

api.interceptors.request.use(
    config => {

        if (accessToken) {

            config.headers.Authorization =
                `Bearer ${accessToken}`;
        }

        return config;
    }
);

api.interceptors.response.use(

    response => response,

    async error => {

        const originalRequest =
            error.config;

        if (
            error.response?.status !== 401 ||
            originalRequest._retry
        ) {

            return Promise.reject(error);
        }

        originalRequest._retry = true;

        if (isRefreshing) {

            return new Promise(
                (resolve, reject) => {

                    subscribeTokenRefresh(
                        token => {

                            originalRequest.headers
                                .Authorization =
                                `Bearer ${token}`;

                            resolve(
                                api(originalRequest)
                            );
                        }
                    );
                }
            );
        }

        isRefreshing = true;

        try {

            const response =
                await api.post(
                    "/auth/refresh"
                );

            const newToken =
                response.data.accessToken;

            setAccessToken(newToken);

            onRefreshSuccess(newToken);

            originalRequest.headers
                .Authorization =
                `Bearer ${newToken}`;

            return api(originalRequest);

        } catch (refreshError) {

            setAccessToken(null);

            window.location.href =
                "/login?sessionExpired=true";

            return Promise.reject(
                refreshError
            );

        } finally {

            isRefreshing = false;
        }
    }
);

export default api;
