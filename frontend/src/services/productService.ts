/**
 * Product Management Service (SCRUM-75 & SCRUM-76)
 * Handles API calls for products and category meta.
 */

import { authenticatedFetch } from "./sessionService";

export interface ProductItem {
  id: number;
  sku: string;
  name: string;
  categoryId?: number | null;
  category_id?: number | null;
  category?: string | null;
  baseUnit?: string;
  unit?: string;
  description?: string;
  packaging_spec?: string;
  basePrice?: number;
  sale_price?: number;
  costPrice?: number | null;
  cost_price?: number | null;
  margin?: string | null;
  minStock?: number;
  manageByLot?: boolean;
  status: string; // "ACTIVE" | "DISCONTINUED"
  imageUrl?: string | null;
  image_url?: string | null;
  has_transactions?: boolean;
}

export interface ProductListParams {
  keyword?: string;
  categoryId?: number | null;
  status?: string;
  page?: number;
  limit?: number;
}

export interface ProductListResult {
  items: ProductItem[];
  total: number;
  page?: number;
  limit?: number;
}

export interface ProductCreatePayload {
  sku: string;
  name: string;
  categoryId?: number | null;
  baseUnit: string;
  basePrice?: number;
  costPrice?: number;
  minStock?: number;
  manageByLot?: boolean;
  imageUrl?: string;
  status?: string;
  description?: string;
}

export interface ProductUpdatePayload {
  name?: string;
  categoryId?: number | null;
  baseUnit?: string;
  basePrice?: number;
  costPrice?: number;
  minStock?: number;
  manageByLot?: boolean;
  imageUrl?: string;
  status?: string;
  description?: string;
}

export interface CategoryOption {
  id: number;
  name: string;
  code?: string;
  children?: CategoryOption[];
}

/**
 * Lấy danh sách sản phẩm theo bộ lọc (keyword, categoryId, status, phân trang)
 */
export async function fetchProducts(
  params: ProductListParams = {},
): Promise<ProductListResult> {
  const query = new URLSearchParams();
  if (params.keyword?.trim()) {
    query.append("keyword", params.keyword.trim());
  }
  if (params.categoryId !== undefined && params.categoryId !== null) {
    query.append("categoryId", String(params.categoryId));
  }
  if (params.status && params.status !== "ALL") {
    query.append("status", params.status);
  }
  if (params.page !== undefined && params.limit !== undefined) {
    query.append("page", String(params.page));
    query.append("limit", String(params.limit));
  }

  const queryString = query.toString();
  const url = `/api/v1/products${queryString ? `?${queryString}` : ""}`;
  const response = await authenticatedFetch(url);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || errorData.message || "Không thể tải danh sách sản phẩm.",
    );
  }

  const json = await response.json();
  if (json && json.data && Array.isArray(json.data)) {
    return {
      items: json.data,
      total: json.pagination?.totalRecords || json.data.length,
      page: json.pagination?.page,
      limit: json.pagination?.limit,
    };
  }

  if (Array.isArray(json)) {
    return {
      items: json,
      total: json.length,
    };
  }

  return {
    items: [],
    total: 0,
  };
}

/**
 * Lấy chi tiết sản phẩm theo ID hoặc SKU
 */
export async function fetchProductDetail(
  idOrSku: string | number,
): Promise<ProductItem> {
  const response = await authenticatedFetch(`/api/v1/products/${idOrSku}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || errorData.message || "Không tìm thấy thông tin sản phẩm.",
    );
  }
  return response.json();
}

/**
 * Tạo sản phẩm mới thủ công
 */
export async function createProduct(
  payload: ProductCreatePayload,
): Promise<ProductItem> {
  const response = await authenticatedFetch("/api/v1/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const err = new Error(
      errorData.detail || errorData.message || "Tạo sản phẩm thất bại.",
    );
    (err as any).status = response.status;
    throw err;
  }

  const resJson = await response.json();
  return resJson.data || resJson;
}

/**
 * Cập nhật thông tin sản phẩm
 */
export async function updateProduct(
  idOrSku: string | number,
  payload: ProductUpdatePayload,
): Promise<ProductItem> {
  const response = await authenticatedFetch(`/api/v1/products/${idOrSku}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const err = new Error(
      errorData.detail || errorData.message || "Cập nhật sản phẩm thất bại.",
    );
    (err as any).status = response.status;
    throw err;
  }

  const resJson = await response.json();
  return resJson.data || resJson;
}

/**
 * Xóa sản phẩm khỏi hệ thống
 */
export async function deleteProduct(
  idOrSku: string | number,
): Promise<{ success: boolean; message: string; sku?: string }> {
  const response = await authenticatedFetch(`/api/v1/products/${idOrSku}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const err = new Error(
      errorData.detail || errorData.message || "Xóa sản phẩm thất bại.",
    );
    (err as any).status = response.status;
    throw err;
  }

  return response.json();
}

/**
 * Đổi trạng thái kinh doanh của sản phẩm
 */
export async function updateProductStatus(
  idOrSku: string | number,
  status: "ACTIVE" | "DISCONTINUED",
): Promise<{ success: boolean; message: string; status: string }> {
  const response = await authenticatedFetch(`/api/v1/products/${idOrSku}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const err = new Error(
      errorData.detail || errorData.message || "Cập nhật trạng thái thất bại.",
    );
    (err as any).status = response.status;
    throw err;
  }

  return response.json();
}

/**
 * Lấy danh sách nhóm hàng (hỗ trợ chọn danh mục dạng select hoặc tree select)
 */
export async function fetchCategoriesTree(): Promise<CategoryOption[]> {
  try {
    const response = await authenticatedFetch("/api/v1/categories/tree");
    if (!response.ok) {
      // Fallback nếu tree không có
      const flatRes = await authenticatedFetch("/api/v1/categories");
      if (flatRes.ok) {
        return flatRes.json();
      }
      return [];
    }
    return response.json();
  } catch {
    return [];
  }
}
