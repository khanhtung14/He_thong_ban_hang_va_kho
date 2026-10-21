import {
  Card,
  Table,
  Tag,
  Typography,
  Form,
  Select,
  Input,
  InputNumber,
  Button,
  Row,
  Col,
  Alert,
  Space,
} from "antd";
import { SearchOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { glassCardStyle, formatMoney } from "./workspaceTypes";

const { Title, Text } = Typography;

const demoUsers = [
  {
    id: 1,
    name: "Nguyễn Văn A",
    username: "nva",
    role: "Nhân viên kinh doanh",
    status: "Hoạt động",
    area: "Hà Nội",
  },
  {
    id: 2,
    name: "Trần Thị B",
    username: "ttb",
    role: "Thủ kho",
    status: "Hoạt động",
    area: "Kho Hà Nội",
  },
  {
    id: 3,
    name: "Lê Văn C",
    username: "lvc",
    role: "Đại lý",
    status: "Khóa",
    area: "Hải Phòng",
  },
];

const demoInventory = [
  {
    sku: "SP-001",
    name: "Nước ép cam 1L",
    category: "Nước giải khát",
    stock: 1500,
    status: "Tốt",
  },
  {
    sku: "SP-002",
    name: "Bánh quy bơ 300g",
    category: "Bánh kẹo",
    stock: 240,
    status: "Sắp hết",
  },
  {
    sku: "SP-003",
    name: "Sữa tươi tiệt trùng",
    category: "Sữa",
    stock: 8500,
    status: "Tốt",
  },
];

const demoOrders = [
  {
    id: "DH-240815",
    customer: "Tạp hóa Minh Anh",
    date: "15/08/2026",
    total: 12400000,
    status: "Chờ duyệt",
    tone: "orange",
  },
  {
    id: "DH-240812",
    customer: "Đại lý Hoàng Long",
    date: "12/08/2026",
    total: 8600000,
    status: "Đang soạn",
    tone: "blue",
  },
  {
    id: "DH-240809",
    customer: "Cửa hàng Hồng Phúc",
    date: "09/08/2026",
    total: 15800000,
    status: "Đang giao",
    tone: "purple",
  },
];

const demoDebts = [
  {
    id: "HD-2026-101",
    date: "01/08/2026",
    total: 15000000,
    paid: 5000000,
    due: 10000000,
    status: "Chưa thanh toán",
  },
  {
    id: "HD-2026-089",
    date: "15/07/2026",
    total: 20000000,
    paid: 20000000,
    due: 0,
    status: "Đã thanh toán",
  },
];

export function renderAdminViews(view: string) {
  if (view === "users") {
    return (
      <Card
        title="Quản lý Người Dùng"
        style={glassCardStyle}
        bordered={false}
        extra={<Button type="primary">Tạo tài khoản</Button>}
      >
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Input
              placeholder="Tìm kiếm tài khoản..."
              prefix={<SearchOutlined />}
              style={{ width: 250 }}
            />
            <Select
              defaultValue="ALL"
              style={{ width: 150 }}
              options={[
                { value: "ALL", label: "Mọi vai trò" },
                { value: "SALES", label: "Kinh doanh" },
                { value: "WH", label: "Kho" },
              ]}
            />
          </Space>
        </div>
        <Table
          dataSource={demoUsers}
          rowKey="id"
          pagination={false}
          columns={[
            { title: "ID", dataIndex: "id" },
            {
              title: "Họ và tên",
              dataIndex: "name",
              render: (t, r) => (
                <div>
                  <strong>{t}</strong>
                  <br />
                  <small style={{ color: "#64748b" }}>{r.username}</small>
                </div>
              ),
            },
            { title: "Vai trò", dataIndex: "role" },
            { title: "Khu vực", dataIndex: "area" },
            {
              title: "Trạng thái",
              dataIndex: "status",
              render: (s) => (
                <Tag color={s === "Hoạt động" ? "green" : "red"}>{s}</Tag>
              ),
            },
            { title: "Thao tác", render: () => <a>Sửa</a> },
          ]}
          style={{ background: "transparent" }}
        />
      </Card>
    );
  }
  if (view === "rbac") {
    return (
      <Card title="Ma trận phân quyền" style={glassCardStyle} bordered={false}>
        <Alert
          message="Chức năng phân quyền động đang được xây dựng"
          type="info"
          showIcon
        />
      </Card>
    );
  }
  return null;
}

export function renderCustomerViews(view: string) {
  if (view === "orders") {
    return (
      <Card title="Lịch sử đơn hàng" style={glassCardStyle} bordered={false}>
        <Table
          dataSource={demoOrders}
          rowKey="id"
          pagination={false}
          columns={[
            { title: "Mã đơn", dataIndex: "id", render: (t) => <a>{t}</a> },
            { title: "Ngày đặt", dataIndex: "date" },
            {
              title: "Tổng tiền",
              dataIndex: "total",
              render: (v) => formatMoney(v),
            },
            {
              title: "Trạng thái",
              dataIndex: "status",
              render: (text, r) => <Tag color={r.tone}>{text}</Tag>,
            },
          ]}
        />
      </Card>
    );
  }
  if (view === "debt") {
    return (
      <Card title="Công nợ & Hóa đơn" style={glassCardStyle} bordered={false}>
        <Table
          dataSource={demoDebts}
          rowKey="id"
          pagination={false}
          columns={[
            { title: "Mã Hóa Đơn", dataIndex: "id", render: (t) => <a>{t}</a> },
            { title: "Ngày phát hành", dataIndex: "date" },
            {
              title: "Tổng tiền",
              dataIndex: "total",
              render: (v) => formatMoney(v),
            },
            {
              title: "Đã thanh toán",
              dataIndex: "paid",
              render: (v) => formatMoney(v),
            },
            {
              title: "Còn nợ",
              dataIndex: "due",
              render: (v) => (
                <span
                  style={{
                    color: v > 0 ? "#ef4444" : "#22c55e",
                    fontWeight: "bold",
                  }}
                >
                  {formatMoney(v)}
                </span>
              ),
            },
            {
              title: "Trạng thái",
              dataIndex: "status",
              render: (s) => (
                <Tag color={s === "Đã thanh toán" ? "green" : "orange"}>
                  {s}
                </Tag>
              ),
            },
          ]}
        />
      </Card>
    );
  }
  return null;
}

export function renderSalesViews(view: string) {
  if (view === "new-order") {
    return (
      <Card
        title="Tạo Đơn Hàng Mới"
        style={{ ...glassCardStyle, maxWidth: 600 }}
        bordered={false}
      >
        <Form layout="vertical">
          <Form.Item label="Chọn Đại lý">
            <Select
              defaultValue="DL-HN-0148"
              options={[
                { value: "DL-HN-0148", label: "Tạp hóa Minh Anh" },
                { value: "DL-HN-0120", label: "Đại lý Hoàng Long" },
              ]}
            />
          </Form.Item>
          <Form.Item label="Sản phẩm">
            <Select
              options={[
                { value: "SP-001", label: "Nước ép cam 1L - 25.000 ₫" },
                { value: "SP-002", label: "Bánh quy bơ 300g - 45.000 ₫" },
              ]}
            />
          </Form.Item>
          <Form.Item label="Số lượng">
            <InputNumber min={1} defaultValue={1} style={{ width: "100%" }} />
          </Form.Item>
          <Button type="primary" icon={<ShoppingCartOutlined />}>
            Thêm vào giỏ hàng
          </Button>
        </Form>
      </Card>
    );
  }
  if (view === "orders" || view === "customers") {
    return renderCustomerViews("orders");
  }
  return null;
}

export function renderWarehouseViews(view: string) {
  if (view === "inventory") {
    return (
      <Card title="Quản lý Tồn Kho" style={glassCardStyle} bordered={false}>
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder="Tìm kiếm SKU hoặc tên sản phẩm..."
            prefix={<SearchOutlined />}
            style={{ width: 300 }}
          />
        </div>
        <Table
          dataSource={demoInventory}
          rowKey="sku"
          pagination={false}
          columns={[
            {
              title: "Mã SKU",
              dataIndex: "sku",
              render: (t) => <strong>{t}</strong>,
            },
            { title: "Tên sản phẩm", dataIndex: "name" },
            { title: "Danh mục", dataIndex: "category" },
            { title: "Tồn khả dụng", dataIndex: "stock" },
            {
              title: "Trạng thái",
              dataIndex: "status",
              render: (s) => (
                <Tag color={s === "Tốt" ? "green" : "orange"}>{s}</Tag>
              ),
            },
          ]}
        />
      </Card>
    );
  }
  if (view === "picking") {
    return (
      <Row gutter={[16, 16]}>
        {[1, 2, 3].map((i) => (
          <Col xs={24} md={8} key={i}>
            <Card
              style={glassCardStyle}
              bordered={false}
              actions={[<Button type="link">Soạn ngay</Button>]}
            >
              <Title level={5}>Phiếu soạn SO-00{i}</Title>
              <Text type="secondary">Đại lý: Tạp hóa Minh Anh</Text>
              <br />
              <Text>Số lượng dòng: 12</Text>
              <br />
              <Tag color="blue" style={{ marginTop: 8 }}>
                Chờ xử lý
              </Tag>
            </Card>
          </Col>
        ))}
      </Row>
    );
  }
  return null;
}

export function renderAccountantViews(view: string) {
  if (view === "debts") {
    return renderCustomerViews("debt");
  }
  if (view === "invoices") {
    return (
      <Card
        title="Quản lý Hóa Đơn & Thu Chi"
        style={glassCardStyle}
        bordered={false}
      >
        <Alert message="Chức năng đang được tích hợp ERP" type="info" />
      </Card>
    );
  }
  return null;
}

export function renderSalesManagerViews(view: string) {
  if (view === "reports") {
    return (
      <Card title="Báo cáo Doanh Thu" style={glassCardStyle} bordered={false}>
        <Alert message="Biểu đồ doanh thu đang được cập nhật..." type="info" />
      </Card>
    );
  }
  if (view === "approvals") {
    return (
      <Card
        title="Duyệt đơn vượt hạn mức"
        style={glassCardStyle}
        bordered={false}
      >
        <Table
          dataSource={[]}
          locale={{ emptyText: "Không có đơn nào chờ duyệt" }}
        />
      </Card>
    );
  }
  return renderSalesViews(view);
}

export function renderWarehouseManagerViews(view: string) {
  if (view === "transfers") {
    return (
      <Card
        title="Lệnh Chuyển Kho"
        style={glassCardStyle}
        bordered={false}
        extra={<Button type="primary">Tạo lệnh mới</Button>}
      >
        <Table
          dataSource={[]}
          locale={{ emptyText: "Chưa có dữ liệu chuyển kho" }}
        />
      </Card>
    );
  }
  return renderWarehouseViews(view);
}
