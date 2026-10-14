import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  Space,
  Typography,
  message,
  Tooltip,
  Popconfirm,
  Row,
  Col,
  Switch,
  Alert,
  Divider,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  TeamOutlined,
  SearchOutlined,
  ReloadOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  StopOutlined,
  FileTextOutlined,
  PhoneOutlined,
  UserOutlined,
  DollarCircleOutlined,
  EyeOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import CreditLimitModal from "../../components/CreditLimitModal";

import {
  getAgencies,
  getAgencyDetail,
  createAgency,
  updateAgency,
  updateAgencyStatus,
  deleteAgency,
  getSalesReps,
} from "../../services/agencyService";
import type {
  Agency,
  AgencyCreatePayload,
  AgencyUpdatePayload,
  SalesRepUser,
} from "../../types/agency";

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

// Danh mục Nhóm khách hàng và tên hiển thị thân thiện
const CUSTOMER_GROUP_OPTIONS = [
  { value: "DEALER_LEVEL_1", label: "Đại lý cấp 1 (Giá sỉ ưu đãi)" },
  { value: "DEALER_LEVEL_2", label: "Đại lý cấp 2 (Giá sỉ tiêu chuẩn)" },
  { value: "RETAIL", label: "Khách lẻ / Showroom" },
];

const REGION_OPTIONS = [
  "Miền Bắc",
  "Miền Trung",
  "Miền Nam",
  "Hà Nội",
  "TP.HCM",
  "Đà Nẵng",
  "Hải Phòng",
  "Cần Thơ",
];

