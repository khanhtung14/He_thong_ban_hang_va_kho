import os
filepath = "frontend/src/features/roles/RoleWorkspace.tsx"
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace my TS error code back
content = content.replace(
    "(orders.length ? orders : [{id: 'Mock', customer: 'Mock', total: 0, status: 'DRAFT'}]).slice(0, compact ? 2 : undefined).map((order: any",
    "demoOrders.slice(0, compact ? 2 : undefined).map((order"
)
content = content.replace(
    "(customers.length ? customers : [{code: 'Mock', name: 'Mock', area: 'Mock', debt: 0, due: 'Hôm nay'}]).slice(0, compact ? 2 : undefined).map((customer: any",
    "demoCustomers.slice(0, compact ? 2 : undefined).map((customer"
)
content = content.replace(
    "(customers.length ? customers : [{code: 'Mock', name: 'Mock', area: 'Mock', debt: 0, due: 'Hôm nay'}]).map((customer: any, index)",
    "demoCustomers.map((customer, index)"
)
content = content.replace(
    "(invoices.length ? invoices : [{id: 'Mock', customer: 'Mock'}]).slice(0, compact ? 2 : undefined).map((customer: any, index)",
    "demoCustomers.slice(0, compact ? 2 : undefined).map((customer, index)"
)
content = content.replace(
    "(orders.length ? orders : [{id: 'Mock', customer: 'Mock', total: 0, status: 'DRAFT'}]).slice(0, compact ? 2 : undefined).map((order: any, index)",
    "demoOrders.slice(0, compact ? 2 : undefined).map((order, index)"
)

# And the state
content = content.replace(
    "const [orders, setOrders] = useState<any[]>([]);\n  const [customers, setCustomers] = useState<any[]>([]);\n  const [invoices, setInvoices] = useState<any[]>([]);",
    ""
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
