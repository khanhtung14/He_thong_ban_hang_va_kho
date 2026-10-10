import React from "react";
import { HomeOutlined } from "@ant-design/icons";

interface BrandLogoProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  title = "WMS",
  subtitle = "Hệ thống quản lý kho & bán hàng",
  icon = <HomeOutlined />,
}) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "20px 20px 16px 20px",
        userSelect: "none",
      }}
    >
      {/* Icon box bo tròn đổ bóng xanh đặc trưng */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: "#2563eb",
          color: "#ffffff",
          display: "grid",
          placeItems: "center",
          fontSize: 22,
          boxShadow: "0 8px 16px rgba(37, 99, 235, 0.25)",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>

      {/* Chữ thương hiệu */}
      <div style={{ overflow: "hidden" }}>
        <div
          style={{
            fontSize: 17,
            fontWeight: 800,
            color: "#1e3a8a",
            letterSpacing: -0.3,
            lineHeight: 1.15,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#94a3b8",
            marginTop: 3,
            lineHeight: 1.3,
            whiteSpace: "normal",
          }}
        >
          {subtitle}
        </div>
      </div>
    </div>
  );
};

export default BrandLogo;
