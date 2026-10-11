import { useEffect, useState } from "react";
import { authenticatedFetch } from "./session";

interface CategoryNode {
  id: number;
  code: string;
  name: string;
  parent_id: number | null;
  description: string | null;
  level: number;
  products_count: number;
  children: CategoryNode[];
}

interface FlatCategory {
  id: number;
  code: string;
  name: string;
  parent_id: number | null;
  parent_name: string | null;
  level: number;
  products_count: number;
}

interface ProductItem {
  sku: string;
  name: string;
  category: string;
  category_id: number;
  sale_price: number;
  stock_available: number;
  unit: string;
  cost_price?: number;
  margin?: string;
}

/**
 * Lấy vai trò người dùng từ JWT token được lưu trong sessionStorage.
 */
function getUserRoleFromSession(): string | null {
  try {
    const storedRole =
      window.sessionStorage.getItem("role") ||
      window.sessionStorage.getItem("user_role") ||
      window.sessionStorage.getItem("role_code");
    if (storedRole) return storedRole.trim();

    const token =
      window.sessionStorage.getItem("session_token") ||
      window.sessionStorage.getItem("access_token");
    if (token) {
      const parts = token.split(".");
      if (parts.length >= 2) {
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split("")
            .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
            .join("")
        );
        const parsed = JSON.parse(jsonPayload);
        return parsed.role || parsed.role_code || null;
      }
    }
  } catch {
    // Bỏ qua lỗi giải mã token
  }
  return null;
}

/**
 * Kiểm tra người dùng có quyền quản trị/quản lý danh mục (Sales Manager hoặc Admin) hay không.
 */
function canManageCategories(role: string | null): boolean {
  if (!role) return false;
  const clean = role.toLowerCase().replace(/[-_ ]/g, "");
  return clean === "salesmanager" || clean === "admin" || clean === "administrator";
}