export const AgencyManagement: React.FC = () => {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [groupFilter, setGroupFilter] = useState<string | undefined>(undefined);
  const [regionFilter, setRegionFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<boolean | undefined>(undefined);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });

  // Danh sách nhân viên kinh doanh
  const [salesReps, setSalesReps] = useState<SalesRepUser[]>([]);
  const [loadingSalesReps, setLoadingSalesReps] = useState<boolean>(false);

  // Tải danh sách nhân viên kinh doanh phụ trách
  const loadSalesReps = useCallback(async () => {
    setLoadingSalesReps(true);
    try {
      const reps = await getSalesReps();
      setSalesReps(reps);
    } catch (err: any) {
      console.error("Không thể tải danh sách nhân viên kinh doanh:", err);
    } finally {
      setLoadingSalesReps(false);
    }
  }, []);

  // Lấy tên hiển thị của nhân viên kinh doanh phụ trách
  const getRepDisplayName = useCallback(
    (agency: Agency | null | undefined): string => {
      if (!agency) return "Chưa phân công";
      const repId = agency.sales_rep_id ?? agency.salesRepId;
      if (repId) {
        const found = salesReps.find((u) => u.id === Number(repId));
        if (found) return found.full_name;
      }
      if (agency.person_in_charge) {
        const asNum = Number(agency.person_in_charge);
        if (!isNaN(asNum) && asNum > 0) {
          const found = salesReps.find((u) => u.id === asNum);
          if (found) return found.full_name;
        }
        return String(agency.person_in_charge);
      }
      return "Chưa phân công";
    },
    [salesReps],
  );

  // Modal Thêm / Sửa
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingAgency, setEditingAgency] = useState<Agency | null>(null);
  const [modalLoading, setModalLoading] = useState<boolean>(false);
  const [form] = Form.useForm();

  // Modal Chi tiết & Xem bảng giá áp dụng
  const [detailModal, setDetailModal] = useState<{
    visible: boolean;
    agency: Agency | null;
    loading: boolean;
  }>({
    visible: false,
    agency: null,
    loading: false,
  });

  // Modal Cảnh báo ràng buộc giao dịch khi xóa
  const [constraintModal, setConstraintModal] = useState<{
    visible: boolean;
    agency: Agency | null;
    errorMessage: string;
  }>({
    visible: false,
    agency: null,
    errorMessage: "",
  });

  // Modal Điều chỉnh hạn mức tín dụng & ngày nợ
  const [creditLimitModal, setCreditLimitModal] = useState<{
    visible: boolean;
    agency: Agency | null;
  }>({
    visible: false,
    agency: null,
  });

  // Tải danh sách đại lý
  const loadAgencies = useCallback(
    async (page = pagination.current, limit = pagination.pageSize) => {
      setLoading(true);
      try {
        const res = await getAgencies({
          search: searchKeyword.trim() || undefined,
          customer_group: groupFilter || undefined,
          region: regionFilter || undefined,
          is_active: statusFilter,
          page,
          limit,
        });

        if (res && res.data) {
          setAgencies(res.data);
          const total =
            res.pagination?.totalRecords ??
            res.pagination?.total_records ??
            res.data.length;
          setPagination({
            current: page,
            pageSize: limit,
            total,
          });
        }
      } catch (err: any) {
        message.error(err.message || "Không thể tải danh sách hồ sơ đại lý.");
      } finally {
        setLoading(false);
      }
    },
    [searchKeyword, groupFilter, regionFilter, statusFilter, pagination.pageSize],
  );

  useEffect(() => {
    loadAgencies(1);
    loadSalesReps();
  }, [loadAgencies, loadSalesReps]);

  // Mở modal thêm mới đại lý
  const handleOpenAddModal = () => {
    setEditingAgency(null);
    form.resetFields();
    form.setFieldsValue({
      customer_group: "DEALER_LEVEL_1",
      region: "Miền Bắc",
      person_in_charge: undefined,
      is_active: true,
    });
    setIsModalOpen(true);
  };

  // Mở modal chỉnh sửa đại lý
  const handleOpenEditModal = (agency: Agency) => {
    setEditingAgency(agency);
    form.resetFields();

    // Xác định ID hoặc giá trị người phụ trách ban đầu
    let initialRep: number | string | undefined = undefined;
    if (agency.sales_rep_id != null && Number(agency.sales_rep_id) > 0) {
      initialRep = Number(agency.sales_rep_id);
    } else if (agency.salesRepId != null && Number(agency.salesRepId) > 0) {
      initialRep = Number(agency.salesRepId);
    } else if (agency.person_in_charge != null) {
      const asNum = Number(agency.person_in_charge);
      if (!isNaN(asNum) && asNum > 0) {
        initialRep = asNum;
      } else {
        const found = salesReps.find(
          (u) =>
            u.full_name?.toLowerCase() === String(agency.person_in_charge).trim().toLowerCase() ||
            u.username?.toLowerCase() === String(agency.person_in_charge).trim().toLowerCase(),
        );
        initialRep = found ? found.id : String(agency.person_in_charge);
      }
    }

    form.setFieldsValue({
      code: agency.code,
      name: agency.name,
      tax_code: agency.tax_code ?? agency.taxCode,
      customer_group: agency.customer_group ?? agency.customerGroup ?? "DEALER_LEVEL_1",
      region: agency.region,
      person_in_charge: initialRep,
      phone: agency.phone,
      email: agency.email,
      address: agency.address,
      is_active: agency.is_active ?? agency.isActive ?? true,
    });
    setIsModalOpen(true);
  };

  // Mở modal xem chi tiết và bảng giá áp dụng
  const handleViewDetail = async (agency: Agency) => {
    setDetailModal({ visible: true, agency, loading: true });
    try {
      const fullDetail = await getAgencyDetail(agency.id);
      setDetailModal({ visible: true, agency: fullDetail, loading: false });
    } catch {
      setDetailModal({ visible: true, agency, loading: false });
    }
  };

  // Lưu form Thêm mới / Cập nhật
  const handleSubmitForm = async () => {
    try {
      const values = await form.validateFields();
      setModalLoading(true);

      // 1. Chuẩn hóa Sales Rep ID: Chỉ gửi số nguyên (integer) của User được chọn, tuyệt đối không gửi text, nếu không chọn thì gửi null
      const repValue = values.person_in_charge;
      let salesRepId: number | null = null;

      if (typeof repValue === "number" && Number.isInteger(repValue) && repValue > 0) {
        salesRepId = repValue;
      } else if (typeof repValue === "string" && repValue.trim()) {
        const asNum = Number(repValue.trim());
        if (!isNaN(asNum) && Number.isInteger(asNum) && asNum > 0) {
          salesRepId = asNum;
        } else {
          const found = salesReps.find(
            (u) =>
              u.full_name?.toLowerCase() === repValue.trim().toLowerCase() ||
              u.username?.toLowerCase() === repValue.trim().toLowerCase(),
          );
          salesRepId = found ? found.id : null;
        }
      } else {
        salesRepId = null;
      }

      // 2. Helper cắt tỉa khoảng trắng (trim), nếu rỗng trả về null
      const cleanStr = (val: any): string | null => {
        if (typeof val === "string") {
          const trimmed = val.trim();
          return trimmed.length > 0 ? trimmed : null;
        }
        return null;
      };

      const codeClean = typeof values.code === "string" ? values.code.trim().toUpperCase() : "";
      const nameClean = typeof values.name === "string" ? values.name.trim() : "";
      const taxCodeClean = cleanStr(values.tax_code);
      const customerGroupClean = cleanStr(values.customer_group) || "DEALER_LEVEL_1";
      const regionClean = cleanStr(values.region);
      const phoneClean = cleanStr(values.phone);
      const emailClean = cleanStr(values.email);
      const addressClean = cleanStr(values.address);

      if (editingAgency) {
        const payload: AgencyUpdatePayload = {
          name: nameClean,
          tax_code: taxCodeClean,
          customer_group: customerGroupClean,
          region: regionClean,
          sales_rep_id: salesRepId,
          salesRepId: salesRepId,
          assigned_sales_id: salesRepId,
          person_in_charge: salesRepId,
          phone: phoneClean,
          email: emailClean,
          address: addressClean,
          is_active: values.is_active ?? true,
        };

        await updateAgency(editingAgency.id, payload);
        message.success(`Cập nhật hồ sơ đại lý "${payload.name}" thành công!`);
      } else {
        const payload: AgencyCreatePayload = {
          code: codeClean,
          name: nameClean,
          tax_code: taxCodeClean,
          customer_group: customerGroupClean,
          region: regionClean,
          sales_rep_id: salesRepId,
          salesRepId: salesRepId,
          assigned_sales_id: salesRepId,
          person_in_charge: salesRepId,
          phone: phoneClean,
          email: emailClean,
          address: addressClean,
          is_active: values.is_active ?? true,
        };

        await createAgency(payload);
        message.success(`Khai báo mới đại lý "${payload.name}" thành công!`);
      }

      setIsModalOpen(false);
      form.resetFields();
      loadAgencies(pagination.current);
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.message || "Đã xảy ra lỗi khi lưu hồ sơ đại lý.");
    } finally {
      setModalLoading(false);
    }
  };

  // Chuyển đổi trạng thái Hoạt động / Ngừng giao dịch
  const handleToggleStatus = async (agency: Agency) => {
    const currentActive = agency.is_active ?? agency.isActive ?? true;
    const nextStatus = !currentActive;

    try {
      setLoading(true);
      await updateAgencyStatus(agency.id, nextStatus);
      message.success(
        `Đã chuyển trạng thái đại lý "${agency.name}" sang "${
          nextStatus ? "Hoạt động" : "Ngừng giao dịch"
        }".`,
      );
      loadAgencies(pagination.current);
    } catch (err: any) {
      message.error(err.message || "Không thể cập nhật trạng thái.");
    } finally {
      setLoading(false);
    }
  };

  // Xóa đại lý có kiểm soát ràng buộc giao dịch
  const handleDeleteAgency = async (agency: Agency) => {
    const txCount = agency.transactions_count ?? 0;
    if (txCount > 0) {
      setConstraintModal({
        visible: true,
        agency,
        errorMessage: `Đại lý "${agency.name}" (${agency.code}) đã phát sinh ${txCount} giao dịch/đơn hàng trong hệ thống. Theo quy định kế toán, không thể xóa đại lý đã phát sinh giao dịch. Bạn có muốn chuyển sang trạng thái "Ngừng giao dịch" không?`,
      });
      return;
    }

    try {
      setLoading(true);
      const res = await deleteAgency(agency.id);
      message.success(res.message || `Xóa đại lý "${agency.name}" thành công!`);
      loadAgencies(pagination.current);
    } catch (err: any) {
      if (err.status === 400 || err.hasTransactionsConstraint) {
        setConstraintModal({
          visible: true,
          agency,
          errorMessage: err.message,
        });
      } else {
        message.error(err.message || "Xóa đại lý thất bại.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Chuyển nhanh sang "Ngừng giao dịch" từ Modal cảnh báo ràng buộc
  const handleQuickDeactivateFromConstraint = async () => {
    if (!constraintModal.agency) return;
    try {
      setLoading(true);
      await updateAgencyStatus(constraintModal.agency.id, false);
      message.success(
        `Đã chuyển đại lý "${constraintModal.agency.name}" sang "Ngừng giao dịch". Dữ liệu chứng từ và công nợ được bảo toàn.`,
      );
      setConstraintModal({ visible: false, agency: null, errorMessage: "" });
      loadAgencies(pagination.current);
    } catch (err: any) {
      message.error(err.message || "Không thể cập nhật trạng thái.");
    } finally {
      setLoading(false);
    }
  };

  // Thống kê nhanh danh mục đại lý
  const stats = useMemo(() => {
    const total = pagination.total;
    const active = agencies.filter((a) => a.is_active ?? a.isActive).length;
    const inactive = agencies.filter((a) => !(a.is_active ?? a.isActive)).length;
    const withTx = agencies.filter((a) => (a.transactions_count ?? 0) > 0).length;
    return { total, active, inactive, withTx };
  }, [pagination.total, agencies]);

  // Cấu hình các cột bảng danh sách đại lý
  const columns: ColumnsType<Agency> = [
    {
      title: "Mã đại lý",
      dataIndex: "code",
      key: "code",
      width: 130,
      render: (code: string) => (
        <Tag
          color="blue"
          style={{
            fontWeight: 700,
            fontSize: 13,
            padding: "2px 8px",
            letterSpacing: "0.5px",
          }}
        >
          {code}
        </Tag>
      ),
    },
    {
      title: "Tên đại lý & MST",
      dataIndex: "name",
      key: "name",
      render: (name: string, record: Agency) => {
        const tax = record.tax_code ?? record.taxCode;
        return (
          <div>
            <Text strong style={{ fontSize: 14, color: "#1e293b" }}>
              {name}
            </Text>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              {tax ? (
                <span>
                  MST:{" "}
                  <Text code style={{ fontSize: 11, color: "#0f766e" }}>
                    {tax}
                  </Text>
                </span>
              ) : (
                <Text type="secondary" italic>
                  Chưa có MST
                </Text>
              )}
              {record.address && (
                <span style={{ marginLeft: 8 }}>📍 {record.address}</span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      title: "Nhóm khách hàng",
      key: "customer_group",
      width: 170,
      render: (_: any, record: Agency) => {
        const group = record.customer_group ?? record.customerGroup ?? "RETAIL";
        let color = "geekblue";
        let label = "Đại lý cấp 1";

        if (group === "DEALER_LEVEL_2") {
          color = "cyan";
          label = "Đại lý cấp 2";
        } else if (group === "RETAIL") {
          color = "orange";
          label = "Khách lẻ / Showroom";
        }

        return (
          <Tooltip title="Nhóm khách hàng quyết định bảng giá được áp dụng">
            <Tag color={color} style={{ fontWeight: 600, padding: "2px 8px" }}>
              {label}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: "Khu vực",
      key: "region",
      width: 130,
      render: (_: any, record: Agency) =>
        record.region ? (
          <Tag color="purple" style={{ borderRadius: 4 }}>
            {record.region}
          </Tag>
        ) : (
          <Text type="secondary" italic style={{ fontSize: 12 }}>
            Chưa gán
          </Text>
        ),
    },
    {
      title: "Người phụ trách",
      key: "person_in_charge",
      width: 180,
      render: (_: any, record: Agency) => {
        const person = getRepDisplayName(record);
        const isAssigned = person !== "Chưa phân công";
        return (
          <div>
            <div style={{ fontWeight: 500, color: "#334155" }}>
              {isAssigned ? (
                <span>
                  <UserOutlined style={{ marginRight: 4, color: "#64748b" }} />
                  {person}
                </span>
              ) : (
                <Text type="secondary" italic>
                  Chưa phân công
                </Text>
              )}
            </div>
            {record.phone && (
              <div style={{ fontSize: 12, color: "#2563eb", marginTop: 2 }}>
                <PhoneOutlined style={{ marginRight: 4 }} />
                {record.phone}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: "Số giao dịch",
      key: "transactions_count",
      width: 120,
      align: "center",
      render: (_: any, record: Agency) => {
        const count = record.transactions_count ?? 0;
        return count > 0 ? (
          <Tooltip title={`Đại lý đã phát sinh ${count} giao dịch/đơn hàng`}>
            <Tag
              icon={<FileTextOutlined />}
              color="geekblue"
              style={{ fontWeight: 600, padding: "2px 8px" }}
            >
              {count} đơn
            </Tag>
          </Tooltip>
        ) : (
          <Tag color="default" style={{ color: "#94a3b8" }}>
            0 đơn
          </Tag>
        );
      },
    },
    {
      title: "Trạng thái",
      key: "is_active",
      width: 140,
      align: "center",
      render: (_: any, record: Agency) => {
        const active = record.is_active ?? record.isActive ?? true;
        return active ? (
          <Tag
            color="success"
            icon={<CheckCircleOutlined />}
            style={{ fontWeight: 500 }}
          >
            Hoạt động
          </Tag>
        ) : (
          <Tag
            color="default"
            icon={<StopOutlined />}
            style={{ fontWeight: 500, color: "#64748b" }}
          >
            Ngừng giao dịch
          </Tag>
        );
      },
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 180,
      align: "center",
      render: (_: any, record: Agency) => {
        const active = record.is_active ?? record.isActive ?? true;
        const count = record.transactions_count ?? 0;

        return (
          <Space size="small">
            <Tooltip title="Xem chi tiết & bảng giá">
              <Button
                type="text"
                icon={<EyeOutlined style={{ color: "#0284c7" }} />}
                onClick={() => handleViewDetail(record)}
              />
            </Tooltip>

            <Tooltip title="Chỉnh sửa hồ sơ đại lý">
              <Button
                type="text"
                icon={<EditOutlined style={{ color: "#2563eb" }} />}
                onClick={() => handleOpenEditModal(record)}
              />
            </Tooltip>

            <Tooltip title="Điều chỉnh hạn mức tín dụng & ngày nợ">
              <Button
                type="text"
                icon={<SafetyCertificateOutlined style={{ color: "#059669" }} />}
                onClick={() => setCreditLimitModal({ visible: true, agency: record })}
              />
            </Tooltip>

            <Tooltip
              title={
                active
                  ? "Chuyển sang Ngừng giao dịch"
                  : "Kích hoạt lại giao dịch"
              }
            >
              <Popconfirm
                title={
                  active
                    ? `Ngừng giao dịch với đại lý "${record.name}"?`
                    : `Kích hoạt lại đại lý "${record.name}"?`
                }
                description={
                  active
                    ? "Đại lý sẽ tạm ngưng đặt hàng mới nhưng lịch sử giao dịch được bảo toàn."
                    : "Đại lý sẽ có thể tiếp tục đặt hàng và áp dụng bảng giá tương ứng."
                }
                okText="Đồng ý"
                cancelText="Hủy"
                onConfirm={() => handleToggleStatus(record)}
              >
                <Button
                  type="text"
                  icon={
                    active ? (
                      <StopOutlined style={{ color: "#ea580c" }} />
                    ) : (
                      <CheckCircleOutlined style={{ color: "#16a34a" }} />
                    )
                  }
                />
              </Popconfirm>
            </Tooltip>

            {count > 0 ? (
              <Tooltip title={`Đã có ${count} giao dịch (Không thể xóa - Bấm để xem cảnh báo)`}>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleDeleteAgency(record)}
                />
              </Tooltip>
            ) : (
              <Tooltip title="Xóa đại lý">
                <Popconfirm
                  title={`Xóa đại lý "${record.code}"?`}
                  description="Đại lý chưa có giao dịch nào phát sinh. Thao tác này sẽ xóa hồ sơ khỏi hệ thống."
                  okText="Xóa"
                  cancelText="Hủy"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleDeleteAgency(record)}
                >
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1. Header phong cách phẳng (Flat design) đồng bộ toàn hệ thống */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          padding: "20px 24px",
          background: "#ffffff",
          borderRadius: 12,
          border: "1px solid #e2e8f0",
        }}
      >
        <div>
          <Title
            level={3}
            style={{
              margin: 0,
              color: "#0f172a",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <TeamOutlined style={{ color: "#2563eb" }} />
            Quản lý hồ sơ Đại lý
          </Title>
          <Text
            type="secondary"
            style={{ fontSize: 13, marginTop: 4, display: "block" }}
          >
            Chuẩn hóa danh mục khách hàng, theo dõi người phụ trách, nhóm khách hàng áp dụng bảng giá và kiểm soát giao dịch.
          </Text>
        </div>

        <Space size="middle">
          <Button
            icon={<ReloadOutlined />}
            onClick={() => loadAgencies(pagination.current)}
            loading={loading}
          >
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{
              backgroundColor: "#2563eb",
              borderRadius: 6,
              fontWeight: 500,
            }}
            onClick={handleOpenAddModal}
          >
            Thêm đại lý
          </Button>
        </Space>
      </div>

      {/* 2. Thống kê nhanh */}
      <Row gutter={16}>
        <Col xs={24} sm={6}>
          <Card bordered={false} style={{ borderRadius: 10, border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  backgroundColor: "#e0f2fe",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#0284c7",
                }}
              >
                <TeamOutlined style={{ fontSize: 20 }} />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Tổng số đại lý
                </Text>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a" }}>
                  {stats.total}
                </div>
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={6}>
          <Card bordered={false} style={{ borderRadius: 10, border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  backgroundColor: "#dcfce7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#16a34a",
                }}
              >
                <CheckCircleOutlined style={{ fontSize: 20 }} />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Đang hoạt động
                </Text>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#16a34a" }}>
                  {stats.active}
                </div>
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={6}>
          <Card bordered={false} style={{ borderRadius: 10, border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  backgroundColor: "#fee2e2",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#dc2626",
                }}
              >
                <StopOutlined style={{ fontSize: 20 }} />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Ngừng giao dịch
                </Text>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#dc2626" }}>
                  {stats.inactive}
                </div>
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={6}>
          <Card bordered={false} style={{ borderRadius: 10, border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  backgroundColor: "#fef3c7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#d97706",
                }}
              >
                <FileTextOutlined style={{ fontSize: 20 }} />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Đã phát sinh giao dịch
                </Text>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#d97706" }}>
                  {stats.withTx}
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 3. Khối tìm kiếm & Bộ lọc */}
      <Card
        bordered={false}
        style={{
          borderRadius: 12,
          border: "1px solid #e2e8f0",
        }}
        bodyStyle={{ padding: 16 }}
      >
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={8}>
            <Input
              placeholder="Tìm theo Mã đại lý, Tên đại lý, Mã số thuế..."
              prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onPressEnter={() => loadAgencies(1)}
              allowClear
            />
          </Col>
          <Col xs={24} sm={8} md={5}>
            <Select
              style={{ width: "100%" }}
              placeholder="Nhóm khách hàng"
              value={groupFilter}
              onChange={(val) => setGroupFilter(val)}
              allowClear
            >
              {CUSTOMER_GROUP_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={8} md={5}>
            <Select
              style={{ width: "100%" }}
              placeholder="Khu vực"
              value={regionFilter}
              onChange={(val) => setRegionFilter(val)}
              allowClear
            >
              {REGION_OPTIONS.map((reg) => (
                <Option key={reg} value={reg}>
                  {reg}
                </Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Select
              style={{ width: "100%" }}
              placeholder="Trạng thái giao dịch"
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              allowClear
            >
              <Option value={undefined as any}>Tất cả trạng thái</Option>
              <Option value={true}>Đang hoạt động</Option>
              <Option value={false}>Ngừng giao dịch</Option>
            </Select>
          </Col>
        </Row>
      </Card>

      {/* 4. Bảng danh sách đại lý */}
      <Card
        bordered={false}
        style={{
          borderRadius: 12,
          border: "1px solid #e2e8f0",
          overflow: "hidden",
        }}
        bodyStyle={{ padding: 0 }}
      >
        <Table
          columns={columns}
          dataSource={agencies}
          rowKey="id"
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50"],
            showTotal: (total, range) =>
              `Hiển thị ${range[0]}-${range[1]} / ${total} đại lý`,
            onChange: (page, pageSize) => loadAgencies(page, pageSize),
          }}
          scroll={{ x: 1000 }}
        />
      </Card>

      {/* ========================================================================= */}
      {/* 5. MODAL THÊM MỚI / CHỈNH SỬA HỒ SƠ ĐẠI LÝ */}
      {/* ========================================================================= */}
      <Modal
        title={
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {editingAgency
              ? `Chỉnh sửa hồ sơ đại lý: ${editingAgency.code}`
              : "Khai báo thêm mới hồ sơ đại lý"}
          </div>
        }
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={handleSubmitForm}
        confirmLoading={modalLoading}
        okText={editingAgency ? "Lưu thay đổi" : "Tạo đại lý"}
        cancelText="Hủy bỏ"
        width={680}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={10}>
              <Form.Item
                name="code"
                label="Mã đại lý"
                rules={[
                  { required: true, message: "Vui lòng nhập mã đại lý!" },
                  { max: 50, message: "Tối đa 50 ký tự" },
                  {
                    pattern: /^[A-Za-z0-9_-]+$/,
                    message: "Mã chỉ chứa chữ, số, gạch ngang",
                  },
                ]}
                tooltip="Mã định danh duy nhất (ví dụ: DL-HN-001). Không thể đổi sau khi tạo."
              >
                <Input
                  placeholder="VD: DL-HN-001"
                  style={{ textTransform: "uppercase" }}
                  disabled={!!editingAgency}
                />
              </Form.Item>
            </Col>

            <Col span={14}>
              <Form.Item
                name="name"
                label="Tên đại lý"
                rules={[
                  { required: true, message: "Vui lòng nhập tên đại lý!" },
                  { max: 150, message: "Tối đa 150 ký tự" },
                ]}
              >
                <Input placeholder="VD: Đại lý Bách Hóa Cầu Giấy" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="customer_group"
                label="Nhóm khách hàng (Quyết định bảng giá)"
                rules={[{ required: true, message: "Vui lòng chọn nhóm khách hàng!" }]}
                tooltip="Hệ thống sẽ tự động áp dụng bảng giá bán buôn tương ứng theo nhóm khách hàng này."
              >
                <Select placeholder="Chọn nhóm khách hàng">
                  {CUSTOMER_GROUP_OPTIONS.map((opt) => (
                    <Option key={opt.value} value={opt.value}>
                      {opt.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="tax_code"
                label="Mã số thuế"
                rules={[{ max: 50, message: "Tối đa 50 ký tự" }]}
              >
                <Input placeholder="VD: 0101234567" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="region" label="Khu vực phụ trách">
                <Select
                  placeholder="Chọn khu vực"
                  allowClear
                  showSearch
                >
                  {REGION_OPTIONS.map((reg) => (
                    <Option key={reg} value={reg}>
                      {reg}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="person_in_charge"
                label="Người phụ trách / NVKD"
                tooltip="Nhân viên kinh doanh quản lý tuyến đại lý này"
              >
                <Select
                  showSearch
                  placeholder="Chọn nhân viên kinh doanh phụ trách"
                  allowClear
                  loading={loadingSalesReps}
                  optionFilterProp="filterLabel"
                  filterOption={(input, option) => {
                    const label = String(option?.filterLabel || option?.children || "");
                    return label.toLowerCase().includes(input.toLowerCase().trim());
                  }}
                >
                  {salesReps.map((u) => (
                    <Option
                      key={u.id}
                      value={u.id}
                      filterLabel={`${u.full_name} ${u.username} ${u.email || ""}`}
                    >
                      {`${u.full_name} (${u.username || u.email})`}
                    </Option>
                  ))}
                  {editingAgency &&
                    form.getFieldValue("person_in_charge") &&
                    !salesReps.some(
                      (u) =>
                        u.id === form.getFieldValue("person_in_charge") ||
                        u.full_name === form.getFieldValue("person_in_charge"),
                    ) && (
                      <Option
                        key={`legacy_${form.getFieldValue("person_in_charge")}`}
                        value={form.getFieldValue("person_in_charge")}
                        filterLabel={String(form.getFieldValue("person_in_charge"))}
                      >
                        {String(form.getFieldValue("person_in_charge"))}
                      </Option>
                    )}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="phone"
                label="Số điện thoại"
                rules={[{ max: 25, message: "Tối đa 25 ký tự" }]}
              >
                <Input placeholder="VD: 0901234567" />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="email"
                label="Email liên hệ"
                rules={[{ type: "email", message: "Email không đúng định dạng!" }]}
              >
                <Input placeholder="VD: daily@example.com" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="address" label="Địa chỉ kinh doanh / điểm giao">
            <TextArea
              rows={2}
              placeholder="VD: Số 123 Cầu Giấy, P. Quan Hoa, Cầu Giấy, Hà Nội"
            />
          </Form.Item>

          <Form.Item
            name="is_active"
            label="Trạng thái hoạt động"
            valuePropName="checked"
          >
            <Space align="center">
              <Switch checkedChildren="Hoạt động" unCheckedChildren="Ngừng giao dịch" />
              <Text type="secondary" style={{ fontSize: 13 }}>
                Gạt tắt để chuyển sang "Ngừng giao dịch" khi muốn tạm dừng hợp tác.
              </Text>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* ========================================================================= */}
      {/* 6. MODAL XEM CHI TIẾT ĐẠI LÝ & BẢNG GIÁ ÁP DỤNG */}
      {/* ========================================================================= */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16 }}>
            <EyeOutlined style={{ color: "#2563eb" }} />
            <span>Chi tiết hồ sơ đại lý: {detailModal.agency?.code}</span>
          </div>
        }
        open={detailModal.visible}
        onCancel={() => setDetailModal({ visible: false, agency: null, loading: false })}
        footer={[
          <Button
            key="close"
            type="primary"
            onClick={() => setDetailModal({ visible: false, agency: null, loading: false })}
          >
            Đóng
          </Button>,
        ]}
        width={720}
      >
        {detailModal.agency && (
          <div style={{ marginTop: 12 }}>
            <Row gutter={[16, 12]}>
              <Col span={12}>
                <Text type="secondary">Tên đại lý: </Text>
                <Text strong>{detailModal.agency.name}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary">Mã số thuế: </Text>
                <Text code>{detailModal.agency.tax_code || "Chưa có"}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary">Nhóm khách hàng: </Text>
                <Tag color="geekblue">{detailModal.agency.customer_group}</Tag>
              </Col>
              <Col span={12}>
                <Text type="secondary">Khu vực: </Text>
                <Tag color="purple">{detailModal.agency.region || "Chưa gán"}</Tag>
              </Col>
              <Col span={12}>
                <Text type="secondary">Người phụ trách: </Text>
                <Text strong>{getRepDisplayName(detailModal.agency)}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary">Số giao dịch đã phát sinh: </Text>
                <Tag color="cyan">{detailModal.agency.transactions_count || 0} đơn</Tag>
              </Col>
              <Col span={24}>
                <Text type="secondary">Địa chỉ: </Text>
                <Text>{detailModal.agency.address || "Chưa có"}</Text>
              </Col>
            </Row>

            <Divider titlePlacement="start" style={{ margin: "16px 0 12px" }}>
              <span style={{ fontSize: 13, color: "#1e3a8a", display: "flex", alignItems: "center", gap: 6 }}>
                <DollarCircleOutlined /> Bảng giá hiện hành áp dụng theo nhóm khách hàng
              </span>
            </Divider>

            {detailModal.agency.price_list ? (
              <div style={{ background: "#f8fafc", padding: 14, borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text strong>Mã bảng giá: {detailModal.agency.price_list.code} (v{detailModal.agency.price_list.version})</Text>
                  <Tag color="success">Đang hiệu lực</Tag>
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                  Hiệu lực từ: {detailModal.agency.price_list.start_date || "N/A"} đến {detailModal.agency.price_list.end_date || "N/A"}
                </div>
                {detailModal.agency.price_list.items && detailModal.agency.price_list.items.length > 0 ? (
                  <Table
                    size="small"
                    dataSource={detailModal.agency.price_list.items}
                    rowKey="sku"
                    pagination={false}
                    columns={[
                      { title: "Mã SKU", dataIndex: "sku", key: "sku" },
                      {
                        title: "Giá bán sỉ (VNĐ)",
                        dataIndex: "sale_price",
                        key: "sale_price",
                        align: "right",
                        render: (val: number) => val?.toLocaleString("vi-VN") + " đ",
                      },
                      {
                        title: "Giá sàn tối thiểu",
                        dataIndex: "floor_price",
                        key: "floor_price",
                        align: "right",
                        render: (val: number) => val?.toLocaleString("vi-VN") + " đ",
                      },
                    ]}
                  />
                ) : (
                  <Text type="secondary">Bảng giá chưa có dòng sản phẩm nào.</Text>
                )}
              </div>
            ) : (
              <Alert
                type="info"
                showIcon
                message="Chưa có bảng giá được kích hoạt cho nhóm khách hàng này"
                description="Hệ thống sẽ áp dụng đơn giá cơ sở hoặc nhân viên kinh doanh cần cấu hình bảng giá trong phân hệ Quản lý giá."
              />
            )}
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* 7. MODAL CẢNH BÁO RÀNG BUỘC GIAO DỊCH KHI XÓA */}
      {/* ========================================================================= */}
      <Modal
        open={constraintModal.visible}
        onCancel={() =>
          setConstraintModal({ visible: false, agency: null, errorMessage: "" })
        }
        footer={[
          <Button
            key="cancel"
            onClick={() =>
              setConstraintModal({ visible: false, agency: null, errorMessage: "" })
            }
          >
            Đóng
          </Button>,
          <Button
            key="deactivate"
            type="primary"
            danger
            icon={<StopOutlined />}
            loading={loading}
            onClick={handleQuickDeactivateFromConstraint}
          >
            Chuyển sang "Ngừng giao dịch"
          </Button>,
        ]}
        width={580}
      >
        <div style={{ textAlign: "center", padding: "16px 0 8px" }}>
          <ExclamationCircleOutlined
            style={{ fontSize: 48, color: "#faad14", marginBottom: 12 }}
          />
          <Title level={4} style={{ color: "#0f172a", margin: 0 }}>
            Đại lý đã phát sinh giao dịch trong hệ thống
          </Title>
        </div>

        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16, borderRadius: 8 }}
          message={<span style={{ fontWeight: 600 }}>Ràng buộc nghiệp vụ kế toán:</span>}
          description={
            <Paragraph style={{ margin: 0, marginTop: 4, fontSize: 13 }}>
              {constraintModal.errorMessage ||
                "Đại lý đã phát sinh giao dịch thì không xoá được, chỉ ngừng giao dịch. Bạn có muốn chuyển sang trạng thái Ngừng giao dịch không?"}
            </Paragraph>
          }
        />

        <div
          style={{
            marginTop: 16,
            padding: 14,
            backgroundColor: "#f8fafc",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
          }}
        >
          <Text strong style={{ color: "#334155" }}>
            Tác động khi chuyển sang "Ngừng giao dịch":
          </Text>
          <ul
            style={{
              paddingLeft: 20,
              margin: "6px 0 0",
              color: "#64748b",
              fontSize: 13,
            }}
          >
            <li>
              Đại lý sẽ bị tạm khóa đặt hàng mới trên toàn bộ hệ thống bán hàng.
            </li>
            <li>
              Tất cả dữ liệu đơn hàng cũ, hóa đơn, chứng từ thanh toán và sổ sách kế toán đối soát được bảo toàn nguyên vẹn.
            </li>
          </ul>
        </div>
      </Modal>

      <CreditLimitModal
        visible={creditLimitModal.visible}
        customer={creditLimitModal.agency as any}
        onClose={() => setCreditLimitModal({ visible: false, agency: null })}
        onSuccess={() => loadAgencies(pagination.current)}
      />
    </div>
  );
};

export default AgencyManagement;
