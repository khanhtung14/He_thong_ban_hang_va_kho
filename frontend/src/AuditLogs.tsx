import { FormEvent, useEffect, useState } from "react";
import { authenticatedFetch } from "./session";

type AuditRow = {
  id: number;
  actor_user_id: number | null;
  actor_name: string;
  entity_type: string;
  entity_id: string;
  action: string;
  before_value: unknown;
  after_value: unknown;
  happened_at: string;
};

const labels: Record<string, string> = {
  inventory: "Tồn kho", price: "Giá", credit_limit: "Hạn mức công nợ",
  invoice: "Hóa đơn", debt: "Công nợ",
};

export default function AuditLogs() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [actor, setActor] = useState("");
  const [entity, setEntity] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ limit: "500" });
    if (/^\d+$/.test(actor.trim())) params.set("actor_user_id", actor.trim());
    else if (actor.trim()) params.set("actor_name", actor.trim());
    if (entity) params.set("entity_type", entity);
    if (from) params.set("start_at", new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set("end_at", new Date(`${to}T23:59:59.999`).toISOString());
    try {
      const response = await authenticatedFetch(`/api/v1/audit-logs?${params}`);
      if (!response.ok) throw new Error(response.status === 403 ? "Chỉ Quản trị viên được xem nhật ký." : "Không tải được nhật ký. Hãy đăng nhập lại nếu phiên đã hết hạn.");
      setRows(await response.json() as AuditRow[]);
    } catch (e) { setError(e instanceof Error ? e.message : "Không thể kết nối máy chủ."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const fieldStyle = { minHeight: 40, padding: "8px 10px", border: "1px solid #d7dce5", borderRadius: 8, font: "inherit", background: "white" };
  return <>
    <PageTitle title="Nhật ký thao tác" subtitle="Lịch sử thay đổi tồn kho, bảng giá, công nợ và hóa đơn." />
    <form onSubmit={load} style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 12, padding: 16, margin: "16px 0", background: "white", border: "1px solid #e7eaf0", borderRadius: 12 }}>
      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>Người thực hiện<input style={fieldStyle} value={actor} onChange={e => setActor(e.target.value)} placeholder="Tên, tài khoản hoặc ID" /></label>
      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>Đối tượng<select style={fieldStyle} value={entity} onChange={e => setEntity(e.target.value)}><option value="">Tất cả</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>Từ ngày<input style={fieldStyle} type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>Đến ngày<input style={fieldStyle} type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
      <button className="workspace-button" disabled={loading}>{loading ? "Đang tải…" : "Lọc nhật ký"}</button>
    </form>
    {error && <p className="workspace-alert" role="alert">{error}</p>}
    <section className="workspace-panel" style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900, textAlign: "left" }}>
      <thead><tr>{["Thời điểm", "Người thực hiện", "Đối tượng", "Mã", "Thao tác", "Giá trị trước", "Giá trị sau"].map(label => <th key={label} style={{ padding: 11, borderBottom: "1px solid #e7eaf0", whiteSpace: "nowrap" }}>{label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>{[new Date(row.happened_at).toLocaleString("vi-VN"), `${row.actor_name}${row.actor_user_id ? ` (#${row.actor_user_id})` : ""}`, labels[row.entity_type] ?? row.entity_type, row.entity_id, row.action, JSON.stringify(row.before_value), JSON.stringify(row.after_value)].map((value, index) => <td key={index} style={{ padding: 11, borderBottom: "1px solid #f0f2f6", verticalAlign: "top", overflowWrap: "anywhere", whiteSpace: index > 4 ? "pre-wrap" : undefined }}>{value}</td>)}</tr>)}{!rows.length && !loading && <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#718096" }}>Không có bản ghi phù hợp.</td></tr>}</tbody>
    </table></section>
  </>;
}

function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <header style={{ marginBottom: 14 }}><h2 style={{ margin: "0 0 6px" }}>{title}</h2><p style={{ margin: 0, color: "#718096" }}>{subtitle}</p></header>;
}
