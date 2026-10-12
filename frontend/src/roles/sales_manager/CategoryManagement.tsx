import React, { useEffect, useState, useMemo } from "react";
import {
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
    Breadcrumb,
    Empty,
} from "antd";
import {
    PlusOutlined,
    DeleteOutlined,
    EditOutlined,
    SwapOutlined,
    FolderOutlined,
    ReloadOutlined,
    ArrowLeftOutlined,
    SearchOutlined,
    FolderOpenOutlined,
    AppstoreOutlined,
    EyeOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { authenticatedFetch } from "../../services/sessionService";

const { Title, Text } = Typography;

interface CategoryNode {
    id: number;
    name: string;
    code?: string;
    parent_id?: number | null;
    level?: number;
    products_count?: number;
    description?: string;
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
    const [selectedCategory, setSelectedCategory] = useState<CategoryNode | null>(null);
    const [products, setProducts] = useState<ProductItem[]>([]);
    const [loadingTree, setLoadingTree] = useState(false);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [productSearch, setProductSearch] = useState("");

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

    // 2. Tải danh sách sản phẩm theo nhóm
    const fetchProducts = async (catId: number) => {
        setLoadingProducts(true);
        try {
            const res = await authenticatedFetch(`/api/v1/products?categoryId=${catId}`);
            if (res.ok) {
                const result = await res.json();
                setProducts(result.data || result.items || result || []);
            }
        } catch {
            message.error("Không tải được danh sách sản phẩm.");
        } finally {
            setLoadingProducts(false);
        }
    };

    // Ban đầu chỉ tải cây ngành hàng, KHÔNG tải danh sách sản phẩm
    useEffect(() => {
        fetchCategoryTree();
    }, []);

    // Format node cho Tree / TreeSelect
    const formatTreeData = (nodes: CategoryNode[]): any[] =>
        nodes.map((n) => ({
            title: n.name,
            value: n.id,
            key: String(n.id),
            children: n.children && n.children.length > 0 ? formatTreeData(n.children) : [],
            data: n,
        }));

    // Tìm đường dẫn từ gốc đến node hiện tại để hiển thị breadcrumb
    const getCategoryPath = (
        nodes: CategoryNode[],
        targetId: number,
        path: CategoryNode[] = []
    ): CategoryNode[] | null => {
        for (const node of nodes) {
            const currentPath = [...path, node];
            if (node.id === targetId) return currentPath;
            if (node.children && node.children.length > 0) {
                const found = getCategoryPath(node.children, targetId, currentPath);
                if (found) return found;
            }
        }
        return null;
    };

    // Bấm chọn nhóm hàng để xem danh sách sản phẩm của nhóm đó
    const handleSelectCategory = (cat: CategoryNode) => {
        setSelectedCategory(cat);
        setProductSearch("");
        fetchProducts(cat.id);
    };

    // Mở modal thêm nhóm con cho một node
    const handleAddSubCategory = (parentCat: CategoryNode) => {
        setEditingCategory(null);
        catForm.resetFields();
        catForm.setFieldsValue({
            parent_id: parentCat.id,
        });
        setIsCatModalOpen(true);
    };

    // Mở modal sửa thông tin nhóm
    const handleEditCategory = (cat: CategoryNode) => {
        setEditingCategory(cat);
        catForm.setFieldsValue({
            code: cat.code,
            name: cat.name,
            parent_id: cat.parent_id || undefined,
        });
        setIsCatModalOpen(true);
    };

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
                if (selectedCategory?.id === catId) {
                    setSelectedCategory(null);
                    setProducts([]);
                }
                fetchCategoryTree();
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
                if (selectedCategory) {
                    fetchProducts(selectedCategory.id);
                }
                fetchCategoryTree();
            } else {
                const err = await res.json();
                message.error(err.detail || "Không thể chuyển nhóm");
            }
        } catch {
            message.error("Lỗi khi chuyển nhóm sản phẩm");
        }
    };

    // Lọc danh sách sản phẩm theo từ khóa
    const filteredProducts = useMemo(() => {
        if (!productSearch.trim()) return products;
        const q = productSearch.trim().toLowerCase();
        return products.filter(
            (p) =>
                p.name?.toLowerCase().includes(q) ||
                p.sku?.toLowerCase().includes(q)
        );
    }, [products, productSearch]);

    const productColumns: ColumnsType<ProductItem> = [
        {
            title: "MÃ SKU",
            dataIndex: "sku",
            key: "sku",
            width: 140,
            render: (t) => <strong style={{ color: "#1e3a8a" }}>{t}</strong>,
        },
        {
            title: "TÊN SẢN PHẨM",
            dataIndex: "name",
            key: "name",
            render: (name) => <span style={{ fontWeight: 500 }}>{name}</span>,
        },
        {
            title: "ĐƠN VỊ",
            dataIndex: "baseUnit",
            key: "unit",
            width: 110,
            render: (u) => <Tag color="blue">{u || "Cái"}</Tag>,
        },
        {
            title: "TRẠNG THÁI",
            dataIndex: "status",
            key: "status",
            width: 130,
            render: (s) => (
                <Tag color={s === "ACTIVE" ? "green" : "default"}>
                    {s === "ACTIVE" ? "Đang kinh doanh" : s || "Chưa kích hoạt"}
                </Tag>
            ),
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
                        setTargetCatId(record.categoryId || selectedCategory?.id || null);
                        setIsMoveModalOpen(true);
                    }}
                >
                    Đổi nhóm
                </Button>
            ),
        },
    ];

    const currentBreadcrumb = selectedCategory
        ? getCategoryPath(treeData, selectedCategory.id)
        : null;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* =========================================================================
                VIEW 1: KHI CHƯA CHỌN NHÓM -> HIỂN THỊ CÂY NGÀNH HÀNG RÕ RÀNG, DỄ NHÌN
               ========================================================================= */}
            {!selectedCategory ? (
                <>
                    {/* Header Cây ngành hàng */}
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 16,
                        }}
                    >
                        <div>
                            <Title level={2} style={{ margin: 0, letterSpacing: "-0.5px" }}>
                                Quản lý Cây Ngành hàng
                            </Title>
                            <Text type="secondary" style={{ fontSize: 13, marginTop: 4, display: "block" }}>
                                Cấu trúc phân cấp ngành hàng theo sơ đồ cây. Nhấp vào nhóm hàng để xem danh sách sản phẩm.
                            </Text>
                        </div>
                        <Space>
                            <Button
                                icon={<ReloadOutlined />}
                                onClick={fetchCategoryTree}
                                loading={loadingTree}
                                style={{ borderRadius: 8, height: 38 }}
                            >
                                Làm mới cây
                            </Button>
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={() => {
                                    setEditingCategory(null);
                                    catForm.resetFields();
                                    setIsCatModalOpen(true);
                                }}
                                style={{ borderRadius: 8, height: 38, backgroundColor: "#2563eb" }}
                            >
                                Thêm nhóm chính
                            </Button>
                        </Space>
                    </div>

                    {/* Card Cây ngành hàng toàn màn hình */}
                    <Card
                        title={
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <FolderOpenOutlined style={{ color: "#2563eb", fontSize: 20 }} />
                                <span style={{ fontWeight: 600, fontSize: 16 }}>
                                    Sơ đồ cây ngành hàng &amp; nhóm sản phẩm
                                </span>
                            </div>
                        }
                        loading={loadingTree}
                        style={{
                            borderRadius: 12,
                            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                        }}
                    >
                        {treeData.length === 0 && !loadingTree ? (
                            <Empty description="Chưa có nhóm hàng nào. Hãy thêm nhóm ngành hàng đầu tiên!" />
                        ) : (
                            <div style={{ padding: "8px 0" }}>
                                <Tree
                                    showLine={{ showLeafIcon: false }}
                                    defaultExpandAll
                                    blockNode
                                    treeData={formatTreeData(treeData)}
                                    titleRender={(nodeData: any) => {
                                        const item: CategoryNode = nodeData.data;
                                        return (
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "space-between",
                                                    padding: "10px 14px",
                                                    margin: "6px 0",
                                                    borderRadius: 8,
                                                    backgroundColor: "#f8fafc",
                                                    border: "1px solid #e2e8f0",
                                                    transition: "all 0.2s ease",
                                                    cursor: "pointer",
                                                }}
                                                className="category-tree-node"
                                                onClick={() => handleSelectCategory(item)}
                                            >
                                                {/* Khối bên trái: Icon + Tên nhóm + Mã + Số lượng */}
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 10,
                                                        flex: 1,
                                                        minWidth: 0,
                                                    }}
                                                >
                                                    <FolderOutlined
                                                        style={{
                                                            fontSize: 16,
                                                            color: item.children && item.children.length > 0 ? "#2563eb" : "#0284c7",
                                                        }}
                                                    />
                                                    <span style={{ fontWeight: 600, color: "#0f172a", fontSize: 14 }}>
                                                        {item.name}
                                                    </span>
                                                    {item.code && (
                                                        <Tag color="blue" style={{ fontSize: 11, borderRadius: 4 }}>
                                                            {item.code}
                                                        </Tag>
                                                    )}
                                                    <Tag
                                                        color={item.products_count ? "cyan" : "default"}
                                                        style={{ fontSize: 11, borderRadius: 4 }}
                                                    >
                                                        {item.products_count ?? 0} sản phẩm
                                                    </Tag>
                                                </div>

                                                {/* Khối bên phải: Nút thao tác */}
                                                <Space size={6} onClick={(e) => e.stopPropagation()}>
                                                    <Button
                                                        type="primary"
                                                        ghost
                                                        size="small"
                                                        icon={<EyeOutlined />}
                                                        onClick={() => handleSelectCategory(item)}
                                                        style={{ borderRadius: 6, fontSize: 12 }}
                                                    >
                                                        Xem sản phẩm
                                                    </Button>
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        title="Thêm nhóm con"
                                                        icon={<PlusOutlined style={{ color: "#16a34a" }} />}
                                                        onClick={() => handleAddSubCategory(item)}
                                                    />
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        title="Sửa nhóm"
                                                        icon={<EditOutlined style={{ color: "#fa8c16" }} />}
                                                        onClick={() => handleEditCategory(item)}
                                                    />
                                                    <Popconfirm
                                                        title="Xóa nhóm này?"
                                                        description="Nếu còn sản phẩm trong nhóm, hệ thống sẽ chặn không cho xóa."
                                                        onConfirm={() => handleDeleteCategory(item.id)}
                                                        okText="Xóa"
                                                        cancelText="Hủy"
                                                    >
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            danger
                                                            title="Xóa nhóm"
                                                            icon={<DeleteOutlined />}
                                                        />
                                                    </Popconfirm>
                                                </Space>
                                            </div>
                                        );
                                    }}
                                />
                            </div>
                        )}
                    </Card>
                </>
            ) : (
                /* =========================================================================
                    VIEW 2: KHI ĐÃ BẤM VÀO NHÓM HÀNG -> HIỂN THỊ DANH SÁCH SẢN PHẨM CỦA NHÓM ĐÓ
                   ========================================================================= */
                <>
                    {/* Header điều hướng quay lại & Breadcrumb */}
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 16,
                        }}
                    >
                        <div>
                            <Breadcrumb
                                items={[
                                    {
                                        title: (
                                            <a onClick={() => setSelectedCategory(null)} style={{ color: "#2563eb", fontWeight: 500 }}>
                                                <AppstoreOutlined style={{ marginRight: 4 }} />
                                                Cây ngành hàng
                                            </a>
                                        ),
                                    },
                                    ...(currentBreadcrumb || []).map((node, idx, arr) => ({
                                        title:
                                            idx === arr.length - 1 ? (
                                                <span style={{ fontWeight: 600, color: "#0f172a" }}>{node.name}</span>
                                            ) : (
                                                <a onClick={() => handleSelectCategory(node)} style={{ color: "#64748b" }}>
                                                    {node.name}
                                                </a>
                                            ),
                                    })),
                                ]}
                                style={{ marginBottom: 6 }}
                            />
                            <Title level={2} style={{ margin: 0, letterSpacing: "-0.5px" }}>
                                {selectedCategory.name}
                            </Title>
                            <Text type="secondary" style={{ fontSize: 13, marginTop: 4, display: "block" }}>
                                Danh sách sản phẩm được phân loại trong nhóm này. Mã nhóm:{" "}
                                <Text strong>{selectedCategory.code || `#${selectedCategory.id}`}</Text>
                            </Text>
                        </div>

                        <Space>
                            <Button
                                icon={<ArrowLeftOutlined />}
                                onClick={() => {
                                    setSelectedCategory(null);
                                    setProducts([]);
                                }}
                                style={{ borderRadius: 8, height: 38 }}
                            >
                                Quay lại Cây ngành hàng
                            </Button>
                            <Button
                                icon={<ReloadOutlined />}
                                onClick={() => fetchProducts(selectedCategory.id)}
                                loading={loadingProducts}
                                style={{ borderRadius: 8, height: 38 }}
                            >
                                Làm mới
                            </Button>
                        </Space>
                    </div>

                    {/* Card Danh sách sản phẩm của nhóm */}
                    <Card
                        title={
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    flexWrap: "wrap",
                                    gap: 12,
                                }}
                            >
                                <Space>
                                    <span style={{ fontWeight: 600, fontSize: 16 }}>
                                        Sản phẩm trong nhóm
                                    </span>
                                    <Tag color="blue" style={{ borderRadius: 12, padding: "0 10px" }}>
                                        {filteredProducts.length} sản phẩm
                                    </Tag>
                                </Space>
                                <Input
                                    prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
                                    placeholder="Tìm theo SKU hoặc tên sản phẩm..."
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                    allowClear
                                    style={{ width: 300, borderRadius: 8 }}
                                />
                            </div>
                        }
                        loading={loadingProducts}
                        style={{
                            borderRadius: 12,
                            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                        }}
                    >
                        <Table
                            dataSource={filteredProducts}
                            columns={productColumns}
                            rowKey="sku"
                            pagination={{
                                pageSize: 10,
                                showTotal: (tot) => `Tổng cộng ${tot} sản phẩm`,
                            }}
                            locale={{
                                emptyText: (
                                    <Empty
                                        description={`Chưa có sản phẩm nào thuộc nhóm "${selectedCategory.name}".`}
                                    />
                                ),
                            }}
                        />
                    </Card>
                </>
            )}

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
                    <Form.Item name="code" label="Mã nhóm hàng (Tùy chọn)">
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