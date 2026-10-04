-- Create the MySQL database before starting the API.
CREATE DATABASE IF NOT EXISTS oms
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

-- Tables are created from src/backend/models.py (SQLAlchemy metadata).
-- users.email is VARCHAR(254), NOT NULL, and UNIQUE (see User in models.py).
-- Configure DATABASE_URL with a least-privilege MySQL account.
