import React, { useState, useEffect, useCallback } from "react";
import {
  Modal,
  Form,
  Select,
  Input,
  InputNumber,
  Button,
  Table,
  Typography,
  Alert,
  Card,
  Tag,
  message,
  Tooltip,
  Checkbox,
  Divider,
  Space,
  Spin,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  DeleteOutlined,
  EnvironmentOutlined,
  ShoppingOutlined,
  WarningOutlined,
  UserOutlined,
  PhoneOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import {
  fetchDeliveryAddresses,
  createDeliveryAddress,
  createOrder,
  updateOrder,
  fetchDealerPurchaseHistory,
  calculateBestDiscount,
  type CustomerItem,
  type DeliveryAddressItem,
  type OrderItemInput,
  type CreateOrderPayload,
  type OrderResponseItem,
  type DealerPurchaseHistoryItem,
} from "../services/apiClient";
import { authenticatedFetch } from "../services/sessionService";

const { Text } = Typography;
const { Option } = Select;

export interface ProductOptionItem {
  id: number;
  sku: string;
  name: string;
  sale_price?: number;
  basePrice?: number;
  unit?: string;
  baseUnit?: string;
  stock_available?: number;
  stock?: number;
  available_quantity?: number;
  available_qty?: number;
  availableQuantity?: number;
  reserved_quantity?: number;
  status?: string;
}

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: CustomerItem[];
  preselectedCustomerId?: number | null;
  onOrderCreated?: () => void;
  editingOrder?: OrderResponseItem | null;
}

