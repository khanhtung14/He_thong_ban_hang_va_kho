import os

filepath = "frontend/src/features/roles/RoleWorkspace.tsx"
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

fetch_logic = """
    if (["sales", "customer", "salesManager"].includes(role)) {
      requests.push(readResponse<any>("/api/v1/orders").then((data: any) => { if (!cancelled) setOrders(data.data || []); }).catch((error: Error) => {}));
      requests.push(readResponse<any>("/api/v1/customers").then((data: any) => { if (!cancelled) setCustomers(data.data || []); }).catch((error: Error) => {}));
    }
    if (["accountant", "customer"].includes(role)) {
      requests.push(readResponse<any>("/api/v1/invoices").then((data: any) => { if (!cancelled) setInvoices(data.data || []); }).catch((error: Error) => {}));
    }
"""

content = content.replace(fetch_logic, "")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
