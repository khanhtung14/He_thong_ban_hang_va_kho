-- Database Schema: Hệ Thống Quản Lý Bán Hàng Và Kho (OMS)
-- Module: Quản lý Tài khoản và Phân quyền (SCRUM-6 / SCRUM-62 / S1-08)
-- Hệ quản trị cơ sở dữ liệu mục tiêu: MySQL 8.0 (InnoDB Engine)

CREATE TABLE IF NOT EXISTS roles (
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT NULL,
    PRIMARY KEY (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
    id INT NOT NULL AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(120) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    role_code VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_ACTIVATION',
    password_hash VARCHAR(255) NOT NULL,
    is_temporary_password TINYINT(1) NOT NULL DEFAULT 1,
    email_sent TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_username (username),
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_phone (phone),
    KEY idx_users_full_name (full_name),
    KEY idx_users_role_code (role_code),
    KEY idx_users_status (status),
    CONSTRAINT fk_users_role FOREIGN KEY (role_code) REFERENCES roles (code) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
