package com.oms.auth.controller;

import com.oms.auth.security.JwtService;
import com.oms.auth.service.AuthService;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final JwtService jwtService;

    /**
     * Ví dụ login
     */
    @PostMapping("/login")
    public ResponseEntity<?> login(
            @RequestParam Long userId,
            HttpServletResponse response
    ) {

        String accessToken =
                jwtService.generateAccessToken(userId);

        String refreshToken =
                authService.createSession(userId);

        // Refresh token nằm trong HttpOnly Cookie
        Cookie cookie =
                new Cookie(
                        "refresh_token",
                        refreshToken
                );

        cookie.setHttpOnly(true);
        cookie.setSecure(false); // production dùng true
        cookie.setPath("/");
        cookie.setMaxAge(7 * 24 * 60 * 60);

        response.addCookie(cookie);

        return ResponseEntity.ok(
                Map.of(
                        "accessToken",
                        accessToken
                )
        );
    }

    /**
     * Refresh Access Token
     */
    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(
            HttpServletRequest request
    ) {

        String refreshToken =
                getRefreshToken(request);

        if (refreshToken == null) {

            return ResponseEntity
                    .status(401)
                    .body(
                            Map.of(
                                    "message",
                                    "Phiên đăng nhập không tồn tại"
                            )
                    );
        }

        try {

            String accessToken =
                    authService.refreshAccessToken(
                            refreshToken
                    );

            return ResponseEntity.ok(
                    Map.of(
                            "accessToken",
                            accessToken
                    )
            );

        } catch (RuntimeException e) {

            return ResponseEntity
                    .status(401)
                    .body(
                            Map.of(
                                    "message",
                                    e.getMessage()
                            )
                    );
        }
    }

    /**
     * Logout
     */
    @PostMapping("/logout")
    public ResponseEntity<?> logout(
            HttpServletRequest request,
            HttpServletResponse response
    ) {

        String refreshToken =
                getRefreshToken(request);

        if (refreshToken != null) {

            authService.logout(
                    refreshToken
            );
        }

        // Xóa Cookie
        Cookie cookie =
                new Cookie(
                        "refresh_token",
                        null
                );

        cookie.setHttpOnly(true);
        cookie.setSecure(false);
        cookie.setPath("/");
        cookie.setMaxAge(0);

        response.addCookie(cookie);

        return ResponseEntity.ok(
                Map.of(
                        "message",
                        "Đăng xuất thành công"
                )
        );
    }

    private String getRefreshToken(
            HttpServletRequest request
    ) {

        if (request.getCookies() == null) {
            return null;
        }

        for (Cookie cookie :
                request.getCookies()) {

            if ("refresh_token"
                    .equals(cookie.getName())) {

                return cookie.getValue();
            }
        }

        return null;
    }
}