import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Card,
  Tree,
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
  Descriptions,
  Drawer,
  Row,
  Col,
  Tooltip,
  Divider,
  Empty,
  Badge,
  Spin,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  SwapOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  SearchOutlined,
  BarcodeOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import type { TreeProps } from "antd";
import { authenticatedFetch } from "../../services/sessionService";

const { Title, Text, Paragraph } = Typography;

export interface CategoryNode {
  id: number;
  name: string;
  code?: string;
  parent_id?: number | null;
  level?: number;
  products_count?: number;
  description?: string;
  children?: CategoryNode[];
}

export interface ProductItem {
  id: number;
  sku: string;
  name: string;
  categoryId?: number | null;
  category_id?: number | null;
  category?: any;
  category_name?: string;
  baseUnit?: string;
  unit?: string;
  sale_price?: number;
  basePrice?: number;
  cost_price?: number;
  costPrice?: number;
  minStock?: number;
  status: string;
  manageByLot?: boolean;
}

export const CategoryManagement: React.FC = () => {
  const [treeData, setTreeData] = useState<CategoryNode[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [autoExpandParent, setAutoExpandParent] = useState(true);

  // Sản phẩm được chọn để xem chi tiết bên Drawer
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Modal tạo / sửa nhóm hàng
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryNode | null>(null);
  const [catForm] = Form.useForm();

  // Modal chuyển nhóm thủ công cho sản phẩm
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [productToMove, setProductToMove] = useState<ProductItem | null>(null);
  const [targetCatId, setTargetCatId] = useState<number | null>(null);

  // 1. Tải cây danh mục ngành hàng
  const fetchCategoryTree = useCallback(async () => {
    try {
      const res = await authenticatedFetch("/api/v1/categories/tree");
      if (res.ok) {
        const data = await res.json();
        setTreeData(data || []);
      }
    } catch {
      message.error("Không tải được danh mục cây ngành hàng.");
    }
  }, []);

  // 2. Tải toàn bộ danh sách sản phẩm
  const fetchAllProducts = useCallback(async () => {
    try {
      const res = await authenticatedFetch("/api/v1/products");
      if (res.ok) {
        const json = await res.json();
        const list: ProductItem[] = Array.isArray(json)
          ? json
          : json.data || json.items || [];
        setProducts(list);
      }
    } catch {
      message.error("Không tải được danh sách sản phẩm.");
    }
  }, []);

  // 3. Tải toàn bộ dữ liệu ban đầu
  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchCategoryTree(), fetchAllProducts()]);
    } finally {
      setLoading(false);
    }
  }, [fetchCategoryTree, fetchAllProducts]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Thu thập tất cả key danh mục để mở rộng mặc định
  const allCategoryKeys = useMemo(() => {
    const keys: string[] = ["unassigned-category"];
    const collect = (nodes: CategoryNode[]) => {
      for (const node of nodes) {
        keys.push(`cat-${node.id}`);
        if (node.children && node.children.length > 0) {
          collect(node.children);
        }
      }
    };
    collect(treeData);
    return keys;
  }, [treeData]);

  useEffect(() => {
    if (allCategoryKeys.length > 0 && expandedKeys.length === 0) {
      setExpandedKeys(allCategoryKeys);
    }
  }, [allCategoryKeys]);

  // Tạo map tra cứu category theo ID và theo tên
  const { categoryMap, categoryNameMap } = useMemo(() => {
    const map = new Map<number, CategoryNode>();
    const nameMap = new Map<string, CategoryNode>();
    const traverse = (nodes: CategoryNode[]) => {
      for (const node of nodes) {
        map.set(node.id, node);
        if (node.name) {
          nameMap.set(node.name.trim().toLowerCase(), node);
        }
        if (node.children) traverse(node.children);
      }
    };
    traverse(treeData);
    return { categoryMap: map, categoryNameMap: nameMap };
  }, [treeData]);

  // Gom nhóm sản phẩm theo categoryId
  // YÊU CẦU 3: Kiểm tra chuẩn product.category_id ?? product.categoryId ?? product.category?.id
  // Nếu đã có category_id thì bắt buộc phải nằm trong thư mục của ngành hàng đó, không được rớt vào "Sản phẩm chưa phân loại"
  const productsByCat = useMemo(() => {
    const map = new Map<number | "unassigned", ProductItem[]>();

    for (const p of products) {
      const rawCat = p.category as any;
      let cid: number | undefined =
        p.category_id ??
        p.categoryId ??
        (typeof rawCat === "object" && rawCat !== null ? rawCat.id : undefined);

      // Nếu chưa có cid dạng số nhưng có tên nhóm dạng chuỗi
      if ((cid === undefined || cid === null) && typeof p.category === "string" && p.category.trim()) {
        const found = categoryNameMap.get(p.category.trim().toLowerCase());
        if (found) cid = found.id;
      }
      if ((cid === undefined || cid === null) && p.category_name && p.category_name.trim()) {
        const found = categoryNameMap.get(p.category_name.trim().toLowerCase());
        if (found) cid = found.id;
      }

      if (cid !== undefined && cid !== null && cid > 0) {
        // Có ID danh mục hợp lệ -> đưa vào nhóm tương ứng
        const list = map.get(cid) || [];
        list.push(p);
        map.set(cid, list);
      } else {
        // Chỉ khi hoàn toàn không có thông tin nhóm mới đưa vào unassigned
        const unassigned = map.get("unassigned") || [];
        unassigned.push(p);
        map.set("unassigned", unassigned);
      }
    }
    return map;
  }, [products, categoryNameMap]);

  // Bổ sung các nhóm xuất hiện trong sản phẩm nhưng chưa có trên treeData
  const displayTreeData = useMemo(() => {
    const existingIds = new Set<number>();
    const collectIds = (nodes: CategoryNode[]) => {
      for (const n of nodes) {
        existingIds.add(n.id);
        if (n.children) collectIds(n.children);
      }
    };
    collectIds(treeData);

    const extraNodes: CategoryNode[] = [];
    for (const [key, prods] of productsByCat.entries()) {
      if (key !== "unassigned" && !existingIds.has(key)) {
        const sampleProd = prods[0];
        const catName =
          sampleProd.category_name ||
          (typeof sampleProd.category === "string" ? sampleProd.category : `Nhóm #${key}`);
        extraNodes.push({
          id: key,
          name: catName,
          code: `CAT_${key}`,
          parent_id: null,
          products_count: prods.length,
        });
      }
    }
    return [...treeData, ...extraNodes];
  }, [treeData, productsByCat]);

  // Định dạng cây cho TreeSelect
  const formatCategoryOptions = (nodes: CategoryNode[]): any[] =>
    nodes.map((n) => ({
      title: `${n.name}${n.code ? ` (${n.code})` : ""}`,
      value: n.id,
      key: String(n.id),
      children: n.children && n.children.length > 0 ? formatCategoryOptions(n.children) : [],
    }));

  // Xây dựng File Explorer Tree: lồng sản phẩm bên trong node danh mục
  const explorerTreeData = useMemo(() => {
    const q = searchKeyword.trim().toLowerCase();

    const buildCategoryTree = (nodes: CategoryNode[]): any[] => {
      const result: any[] = [];

      for (const cat of nodes) {
        const directProducts = productsByCat.get(cat.id) || [];
        const childCatNodes =
          cat.children && cat.children.length > 0 ? buildCategoryTree(cat.children) : [];

        const matchingProducts = q
          ? directProducts.filter(
              (p) =>
                p.name?.toLowerCase().includes(q) ||
                p.sku?.toLowerCase().includes(q)
            )
          : directProducts;

        const isCatMatch =
          !q ||
          cat.name?.toLowerCase().includes(q) ||
          (cat.code && cat.code.toLowerCase().includes(q));

        if (isCatMatch || matchingProducts.length > 0 || childCatNodes.length > 0) {
          // Node sản phẩm (Leaf)
          const productLeafNodes = matchingProducts.map((prod) => ({
            key: `prod-${prod.sku}`,
            isLeaf: true,
            isProduct: true,
            isCategory: false,
            product: prod,
            categoryId: cat.id,
            categoryName: cat.name,
            title: (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "4px 8px",
                  borderRadius: 6,
                  transition: "background-color 0.15s ease",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 8,
                    whiteSpace: "normal",
                    wordBreak: "break-word",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <BarcodeOutlined style={{ color: "#7c3aed", fontSize: 14, flexShrink: 0 }} />
                  <Tag
                    color="purple"
                    style={{
                      fontFamily: "monospace",
                      fontSize: 11,
                      margin: 0,
                      fontWeight: 600,
                      borderRadius: 4,
                    }}
                  >
                    {prod.sku}
                  </Tag>
                  <span
                    style={{
                      fontWeight: 500,
                      color: "#1e293b",
                      fontSize: 13,
                      whiteSpace: "normal",
                      wordBreak: "break-word",
                    }}
                  >
                    {prod.name}
                  </span>
                  <Tag color="blue" style={{ fontSize: 11, margin: 0, borderRadius: 4 }}>
                    {prod.baseUnit || prod.unit || "Cái"}
                  </Tag>
                  {prod.status === "ACTIVE" ? (
                    <Tag color="success" style={{ fontSize: 11, margin: 0, borderRadius: 4 }}>
                      Đang kinh doanh
                    </Tag>
                  ) : (
                    <Tag style={{ fontSize: 11, margin: 0, borderRadius: 4 }}>
                      {prod.status || "Chưa kích hoạt"}
                    </Tag>
                  )}
                </div>

                <Space size={4} onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, marginLeft: 8 }}>
                  <Tooltip title="Đổi nhóm hàng thủ công">
                    <Button
                      type="text"
                      size="small"
                      icon={<SwapOutlined style={{ color: "#2563eb", fontSize: 13 }} />}
                      onClick={() => {
                        setProductToMove(prod);
                        setTargetCatId(cat.id);
                        setIsMoveModalOpen(true);
                      }}
                    />
                  </Tooltip>
                </Space>
              </div>
            ),
          }));

          // Node Nhóm hàng (Folder)
          const categoryNode = {
            key: `cat-${cat.id}`,
            categoryId: cat.id,
            data: { id: cat.id },
            isLeaf: false,
            isCategory: true,
            isProduct: false,
            category: cat,
            title: (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  borderRadius: 8,
                  backgroundColor: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  margin: "3px 0",
                  transition: "all 0.15s ease",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <FolderOutlined style={{ color: "#2563eb", fontSize: 16, flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, color: "#0f172a", fontSize: 14 }}>
                    {cat.name}
                  </span>
                  {cat.code && (
                    <Tag color="blue" style={{ fontSize: 11, borderRadius: 4, margin: 0 }}>
                      {cat.code}
                    </Tag>
                  )}
                  <Tag
                    color={directProducts.length > 0 ? "cyan" : "default"}
                    style={{ fontSize: 11, borderRadius: 10, margin: 0 }}
                  >
                    {directProducts.length} SP
                  </Tag>
                </div>

                <Space size={4} onClick={(e) => e.stopPropagation()}>
                  <Tooltip title="Thêm nhóm con">
                    <Button
                      type="text"
                      size="small"
                      icon={<PlusOutlined style={{ color: "#16a34a" }} />}
                      onClick={() => handleAddSubCategory(cat)}
                    />
                  </Tooltip>
                  <Tooltip title="Sửa tên / mã nhóm">
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined style={{ color: "#d97706" }} />}
                      onClick={() => handleEditCategory(cat)}
                    />
                  </Tooltip>
                  <Popconfirm
                    title="Xóa nhóm này?"
                    description={
                      directProducts.length > 0
                        ? "Nhóm còn sản phẩm sẽ không thể xóa!"
                        : "Bạn có chắc chắn muốn xóa nhóm này?"
                    }
                    onConfirm={() => handleDeleteCategory(cat.id)}
                    okText="Xóa"
                    cancelText="Hủy"
                  >
                    <Tooltip title="Xóa nhóm">
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Tooltip>
                  </Popconfirm>
                </Space>
              </div>
            ),
            children: [...childCatNodes, ...productLeafNodes],
          };

          result.push(categoryNode);
        }
      }

      return result;
    };

    const mainCategoryTree = buildCategoryTree(displayTreeData);

    // Thư mục đặc biệt: "Sản phẩm chưa phân loại" (chỉ khi có sản phẩm thực sự chưa có nhóm)
    const unassignedProds = productsByCat.get("unassigned") || [];
    const matchingUnassigned = q
      ? unassignedProds.filter(
          (p) =>
            p.name?.toLowerCase().includes(q) ||
            p.sku?.toLowerCase().includes(q)
        )
      : unassignedProds;

    if (unassignedProds.length > 0 && (matchingUnassigned.length > 0 || !q)) {
      const unassignedNode = {
        key: "unassigned-category",
        isLeaf: false,
        isCategory: true,
        isProduct: false,
        category: { id: 0, name: "Chưa phân loại" },
        title: (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 10px",
              borderRadius: 8,
              backgroundColor: "#fffbeb",
              border: "1px dashed #f59e0b",
              margin: "3px 0",
              width: "100%",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <InboxOutlined style={{ color: "#d97706", fontSize: 16 }} />
              <span style={{ fontWeight: 600, color: "#b45309", fontSize: 14 }}>
                Sản phẩm chưa phân loại
              </span>
              <Tag color="warning" style={{ fontSize: 11, borderRadius: 10, margin: 0 }}>
                {unassignedProds.length} SP
              </Tag>
            </div>
            <span style={{ fontSize: 12, color: "#92400e" }}>
              (Kéo thả vào nhóm để phân loại)
            </span>
          </div>
        ),
        children: matchingUnassigned.map((prod) => ({
          key: `prod-${prod.sku}`,
          isLeaf: true,
          isProduct: true,
          isCategory: false,
          product: prod,
          categoryId: null,
          categoryName: "Chưa phân loại",
          title: (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "4px 8px",
                borderRadius: 6,
                width: "100%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 8,
                  whiteSpace: "normal",
                  wordBreak: "break-word",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <BarcodeOutlined style={{ color: "#d97706", fontSize: 14, flexShrink: 0 }} />
                <Tag color="orange" style={{ fontFamily: "monospace", fontSize: 11, margin: 0 }}>
                  {prod.sku}
                </Tag>
                <span
                  style={{
                    fontWeight: 500,
                    color: "#1e293b",
                    fontSize: 13,
                    whiteSpace: "normal",
                    wordBreak: "break-word",
                  }}
                >
                  {prod.name}
                </span>
                <Tag color="blue" style={{ fontSize: 11, margin: 0, borderRadius: 4 }}>
                  {prod.baseUnit || prod.unit || "Cái"}
                </Tag>
              </div>
              <Tooltip title="Đổi nhóm hàng thủ công">
                <Button
                  type="text"
                  size="small"
                  icon={<SwapOutlined style={{ color: "#2563eb", fontSize: 13 }} />}
                  style={{ flexShrink: 0, marginLeft: 8 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setProductToMove(prod);
                    setTargetCatId(null);
                    setIsMoveModalOpen(true);
                  }}
                />
              </Tooltip>
            </div>
          ),
        })),
      };

      mainCategoryTree.push(unassignedNode);
    }

    return mainCategoryTree;
  }, [displayTreeData, productsByCat, searchKeyword]);

  // YÊU CẦU 1: Khắc phục lỗi kéo thả (Drag & Drop)
  // - Trích xuất targetCategoryId chính xác từ dropNode hoặc sản phẩm đích
  // - Chỉ gọi API khi targetCategoryId là số nguyên hợp lệ và khác nhóm hiện tại
  const handleDrop: TreeProps["onDrop"] = async (info) => {
    const { dragNode, node: dropNode } = info;

    const dragData = dragNode as any;
    const dropData = dropNode as any;

    // 1. Chỉ cho phép kéo node Sản phẩm
    if (!dragData.isProduct || !dragData.product) {
      message.warning("Chỉ được phép kéo thả sản phẩm để đổi nhóm.");
      return;
    }

    const sku = dragData.product.sku;

    // 2. Trích xuất targetCategoryId:
    let targetCategoryId: number | null = null;
    if (dropData.isProduct) {
      // Nếu kéo thả trực tiếp lên một sản phẩm khác trong cùng nhóm, lấy targetCategoryId từ sản phẩm đích đó
      const dropProd = dropData.product;
      const rawProdCat =
        (dropNode as any).categoryId ??
        (dropNode as any).data?.categoryId ??
        dropProd?.category_id ??
        dropProd?.categoryId ??
        (typeof dropProd?.category === "object" && dropProd?.category !== null
          ? dropProd.category.id
          : undefined) ??
        String(dropNode.key).replace(/\D/g, "");
      targetCategoryId = Number(rawProdCat);
    } else {
      // Đảm bảo lấy chính xác ID của danh mục từ dropNode
      targetCategoryId = Number(
        (dropNode as any).categoryId ??
        (dropNode as any).data?.id ??
        String(dropNode.key).replace(/\D/g, "")
      );
    }

    // 3. Chỉ gọi API khi targetCategoryId là số nguyên hợp lệ và khác với category hiện tại của sản phẩm
    if (!targetCategoryId || isNaN(targetCategoryId) || targetCategoryId <= 0) {
      message.warning("Không xác định được nhóm hàng đích hợp lệ.");
      return;
    }

    const currentCatId = Number(
      dragData.product.category_id ??
      dragData.product.categoryId ??
      (typeof dragData.product.category === "object" && dragData.product.category !== null
        ? dragData.product.category.id
        : undefined) ??
      dragData.categoryId ??
      0
    );

    if (currentCatId === targetCategoryId) {
      message.info("Sản phẩm đã thuộc nhóm hàng này.");
      return;
    }

    const targetCatName =
      categoryMap.get(targetCategoryId)?.name ||
      dropData.category?.name ||
      dropData.categoryName ||
      `Nhóm #${targetCategoryId}`;

    const hide = message.loading(`Đang chuyển sản phẩm sang nhóm "${targetCatName}"...`, 0);

    try {
      const res = await authenticatedFetch(`/api/v1/products/${sku}/category`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_category_id: targetCategoryId }),
      });

      hide();
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.detail || "Không thể chuyển nhóm hàng");
      }

      message.success(
        result.message || `Đã chuyển sản phẩm "${dragData.product.name}" sang nhóm "${targetCatName}" thành công!`
      );

      // Cập nhật state sản phẩm tại chỗ
      setProducts((prev) =>
        prev.map((p) =>
          p.sku === sku
            ? {
                ...p,
                categoryId: targetCategoryId,
                category_id: targetCategoryId,
                category_name: targetCatName,
                category: targetCatName,
              }
            : p
        )
      );

      // Đồng bộ nếu đang xem chi tiết sản phẩm này
      setSelectedProduct((prev) =>
        prev && prev.sku === sku
          ? {
              ...prev,
              categoryId: targetCategoryId,
              category_id: targetCategoryId,
              category_name: targetCatName,
              category: targetCatName,
            }
          : prev
      );

      // Làm mới cây để đồng bộ số lượng sản phẩm
      fetchCategoryTree();
    } catch (err: any) {
      hide();
      message.error(err.message || "Lỗi khi chuyển nhóm sản phẩm");
    }
  };

  // Mở modal thêm nhóm con
  const handleAddSubCategory = (parentCat: CategoryNode) => {
    setEditingCategory(null);
    catForm.resetFields();
    catForm.setFieldsValue({ parent_id: parentCat.id });
    setIsCatModalOpen(true);
  };

  // Mở modal sửa nhóm
  const handleEditCategory = (cat: CategoryNode) => {
    setEditingCategory(cat);
    catForm.resetFields();
    catForm.setFieldsValue({
      name: cat.name,
      code: cat.code,
      parent_id: cat.parent_id,
      description: cat.description,
    });
    setIsCatModalOpen(true);
  };

  // Xóa nhóm hàng
  const handleDeleteCategory = async (catId: number) => {
    try {
      const res = await authenticatedFetch(`/api/v1/categories/${catId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        message.success(data.message || "Xóa nhóm hàng thành công.");
        loadAllData();
      } else {
        message.error(data.detail || "Không thể xóa nhóm hàng.");
      }
    } catch {
      message.error("Lỗi khi kết nối đến máy chủ.");
    }
  };

  // Lưu thêm / sửa nhóm hàng
  const handleSaveCategory = async (values: any) => {
    try {
      if (editingCategory) {
        const res = await authenticatedFetch(`/api/v1/categories/${editingCategory.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        const data = await res.json();
        if (res.ok) {
          message.success("Cập nhật nhóm hàng thành công.");
          setIsCatModalOpen(false);
          loadAllData();
        } else {
          message.error(data.detail || "Không thể cập nhật nhóm hàng.");
        }
      } else {
        const res = await authenticatedFetch("/api/v1/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        const data = await res.json();
        if (res.ok) {
          message.success("Tạo nhóm hàng mới thành công.");
          setIsCatModalOpen(false);
          loadAllData();
        } else {
          message.error(data.detail || "Không thể tạo nhóm hàng.");
        }
      }
    } catch {
      message.error("Lỗi khi kết nối đến máy chủ.");
    }
  };

  // Chuyển nhóm thủ công qua modal
  const handleMoveCategoryManual = async () => {
    if (!productToMove || !targetCatId) {
      message.warning("Vui lòng chọn nhóm hàng đích!");
      return;
    }

    try {
      const res = await authenticatedFetch(`/api/v1/products/${productToMove.sku}/category`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_category_id: targetCatId }),
      });
      const data = await res.json();
      if (res.ok) {
        message.success(data.message || "Chuyển nhóm sản phẩm thành công.");
        setIsMoveModalOpen(false);
        setProductToMove(null);
        setTargetCatId(null);
        loadAllData();
      } else {
        message.error(data.detail || "Không thể chuyển nhóm sản phẩm.");
      }
    } catch {
      message.error("Lỗi khi kết nối đến máy chủ.");
    }
  };

  const unassignedCount = (productsByCat.get("unassigned") || []).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1. Header & Thống kê nhanh */}
      <Card
        bordered={false}
        style={{
          boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)",
          borderRadius: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <Title level={4} style={{ margin: 0, color: "#0f172a" }}>
              Quản lý Cây Ngành hàng & Danh mục Sản phẩm
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Cấu trúc phân cấp đa tầng (File Explorer). Kéo thả sản phẩm trực tiếp vào thư mục ngành hàng để đổi nhóm.
            </Text>
          </div>

          <Space size={10} wrap>
            <Input
              prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
              placeholder="Tìm kiếm sản phẩm hoặc nhóm..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              style={{ width: 260 }}
              allowClear
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={loadAllData}
              loading={loading}
            >
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
              style={{
                backgroundColor: "#2563eb",
                boxShadow: "0 2px 4px rgba(37, 99, 235, 0.2)",
              }}
            >
              Thêm nhóm gốc
            </Button>
          </Space>
        </div>

        {/* Thống kê thẻ tóm tắt */}
        <div
          style={{
            display: "flex",
            gap: 20,
            marginTop: 16,
            paddingTop: 12,
            borderTop: "1px solid #f1f5f9",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FolderOpenOutlined style={{ color: "#2563eb", fontSize: 18 }} />
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Tổng số nhóm hàng</Text>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
                {categoryMap.size}
              </div>
            </div>
          </div>

          <div style={{ width: 1, backgroundColor: "#e2e8f0" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AppstoreOutlined style={{ color: "#059669", fontSize: 18 }} />
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Tổng số sản phẩm</Text>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#059669" }}>
                {products.length}
              </div>
            </div>
          </div>

          <div style={{ width: 1, backgroundColor: "#e2e8f0" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <InboxOutlined style={{ color: unassignedCount > 0 ? "#d97706" : "#64748b", fontSize: 18 }} />
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Chưa phân loại</Text>
              <div style={{ fontSize: 18, fontWeight: 700, color: unassignedCount > 0 ? "#d97706" : "#64748b" }}>
                {unassignedCount} SP
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 2. Cây phân cấp ngành hàng chiếm trọn 100% chiều ngang (Full Width) */}
      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FolderOpenOutlined style={{ color: "#2563eb" }} />
            <span>Cây Phân cấp Ngành hàng & Sản phẩm</span>
          </div>
        }
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            Click sản phẩm để xem chi tiết • Kéo thả node để đổi nhóm
          </Text>
        }
        bordered={false}
        style={{
          boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)",
          borderRadius: 12,
          width: "100%",
          minHeight: 650,
        }}
      >
        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <Spin size="large" />
            <div style={{ marginTop: 12, color: "#64748b" }}>Đang tải cây dữ liệu...</div>
          </div>
        ) : explorerTreeData.length === 0 ? (
          <Empty description="Không có dữ liệu ngành hàng nào." />
        ) : (
          <Tree
            draggable={{ icon: false, nodeDraggable: (node: any) => Boolean(node.isProduct) }}
            blockNode
            showIcon
            expandedKeys={expandedKeys}
            autoExpandParent={autoExpandParent}
            onExpand={(keys) => setExpandedKeys(keys)}
            selectedKeys={selectedProduct ? [`prod-${selectedProduct.sku}`] : []}
            onSelect={(_, info: any) => {
              if (info.node.isProduct && info.node.product) {
                setSelectedProduct(info.node.product);
                setIsDrawerOpen(true);
              }
            }}
            allowDrop={(info: any) => {
              // Cho phép thả vào thư mục nhóm hàng hoặc trực tiếp lên sản phẩm khác trong nhóm
              return Boolean(info.dropNode?.isCategory || info.dropNode?.isProduct);
            }}
            onDrop={handleDrop}
            treeData={explorerTreeData}
          />
        )}
      </Card>

      {/* 3. Drawer Chi tiết Sản phẩm trượt từ bên phải */}
      <Drawer
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BarcodeOutlined style={{ color: "#7c3aed" }} />
            <span>Chi tiết Sản phẩm</span>
          </div>
        }
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        width={420}
        placement="right"
      >
        {selectedProduct ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Header: Tag SKU bo tròn, Tên sản phẩm in đậm to, dòng "Nhóm hiện tại: [Tên nhóm]" (màu xanh dương) */}
            <div
              style={{
                backgroundColor: "#f8fafc",
                padding: 16,
                borderRadius: 10,
                border: "1px solid #e2e8f0",
              }}
            >
              <Tag
                color="purple"
                style={{
                  fontFamily: "monospace",
                  fontWeight: 700,
                  fontSize: 13,
                  padding: "2px 10px",
                  borderRadius: 12,
                }}
              >
                {selectedProduct.sku}
              </Tag>
              <Title level={4} style={{ margin: "10px 0 6px", color: "#0f172a" }}>
                {selectedProduct.name}
              </Title>
              <div style={{ fontSize: 13, color: "#64748b" }}>
                Nhóm hiện tại:{" "}
                <Text strong style={{ color: "#2563eb" }}>
                  {categoryMap.get(
                    Number(selectedProduct.categoryId ?? selectedProduct.category_id ?? 0)
                  )?.name ||
                    selectedProduct.category_name ||
                    (typeof selectedProduct.category === "string" ? selectedProduct.category : null) ||
                    (typeof selectedProduct.category === "object" && selectedProduct.category?.name ? selectedProduct.category.name : null) ||
                    "Chưa phân loại"}
                </Text>
              </div>
            </div>

            {/* Bảng thông tin: SKU, Đơn vị tính cơ bản, Trạng thái, Giá bán, Giá vốn, Định mức tồn tối thiểu */}
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Mã SKU">
                <Text copyable strong>{selectedProduct.sku}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Đơn vị tính cơ bản">
                <Tag color="blue">{selectedProduct.baseUnit || selectedProduct.unit || "Cái"}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                <Tag color={selectedProduct.status === "ACTIVE" ? "success" : "default"}>
                  {selectedProduct.status === "ACTIVE" ? "Đang kinh doanh" : selectedProduct.status || "Chưa kích hoạt"}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Giá bán">
                <Text strong style={{ color: "#059669", fontSize: 15 }}>
                  {(selectedProduct.sale_price ?? selectedProduct.basePrice ?? 0).toLocaleString("vi-VN")} ₫
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Giá vốn">
                <Text>
                  {(selectedProduct.cost_price ?? selectedProduct.costPrice ?? 0).toLocaleString("vi-VN")} ₫
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Định mức tồn tối thiểu">
                <Text>
                  {selectedProduct.minStock ?? 0} {selectedProduct.baseUnit || selectedProduct.unit || "Cái"}
                </Text>
              </Descriptions.Item>
            </Descriptions>

            {/* Nút hành động */}
            <Button
              type="primary"
              ghost
              icon={<SwapOutlined />}
              block
              onClick={() => {
                setProductToMove(selectedProduct);
                setTargetCatId(selectedProduct.categoryId ?? selectedProduct.category_id ?? null);
                setIsMoveModalOpen(true);
              }}
            >
              Đổi nhóm hàng thủ công
            </Button>

            {/* Khối Alert hướng dẫn bo tròn ở dưới cùng */}
            <div
              style={{
                backgroundColor: "#eff6ff",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #bfdbfe",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <InfoCircleOutlined style={{ color: "#2563eb" }} />
                <span style={{ fontWeight: 600, color: "#1e40af", fontSize: 13 }}>
                  Kéo thả để đổi nhóm
                </span>
              </div>
              <Paragraph style={{ margin: 0, fontSize: 12, color: "#3b82f6", lineHeight: 1.5 }}>
                Bạn có thể kéo trực tiếp sản phẩm này trên cây File Explorer bên trái và thả vào bất kỳ thư mục nhóm hàng nào khác.
              </Paragraph>
            </div>
          </div>
        ) : null}
      </Drawer>

      {/* 3. Modal Thêm / Sửa nhóm hàng */}
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
              treeData={formatCategoryOptions(treeData)}
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
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={3} placeholder="Mô tả ngành hàng..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* 4. Modal Chuyển nhóm thủ công cho sản phẩm */}
      <Modal
        title="Chuyển sản phẩm sang nhóm khác"
        open={isMoveModalOpen}
        onCancel={() => {
          setIsMoveModalOpen(false);
          setProductToMove(null);
          setTargetCatId(null);
        }}
        onOk={handleMoveCategoryManual}
        okText="Chuyển ngay"
        cancelText="Hủy"
      >
        {productToMove && (
          <div style={{ marginBottom: 16 }}>
            <p>
              Sản phẩm: <strong>{productToMove.name}</strong> ({productToMove.sku})
            </p>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>
              Chọn nhóm hàng mới:
            </label>
            <TreeSelect
              style={{ width: "100%" }}
              treeData={formatCategoryOptions(treeData)}
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