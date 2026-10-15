export interface Supplier {
  id: number;
  code: string;
  name: string;
  taxCode?: string | null;
  tax_code?: string | null;
  contactPerson?: string | null;
  contact_person?: string | null;
  paymentTerms?: string | null;
  payment_terms?: string | null;
  isActive: boolean;
  is_active?: boolean;
  phone?: string | null;
  address?: string | null;
  status?: string;
  receiptsCount?: number;
  receipts_count?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SupplierPayload {
  code: string;
  name: string;
  tax_code?: string;
  contact_person?: string;
  payment_terms?: string;
  is_active?: boolean;
  phone?: string;
  address?: string;
}

export interface SupplierListParams {
  search?: string;
  is_active?: boolean;
  page?: number;
  limit?: number;
}

export interface SupplierListResponse {
  success: boolean;
  code: number;
  message: string;
  data: Supplier[];
  pagination: {
    page: number;
    limit: number;
    totalRecords?: number;
    total_records?: number;
    totalPages?: number;
    total_pages?: number;
  };
}
