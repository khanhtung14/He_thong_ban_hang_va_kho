export interface AgencyPriceListItem {
  sku: string;
  sale_price: number;
  floor_price: number;
}

export interface AgencyPriceList {
  id: number;
  code: string;
  version: number;
  customer_group: string;
  start_date?: string | null;
  end_date?: string | null;
  published?: boolean;
  items_count?: number;
  items?: AgencyPriceListItem[];
}

export interface Agency {
  id: number;
  code: string;
  name: string;
  tax_code?: string | null;
  taxCode?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  customer_group: string;
  customerGroup?: string;
  region?: string | null;
  regionId?: number | null;
  territory_id?: number | null;
  person_in_charge?: string | number | null;
  sales_rep_id?: number | null;
  salesRepId?: number | null;
  status: string;
  is_active: boolean;
  isActive?: boolean;
  is_locked?: boolean;
  isLocked?: boolean;
  lock_reason?: string | null;
  transactions_count: number;
  price_list?: AgencyPriceList | null;
  effective_price_list?: AgencyPriceList | null;
  created_at?: string;
  createdAt?: string;
}

export interface AgencyListParams {
  search?: string;
  keyword?: string;
  customer_group?: string;
  customerGroup?: string;
  region?: string;
  regionId?: number | string;
  is_active?: boolean;
  status?: string;
  sales_rep_id?: number | string;
  assignedRepId?: number | string;
  page?: number;
  limit?: number;
}

export interface AgencyPagination {
  page: number;
  limit: number;
  totalRecords: number;
  totalPages: number;
  total_records?: number;
  total_pages?: number;
  total?: number;
}

export interface AgencyListResponse {
  success?: boolean;
  code?: number;
  message?: string;
  data: Agency[];
  pagination?: AgencyPagination;
}

export interface AgencyCreatePayload {
  code: string;
  name: string;
  tax_code?: string | null;
  customer_group: string;
  region?: string | null;
  person_in_charge?: string | number | null;
  sales_rep_id?: number | null;
  salesRepId?: number | null;
  assigned_sales_id?: number | null;
  status?: string;
  is_active?: boolean;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

export interface AgencyUpdatePayload {
  code?: string;
  name?: string;
  tax_code?: string | null;
  customer_group?: string;
  region?: string | null;
  person_in_charge?: string | number | null;
  sales_rep_id?: number | null;
  salesRepId?: number | null;
  assigned_sales_id?: number | null;
  status?: string;
  is_active?: boolean;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

export interface SalesRepUser {
  id: number;
  username: string;
  full_name: string;
  email: string;
  phone?: string;
  role?: string;
}
