import React, { useEffect, useState } from "react";
import {
    Row,
    Col,
    Card,
    Tree,
    Table,
    Button,
    Modal,
    Form,
    Input,
    TreeSelect,
    Tag,
    Space,
    Popconfirm,
    message,
    Typography,
} from "antd";
import {
    PlusOutlined,
    DeleteOutlined,
    EditOutlined,
    SwapOutlined,
    FolderOutlined,
    ReloadOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { authenticatedFetch } from "../../services/sessionService";

const { Title, Text } = Typography;

interface CategoryNode {
    id: number;
    name: string;
    code?: string;
    parent_id?: number | null;
    children?: CategoryNode[];
}

interface ProductItem {
    id: number;
    sku: string;
    name: string;
    categoryId?: number;
    category_name?: string;
    baseUnit?: string;
    status: string;
}

export const CategoryManagement: React.FC = () => {
    const [treeData, setTreeData] = useState<CategoryNode[]>([]);
    const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
    const [products, setProducts] = useState<ProductItem[]>([]);
    const [loadingTree, setLoadingTree] = useState(false);
    const [loadingProducts, setLoadingProducts] = useState(false);

    // Modal tạo/sửa nhóm
    const [isCatModalOpen, setIsCatModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<CategoryNode | null>(null);
    const [catForm] = Form.useForm();

    // Modal chuyển nhóm sản phẩm
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
    const [targetCatId, setTargetCatId] = useState<number | null>(null);

    // 1. Tải cây danh mục
    const fetchCategoryTree = async () => {
        setLoadingTree(true);
        try {
            const res = await authenticatedFetch("/api/v1/categories/tree");
            if (res.ok) {
                const data = await res.json();
                setTreeData(data || []);
            }
        } catch {
            message.error("Không tải được danh mục cây.");
        } finally {
            setLoadingTree(false);
        }
    };

    // 2. Tải danh sách sản phẩm (có lọc theo categoryId nếu được chọn)
    const fetchProducts = async (catId?: number | null) => {
        setLoadingProducts(true);
        try {
            const url = catId
                ? `/api/v1/products?categoryId=${catId}`
                : "/api/v1/products";
            const res = await authenticatedFetch(url);
            if (res.ok) {
                const result = await res.json();
                // Xử lý linh hoạt format trả về (nếu bọc trong data hoặc mảng trực tiếp)
                setProducts(result.data || result.items || result || []);
            }
        } catch {
            message.error("Không tải được danh sách sản phẩm.");
        } finally {
            setLoadingProducts(false);
        }
    };

    useEffect(() => {
        fetchCategoryTree();
        fetchProducts();
    }, []);

    // Format node cho Tree / TreeSelect
    const formatTreeData = (nodes: CategoryNode[]): any[] =>
        nodes.map((n) => ({
            title: n.name,
            value: n.id,
            key: String(n.id),
            children: n.children ? formatTreeData(n.children) : [],
            data: n,
        }));

    // Xử lý Lưu nhóm hàng (Tạo mới hoặc Cập nhật)
    const handleSaveCategory = async (values: any) => {
        try {
            const isEdit = Boolean(editingCategory);
            const url = isEdit
                ? `/api/v1/categories/${editingCategory?.id}`
                : "/api/v1/categories";
            const method = isEdit ? "PUT" : "POST";

            const res = await authenticatedFetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });

            if (res.ok) {
                message.success(isEdit ? "Cập nhật nhóm thành công" : "Tạo nhóm mới thành công");
                setIsCatModalOpen(false);
                catForm.resetFields();
                setEditingCategory(null);
                fetchCategoryTree();
            } else {
                const err = await res.json();
                message.error(err.detail || "Thao tác thất bại");
            }
        } catch {
            message.error("Lỗi khi lưu nhóm hàng");
        }
    };

    // Xóa nhóm hàng (chặn nếu còn sản phẩm)
    const handleDeleteCategory = async (catId: number) => {
        try {
            const res = await authenticatedFetch(`/api/v1/categories/${catId}`, {
                method: "DELETE",
            });
            if (res.ok) {
                message.success("Đã xóa nhóm hàng");
                if (selectedCatId === catId) setSelectedCatId(null);
                fetchCategoryTree();
                fetchProducts();
            } else {
                const err = await res.json();
                message.error(err.detail || "Không thể xóa: nhóm này vẫn còn chứa sản phẩm!");
            }
        } catch {
            message.error("Lỗi khi xóa nhóm hàng");
        }
    };

    // Chuyển nhóm cho sản phẩm
    const handleMoveCategory = async () => {
        if (!selectedProduct || !targetCatId) {
            message.warning("Vui lòng chọn nhóm hàng đích!");
            return;
        }
        try {
            const res = await authenticatedFetch(`/api/v1/products/${selectedProduct.sku}/category`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    target_category_id: targetCatId,
                    category_id: targetCatId,
                    categoryId: targetCatId,
                }),
            });
            if (res.ok) {
                message.success(`Đã chuyển sản phẩm [${selectedProduct.name}] sang nhóm mới.`);
                setIsMoveModalOpen(false);
                setSelectedProduct(null);
                setTargetCatId(null);
                fetchProducts(selectedCatId);
            } else {
                const err = await res.json();
                message.error(err.detail || "Không thể chuyển nhóm");
            }
        } catch {
            message.error("Lỗi khi chuyển nhóm sản phẩm");
        }
    };

    const productColumns: ColumnsType<ProductItem> = [
        { title: "MÃ SKU", dataIndex: "sku", key: "sku", width: 120, render: (t) => <strong>{t}</strong> },
        { title: "TÊN SẢN PHẨM", dataIndex: "name", key: "name" },
        {
            title: "ĐƠN VỊ",
            dataIndex: "baseUnit",
            key: "unit",
            width: 100,
            render: (u) => <Tag color="blue">{u || "Cái"}</Tag>,
        },
        {
            title: "TRẠNG THÁI",
            dataIndex: "status",
            key: "status",
            width: 110,
            render: (s) => <Tag color={s === "ACTIVE" ? "green" : "default"}>{s || "ACTIVE"}</Tag>,
        },
        {
            title: "THAO TÁC",
            key: "actions",
            width: 140,
            render: (_, record) => (
                <Button
                    size="small"
                    icon={<SwapOutlined />}
                    onClick={() => {
                        setSelectedProduct(record);
                        setTargetCatId(record.categoryId || null);
                        setIsMoveModalOpen(true);
                    }}
                >
                    Đổi nhóm
                </Button>
            ),
        },
    ];

    return (
        <div style={{ padding: 4 }}>
            <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                    <Title level={3} style={{ margin: 0, fontWeight: 700 }}>
                        Quản lý Ngành hàng &amp; Phân loại sản phẩm
                    </Title>
                    <Text type="secondary">
                        Thiết lập cấu trúc cây nhóm hàng đa cấp và luân chuyển phân loại sản phẩm.
                    </Text>
                </div>
                <Space>
                    <Button icon={<ReloadOutlined />} onClick={() => { fetchCategoryTree(); fetchProducts(selectedCatId); }}>
                        Làm mới
                    </Button>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => {
                            setEditingCategory(null);
                            catForm.resetFields();
                            setIsCatModalOpen(true);
                        }}
                    >
                        Thêm nhóm hàng
                    </Button>
                </Space>
            </div>

            <Row gutter={16}>
                {/* Cột trái: Cây danh mục */}
                <Col xs={24} md={8}>
                    <Card
                        title={<span><FolderOutlined style={{ marginRight: 8, color: "#2563eb" }} />Cây ngành hàng</span>}
                        loading={loadingTree}
                        style={{ borderRadius: 12, minHeight: 600 }}
                    >
                        <div style={{ marginBottom: 12 }}>
                            <Button
                                type={selectedCatId === null ? "primary" : "default"}
                                size="small"
                                block
                                onClick={() => {
                                    setSelectedCatId(null);
                                    fetchProducts(null);
                                }}
                            >
                                Hiển thị tất cả sản phẩm
                            </Button>
                        </div>

                        <Tree
                            showIcon
                            defaultExpandAll
                            treeData={formatTreeData(treeData)}
                            onSelect={(selectedKeys) => {
                                const id = selectedKeys[0] ? Number(selectedKeys[0]) : null;
                                setSelectedCatId(id);
                                fetchProducts(id);
                            }}
                            titleRender={(node: any) => (
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", paddingRight: 8 }}>
                                    <span>{node.title}</span>
                                    <Space size={2} onClick={(e) => e.stopPropagation()}>
                                        <Button
                                            type="text"
                                            size="small"
                                            icon={<EditOutlined style={{ fontSize: 13, color: "#fa8c16" }} />}
                                            onClick={() => {
                                                setEditingCategory(node.data);
                                                catForm.setFieldsValue({
                                                    code: node.data.code,
                                                    name: node.data.name,
                                                    parent_id: node.data.parent_id || undefined,
                                                });
                                                setIsCatModalOpen(true);
                                            }}
                                        />
                                        <Popconfirm
                                            title="Xóa nhóm này?"
                                            description="Nếu còn sản phẩm trong nhóm, hệ thống sẽ chặn không cho xóa."
                                            onConfirm={() => handleDeleteCategory(node.data.id)}
                                        >
                                            <Button
                                                type="text"
                                                size="small"
                                                danger
                                                icon={<DeleteOutlined style={{ fontSize: 13 }} />}
                                            />
                                        </Popconfirm>
                                    </Space>
                                </div>
                            )}
                        />
                    </Card>
                </Col>

                {/* Cột phải: Danh sách sản phẩm & Chuyển nhóm */}
                <Col xs={24} md={16}>
                    <Card
                        title={
                            selectedCatId
                                ? `Sản phẩm thuộc nhóm ID: #${selectedCatId}`
                                : "Tất cả sản phẩm"
                        }
                        loading={loadingProducts}
                        style={{ borderRadius: 12, minHeight: 600 }}
                    >
                        <Table
                            dataSource={products}
                            columns={productColumns}
                            rowKey="sku"
                            pagination={{ pageSize: 10 }}
                        />
                    </Card>
                </Col>
            </Row>

            {/* Modal Thêm / Sửa nhóm hàng */}
            <Modal
                title={editingCategory ? "Cập nhật nhóm hàng" : "Thêm mới nhóm hàng"}
                open={isCatModalOpen}
                onCancel={() => {
                    setIsCatModalOpen(false);
                    setEditingCategory(null);
                }}
                onOk={() => catForm.submit()}
                okText="Lưu"
                cancelText="Hủy"
            >
                <Form form={catForm} layout="vertical" onFinish={handleSaveCategory}>
                    <Form.Item name="parent_id" label="Nhóm cha (Để trống nếu là nhóm cấp 1 / Nhóm gốc)">
                        <TreeSelect
                            treeData={formatTreeData(treeData)}
                            placeholder="Chọn nhóm cha..."
                            allowClear
                            treeDefaultExpandAll
                        />
                    </Form.Item>
                    <Form.Item
                        name="code"
                        label="Mã nhóm hàng (Tùy chọn)"
                    >
                        <Input placeholder="Ví dụ: NGK_TRA (để trống hệ thống sẽ tự sinh mã)" />
                    </Form.Item>
                    <Form.Item
                        name="name"
                        label="Tên nhóm hàng"
                        rules={[{ required: true, message: "Vui lòng nhập tên nhóm hàng!" }]}
                    >
                        <Input placeholder="Ví dụ: Đồ uống, Nước giải khát có ga..." />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Modal Chuyển nhóm cho sản phẩm */}
            <Modal
                title="Chuyển sản phẩm sang nhóm khác"
                open={isMoveModalOpen}
                onCancel={() => setIsMoveModalOpen(false)}
                onOk={handleMoveCategory}
                okText="Chuyển ngay"
                cancelText="Hủy"
            >
                {selectedProduct && (
                    <div style={{ marginBottom: 16 }}>
                        <p>
                            Sản phẩm: <strong>{selectedProduct.name}</strong> ({selectedProduct.sku})
                        </p>
                        <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>
                            Chọn nhóm hàng mới:
                        </label>
                        <TreeSelect
                            style={{ width: "100%" }}
                            treeData={formatTreeData(treeData)}
                            value={targetCatId}
                            onChange={(val) => setTargetCatId(val)}
                            placeholder="Chọn nhóm hàng đích..."
                            treeDefaultExpandAll
                        />
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default CategoryManagement;