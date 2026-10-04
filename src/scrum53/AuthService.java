package com.oms.auth.service;

import com.oms.auth.entity.RefreshToken;
import com.oms.auth.repository.RefreshTokenRepository;
import com.oms.auth.security.JwtService;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final RefreshTokenRepository refreshTokenRepository;
    private final JwtService jwtService;

    /**
     * Tạo session mới
     */
    public String createSession(Long userId) {

        String refreshToken =
                UUID.randomUUID().toString();

        RefreshToken session =
                RefreshToken.builder()
                        .userId(userId)
                        .token(refreshToken)
                        .expiresAt(
                                LocalDateTime.now()
                                        .plusDays(7)
                        )
                        .revoked(false)
                        .createdAt(LocalDateTime.now())
                        .build();

        refreshTokenRepository.save(session);

        return refreshToken;
    }

    /**
     * Refresh access token
     */
    public String refreshAccessToken(
            String refreshToken
    ) {

        RefreshToken session =
                refreshTokenRepository
                        .findByToken(refreshToken)
                        .orElseThrow(() ->
                                new RuntimeException(
                                        "Phiên đăng nhập không tồn tại"
                                )
                        );

        // Kiểm tra session đã logout
        if (session.isRevoked()) {

            throw new RuntimeException(
                    "Phiên đăng nhập đã bị đăng xuất"
            );
        }

        // Kiểm tra hết hạn
        if (session.getExpiresAt()
                .isBefore(LocalDateTime.now())) {

            session.setRevoked(true);

            refreshTokenRepository.save(session);

            throw new RuntimeException(
                    "Phiên đăng nhập đã hết hạn"
            );
        }

        return jwtService.generateAccessToken(
                session.getUserId()
        );
    }

    /**
     * Logout:
     * vô hiệu hóa session ngay phía server
     */
    @Transactional
    public void logout(String refreshToken) {

        RefreshToken session =
                refreshTokenRepository
                        .findByToken(refreshToken)
                        .orElse(null);

        if (session != null) {

            session.setRevoked(true);

            refreshTokenRepository.save(session);
        }
    }
}
