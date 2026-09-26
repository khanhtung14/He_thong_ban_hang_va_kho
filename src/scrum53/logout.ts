import api, {
    setAccessToken
} from "./api";

export async function logout() {

    try {

        await api.post(
            "/auth/logout"
        );

    } finally {

        // Xóa access token phía client
        setAccessToken(null);

        // Chuyển về Login
        window.location.href =
            "/login";
    }
}
