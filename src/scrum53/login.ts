import api, {
    setAccessToken
} from "./api";

export async function login(
    userId: number
) {

    const response =
        await api.post(
            "/auth/login",
            null,
            {
                params: {
                    userId
                }
            }
        );

    setAccessToken(
        response.data.accessToken
    );

    return response.data;
}

