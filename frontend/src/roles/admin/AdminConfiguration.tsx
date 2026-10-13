import React, { useEffect, useState, useMemo } from "react";
import {
  Card,
  Row,
  Col,
  Typography,
  Tabs,
  Table,
  Tag,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Space,
  Popconfirm,
  message,
  Tooltip,
  Badge,
  Divider,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  AppstoreOutlined,
  CompassOutlined,
  ShopOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  StopOutlined,
  UserAddOutlined,
  SafetyCertificateOutlined,
  EnvironmentOutlined,
  GlobalOutlined,
  ApartmentOutlined,
} from "@ant-design/icons";
import { authenticatedFetch } from "../../services/sessionService";
import CategoryManagement from "../sales_manager/CategoryManagement";

const { Title, Text, Paragraph } = Typography;

// ---------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------

export interface WarehouseItem {
  id: number;
  code: string;
  name: string;
  address?: string;
  is_active: boolean;
}

export interface TerritoryItem {
  id: number;
  code: string;
  name: string;
  parent_id?: number | null;
}

export interface RoleItem {
  id: number;
  code: string;
  name: string;
  description?: string;
}

// ---------------------------------------------------------------------
// Fallback Datasets (Chuẩn nghiệp vụ OMS/WMS)
// ---------------------------------------------------------------------

const FALLBACK_WAREHOUSES: WarehouseItem[] = [
  {
    id: 1,
    code: "WH-HN-01",
    name: "Kho Tổng Hà Nội",
    address: "Cụm Công nghiệp Long Biên, Phường Long Biên, TP. Hà Nội",
    is_active: true,
  },
  {
    id: 2,
    code: "WH-HCM-01",
    name: "Kho Chi nhánh TP. Hồ Chí Minh",
    address: "Khu chế xuất Tân Thuận, Phường Tân Thuận Đông, Quận 7, TP. Hồ Chí Minh",
    is_active: true,
  },
];

const FALLBACK_TERRITORIES: TerritoryItem[] = [
  { id: 1, code: "TT-VN", name: "Toàn quốc", parent_id: null },
  { id: 2, code: "TT-MB", name: "Miền Bắc (Hà Nội)", parent_id: 1 },
  { id: 3, code: "TT-MN", name: "Miền Nam (TP.HCM)", parent_id: 1 },
  { id: 4, code: "TT-MT", name: "Miền Trung (Đà Nẵng)", parent_id: 1 },
];

const STANDARD_ROLES: RoleItem[] = [
  {
    id: 1,
    code: "ADMIN",
    name: "Quản trị hệ thống",
    description: "Toàn quyền quản trị tài khoản, phân quyền RBAC, theo dõi nhật ký audit và cấu hình danh mục toàn hệ thống.",
  },
  {
    id: 2,
    code: "SALES_MANAGER",
    name: "Quản lý kinh doanh",
    description: "Quản lý chính sách giá, phê duyệt đơn hàng ngoại lệ, kiểm tra biên lợi nhuận & giá vốn, phân bổ KPI doanh số toàn tuyến.",
  },
  {
    id: 3,
    code: "SALES_REP",
    name: "Nhân viên kinh doanh",
    description: "Phụ trách địa bàn và tuyến bán hàng, tạo đơn hàng đại lý, theo dõi tiến độ giao hàng và đôn đốc thu tiền.",
  },
  {
    id: 4,
    code: "WH_MANAGER",
    name: "Quản lý kho",
    description: "Quản trị vận hành kho bãi, duyệt phiếu điều chuyển, phê duyệt điều chỉnh tồn kho và chốt biên bản kiểm kê định kỳ.",
  },
  {
    id: 5,
    code: "WAREHOUSE",
    name: "Nhân viên kho",
    description: "Tiếp nhận hàng nhập theo PO, thực hiện soạn hàng xuất kho theo nguyên tắc FEFO, đóng gói và xác nhận xuất xưởng.",
  },
  {
    id: 6,
    code: "ACCOUNTANT",
    name: "Kế toán công nợ",
    description: "Theo dõi số dư công nợ đại lý, lập hóa đơn tài chính, hạch toán phiếu thu và thực hiện khóa giao dịch khi nợ quá hạn.",
  },
  {
    id: 7,
    code: "CUSTOMER",
    name: "Đại lý (Khách sỉ)",
    description: "Cửa hàng hoặc đại lý phân phối tự đăng nhập xem bảng giá áp dụng, đặt hàng trực tuyến và theo dõi lịch sử thanh toán.",
  },
];