export default function Categories() {
  const [treeData, setTreeData] = useState<CategoryNode[]>([]);
  const [flatCategories, setFlatCategories] = useState<FlatCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategoryNode | null>(null);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [alertMessage, setAlertMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Vai trò người dùng từ phiên làm việc thực tế
  const [userRole, setUserRole] = useState<string | null>(() => getUserRoleFromSession());
  const isWritable = canManageCategories(userRole);

  // Trạng thái modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);

  // Dữ liệu biểu mẫu
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    parent_id: "" as string | number,
    description: "",
  });
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [targetCategoryId, setTargetCategoryId] = useState<number | "">("");

  const showAlert = (text: string, type: "success" | "error" = "error") => {
    setAlertMessage({ text, type });
    setTimeout(() => setAlertMessage(null), 5000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [treeRes, flatRes] = await Promise.all([
        authenticatedFetch("/api/v1/categories/tree"),
        authenticatedFetch("/api/v1/categories"),
      ]);

      if (treeRes.ok) {
        const treeJson = await treeRes.json();
        setTreeData(treeJson);
        // Mặc định chọn nhóm con đầu tiên hoặc gốc nếu chưa chọn
        if (!selectedCategory && treeJson.length > 0) {
          const firstCat = treeJson[0].children?.[0]?.children?.[0] || treeJson[0];
          setSelectedCategory(firstCat);
        }
      }

      if (flatRes.ok) {
        const flatJson = await flatRes.json();
        setFlatCategories(flatJson);
      }
    } catch {
      showAlert("Không thể tải danh mục nhóm hàng.", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadProductsForCategory = async (categoryId: number) => {
    try {
      const res = await authenticatedFetch(`/api/v1/products?category_id=${categoryId}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      } else {
        setProducts([]);
      }
    } catch {
      setProducts([]);
    }
  };

  // Đồng bộ phiên người dùng từ endpoint navigation khi khởi tạo
  useEffect(() => {
    authenticatedFetch("/api/v1/navigation/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user?.role_code) {
          setUserRole(data.user.role_code);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      loadProductsForCategory(selectedCategory.id);
    } else {
      setProducts([]);
    }
  }, [selectedCategory]);

  // Thao tác biểu mẫu
  const handleOpenAdd = (parentId: number | null = null) => {
    if (!isWritable) return;
    setFormData({
      code: "",
      name: "",
      parent_id: parentId !== null ? parentId : "",
      description: "",
    });
    setShowAddModal(true);
  };

  const handleOpenEdit = (node: CategoryNode) => {
    if (!isWritable) return;
    setFormData({
      code: node.code,
      name: node.name,
      parent_id: node.parent_id !== null ? node.parent_id : "",
      description: node.description || "",
    });
    setShowEditModal(true);
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isWritable) return;

    try {
      const payload = {
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        parent_id: formData.parent_id !== "" ? Number(formData.parent_id) : null,
        description: formData.description.trim() || null,
      };

      const res = await authenticatedFetch("/api/v1/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        showAlert(data.detail || "Không thể tạo nhóm hàng", "error");
        return;
      }

      showAlert("Tạo nhóm hàng mới thành công!", "success");
      setShowAddModal(false);
      await loadData();
    } catch {
      showAlert("Lỗi kết nối khi tạo nhóm hàng.", "error");
    }
  };

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isWritable || !selectedCategory) return;

    try {
      const payload = {
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        parent_id: formData.parent_id !== "" ? Number(formData.parent_id) : null,
        description: formData.description.trim() || null,
      };

      const res = await authenticatedFetch(`/api/v1/categories/${selectedCategory.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        showAlert(data.detail || "Không thể cập nhật nhóm hàng", "error");
        return;
      }

      showAlert("Cập nhật nhóm hàng thành công!", "success");
      setShowEditModal(false);
      await loadData();
    } catch {
      showAlert("Lỗi kết nối khi cập nhật nhóm hàng.", "error");
    }
  };

  const handleDeleteCategory = async (categoryId: number, categoryName: string) => {
    if (!isWritable) return;
    if (!confirm(`Bạn có chắc chắn muốn xóa nhóm hàng "${categoryName}"?`)) return;

    try {
      const res = await authenticatedFetch(`/api/v1/categories/${categoryId}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        // Hiển thị trực tiếp lỗi từ backend (AC 3 & Safety Rule)
        showAlert(data.detail || "Không thể xóa nhóm hàng.", "error");
        return;
      }

      showAlert("Xóa nhóm hàng thành công!", "success");
      if (selectedCategory?.id === categoryId) {
        setSelectedCategory(null);
      }
      await loadData();
    } catch {
      showAlert("Lỗi kết nối khi xóa nhóm hàng.", "error");
    }
  };

  const handleOpenMoveProduct = (product: ProductItem) => {
    if (!isWritable) return;
    setSelectedProduct(product);
    setTargetCategoryId(product.category_id || "");
    setShowMoveModal(true);
  };

  const handleMoveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isWritable || !selectedProduct || targetCategoryId === "") return;

    try {
      const res = await authenticatedFetch(`/api/v1/products/${selectedProduct.sku}/category`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_category_id: Number(targetCategoryId) }),
      });

      const data = await res.json();
      if (!res.ok) {
        showAlert(data.detail || "Không thể chuyển nhóm sản phẩm.", "error");
        return;
      }

      showAlert(data.message || "Chuyển nhóm sản phẩm thành công!", "success");
      setShowMoveModal(false);
      await loadData();
      if (selectedCategory) {
        await loadProductsForCategory(selectedCategory.id);
      }
    } catch {
      showAlert("Lỗi kết nối khi chuyển nhóm sản phẩm.", "error");
    }
  };

  // Render nút cây danh mục đệ quy
  const renderTreeNode = (node: CategoryNode) => {
    const isSelected = selectedCategory?.id === node.id;
    const badgeText = node.level === 1 ? "Cấp 1" : node.level === 2 ? "Cấp 2" : `Cấp ${node.level}`;
    const badgeClass = node.level === 1 ? "badge-level-1" : node.level === 2 ? "badge-level-2" : "badge-level-3";

    return (
      <div key={node.id} className="tree-node-wrapper">
        <div
          className={`tree-node-row ${isSelected ? "selected" : ""}`}
          onClick={() => setSelectedCategory(node)}
        >
          <div className="node-info">
            <span className={`node-badge ${badgeClass}`}>{badgeText}</span>
            <span className="node-name">{node.name}</span>
            <span className="node-code">({node.code})</span>
            <span className="node-count" title="Số sản phẩm trực thuộc">
              {node.products_count} SP
            </span>
          </div>

          {/* Các nút thao tác chỉ hiển thị với vai trò có quyền ghi */}
          {isWritable && (
            <div className="node-actions" onClick={(e) => e.stopPropagation()}>
              <button
                className="btn-icon"
                title="Thêm nhóm con"
                onClick={() => handleOpenAdd(node.id)}
              >
                +
              </button>
              <button
                className="btn-icon"
                title="Sửa nhóm hàng"
                onClick={() => {
                  setSelectedCategory(node);
                  handleOpenEdit(node);
                }}
              >
                ✎
              </button>
              <button
                className="btn-icon btn-danger"
                title="Xóa nhóm hàng"
                onClick={() => handleDeleteCategory(node.id, node.name)}
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {node.children && node.children.length > 0 && (
          <div className="tree-children">
            {node.children.map((child) => renderTreeNode(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="categories-app">
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Inter, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; }
        .categories-app { min-height: 100vh; display: flex; flex-direction: column; }

        .header {
          height: 64px; background: #fff; border-bottom: 1px solid #e2e8f0;
          display: flex; align-items: center; justify-content: space-between; padding: 0 20px;
          position: sticky; top: 0; z-index: 20;
        }
        .header-title { font-size: 17px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 8px; }
        .header-right { display: flex; align-items: center; gap: 12px; }
        .user-role-badge { font-size: 13px; color: #475569; background: #f1f5f9; padding: 5px 12px; border-radius: 6px; border: 1px solid #e2e8f0; }
        .btn-link { font-size: 13px; color: #2563eb; text-decoration: none; font-weight: 600; padding: 6px 12px; }

        .alert-banner {
          padding: 12px 20px; font-size: 14px; font-weight: 500; display: flex; justify-content: space-between; align-items: center;
        }
        .alert-error { background: #fef2f2; color: #b91c1c; border-bottom: 1px solid #fecaca; }
        .alert-success { background: #f0fdf4; color: #15803d; border-bottom: 1px solid #bbf7d0; }

        .main-container {
          flex: 1; display: grid; grid-template-columns: 380px 1fr; gap: 20px; padding: 20px; max-width: 1400px; width: 100%; margin: 0 auto;
        }
        @media (max-width: 860px) {
          .main-container { grid-template-columns: 1fr; }
        }

        .panel {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
          display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .panel-header {
          padding: 16px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;
          display: flex; justify-content: space-between; align-items: center; gap: 10px;
        }
        .panel-title { font-size: 15px; font-weight: 700; color: #0f172a; }

        .btn-primary {
          background: #2563eb; color: #fff; border: none; border-radius: 6px; padding: 8px 14px;
          font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s; white-space: nowrap;
        }
        .btn-primary:hover { background: #1d4ed8; }

        .tree-container { padding: 12px; overflow-y: auto; max-height: calc(100vh - 200px); }
        .tree-node-wrapper { margin-bottom: 4px; }
        .tree-node-row {
          display: flex; justify-content: space-between; align-items: center; padding: 8px 12px;
          border-radius: 8px; cursor: pointer; transition: background 0.15s; border: 1px solid transparent;
        }
        .tree-node-row:hover { background: #f1f5f9; }
        .tree-node-row.selected { background: #eff6ff; border-color: #bfdbfe; }

        .node-info { display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden; }
        .node-name { font-size: 14px; font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .node-code { font-size: 12px; color: #64748b; font-family: monospace; }
        .node-count { font-size: 11px; background: #e2e8f0; color: #334155; padding: 2px 6px; border-radius: 4px; font-weight: 600; }

        .node-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; }
        .badge-level-1 { background: #dbeafe; color: #1e40af; }
        .badge-level-2 { background: #e0e7ff; color: #3730a3; }
        .badge-level-3 { background: #fef3c7; color: #92400e; }

        .node-actions { display: flex; gap: 4px; margin-left: 8px; }
        .btn-icon {
          width: 28px; height: 28px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff;
          cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 13px; color: #475569;
        }
        .btn-icon:hover { background: #f1f5f9; color: #0f172a; }
        .btn-icon.btn-danger:hover { background: #fee2e2; border-color: #fca5a5; color: #dc2626; }

        .tree-children { margin-left: 20px; padding-left: 12px; border-left: 2px solid #e2e8f0; margin-top: 4px; }

        /* Bảng sản phẩm */
        .table-responsive { overflow-x: auto; padding: 16px; }
        .table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .table th { text-align: left; padding: 10px 12px; background: #f8fafc; color: #475569; font-weight: 600; border-bottom: 1px solid #e2e8f0; }
        .table td { padding: 12px; border-bottom: 1px solid #f1f5f9; color: #1e293b; }
        .table tr:hover td { background: #fafafa; }
        .btn-change-group {
          background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; border-radius: 6px;
          padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer;
        }
        .btn-change-group:hover { background: #dbeafe; }

        .empty-state { padding: 48px 20px; text-align: center; color: #64748b; font-size: 14px; }

        /* Hộp thoại Modal */
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(15,23,42,0.5); z-index: 50;
          display: flex; align-items: center; justify-content: center; padding: 16px;
        }
        .modal-box {
          background: #fff; border-radius: 12px; width: 100%; max-width: 480px;
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); overflow: hidden;
        }
        .modal-header {
          padding: 16px 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;
        }
        .modal-title { font-size: 16px; font-weight: 700; color: #0f172a; }
        .btn-modal-close { border: none; background: transparent; cursor: pointer; font-size: 16px; color: #64748b; }
        .modal-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
        .form-group { display: flex; flex-direction: column; gap: 6px; }
        .form-group label { font-size: 13px; font-weight: 600; color: #334155; }
        .form-control {
          padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; outline: none;
        }
        .form-control:focus { border-color: #2563eb; }
        .modal-footer {
          padding: 14px 20px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px;
        }
        .btn-secondary {
          background: #fff; border: 1px solid #cbd5e1; color: #475569; border-radius: 6px; padding: 8px 14px;
          font-size: 13px; font-weight: 600; cursor: pointer;
        }
        @media (max-width: 360px) {
          .header { padding: 0 10px; height: 56px; }
          .header-title { font-size: 14px; }
          .main-container { padding: 10px; gap: 12px; }
          .panel-header { padding: 12px; flex-direction: column; align-items: flex-start; }
          .tree-children { margin-left: 10px; padding-left: 8px; }
        }
      `}</style>

      {/* Thanh tiêu đề đầu trang */}
      <header className="header">
        <div className="header-title">
          <span>📦 Quản Lý Nhóm Hàng Nhiều Cấp (SCRUM-76)</span>
        </div>
        <div className="header-right">
          {userRole && (
            <span className="user-role-badge">
              Vai trò: <strong>{userRole}</strong> {isWritable ? "(Toàn quyền)" : "(Chỉ xem)"}
            </span>
          )}
          <a href="/navigation" className="btn-link">← Quay về Menu</a>
        </div>
      </header>

      {/* Thông báo Alert */}
      {alertMessage && (
        <div className={`alert-banner ${alertMessage.type === "error" ? "alert-error" : "alert-success"}`}>
          <span>{alertMessage.text}</span>
          <button
            style={{ border: "none", background: "transparent", cursor: "pointer", fontWeight: 700 }}
            onClick={() => setAlertMessage(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Khung nội dung chính */}
      <main className="main-container">
        {/* Khung trái: Cây phân cấp nhóm hàng */}
        <section className="panel" aria-label="Cây phân cấp nhóm hàng">
          <div className="panel-header">
            <h2 className="panel-title">Cây Phân Cấp (Tối thiểu 3 Cấp)</h2>
            {isWritable && (
              <button className="btn-primary" onClick={() => handleOpenAdd(null)}>
                + Thêm Ngành Hàng
              </button>
            )}
          </div>
          <div className="tree-container">
            {loading && treeData.length === 0 ? (
              <div className="empty-state">Đang tải cây nhóm hàng...</div>
            ) : treeData.length === 0 ? (
              <div className="empty-state">Chưa có nhóm hàng nào. Bấm nút phía trên để tạo.</div>
            ) : (
              treeData.map((node) => renderTreeNode(node))
            )}
          </div>
        </section>

        {/* Khung phải: Danh sách sản phẩm thuộc nhóm */}
        <section className="panel" aria-label="Danh sách sản phẩm thuộc nhóm">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">
                {selectedCategory ? `Sản phẩm thuộc nhóm: ${selectedCategory.name}` : "Vui lòng chọn một nhóm hàng"}
              </h2>
              {selectedCategory && (
                <span style={{ fontSize: "12px", color: "#64748b" }}>
                  Mã nhóm: <strong>{selectedCategory.code}</strong> • Cấp độ: <strong>Cấp {selectedCategory.level}</strong>
                </span>
              )}
            </div>
            {isWritable && selectedCategory && (
              <button
                className="btn-primary"
                style={{ background: "#475569" }}
                onClick={() => handleOpenAdd(selectedCategory.id)}
              >
                + Thêm Nhóm Con
              </button>
            )}
          </div>

          <div className="table-responsive">
            {selectedCategory ? (
              products.length > 0 ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Mã SKU</th>
                      <th>Tên sản phẩm</th>
                      <th>Đơn vị tính</th>
                      <th>Tồn kho</th>
                      <th>Giá bán</th>
                      {isWritable && <th style={{ textAlign: "right" }}>Thao tác</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.sku}>
                        <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{p.sku}</td>
                        <td>{p.name}</td>
                        <td>{p.unit}</td>
                        <td>{p.stock_available}</td>
                        <td>{Number(p.sale_price).toLocaleString("vi-VN")} đ</td>
                        {isWritable && (
                          <td style={{ textAlign: "right" }}>
                            <button
                              className="btn-change-group"
                              onClick={() => handleOpenMoveProduct(p)}
                            >
                              Đổi nhóm
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">
                  Nhóm hàng này hiện chưa có sản phẩm nào.
                  <br />
                  <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                    (Nhóm rỗng sản phẩm đủ điều kiện xóa nếu không còn nhóm con trực thuộc)
                  </span>
                </div>
              )
            ) : (
              <div className="empty-state">Click chọn một nhóm hàng ở cây bên trái để xem sản phẩm.</div>
            )}
          </div>
        </section>
      </main>

      {/* Modal: Thêm nhóm hàng (chỉ cho Sales Manager / Admin) */}
      {isWritable && showAddModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h3 className="modal-title">Thêm Nhóm Hàng Mới</h3>
              <button className="btn-modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateCategory}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Mã nhóm hàng (Unique):</label>
                  <input
                    className="form-control"
                    required
                    placeholder="Ví dụ: NGK, ENERGY, CAFE..."
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Tên nhóm hàng:</label>
                  <input
                    className="form-control"
                    required
                    placeholder="Ví dụ: Nước giải khát, Nước tăng lực..."
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Trực thuộc nhóm cha:</label>
                  <select
                    className="form-control"
                    value={formData.parent_id}
                    onChange={(e) => setFormData({ ...formData, parent_id: e.target.value })}
                  >
                    <option value="">-- Là Ngành Hàng Gốc (Cấp 1) --</option>
                    {flatCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {`Cấp ${c.level} - ${c.name} (${c.code})`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Mô tả:</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    placeholder="Ghi chú về nhóm hàng..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>Hủy</button>
                <button type="submit" className="btn-primary">Tạo Mới</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Sửa nhóm hàng (chỉ cho Sales Manager / Admin) */}
      {isWritable && showEditModal && selectedCategory && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h3 className="modal-title">Cập Nhật Nhóm Hàng</h3>
              <button className="btn-modal-close" onClick={() => setShowEditModal(false)}>✕</button>
            </div>
            <form onSubmit={handleUpdateCategory}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Mã nhóm hàng:</label>
                  <input
                    className="form-control"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Tên nhóm hàng:</label>
                  <input
                    className="form-control"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Nhóm cha (Chống tạo vòng lặp):</label>
                  <select
                    className="form-control"
                    value={formData.parent_id}
                    onChange={(e) => setFormData({ ...formData, parent_id: e.target.value })}
                  >
                    <option value="">-- Là Ngành Hàng Gốc (Cấp 1) --</option>
                    {flatCategories
                      .filter((c) => c.id !== selectedCategory.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {`Cấp ${c.level} - ${c.name} (${c.code})`}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Mô tả:</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowEditModal(false)}>Hủy</button>
                <button type="submit" className="btn-primary">Lưu Thay Đổi</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Đổi nhóm cho sản phẩm (chỉ cho Sales Manager / Admin) */}
      {isWritable && showMoveModal && selectedProduct && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h3 className="modal-title">Chuyển Sản Phẩm Sang Nhóm Mới</h3>
              <button className="btn-modal-close" onClick={() => setShowMoveModal(false)}>✕</button>
            </div>
            <form onSubmit={handleMoveProduct}>
              <div className="modal-body">
                <div style={{ padding: "10px", background: "#f8fafc", borderRadius: "6px", fontSize: "13px" }}>
                  <div>Mã SKU: <strong>{selectedProduct.sku}</strong></div>
                  <div>Tên: <strong>{selectedProduct.name}</strong></div>
                  <div>Nhóm hiện tại: <span style={{ color: "#2563eb", fontWeight: 600 }}>{selectedProduct.category}</span></div>
                </div>

                <div className="form-group">
                  <label>Chọn nhóm hàng đích:</label>
                  <select
                    className="form-control"
                    required
                    value={targetCategoryId}
                    onChange={(e) => setTargetCategoryId(Number(e.target.value))}
                  >
                    <option value="">-- Chọn nhóm hàng đích --</option>
                    {flatCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {`Cấp ${c.level} - ${c.name} (${c.code})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowMoveModal(false)}>Hủy</button>
                <button type="submit" className="btn-primary">Xác Nhận Chuyển</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