interface OrderItemRow extends OrderItemInput {
  key: string;
  unit?: string;
  available_quantity?: number;
  discount_percent?: number;
  discount_amount?: number;
  applied_policy_name?: string;
  line_subtotal?: number;
  line_total?: number;
}

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({
  isOpen,
  onClose,
  customers,
  preselectedCustomerId,
  onOrderCreated,
  editingOrder,
}) => {
  const [form] = Form.useForm();
  const [addressForm] = Form.useForm();
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem | null>(null);
  const [deliveryAddresses, setDeliveryAddresses] = useState<DeliveryAddressItem[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [isAddAddressModalOpen, setIsAddAddressModalOpen] = useState(false);
  const [submittingAddress, setSubmittingAddress] = useState(false);

  // Danh mục sản phẩm load từ API
  const [products, setProducts] = useState<ProductOptionItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Danh sách dòng sản phẩm trong đơn hàng
  const [items, setItems] = useState<OrderItemRow[]>([
    { key: "1", sku: "", product_name: "", quantity: 1, unit_price: 0 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // SCRUM S4-04: Lịch sử mua hàng 3 tháng của đại lý
  const [historyItems, setHistoryItems] = useState<DealerPurchaseHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadPurchaseHistory = useCallback(async (dealerId: number) => {
    setLoadingHistory(true);
    try {
      const data = await fetchDealerPurchaseHistory(dealerId);
      setHistoryItems(data || []);
    } catch (err: unknown) {
      console.warn("Không thể tải lịch sử mua hàng của đại lý:", err);
      setHistoryItems([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // Gọi API lấy danh mục sản phẩm từ backend
  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const res = await authenticatedFetch("/api/v1/products");
      if (res.ok) {
        const json = await res.json();
        const list: ProductOptionItem[] = Array.isArray(json)
          ? json
          : json.data && Array.isArray(json.data)
            ? json.data
            : [];
        // Ưu tiên sản phẩm đang hoạt động ACTIVE
        const activeList = list.filter((p) => !p.status || p.status === "ACTIVE");
        setProducts(activeList.length > 0 ? activeList : list);
      }
    } catch (err: unknown) {
      console.error("Lỗi khi tải danh mục sản phẩm:", err);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const loadCustomerAddresses = useCallback(
    async (cust: CustomerItem) => {
      setSelectedCustomer(cust);
      setSelectedAddressId(null);
      setLoadingAddresses(true);
      loadPurchaseHistory(cust.id);
      try {
        const addrs = await fetchDeliveryAddresses(cust.id);
        setDeliveryAddresses(addrs);
        // Tự động chọn điểm giao hàng mặc định nếu có
        const defaultAddr = addrs.find((a) => a.is_default);
        if (defaultAddr) {
          setSelectedAddressId(defaultAddr.id);
          form.setFieldValue("delivery_address_id", defaultAddr.id);
        } else if (addrs.length > 0) {
          setSelectedAddressId(addrs[0].id);
          form.setFieldValue("delivery_address_id", addrs[0].id);
        } else {
          form.setFieldValue("delivery_address_id", undefined);
        }
      } catch (err: unknown) {
        console.error("Lỗi tải điểm giao hàng:", err);
        setDeliveryAddresses([]);
      } finally {
        setLoadingAddresses(false);
      }
    },
    [form]
  );

  useEffect(() => {
    let ignore = false;
    if (isOpen) {
      loadProducts();

      if (editingOrder) {
        // Chế độ chỉnh sửa đơn hàng
        const cust = customers.find((c) => c.id === editingOrder.customer_id) || null;
        if (cust) {
          setSelectedCustomer(cust);
          loadCustomerAddresses(cust);
        }
        form.setFieldsValue({
          customer_id: editingOrder.customer_id,
          delivery_address_id: editingOrder.delivery_address_id || undefined,
          note: editingOrder.note || "",
          submit_for_approval: editingOrder.status === "PENDING_APPROVAL",
        });
        setSelectedAddressId(editingOrder.delivery_address_id || null);

        if (editingOrder.items && editingOrder.items.length > 0) {
          setItems(
            editingOrder.items.map((it, idx) => ({
              key: String(it.id || idx + 1),
              sku: it.sku,
              product_name: it.product_name,
              quantity: it.quantity,
              unit_price: it.unit_price,
            }))
          );
        }
      } else {
        // Reset items về trạng thái sạch sẽ chờ chọn sản phẩm mới
        setItems([{ key: String(Date.now()), sku: "", product_name: "", quantity: 1, unit_price: 0 }]);

        const custId = preselectedCustomerId || (customers.length > 0 ? customers[0].id : null);
        if (custId) {
          const cust = customers.find((c) => c.id === custId);
          if (cust) {
            form.setFieldValue("customer_id", cust.id);
            loadPurchaseHistory(cust.id);
            fetchDeliveryAddresses(cust.id)
              .then((addrs) => {
                if (!ignore) {
                  setSelectedCustomer(cust);
                  setDeliveryAddresses(addrs);
                  const defaultAddr = addrs.find((a) => a.is_default);
                  if (defaultAddr) {
                    setSelectedAddressId(defaultAddr.id);
                    form.setFieldValue("delivery_address_id", defaultAddr.id);
                  } else if (addrs.length > 0) {
                    setSelectedAddressId(addrs[0].id);
                    form.setFieldValue("delivery_address_id", addrs[0].id);
                  } else {
                    form.setFieldValue("delivery_address_id", undefined);
                  }
                }
              })
              .catch((err: unknown) => {
                if (!ignore) {
                  console.error("Lỗi tải điểm giao hàng:", err);
                  setSelectedCustomer(cust);
                  setDeliveryAddresses([]);
                }
              });
          }
        }
      }
    }
    return () => {
      ignore = true;
    };
  }, [isOpen, preselectedCustomerId, editingOrder, customers, form, loadProducts, loadCustomerAddresses, loadPurchaseHistory]);

  const handleClose = () => {
    form.resetFields();
    addressForm.resetFields();
    setIsAddAddressModalOpen(false);
    setSelectedCustomer(null);
    setDeliveryAddresses([]);
    setHistoryItems([]);
    setSelectedAddressId(null);
    setErrorMsg(null);
    setItems([{ key: "1", sku: "", product_name: "", quantity: 1, unit_price: 0 }]);
    onClose();
  };

  const handleOpenAddAddressModal = () => {
    if (!selectedCustomer) {
      message.warning("Vui lòng chọn đại lý trước.");
      return;
    }
    addressForm.resetFields();
    addressForm.setFieldsValue({
      receiver_name: "",
      phone: "",
      address: "",
      note: "",
      is_default: deliveryAddresses.length === 0,
    });
    setIsAddAddressModalOpen(true);
  };

  const handleSaveDeliveryAddress = async () => {
    if (!selectedCustomer) return;
    try {
      const values = await addressForm.validateFields();
      setSubmittingAddress(true);
      const newAddr = await createDeliveryAddress(selectedCustomer.id, {
        receiver_name: values.receiver_name.trim(),
        receiverName: values.receiver_name.trim(),
        phone: values.phone.trim(),
        address: values.address.trim(),
        note: values.note ? values.note.trim() : undefined,
        is_default: Boolean(values.is_default),
        isDefault: Boolean(values.is_default),
      });

      message.success("Thêm điểm giao hàng thành công!");
      setIsAddAddressModalOpen(false);
      addressForm.resetFields();

      // Tự động gọi lại danh sách điểm giao của đại lý này để làm mới dropdown
      const freshAddrs = await fetchDeliveryAddresses(selectedCustomer.id);
      setDeliveryAddresses(freshAddrs);

      // Tự động gán (select) điểm giao vừa tạo làm giá trị được chọn hiện tại trên form lập đơn hàng
      setSelectedAddressId(newAddr.id);
      form.setFieldValue("delivery_address_id", newAddr.id);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "errorFields" in err) {
        return;
      }
      const msg = err instanceof Error ? err.message : "Không thể thêm điểm giao hàng.";
      message.error(msg);
    } finally {
      setSubmittingAddress(false);
    }
  };

  const handleCustomerChange = async (custId: number) => {
    const cust = customers.find((c) => c.id === custId);
    if (cust) {
      loadCustomerAddresses(cust);
      loadPurchaseHistory(cust.id);
      // Khi đổi đại lý, tự động cập nhật lại đơn giá và tồn khả dụng theo kho đại lý mới
      if (items.some((it) => it.sku)) {
        const updated = await Promise.all(
          items.map(async (it) => {
            if (!it.sku) return it;
            const prod = products.find((p) => p.sku === it.sku);
            let price = Number(prod?.sale_price ?? prod?.basePrice ?? it.unit_price ?? 0);
            let avail = it.available_quantity;

            if (cust.customer_group) {
              try {
                const res = await authenticatedFetch(
                  `/api/v1/price-lists/effective/${encodeURIComponent(it.sku)}?customer_group=${encodeURIComponent(
                    cust.customer_group
                  )}&fallback=true`
                );
                if (res.ok) {
                  const data = await res.json();
                  if (data && data.sale_price !== undefined && data.sale_price !== null) {
                    price = Number(data.sale_price);
                  }
                }
              } catch {
                // fallback to base_price
              }
            }

            try {
              const stockRes = await authenticatedFetch(
                `/api/v1/inventory/available-stock?sku=${encodeURIComponent(it.sku)}&customerId=${cust.id}`
              );
              if (stockRes.ok) {
                const sJson = await stockRes.json();
                const sData = sJson.data || sJson;
                if (sData) {
                  const val = Number(
                    sData.available_quantity ?? sData.availableQuantity ?? sData.availableQty ?? sData.available_qty
                  );
                  if (!isNaN(val)) avail = val;
                }
              }
            } catch {
              // keep existing
            }

            const clampedQty = avail !== undefined && avail > 0 ? Math.min(it.quantity || 1, avail) : it.quantity;
            return { ...it, unit_price: price, available_quantity: avail, quantity: clampedQty };
          })
        );
        setItems(updated);
      }
    }
  };

  // Thêm một dòng sản phẩm mới
  const handleAddItem = () => {
    const newKey = String(Date.now() + Math.random());
    setItems((prev) => [
      ...prev,
      { key: newKey, sku: "", product_name: "", quantity: 1, unit_price: 0 },
    ]);
  };

  // Xóa dòng sản phẩm
  const handleRemoveItem = (key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key));
  };

  // Xử lý khi chọn sản phẩm từ dropdown
  const handleSelectProduct = async (key: string, selectedSku: string) => {
    const prod = products.find((p) => p.sku === selectedSku);
    if (!prod) return;

    let price = Number(prod.sale_price ?? prod.basePrice ?? 0);
    const unit = prod.unit || prod.baseUnit || "";
    let availStock = Number(
      prod.available_quantity ?? prod.availableQuantity ?? prod.available_qty ?? prod.stock_available ?? prod.stock ?? 0
    );

    // Truy vấn thời gian thực tồn khả dụng từ API kho phục vụ đại lý
    if (selectedCustomer?.id) {
      try {
        const stockRes = await authenticatedFetch(
          `/api/v1/inventory/available-stock?sku=${encodeURIComponent(prod.sku)}&customerId=${selectedCustomer.id}`
        );
        if (stockRes.ok) {
          const sJson = await stockRes.json();
          const sData = sJson.data || sJson;
          if (sData) {
            const fetchedAvail = Number(
              sData.available_quantity ?? sData.availableQuantity ?? sData.availableQty ?? sData.available_qty
            );
            if (!isNaN(fetchedAvail)) {
              availStock = fetchedAvail;
            }
          }
        }
      } catch {
        // fallback to prod available_quantity
      }
    }

    // Ưu tiên tra cứu giá theo bảng giá của nhóm đại lý nếu có
    if (selectedCustomer?.customer_group) {
      try {
        const res = await authenticatedFetch(
          `/api/v1/price-lists/effective/${encodeURIComponent(prod.sku)}?customer_group=${encodeURIComponent(
            selectedCustomer.customer_group
          )}&fallback=true`
        );
        if (res.ok) {
          const priceData = await res.json();
          if (priceData && priceData.sale_price !== undefined && priceData.sale_price !== null) {
            price = Number(priceData.sale_price);
          }
        }
      } catch {
        // Tự động fallback về base_price niêm yết của sản phẩm
      }
    }

    // Chỉ hiển thị cảnh báo nhẹ nếu sản phẩm hoàn toàn không có giá nào trong hệ thống
    if (!price || price <= 0) {
      message.warning(
        `Sản phẩm [${prod.sku}] hiện chưa có giá nào trong hệ thống. Vui lòng nhập đơn giá thủ công.`
      );
    }

    setItems((prev) =>
      prev.map((it) => {
        if (it.key === key) {
          const targetQty = availStock > 0 ? Math.min(it.quantity || 1, availStock) : 1;
          return {
            ...it,
            sku: prod.sku,
            product_name: prod.name,
            unit_price: price,
            unit: unit,
            available_quantity: availStock,
            quantity: targetQty,
          };
        }
        return it;
      })
    );
  };

  // Thay đổi trường cụ thể (số lượng hoặc đơn giá)
  const handleItemChange = (key: string, field: keyof OrderItemRow, value: string | number) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key === key) {
          const updated = { ...it, [field]: value };
          if (field === "quantity") {
            const numVal = Number(value) || 0;
            if (it.available_quantity !== undefined && it.available_quantity >= 0 && numVal > it.available_quantity) {
              message.error(
                `Vượt quá số lượng hàng tồn khả dụng! Sản phẩm [${it.product_name || it.sku}] chỉ còn khả dụng tối đa ${it.available_quantity} ${it.unit || "đơn vị"}. Số lượng tối đa còn có thể đặt: ${it.available_quantity}.`
              );
            }
          }
          return updated;
        }
        return it;
      })
    );
  };

  // S4-04: Thêm một mặt hàng gợi ý từ lịch sử vào đơn
  const handleAddSingleSuggestion = (s: DealerPurchaseHistoryItem) => {
    let qty = Math.max(1, Math.round(s.avg_quantity));
    if (s.available_quantity !== undefined && s.available_quantity > 0 && s.available_quantity < qty) {
      qty = Math.floor(s.available_quantity);
    }
    const matchedProd = products.find(
      (p) => p.sku.toUpperCase() === s.sku.toUpperCase() || p.id === s.product_id
    );
    const unitPrice = s.last_price || Number(matchedProd?.sale_price ?? matchedProd?.basePrice ?? 0);
    const avail = s.available_quantity !== undefined ? s.available_quantity : (matchedProd?.available_quantity ?? matchedProd?.stock_available);

    setItems((prev) => {
      if (prev.length === 0 || (prev.length === 1 && !prev[0].sku && !prev[0].product_name)) {
        return [
          {
            key: String(Date.now()),
            sku: s.sku,
            product_name: s.product_name,
            quantity: qty,
            unit_price: unitPrice,
            unit: s.unit,
            available_quantity: avail,
          },
        ];
      }
      const existingIdx = prev.findIndex((it) => it.sku.toUpperCase() === s.sku.toUpperCase());
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = {
          ...next[existingIdx],
          quantity: qty,
          unit_price: next[existingIdx].unit_price || unitPrice,
          available_quantity: avail,
        };
        return next;
      }
      return [
        ...prev,
        {
          key: `${Date.now()}_${s.sku}`,
          sku: s.sku,
          product_name: s.product_name,
          quantity: qty,
          unit_price: unitPrice,
          unit: s.unit,
          available_quantity: avail,
        },
      ];
    });
    message.success(`Đã thêm [${s.product_name}] vào đơn hàng!`);
  };

  // S4-04: Thêm toàn bộ danh sách mặt hàng gợi ý vào đơn hàng
  const handleAddAllSuggestions = () => {
    if (historyItems.length === 0) return;

    const newRows: OrderItemRow[] = historyItems.map((s, idx) => {
      let qty = Math.max(1, Math.round(s.avg_quantity));
      if (s.available_quantity !== undefined && s.available_quantity > 0 && s.available_quantity < qty) {
        qty = Math.floor(s.available_quantity);
      }
      const matchedProd = products.find(
        (p) => p.sku.toUpperCase() === s.sku.toUpperCase() || p.id === s.product_id
      );
      const unitPrice = s.last_price || Number(matchedProd?.sale_price ?? matchedProd?.basePrice ?? 0);
      const avail = s.available_quantity !== undefined ? s.available_quantity : (matchedProd?.available_quantity ?? matchedProd?.stock_available);

      return {
        key: `${Date.now()}_${idx}_${s.sku}`,
        sku: s.sku,
        product_name: s.product_name,
        quantity: qty,
        unit_price: unitPrice,
        unit: s.unit,
        available_quantity: avail,
      };
    });

    setItems((prev) => {
      if (prev.length === 0 || (prev.length === 1 && !prev[0].sku && !prev[0].product_name)) {
        return newRows;
      }
      const existingSkus = new Set(prev.map((it) => it.sku.toUpperCase()));
      const itemsToAppend = newRows.filter((nr) => !existingSkus.has(nr.sku.toUpperCase()));
      if (itemsToAppend.length === 0) {
        const skuMap = new Map(newRows.map((nr) => [nr.sku.toUpperCase(), nr]));
        return prev.map((it) => {
          const matchingNew = skuMap.get(it.sku.toUpperCase());
          if (matchingNew) {
            return { ...it, quantity: matchingNew.quantity };
          }
          return it;
        });
      }
      return [...prev, ...itemsToAppend];
    });

    message.success(`Đã thêm ${historyItems.length} mặt hàng thường mua vào đơn hàng!`);
  };

  // Tự động tính toán chiết khấu sản lượng theo bậc nấc (Best Deal Rule)
  useEffect(() => {
    let isCancelled = false;
    const itemsKey = items.map((i) => `${i.sku}_${i.quantity}_${i.unit_price}`).join(",");

    const runDiscountCalculation = async () => {
      let hasChange = false;
      const updated = await Promise.all(
        items.map(async (it) => {
          if (!it.sku || (it.quantity || 0) <= 0) {
            const lineSub = (it.quantity || 0) * (it.unit_price || 0);
            return {
              ...it,
              discount_percent: 0,
              discount_amount: 0,
              applied_policy_name: undefined,
              line_subtotal: lineSub,
              line_total: lineSub,
            };
          }
          try {
            const disc = await calculateBestDiscount({
              sku: it.sku,
              quantity: it.quantity,
              base_price: it.unit_price || 0,
            });
            const lineSub = it.quantity * (it.unit_price || 0);
            const discAmt = Number(disc.discount_amount || 0);
            const discPct = disc.discount_type === "PERCENTAGE"
              ? Number(disc.discount_value || 0)
              : (lineSub > 0 ? (discAmt / lineSub) * 100 : 0);
            const policyName = disc.policy_name || undefined;
            const lineTot = Math.max(0, lineSub - discAmt);

            if (
              it.discount_amount !== discAmt ||
              it.line_total !== lineTot ||
              it.applied_policy_name !== policyName
            ) {
              hasChange = true;
            }

            return {
              ...it,
              discount_percent: discPct,
              discount_amount: discAmt,
              applied_policy_name: policyName,
              line_subtotal: lineSub,
              line_total: lineTot,
            };
          } catch {
            const lineSub = (it.quantity || 0) * (it.unit_price || 0);
            return {
              ...it,
              discount_percent: 0,
              discount_amount: 0,
              applied_policy_name: undefined,
              line_subtotal: lineSub,
              line_total: lineSub,
            };
          }
        })
      );

      if (!isCancelled && hasChange) {
        setItems(updated);
      }
    };

    const timer = setTimeout(runDiscountCalculation, 250);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [items.map((i) => `${i.sku}_${i.quantity}_${i.unit_price}`).join(",")]);

  const selectedAddress = deliveryAddresses.find((a) => a.id === selectedAddressId);
  // Tính toán tiền hàng tạm tính, tổng chiết khấu và tổng thanh toán
  const subtotalAmount = items.reduce(
    (sum, it) => sum + (it.quantity || 0) * (it.unit_price || 0),
    0
  );
  const totalDiscount = items.reduce(
    (sum, it) => sum + (it.discount_amount || 0),
    0
  );
  const totalAmount = Math.max(0, subtotalAmount - totalDiscount);
  const isCustomerLocked = selectedCustomer?.is_locked;

  // Xác nhận tạo đơn hàng
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (!selectedCustomer) {
        message.error("Vui lòng chọn đại lý đặt hàng.");
        return;
      }

      if (selectedCustomer.is_locked) {
        message.error("Đại lý đang bị khóa giao dịch, không thể lên đơn hàng!");
        return;
      }

      if (items.length === 0) {
        message.error("Vui lòng thêm ít nhất một sản phẩm.");
        return;
      }

      // Kiểm tra mọi dòng hàng đều đã chọn sản phẩm hợp lệ
      if (items.some((it) => !it.sku || !it.product_name)) {
        message.error("Vui lòng chọn sản phẩm cho tất cả các dòng hàng!");
        return;
      }

      // Kiểm tra chặn đặt vượt tồn khả dụng ngay trên giao diện
      for (const it of items) {
        if (it.available_quantity !== undefined) {
          if (it.available_quantity <= 0) {
            message.error(`Sản phẩm [${it.product_name || it.sku}] đã hết hàng trong kho (tồn khả dụng = 0)!`);
            return;
          }
          if (it.quantity > it.available_quantity) {
            message.error(
              `Vượt quá số lượng hàng tồn khả dụng! Sản phẩm [${it.product_name || it.sku}] chỉ còn khả dụng tối đa ${it.available_quantity} đơn vị. Số lượng tối đa còn có thể đặt: ${it.available_quantity}!`
            );
            return;
          }
        }
      }

      setSubmitting(true);
      setErrorMsg(null);

      const chosenAddressId = values.delivery_address_id || selectedAddressId || null;
      const isSubmitForApproval = values.submit_for_approval !== false;
      const payload: CreateOrderPayload = {
        customer_id: selectedCustomer.id,
        customerId: selectedCustomer.id,
        delivery_address_id: chosenAddressId,
        deliveryAddressId: chosenAddressId,
        items: items.map((it) => ({
          sku: it.sku,
          product_name: it.product_name,
          quantity: it.quantity,
          unit_price: it.unit_price,
        })),
        note: values.note ? values.note.trim() : undefined,
        status: isSubmitForApproval ? "PENDING_APPROVAL" : "DRAFT",
        submit_for_approval: isSubmitForApproval,
        submitForApproval: isSubmitForApproval,
      };

      if (editingOrder) {
        await updateOrder(editingOrder.id, payload);
        message.success(
          isSubmitForApproval
            ? "Cập nhật và đã gửi yêu cầu duyệt đơn hàng thành công!"
            : "Cập nhật đơn hàng thành công!"
        );
      } else {
        await createOrder(payload);
        message.success(
          isSubmitForApproval
            ? "Tạo đơn hàng thành công và đã gửi yêu cầu phê duyệt tới Quản lý kinh doanh!"
            : "Tạo đơn hàng thành công (Lưu nháp)!"
        );
      }
      if (onOrderCreated) onOrderCreated();
      handleClose();
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "errorFields" in err) return;
      const messageText = err instanceof Error ? err.message : "Tạo đơn hàng thất bại.";
      setErrorMsg(messageText);
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<OrderItemRow> = [
    {
      title: "MÃ SKU",
      dataIndex: "sku",
      key: "sku",
      width: 140,
      render: (val: string, r) => (
        <Select
          showSearch
          placeholder="Chọn mã SKU..."
          value={val || undefined}
          onChange={(selectedSku) => handleSelectProduct(r.key, selectedSku)}
          filterOption={(input, option) => {
            const label = String(option?.label || "");
            return label.toLowerCase().includes(input.toLowerCase());
          }}
          options={products.map((p) => ({
            value: p.sku,
            label: p.sku,
          }))}
          size="small"
          loading={loadingProducts}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "TÊN SẢN PHẨM",
      dataIndex: "sku",
      key: "product_name",
      width: 220,
      render: (val: string, r) => (
        <Select
          showSearch
          placeholder="Chọn tên sản phẩm..."
          value={val || undefined}
          onChange={(selectedSku) => handleSelectProduct(r.key, selectedSku)}
          filterOption={(input, option) => {
            const label = String(option?.label || "");
            return label.toLowerCase().includes(input.toLowerCase());
          }}
          options={products.map((p) => {
            const unitText = p.unit || p.baseUnit ? ` (${p.unit || p.baseUnit})` : "";
            return {
              value: p.sku,
              label: `${p.name}${unitText}`,
            };
          })}
          size="small"
          loading={loadingProducts}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "ĐVT",
      dataIndex: "unit",
      key: "unit",
      width: 75,
      align: "center",
      render: (val: string) =>
        val ? (
          <Tag color="cyan" style={{ margin: 0, fontWeight: 600, borderRadius: 4 }}>
            {val}
          </Tag>
        ) : (
          <span style={{ color: "#94a3b8" }}>—</span>
        ),
    },
    {
      title: "TỒN KHẢ DỤNG",
      dataIndex: "available_quantity",
      key: "available_quantity",
      width: 115,
      align: "center",
      render: (val: number | undefined, r) => {
        if (!r.sku) return <span style={{ color: "#94a3b8" }}>—</span>;
        if (val === undefined || val === null) {
          return <Tag color="default">Chưa rõ</Tag>;
        }
        if (val <= 0) {
          return (
            <Tag color="error" style={{ fontWeight: 600, borderRadius: 4 }}>
              Hết hàng (0)
            </Tag>
          );
        }
        if (val <= 10) {
          return (
            <Tag color="warning" style={{ fontWeight: 600, borderRadius: 4 }}>
              {val} {r.unit || ""}
            </Tag>
          );
        }
        return (
          <Tag color="success" style={{ fontWeight: 600, borderRadius: 4 }}>
            {val} {r.unit || ""}
          </Tag>
        );
      },
    },
    {
      title: "SỐ LƯỢNG",
      dataIndex: "quantity",
      key: "quantity",
      width: 115,
      render: (val: number, r) => {
        const isOutOfStock = r.available_quantity !== undefined && r.available_quantity <= 0;
        const isExceeded = r.available_quantity !== undefined && r.available_quantity >= 0 && (val || 0) > r.available_quantity;

        return (
          <Tooltip
            title={
              isOutOfStock
                ? `Sản phẩm '${r.sku}' đã hết hàng trong kho!`
                : isExceeded
                ? `Vượt quá số lượng hàng tồn khả dụng! Tối đa có thể đặt: ${r.available_quantity} ${r.unit || "đơn vị"}`
                : undefined
            }
          >
            <div>
              <InputNumber
                min={isOutOfStock ? 0 : 1}
                disabled={isOutOfStock}
                status={isOutOfStock || isExceeded ? "error" : undefined}
                value={val}
                onChange={(num) => handleItemChange(r.key, "quantity", num || 0)}
                size="small"
                style={{ width: "100%" }}
              />
              {isExceeded && (
                <div style={{ color: "#ef4444", fontSize: 11, marginTop: 2, fontWeight: 500, lineHeight: 1.2 }}>
                  Vượt tồn (tối đa {r.available_quantity})
                </div>
              )}
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: "ĐƠN GIÁ (₫)",
      dataIndex: "unit_price",
      key: "unit_price",
      width: 115,
      render: (val: number, r) => (
        <InputNumber
          min={0}
          step={1000}
          value={val}
          onChange={(num) => handleItemChange(r.key, "unit_price", num || 0)}
          size="small"
          style={{ width: "100%" }}
          formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
          parser={(v) => Number(v?.replace(/\$\s?|(,*)/g, "") || 0)}
        />
      ),
    },
    {
      title: "CHIẾT KHẤU",
      dataIndex: "discount_amount",
      key: "discount",
      width: 130,
      align: "center",
      render: (val: number | undefined, r) => {
        if (!r.sku) return <span style={{ color: "#94a3b8" }}>—</span>;
        if (!val || val <= 0) {
          return <span style={{ color: "#94a3b8" }}>0 ₫</span>;
        }
        return (
          <Tooltip title={r.applied_policy_name ? `Chính sách: ${r.applied_policy_name}` : "Chiết khấu sản lượng đạt bậc"}>
            <Tag color="success" style={{ fontWeight: 600, borderRadius: 4, cursor: "pointer", margin: 0 }}>
              {r.discount_percent && r.discount_percent > 0 ? `${r.discount_percent}% ` : ""}
              (-{val.toLocaleString("vi-VN")} ₫)
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: "THÀNH TIỀN (₫)",
      key: "subtotal",
      width: 125,
      align: "right",
      render: (_, r) => {
        const lineSub = (r.quantity || 0) * (r.unit_price || 0);
        const lineTot = r.line_total !== undefined ? r.line_total : Math.max(0, lineSub - (r.discount_amount || 0));
        const hasDisc = (r.discount_amount || 0) > 0;
        return (
          <div style={{ textAlign: "right" }}>
            <Text strong style={{ color: "#047857", whiteSpace: "nowrap", fontSize: 13 }}>
              {lineTot.toLocaleString("vi-VN")} ₫
            </Text>
            {hasDisc && (
              <div style={{ textDecoration: "line-through", color: "#94a3b8", fontSize: 11 }}>
                {lineSub.toLocaleString("vi-VN")} ₫
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: "XÓA",
      key: "action",
      width: 48,
      align: "center",
      render: (_, r) => (
        <Tooltip title="Xóa dòng sản phẩm">
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => handleRemoveItem(r.key)}
          />
        </Tooltip>
      ),
    },
  ];

  // SCRUM-10 Tiêu chí 3: Kiểm tra nếu có sản phẩm nào đặt vượt tồn khả dụng hoặc hết hàng
  const hasExceededStock = items.some(
    (it) =>
      Boolean(it.sku) &&
      it.available_quantity !== undefined &&
      (Number(it.quantity) > Number(it.available_quantity) || Number(it.available_quantity) <= 0)
  );

  return (
    <>
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShoppingOutlined style={{ color: "#2563eb", fontSize: 22 }} />
            <span>
              {editingOrder
                ? `Chỉnh sửa đơn hàng ${editingOrder.order_code}`
                : "Lập đơn hàng bán (SCRUM-20 & SCRUM-85)"}
            </span>
          </div>
        }
        open={isOpen}
        onCancel={handleClose}
        width={1520}
        style={{ top: 12, maxWidth: "98vw" }}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText={editingOrder ? "Lưu thay đổi" : "Xác nhận tạo đơn"}
        cancelText="Hủy"
        okButtonProps={{ disabled: isCustomerLocked || hasExceededStock }}
        destroyOnClose
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {errorMsg && <Alert type="error" message={errorMsg} showIcon closable />}

          {isCustomerLocked && (
            <Alert
              type="error"
              showIcon
              icon={<WarningOutlined />}
              message="Đại lý đang bị khóa giao dịch (SCRUM-85)"
              description={`Lý do: ${selectedCustomer?.lock_reason || "Chặn công nợ quá hạn"
                }. Hệ thống chặn toàn bộ thao tác lên đơn hàng mới cho đại lý này.`}
            />
          )}

          <Form form={form} layout="vertical">
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              {/* CỘT TRÁI: Mặt hàng đã mua gần đây (S4-04) */}
              <div
                style={{
                  width: 320,
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Card
                  size="small"
                  style={{
                    borderRadius: 8,
                    borderColor: "#bfdbfe",
                    backgroundColor: "#f8fafc",
                    boxShadow: "0 1px 3px rgba(37,99,235,0.06)",
                  }}
                  styles={{
                    header: { padding: "10px 14px", borderBottom: "1px solid #e2e8f0" },
                    body: {
                      padding: "10px",
                      maxHeight: "calc(80vh - 160px)",
                      overflowY: "auto",
                    },
                  }}
                  title={
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <Space size={6}>
                          <HistoryOutlined style={{ color: "#2563eb", fontSize: 16 }} />
                          <span style={{ fontWeight: 600, color: "#1e3a8a", fontSize: 14 }}>
                            Mặt hàng đã mua
                          </span>
                        </Space>
                        {historyItems.length > 0 && (
                          <Tag color="blue" style={{ margin: 0 }}>
                            {historyItems.length} gợi ý
                          </Tag>
                        )}
                      </div>
                      {historyItems.length > 0 && (
                        <Button
                          type="primary"
                          size="small"
                          icon={<PlusOutlined />}
                          style={{ backgroundColor: "#2563eb", fontWeight: 500, width: "100%" }}
                          onClick={handleAddAllSuggestions}
                        >
                          Thêm tất cả vào đơn
                        </Button>
                      )}
                    </div>
                  }
                >
                  {!selectedCustomer ? (
                    <div style={{ padding: "30px 10px", textAlign: "center", color: "#64748b" }}>
                      <ShoppingOutlined style={{ fontSize: 32, color: "#94a3b8", marginBottom: 8 }} />
                      <div style={{ fontSize: 13 }}>Vui lòng chọn đại lý để xem mặt hàng đã mua gần đây.</div>
                    </div>
                  ) : loadingHistory ? (
                    <div style={{ padding: "30px 0", textAlign: "center" }}>
                      <Spin size="small" tip="Đang tải lịch sử mua hàng..." />
                    </div>
                  ) : historyItems.length === 0 ? (
                    <Text type="secondary" style={{ fontSize: 13, fontStyle: "italic", display: "block", textAlign: "center", padding: "20px 0" }}>
                      Đại lý chưa có lịch sử mua hàng trong 3 tháng gần nhất.
                    </Text>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {historyItems.map((s) => (
                        <div
                          key={s.product_id || s.sku}
                          style={{
                            padding: "8px 10px",
                            backgroundColor: "#ffffff",
                            border: "1px solid #e2e8f0",
                            borderRadius: 6,
                            display: "flex",
                            flexDirection: "column",
                            gap: 5,
                            boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                          }}
                        >
                          <div>
                            <Text strong style={{ color: "#0f172a", fontSize: 13, display: "block" }}>
                              {s.product_name}
                            </Text>
                            <Space size={4} style={{ marginTop: 2 }}>
                              <Tag color="geekblue" style={{ fontSize: 11, margin: 0 }}>
                                {s.sku}
                              </Tag>
                              {s.unit && (
                                <Tag color="default" style={{ fontSize: 11, margin: 0 }}>
                                  ĐVT: {s.unit}
                                </Tag>
                              )}
                            </Space>
                          </div>

                          <div style={{ fontSize: 12, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span>Tồn khả dụng:</span>
                              <Tag color={s.available_quantity > 0 ? "success" : "error"} style={{ margin: 0, fontWeight: 600 }}>
                                {s.available_quantity > 0 ? `${s.available_quantity} ${s.unit}` : "Hết hàng (0)"}
                              </Tag>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span>SL bình quân:</span>
                              <Text strong style={{ color: "#2563eb" }}>
                                {s.avg_quantity} {s.unit}
                              </Text>
                            </div>
                            {s.last_price > 0 && (
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span>Giá gần nhất:</span>
                                <Text>{s.last_price.toLocaleString("vi-VN")} ₫</Text>
                              </div>
                            )}
                          </div>

                          <Button
                            size="small"
                            icon={<PlusOutlined />}
                            type="default"
                            style={{
                              borderColor: "#2563eb",
                              color: "#2563eb",
                              fontWeight: 500,
                              marginTop: 2,
                              width: "100%",
                            }}
                            onClick={() => handleAddSingleSuggestion(s)}
                          >
                            Thêm vào đơn
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              {/* CỘT PHẢI: Phần tạo đơn hàng (được mở rộng tối đa) */}
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {/* 1. Chọn đại lý & điểm giao hàng */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {/* Chọn đại lý */}
                  <Form.Item
                    name="customer_id"
                    label="Chọn Đại lý / Khách hàng"
                    rules={[{ required: true, message: "Vui lòng chọn đại lý" }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Select
                      showSearch
                      placeholder="Chọn đại lý"
                      onChange={handleCustomerChange}
                      optionFilterProp="children"
                    >
                      {customers.map((c) => (
                        <Option key={c.id} value={c.id}>
                          {c.code} — {c.name} {c.is_locked ? "(BỊ KHÓA)" : ""}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>

                  {/* Chọn điểm giao hàng */}
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 4,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "rgba(0, 0, 0, 0.88)", fontSize: 14 }}>
                          Điểm giao hàng của đại lý
                        </span>
                        {deliveryAddresses.length === 0 && !loadingAddresses && selectedCustomer && (
                          <Text type="danger" style={{ fontSize: 12 }}>
                            (Chưa có điểm giao hàng)
                          </Text>
                        )}
                      </div>
                      <Tooltip title={!selectedCustomer ? "Vui lòng chọn đại lý trước" : "Khai báo điểm giao hàng mới cho đại lý"}>
                        <Button
                          type="link"
                          size="small"
                          disabled={!selectedCustomer}
                          onClick={handleOpenAddAddressModal}
                          style={{ padding: 0, height: "auto", fontSize: 13 }}
                        >
                          + Thêm điểm giao mới
                        </Button>
                      </Tooltip>
                    </div>
                    <Form.Item name="delivery_address_id" style={{ marginBottom: 0 }}>
                      <Select
                        placeholder="Chọn điểm giao hàng (hoặc để trống nhận mặc định)"
                        loading={loadingAddresses}
                        value={selectedAddressId}
                        onChange={(val) => {
                          setSelectedAddressId(val);
                          form.setFieldValue("delivery_address_id", val);
                        }}
                        allowClear
                        dropdownRender={(menu) => (
                          <>
                            {menu}
                            <Divider style={{ margin: "4px 0" }} />
                            <div style={{ padding: "4px 8px" }}>
                              <Tooltip title={!selectedCustomer ? "Vui lòng chọn đại lý trước" : ""}>
                                <Button
                                  type="link"
                                  size="small"
                                  icon={<PlusOutlined />}
                                  disabled={!selectedCustomer}
                                  onClick={handleOpenAddAddressModal}
                                  style={{ width: "100%", textAlign: "left", padding: 0 }}
                                >
                                  Thêm địa chỉ mới
                                </Button>
                              </Tooltip>
                            </div>
                          </>
                        )}
                      >
                        {deliveryAddresses.map((addr) => (
                          <Option key={addr.id} value={addr.id}>
                            {addr.is_default ? "★ [MẶC ĐỊNH] " : ""}
                            {addr.receiver_name} - {addr.phone} ({addr.address})
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </div>
                </div>

                {/* Chi tiết điểm giao hàng được chọn */}
                {selectedAddress && (
                  <Card
                    size="small"
                    style={{
                      backgroundColor: "#f8fafc",
                      borderColor: "#e2e8f0",
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <EnvironmentOutlined style={{ color: "#2563eb", fontSize: 18, marginTop: 2 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Text strong>{selectedAddress.receiver_name}</Text>
                          <Text type="secondary">({selectedAddress.phone})</Text>
                          {selectedAddress.is_default && <Tag color="success">Mặc định</Tag>}
                        </div>
                        <div style={{ color: "#334155", marginTop: 2 }}>{selectedAddress.address}</div>
                        {selectedAddress.note && (
                          <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>
                            Ghi chú: {selectedAddress.note}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                )}

                {/* Danh sách sản phẩm trong đơn */}
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <Text strong style={{ fontSize: 15 }}>
                      Danh sách sản phẩm trong đơn
                    </Text>
                    <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={handleAddItem}>
                      Thêm sản phẩm
                    </Button>
                  </div>

                  <Table
                    columns={columns}
                    dataSource={items}
                    pagination={false}
                    bordered
                    size="small"
                    scroll={{
                      y: items.length > 3 ? 205 : undefined,
                    }}
                  />

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      marginTop: 10,
                      padding: "10px 16px",
                      backgroundColor: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      gap: 24,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 13, color: "#64748b" }}>Tiền hàng tạm tính: </span>
                      <strong style={{ fontSize: 14, color: "#334155" }}>
                        {subtotalAmount.toLocaleString("vi-VN")} ₫
                      </strong>
                    </div>
                    {totalDiscount > 0 && (
                      <div>
                        <span style={{ fontSize: 13, color: "#16a34a" }}>Chiết khấu sản lượng: </span>
                        <strong style={{ fontSize: 14, color: "#16a34a" }}>
                          -{totalDiscount.toLocaleString("vi-VN")} ₫
                        </strong>
                      </div>
                    )}
                    <div style={{ borderLeft: "1px solid #cbd5e1", paddingLeft: 16 }}>
                      <span style={{ fontSize: 14, color: "#1e293b", fontWeight: 500 }}>Tổng thanh toán: </span>
                      <strong style={{ color: "#047857", fontSize: 18 }}>
                        {totalAmount.toLocaleString("vi-VN")} ₫
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Ghi chú đơn hàng */}
                <Form.Item name="note" label="Ghi chú đơn hàng" style={{ marginBottom: 8 }}>
                  <Input.TextArea rows={2} placeholder="Ghi chú đơn hàng..." />
                </Form.Item>

                {/* Gửi phê duyệt ngay cho Quản lý kinh doanh */}
                <Form.Item
                  name="submit_for_approval"
                  valuePropName="checked"
                  initialValue={true}
                  style={{ marginBottom: 0 }}
                >
                  <Checkbox defaultChecked>
                    <Text strong style={{ color: "#2563eb" }}>
                      Gửi phê duyệt ngay cho Quản lý kinh doanh
                    </Text>
                  </Checkbox>
                </Form.Item>
              </div>
            </div>
          </Form>
        </div>
      </Modal>

      {/* Modal con: Thêm điểm giao hàng mới trực tiếp trên modal đơn hàng */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <EnvironmentOutlined style={{ color: "#2563eb", fontSize: 20 }} />
            <span>
              Thêm điểm giao hàng mới
              {selectedCustomer ? ` — ${selectedCustomer.name}` : ""}
            </span>
          </div>
        }
        open={isAddAddressModalOpen}
        onCancel={() => {
          setIsAddAddressModalOpen(false);
          addressForm.resetFields();
        }}
        onOk={handleSaveDeliveryAddress}
        confirmLoading={submittingAddress}
        okText="Lưu điểm giao"
        cancelText="Hủy"
        destroyOnClose
        zIndex={1050}
      >
        <Form
          form={addressForm}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="receiver_name"
            label="Tên người nhận"
            rules={[
              { required: true, message: "Vui lòng nhập tên người nhận" },
              { max: 150, message: "Tên người nhận không vượt quá 150 ký tự" },
            ]}
          >
            <Input placeholder="Ví dụ: Anh Nguyễn Văn Tuấn (Kho A)" prefix={<UserOutlined />} />
          </Form.Item>

          <Form.Item
            name="phone"
            label="Số điện thoại"
            rules={[
              { required: true, message: "Vui lòng nhập số điện thoại" },
              {
                pattern: /^0[1235789]\d{8,9}$/,
                message: "Số điện thoại không hợp lệ (10-11 chữ số, bắt đầu bằng 03, 05, 07, 08, 09, 01, 02)",
              },
            ]}
          >
            <Input placeholder="Ví dụ: 0912345678" prefix={<PhoneOutlined />} />
          </Form.Item>

          <Form.Item
            name="address"
            label="Địa chỉ chi tiết / Tên kho"
            rules={[{ required: true, message: "Vui lòng nhập địa chỉ chi tiết / tên kho" }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="Ví dụ: Lô B4 KCN Quang Minh, Mê Linh, Hà Nội"
            />
          </Form.Item>

          <Form.Item
            name="note"
            label="Ghi chú giao hàng / hướng dẫn đường đi"
          >
            <Input.TextArea
              rows={2}
              placeholder="Ví dụ: Xe tải 5 tấn vào được, giao giờ hành chính, gọi trước 30 phút..."
            />
          </Form.Item>

          <Form.Item
            name="is_default"
            valuePropName="checked"
            style={{ marginBottom: 0 }}
          >
            <Checkbox>
              Đặt làm địa chỉ mặc định
            </Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default CreateOrderModal;