export const AdminConfiguration: React.FC = () => {
  // State danh mục
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>(FALLBACK_WAREHOUSES);
  const [territories, setTerritories] = useState<TerritoryItem[]>(FALLBACK_TERRITORIES);
  const [roles, setRoles] = useState<RoleItem[]>(STANDARD_ROLES);

  // Loading states
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [loadingTerritories, setLoadingTerritories] = useState(false);
  const [submittingWarehouse, setSubmittingWarehouse] = useState(false);
  const [submittingTerritory, setSubmittingTerritory] = useState(false);

  // Search & Filter
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [warehouseStatusFilter, setWarehouseStatusFilter] = useState<string>("ALL");
  const [territorySearch, setTerritorySearch] = useState("");

  // Modals
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseItem | null>(null);
  const [warehouseForm] = Form.useForm();

  const [isTerritoryModalOpen, setIsTerritoryModalOpen] = useState(false);
  const [editingTerritory, setEditingTerritory] = useState<TerritoryItem | null>(null);
  const [territoryForm] = Form.useForm();

  // Active Tab
  const [activeTabKey, setActiveTabKey] = useState("warehouses");

  // -------------------------------------------------------------------
  // Fetch Functions
  // -------------------------------------------------------------------

  const fetchWarehouses = async () => {
    setLoadingWarehouses(true);
    try {
      const res = await authenticatedFetch("/api/v1/warehouses");
      if (res.ok) {
        const json = await res.json();
        const items = Array.isArray(json) ? json : json.data || [];
        if (items.length > 0) {
          setWarehouses(items);
        }
      }
    } catch {
      // Giữ nguyên dữ liệu hiện tại / fallback
    } finally {
      setLoadingWarehouses(false);
    }
  };

  const fetchTerritories = async () => {
    setLoadingTerritories(true);
    try {
      const res = await authenticatedFetch("/api/v1/territories");
      if (res.ok) {
        const json = await res.json();
        const items = Array.isArray(json) ? json : json.data || [];
        if (items.length > 0) {
          setTerritories(items);
        }
      }
    } catch {
      // Giữ nguyên dữ liệu hiện tại / fallback
    } finally {
      setLoadingTerritories(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const res = await authenticatedFetch("/api/v1/roles");
      if (res.ok) {
        const json = await res.json();
        const items = Array.isArray(json) ? json : json.data || [];
        if (items.length > 0) {
          setRoles(items);
        }
      }
    } catch {
      // Giữ STANDARD_ROLES
    }
  };

  useEffect(() => {
    fetchWarehouses();
    fetchTerritories();
    fetchRoles();
  }, []);

  // -------------------------------------------------------------------
  // Warehouse Handlers (CRUD & Đồng bộ CreateUser)
  // -------------------------------------------------------------------

  const handleOpenCreateWarehouse = () => {
    setEditingWarehouse(null);
    warehouseForm.resetFields();
    warehouseForm.setFieldsValue({ is_active: true });
    setIsWarehouseModalOpen(true);
  };

  const handleOpenEditWarehouse = (item: WarehouseItem) => {
    setEditingWarehouse(item);
    warehouseForm.setFieldsValue({
      code: item.code,
      name: item.name,
      address: item.address,
      is_active: item.is_active,
    });
    setIsWarehouseModalOpen(true);
  };

  const handleSaveWarehouse = async () => {
    try {
      const values = await warehouseForm.validateFields();
      setSubmittingWarehouse(true);

      if (editingWarehouse) {
        // Cập nhật kho
        const res = await authenticatedFetch(`/api/v1/warehouses/${editingWarehouse.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name.trim(),
            address: values.address ? values.address.trim() : "",
            is_active: values.is_active,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Không thể cập nhật kho hàng.");
        }

        message.success(`Đã cập nhật thông tin kho "${values.name}".`);
      } else {
        // Tạo mới kho
        const res = await authenticatedFetch("/api/v1/warehouses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: values.code.trim().toUpperCase(),
            name: values.name.trim(),
            address: values.address ? values.address.trim() : "",
            is_active: values.is_active ?? true,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Không thể thêm mới kho hàng.");
        }

        message.success(`Thêm mới kho "${values.name}" thành công!`);
      }

      setIsWarehouseModalOpen(false);
      warehouseForm.resetFields();
      await fetchWarehouses();

      // Đồng bộ ngay lập tức cho trang CreateUser.tsx
      window.dispatchEvent(new CustomEvent("warehouse_updated"));
    } catch (err: any) {
      if (err.message) {
        message.error(err.message);
      }
    } finally {
      setSubmittingWarehouse(false);
    }
  };

  const handleToggleWarehouseStatus = async (item: WarehouseItem) => {
    try {
      const res = await authenticatedFetch(`/api/v1/warehouses/${item.id}/status`, {
        method: "PATCH",
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Không thể đổi trạng thái kho.");
      }

      const nextStatusText = !item.is_active ? "kích hoạt" : "tạm ngừng";
      message.success(`Đã ${nextStatusText} kho "${item.name}".`);
      await fetchWarehouses();

      // Đồng bộ ngay lập tức cho trang CreateUser.tsx
      window.dispatchEvent(new CustomEvent("warehouse_updated"));
    } catch (err: any) {
      message.error(err.message || "Lỗi thao tác.");
    }
  };

  const handleGoToCreateUser = (warehouseId?: number) => {
    // Điều hướng hoặc chuyển view sang CreateUser
    const targetUrl = warehouseId
      ? `/admin/users/create?warehouse=${warehouseId}`
      : `/admin/users/create`;
    window.location.assign(targetUrl);
  };

  // -------------------------------------------------------------------
  // Territory Handlers
  // -------------------------------------------------------------------

  const handleOpenCreateTerritory = () => {
    setEditingTerritory(null);
    territoryForm.resetFields();
    setIsTerritoryModalOpen(true);
  };

  const handleOpenEditTerritory = (item: TerritoryItem) => {
    setEditingTerritory(item);
    territoryForm.setFieldsValue({
      code: item.code,
      name: item.name,
      parent_id: item.parent_id,
    });
    setIsTerritoryModalOpen(true);
  };

  const handleSaveTerritory = async () => {
    try {
      const values = await territoryForm.validateFields();
      setSubmittingTerritory(true);

      if (editingTerritory) {
        const res = await authenticatedFetch(`/api/v1/territories/${editingTerritory.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name.trim(),
            parent_id: values.parent_id || null,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Không thể cập nhật địa bàn.");
        }

        message.success(`Đã cập nhật địa bàn "${values.name}".`);
      } else {
        const res = await authenticatedFetch("/api/v1/territories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: values.code.trim().toUpperCase(),
            name: values.name.trim(),
            parent_id: values.parent_id || null,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Không thể tạo địa bàn mới.");
        }

        message.success(`Thêm mới địa bàn "${values.name}" thành công!`);
      }

      setIsTerritoryModalOpen(false);
      territoryForm.resetFields();
      await fetchTerritories();

      // Đồng bộ cho CreateUser
      window.dispatchEvent(new CustomEvent("territory_updated"));
    } catch (err: any) {
      if (err.message) {
        message.error(err.message);
      }
    } finally {
      setSubmittingTerritory(false);
    }
  };

  const handleDeleteTerritory = async (id: number) => {
    try {
      const res = await authenticatedFetch(`/api/v1/territories/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Không thể xóa địa bàn.");
      }
      message.success("Đã xóa địa bàn thành công.");
      await fetchTerritories();
      window.dispatchEvent(new CustomEvent("territory_updated"));
    } catch (err: any) {
      message.error(err.message || "Lỗi thao tác.");
    }
  };

  // -------------------------------------------------------------------
  // Filtered Data
  // -------------------------------------------------------------------

  const filteredWarehouses = useMemo(() => {
    return warehouses.filter((w) => {
      const matchSearch =
        warehouseSearch.trim() === "" ||
        w.name.toLowerCase().includes(warehouseSearch.toLowerCase()) ||
        w.code.toLowerCase().includes(warehouseSearch.toLowerCase()) ||
        (w.address && w.address.toLowerCase().includes(warehouseSearch.toLowerCase()));

      const matchStatus =
        warehouseStatusFilter === "ALL" ||
        (warehouseStatusFilter === "ACTIVE" && w.is_active) ||
        (warehouseStatusFilter === "INACTIVE" && !w.is_active);

      return matchSearch && matchStatus;
    });
  }, [warehouses, warehouseSearch, warehouseStatusFilter]);

  const filteredTerritories = useMemo(() => {
    return territories.filter((t) => {
      return (
        territorySearch.trim() === "" ||
        t.name.toLowerCase().includes(territorySearch.toLowerCase()) ||
        t.code.toLowerCase().includes(territorySearch.toLowerCase())
      );
    });
  }, [territories, territorySearch]);

  const activeWarehousesCount = useMemo(() => {
    return warehouses.filter((w) => w.is_active).length;
  }, [warehouses]);

  // -------------------------------------------------------------------
  // StatCards Configs (Giữ nguyên và làm giàu giá trị thực)
  // -------------------------------------------------------------------

  const statCardsData = [
    {
      icon: <ShopOutlined style={{ fontSize: 24, color: "#d97706" }} />,
      bgColor: "#fffbeb",
      borderColor: "#fef3c7",
      title: "Kho vận hành",
      value: `${warehouses.length} kho`,
      badgeText: `${activeWarehousesCount} đang hoạt động`,
      badgeColor: "#16a34a",
      desc: "Kho lưu trữ hàng hóa, quản lý tồn thực tế và phân bổ cho nhân sự kho.",
    },
    {
      icon: <CompassOutlined style={{ fontSize: 24, color: "#16a34a" }} />,
      bgColor: "#f0fdf4",
      borderColor: "#dcfce7",
      title: "Địa bàn hoạt động",
      value: `${territories.length} khu vực`,
      badgeText: "Phân vùng kinh doanh",
      badgeColor: "#0284c7",
      desc: "Phân tuyến thị trường phụ trách cho Sales Rep và quản lý đại lý.",
    },
    {
      icon: <SafetyCertificateOutlined style={{ fontSize: 24, color: "#2563eb" }} />,
      bgColor: "#eff6ff",
      borderColor: "#dbeafe",
      title: "Vai trò hệ thống",
      value: `${roles.length} vai trò`,
      badgeText: "Chuẩn chính sách RBAC",
      badgeColor: "#7c3aed",
      desc: "Phân quyền cố định 7 vai trò nghiệp vụ độc lập, bảo vệ dữ liệu giá vốn.",
    },
  ];

  // -------------------------------------------------------------------
  // Columns Definitions
  // -------------------------------------------------------------------

  const warehouseColumns: ColumnsType<WarehouseItem> = [
    {
      title: "Mã kho",
      dataIndex: "code",
      key: "code",
      width: 140,
      render: (code: string) => (
        <Tag
          color="blue"
          style={{
            fontWeight: 700,
            fontSize: 13,
            padding: "2px 8px",
            borderRadius: 6,
            fontFamily: "monospace",
          }}
        >
          {code}
        </Tag>
      ),
    },
    {
      title: "Tên kho hàng",
      dataIndex: "name",
      key: "name",
      render: (name: string) => (
        <Space>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: "#fef3c7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#d97706",
            }}
          >
            <ShopOutlined style={{ fontSize: 16 }} />
          </div>
          <div>
            <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 14 }}>
              {name}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Kho chi nhánh OMS
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: "Địa chỉ vị trí kho",
      dataIndex: "address",
      key: "address",
      render: (address?: string) => (
        <Space orientation="horizontal" size={6} style={{ maxWidth: 360 }}>
          <EnvironmentOutlined style={{ color: "#94a3b8" }} />
          <Text style={{ fontSize: 13 }}>{address || "Chưa cập nhật địa chỉ"}</Text>
        </Space>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "is_active",
      key: "is_active",
      width: 170,
      render: (isActive: boolean, record) => (
        <Space orientation="horizontal" size={8}>
          <Switch
            checked={isActive}
            onChange={() => handleToggleWarehouseStatus(record)}
            size="small"
            style={{
              backgroundColor: isActive ? "#16a34a" : undefined,
            }}
          />
          {isActive ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>
              Đang hoạt động
            </Tag>
          ) : (
            <Tag color="default" icon={<StopOutlined />}>
              Tạm ngừng
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 180,
      align: "center",
      render: (_, record) => (
        <Space size={8}>
          <Tooltip title="Chỉnh sửa thông tin kho">
            <Button
              type="text"
              icon={<EditOutlined style={{ color: "#2563eb" }} />}
              onClick={() => handleOpenEditWarehouse(record)}
              style={{ borderRadius: 6 }}
            />
          </Tooltip>
          <Tooltip title="Tạo tài khoản phụ trách kho này">
            <Button
              type="text"
              icon={<UserAddOutlined style={{ color: "#16a34a" }} />}
              onClick={() => handleGoToCreateUser(record.id)}
              style={{ borderRadius: 6 }}
            />
          </Tooltip>
          <Popconfirm
            title="Đổi trạng thái kho"
            description={`Bạn có chắc muốn ${record.is_active ? "tạm ngừng" : "kích hoạt"
              } kho "${record.name}"?`}
            onConfirm={() => handleToggleWarehouseStatus(record)}
            okText="Đồng ý"
            cancelText="Hủy"
          >
            <Button
              type="text"
              danger={record.is_active}
              icon={
                record.is_active ? (
                  <StopOutlined />
                ) : (
                  <CheckCircleOutlined style={{ color: "#16a34a" }} />
                )
              }
              style={{ borderRadius: 6 }}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const territoryColumns: ColumnsType<TerritoryItem> = [
    {
      title: "Mã địa bàn",
      dataIndex: "code",
      key: "code",
      width: 140,
      render: (code: string) => (
        <Tag
          color="cyan"
          style={{
            fontWeight: 700,
            fontSize: 13,
            padding: "2px 8px",
            borderRadius: 6,
            fontFamily: "monospace",
          }}
        >
          {code}
        </Tag>
      ),
    },
    {
      title: "Tên địa bàn / Khu vực",
      dataIndex: "name",
      key: "name",
      render: (name: string, record) => (
        <Space>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: "#f0fdf4",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#16a34a",
            }}
          >
            {record.parent_id ? (
              <ApartmentOutlined style={{ fontSize: 16 }} />
            ) : (
              <GlobalOutlined style={{ fontSize: 16 }} />
            )}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 14 }}>
              {name}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.parent_id ? "Khu vực trực thuộc phân cấp" : "Khu vực trung tâm / Toàn quốc"}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: "Cấp độ trực thuộc",
      dataIndex: "parent_id",
      key: "parent_id",
      width: 220,
      render: (parentId?: number | null) => {
        if (!parentId) {
          return <Tag color="blue">Khu vực Trụ sở (Cấp 1)</Tag>;
        }
        const parent = territories.find((t) => t.id === parentId);
        return (
          <Tag color="purple">
            Thuộc: {parent ? parent.name : `Khu vực #${parentId}`}
          </Tag>
        );
      },
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 140,
      align: "center",
      render: (_, record) => (
        <Space size={8}>
          <Tooltip title="Chỉnh sửa địa bàn">
            <Button
              type="text"
              icon={<EditOutlined style={{ color: "#2563eb" }} />}
              onClick={() => handleOpenEditTerritory(record)}
              style={{ borderRadius: 6 }}
            />
          </Tooltip>
          <Popconfirm
            title="Xóa địa bàn"
            description={`Bạn có chắc muốn xóa địa bàn "${record.name}"?`}
            onConfirm={() => handleDeleteTerritory(record.id)}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              style={{ borderRadius: 6 }}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const roleColumns: ColumnsType<RoleItem> = [
    {
      title: "Mã vai trò (Role Code)",
      dataIndex: "code",
      key: "code",
      width: 170,
      render: (code: string) => {
        const colorMap: Record<string, string> = {
          ADMIN: "magenta",
          SALES_MANAGER: "blue",
          SALES_REP: "cyan",
          WH_MANAGER: "gold",
          WAREHOUSE: "orange",
          ACCOUNTANT: "green",
          CUSTOMER: "purple",
        };
        return (
          <Tag
            color={colorMap[code] || "geekblue"}
            style={{
              fontWeight: 700,
              fontSize: 13,
              padding: "3px 8px",
              borderRadius: 6,
              fontFamily: "monospace",
            }}
          >
            {code}
          </Tag>
        );
      },
    },
    {
      title: "Tên vai trò",
      dataIndex: "name",
      key: "name",
      width: 200,
      render: (name: string) => (
        <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 14 }}>
          {name}
        </div>
      ),
    },
    {
      title: "Mô tả nghiệp vụ & Phạm vi trách nhiệm",
      dataIndex: "description",
      key: "description",
      render: (desc: string) => (
        <Paragraph style={{ margin: 0, color: "#475569", fontSize: 13 }}>
          {desc}
        </Paragraph>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 180,
      align: "center",
      render: (_, record) => (
        <Button
          type="link"
          icon={<UserAddOutlined />}
          onClick={() => window.location.assign(`/admin/users/create?role=${record.code}`)}
          style={{ fontWeight: 600 }}
        >
          Tạo tài khoản
        </Button>
      ),
    },
  ];

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 1. Header Banner */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              backgroundColor: "#eff6ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#2563eb",
            }}
          >
            <AppstoreOutlined style={{ fontSize: 20 }} />
          </div>
          <Title level={3} style={{ margin: 0, fontWeight: 700, color: "#0f172a" }}>
            Danh mục &amp; Cấu hình hệ thống
          </Title>
        </div>
        <Text type="secondary" style={{ marginTop: 4, display: "inline-block", fontSize: 13 }}>
          Quản trị danh mục kho bãi, địa bàn kinh doanh và ma trận vai trò phân quyền OMS/WMS.
        </Text>
      </div>

      {/* 2. Thẻ tóm tắt thống kê (StatCards) ở trên đầu */}
      <Row gutter={[20, 20]}>
        {statCardsData.map((c) => (
          <Col xs={24} md={8} key={c.title}>
            <Card
              hoverable
              style={{
                borderRadius: 14,
                border: `1px solid ${c.borderColor}`,
                background: "#ffffff",
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                transition: "all 0.2s ease",
              }}
              bodyStyle={{ padding: "18px 20px" }}
            >
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    backgroundColor: c.bgColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                    flexShrink: 0,
                  }}
                >
                  {c.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <Text
                      type="secondary"
                      style={{ fontSize: 13, fontWeight: 600, color: "#64748b" }}
                    >
                      {c.title}
                    </Text>
                    <Tag
                      color={c.badgeColor}
                      style={{
                        margin: 0,
                        fontSize: 11,
                        borderRadius: 12,
                        padding: "1px 8px",
                        fontWeight: 600,
                      }}
                    >
                      {c.badgeText}
                    </Tag>
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      margin: "2px 0 4px",
                      color: "#0f172a",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {c.value}
                  </div>
                  <Text type="secondary" style={{ fontSize: 12, color: "#64748b" }}>
                    {c.desc}
                  </Text>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 4. Bộ Tabs Ant Design gồm 3 tab */}
      <Card
        style={{
          borderRadius: 16,
          border: "1px solid #e2e8f0",
          boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
        }}
        bodyStyle={{ padding: "20px" }}
      >
        <Tabs
          activeKey={activeTabKey}
          onChange={setActiveTabKey}
          type="line"
          size="large"
          items={[
            // TAB 1: QUẢN LÝ KHO HÀNG
            {
              key: "warehouses",
              label: (
                <Space size={8}>
                  <ShopOutlined />
                  <span>Quản lý Kho hàng</span>
                  <Badge count={warehouses.length} overflowCount={99} style={{ backgroundColor: "#d97706" }} />
                </Space>
              ),
              children: (
                <div>
                  {/* Toolbar */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 12,
                      marginBottom: 16,
                    }}
                  >
                    <Space wrap size={10}>
                      <Input
                        prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
                        placeholder="Tìm kiếm kho theo mã, tên hoặc địa chỉ..."
                        value={warehouseSearch}
                        onChange={(e) => setWarehouseSearch(e.target.value)}
                        allowClear
                        style={{ width: 300, borderRadius: 8, height: 38 }}
                      />
                      <Select
                        value={warehouseStatusFilter}
                        onChange={setWarehouseStatusFilter}
                        style={{ width: 180, height: 38 }}
                        options={[
                          { label: "Tất cả trạng thái", value: "ALL" },
                          { label: "Đang hoạt động", value: "ACTIVE" },
                          { label: "Tạm ngừng", value: "INACTIVE" },
                        ]}
                      />
                    </Space>

                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={handleOpenCreateWarehouse}
                      style={{
                        borderRadius: 8,
                        height: 38,
                        backgroundColor: "#2563eb",
                        fontWeight: 600,
                      }}
                    >
                      Thêm kho mới
                    </Button>
                  </div>

                  {/* Bảng Table Kho Hàng */}
                  <Table
                    columns={warehouseColumns}
                    dataSource={filteredWarehouses}
                    rowKey="id"
                    loading={loadingWarehouses}
                    pagination={{
                      pageSize: 10,
                      showTotal: (total) => `Tổng cộng ${total} kho hàng`,
                      showSizeChanger: true,
                    }}
                    bordered
                    style={{ borderRadius: 8, overflow: "hidden" }}
                  />
                </div>
              ),
            },

            // TAB 2: ĐỊA BÀN HOẠT ĐỘNG
            {
              key: "territories",
              label: (
                <Space size={8}>
                  <CompassOutlined />
                  <span>Địa bàn hoạt động</span>
                  <Badge count={territories.length} overflowCount={99} style={{ backgroundColor: "#16a34a" }} />
                </Space>
              ),
              children: (
                <div>
                  {/* Toolbar */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 12,
                      marginBottom: 16,
                    }}
                  >
                    <Input
                      prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
                      placeholder="Tìm kiếm theo mã hoặc tên địa bàn..."
                      value={territorySearch}
                      onChange={(e) => setTerritorySearch(e.target.value)}
                      allowClear
                      style={{ width: 300, borderRadius: 8, height: 38 }}
                    />

                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={handleOpenCreateTerritory}
                      style={{
                        borderRadius: 8,
                        height: 38,
                        backgroundColor: "#16a34a",
                        fontWeight: 600,
                      }}
                    >
                      Thêm địa bàn mới
                    </Button>
                  </div>

                  {/* Bảng Table Địa Bàn */}
                  <Table
                    columns={territoryColumns}
                    dataSource={filteredTerritories}
                    rowKey="id"
                    loading={loadingTerritories}
                    pagination={{
                      pageSize: 10,
                      showTotal: (total) => `Tổng cộng ${total} địa bàn hoạt động`,
                    }}
                    bordered
                    style={{ borderRadius: 8, overflow: "hidden" }}
                  />
                </div>
              ),
            },

            // TAB 3: VAI TRÒ HỆ THỐNG
            {
              key: "roles",
              label: (
                <Space size={8}>
                  <SafetyCertificateOutlined />
                  <span>Vai trò hệ thống</span>
                  <Badge count={roles.length} overflowCount={99} style={{ backgroundColor: "#2563eb" }} />
                </Space>
              ),
              children: (
                <div>
                  <div style={{ marginBottom: 16 }}>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      Danh mục 7 vai trò chuẩn định danh trong hệ thống OMS theo quy định phân quyền nghiêm ngặt.
                    </Text>
                  </div>

                  {/* Bảng Table Vai Trò */}
                  <Table
                    columns={roleColumns}
                    dataSource={roles}
                    rowKey="id"
                    pagination={false}
                    bordered
                    style={{ borderRadius: 8, overflow: "hidden" }}
                  />
                </div>
              ),
            },

            // TAB 4: NHÓM NGÀNH HÀNG & PHÂN LOẠI SẢN PHẨM
            {
              key: "categories",
              label: (
                <Space size={8}>
                  <ApartmentOutlined />
                  <span>Nhóm ngành hàng &amp; Phân loại sản phẩm</span>
                </Space>
              ),
              children: (
                <div style={{ marginTop: 8 }}>
                  <CategoryManagement />
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* --------------------------------------------------------------- */}
      {/* MODAL THÊM / CHỈNH SỬA KHO HÀNG */}
      {/* --------------------------------------------------------------- */}
      <Modal
        title={
          <Space>
            <ShopOutlined style={{ color: "#d97706", fontSize: 20 }} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              {editingWarehouse ? "Chỉnh sửa kho hàng" : "Thêm mới kho hàng vào hệ thống"}
            </span>
          </Space>
        }
        open={isWarehouseModalOpen}
        onOk={handleSaveWarehouse}
        onCancel={() => setIsWarehouseModalOpen(false)}
        confirmLoading={submittingWarehouse}
        okText={editingWarehouse ? "Cập nhật kho" : "Lưu kho mới"}
        cancelText="Hủy bỏ"
        destroyOnClose
        width={560}
      >
        <Divider style={{ margin: "12px 0 20px" }} />
        <Form form={warehouseForm} layout="vertical" requiredMark="optional">
          <Form.Item
            name="code"
            label={<span style={{ fontWeight: 600 }}>Mã kho (Warehouse Code)</span>}
            rules={[
              { required: true, message: "Vui lòng nhập mã kho!" },
              { pattern: /^[A-Za-z0-9_-]+$/, message: "Mã kho chỉ chứa chữ cái, số, gạch ngang hoặc gạch dưới!" },
            ]}
            extra="Mã định danh duy nhất (Ví dụ: WH-HN-01, WH-DN-01, WH-HCM-01)."
          >
            <Input
              placeholder="Ví dụ: WH-DN-01"
              maxLength={40}
              disabled={Boolean(editingWarehouse)}
              style={{ height: 40, borderRadius: 8, textTransform: "uppercase" }}
            />
          </Form.Item>

          <Form.Item
            name="name"
            label={<span style={{ fontWeight: 600 }}>Tên kho hàng</span>}
            rules={[{ required: true, message: "Vui lòng nhập tên kho hàng!" }]}
          >
            <Input
              placeholder="Ví dụ: Kho Tổng Đà Nẵng"
              maxLength={150}
              style={{ height: 40, borderRadius: 8 }}
            />
          </Form.Item>

          <Form.Item
            name="address"
            label={<span style={{ fontWeight: 600 }}>Địa chỉ chi tiết</span>}
          >
            <Input.TextArea
              placeholder="Ví dụ: Lô B, KCN Hòa Khánh, Phường Hòa Khánh Bắc, Quận Liên Chiểu, TP. Đà Nẵng"
              rows={3}
              maxLength={255}
              showCount
              style={{ borderRadius: 8 }}
            />
          </Form.Item>

          <Form.Item
            name="is_active"
            label={<span style={{ fontWeight: 600 }}>Trạng thái vận hành</span>}
            valuePropName="checked"
          >
            <Space orientation="horizontal" size={10}>
              <Switch checkedChildren="Hoạt động" unCheckedChildren="Tạm ngừng" />
              <Text type="secondary" style={{ fontSize: 13 }}>
                Kho ở trạng thái hoạt động sẽ sẵn sàng xuất hiện trong phân công nhân sự.
              </Text>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* --------------------------------------------------------------- */}
      {/* MODAL THÊM / CHỈNH SỬA ĐỊA BÀN */}
      {/* --------------------------------------------------------------- */}
      <Modal
        title={
          <Space>
            <CompassOutlined style={{ color: "#16a34a", fontSize: 20 }} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              {editingTerritory ? "Chỉnh sửa địa bàn" : "Thêm mới địa bàn kinh doanh"}
            </span>
          </Space>
        }
        open={isTerritoryModalOpen}
        onOk={handleSaveTerritory}
        onCancel={() => setIsTerritoryModalOpen(false)}
        confirmLoading={submittingTerritory}
        okText={editingTerritory ? "Cập nhật" : "Tạo mới"}
        cancelText="Hủy bỏ"
        destroyOnClose
        width={500}
      >
        <Divider style={{ margin: "12px 0 20px" }} />
        <Form form={territoryForm} layout="vertical" requiredMark="optional">
          <Form.Item
            name="code"
            label={<span style={{ fontWeight: 600 }}>Mã địa bàn</span>}
            rules={[
              { required: true, message: "Vui lòng nhập mã địa bàn!" },
              { pattern: /^[A-Za-z0-9_-]+$/, message: "Mã chỉ chứa chữ, số và gạch ngang!" },
            ]}
          >
            <Input
              placeholder="Ví dụ: TT-MD, TT-DNB"
              maxLength={40}
              disabled={Boolean(editingTerritory)}
              style={{ height: 40, borderRadius: 8, textTransform: "uppercase" }}
            />
          </Form.Item>

          <Form.Item
            name="name"
            label={<span style={{ fontWeight: 600 }}>Tên địa bàn / Khu vực</span>}
            rules={[{ required: true, message: "Vui lòng nhập tên địa bàn!" }]}
          >
            <Input
              placeholder="Ví dụ: Miền Tây (Cần Thơ), Đông Nam Bộ"
              maxLength={150}
              style={{ height: 40, borderRadius: 8 }}
            />
          </Form.Item>

          <Form.Item
            name="parent_id"
            label={<span style={{ fontWeight: 600 }}>Khu vực cấp cha (Trực thuộc)</span>}
          >
            <Select
              allowClear
              placeholder="Chọn khu vực cấp cha (nếu có)..."
              options={territories
                .filter((t) => !editingTerritory || t.id !== editingTerritory.id)
                .map((t) => ({
                  label: `${t.name} (${t.code})`,
                  value: t.id,
                }))}
              style={{ height: 40 }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminConfiguration;
