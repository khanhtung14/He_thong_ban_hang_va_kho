import os
import re

filepath = "frontend/src/features/roles/RoleWorkspace.tsx"
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace demoOrders with state
content = content.replace(
    "const demoOrders = [",
    "// const demoOrders = ["
)
content = content.replace(
    "const demoCustomers = [",
    "// const demoCustomers = ["
)

# We need to add state for orders, customers, invoices
state_declarations = """
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
"""
content = content.replace(
    "const [products, setProducts] = useState<Product[]>([]);",
    "const [products, setProducts] = useState<Product[]>([]);\n" + state_declarations
)

# Add fetch logic in useEffect
fetch_logic = """
    if (["sales", "customer", "salesManager"].includes(role)) {
      requests.push(readResponse<any>("/api/v1/orders").then((data: any) => { if (!cancelled) setOrders(data.data || []); }).catch((error: Error) => {}));
      requests.push(readResponse<any>("/api/v1/customers").then((data: any) => { if (!cancelled) setCustomers(data.data || []); }).catch((error: Error) => {}));
    }
    if (["accountant", "customer"].includes(role)) {
      requests.push(readResponse<any>("/api/v1/invoices").then((data: any) => { if (!cancelled) setInvoices(data.data || []); }).catch((error: Error) => {}));
    }
"""
content = content.replace(
    "if (shouldProducts) requests.push(",
    fetch_logic + "\n    if (shouldProducts) requests.push("
)

# Fix OrdersTable to use orders
content = content.replace(
    "demoOrders.slice(0, compact ? 2 : undefined).map((order",
    "(orders.length ? orders : [{id: 'Mock', customer: 'Mock', total: 0, status: 'DRAFT'}]).slice(0, compact ? 2 : undefined).map((order: any"
)

# Fix CustomersTable
content = content.replace(
    "demoCustomers.slice(0, compact ? 2 : undefined).map((customer",
    "(customers.length ? customers : [{code: 'Mock', name: 'Mock', area: 'Mock', debt: 0, due: 'Hôm nay'}]).slice(0, compact ? 2 : undefined).map((customer: any"
)

# Fix DebtTable
content = content.replace(
    "demoCustomers.map((customer, index)",
    "(customers.length ? customers : [{code: 'Mock', name: 'Mock', area: 'Mock', debt: 0, due: 'Hôm nay'}]).map((customer: any, index)"
)

# Fix InvoiceTable
content = content.replace(
    "demoCustomers.slice(0, compact ? 2 : undefined).map((customer, index)",
    "(invoices.length ? invoices : [{id: 'Mock', customer: 'Mock'}]).slice(0, compact ? 2 : undefined).map((customer: any, index)"
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
