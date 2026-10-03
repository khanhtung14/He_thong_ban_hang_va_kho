import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "./session";

type ImportAction = "create" | "update" | "error";

type ImportRow = {
  row: number;
  sku: string;
  item: {
    name?: string;
    category?: string;
    sale_price?: number;
    cost_price?: number;
    stock_available?: number;
    unit?: string;
  };
  action: ImportAction;
  message: string;
};

type PreviewResult = {
  total: number;
  create_count: number;
  update_count: number;
  error_count: number;
  rows: ImportRow[];
};

type ApiError = {
  detail?: string | { message?: string };
};

const PAGE_SIZE = 50;

const styles = `
  :root { color-scheme: light; --import-ink: #172b3a; --import-muted: #62727d; --import-line: #dce4e8; --import-paper: #fff; --import-canvas: #f2f6f5; --import-blue: #176b87; --import-blue-hover: #10546c; --import-green: #237453; --import-red: #a63c35; --import-amber: #9a6414; }
  * { box-sizing: border-box; }
  body { margin: 0; min-width: 320px; min-height: 100vh; background: var(--import-canvas); color: var(--import-ink); font-family: "Segoe UI", sans-serif; }
  .product-import { min-height: 100vh; }
  .import-topbar { min-height: 60px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px max(20px, calc((100vw - 1280px) / 2)); border-bottom: 1px solid var(--import-line); background: var(--import-paper); }
  .import-brand { color: var(--import-ink); font-size: 14px; font-weight: 700; text-decoration: none; }
  .import-toplink { color: var(--import-blue); font-size: 14px; font-weight: 600; text-decoration: none; }
  .import-main { width: min(100% - 40px, 1280px); margin: 30px auto 64px; }
  .import-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
  .import-eyebrow { margin: 0 0 8px; color: var(--import-green); font-size: 12px; font-weight: 700; text-transform: uppercase; }
  .import-heading h1 { margin: 0; font-size: 28px; line-height: 1.2; }
  .import-heading p { max-width: 680px; margin: 9px 0 0; color: var(--import-muted); font-size: 14px; line-height: 1.5; }
  .import-button { min-height: 42px; display: inline-flex; align-items: center; justify-content: center; gap: 9px; padding: 0 14px; border: 1px solid var(--import-line); border-radius: 6px; background: var(--import-paper); color: var(--import-ink); font: inherit; font-size: 14px; font-weight: 650; text-decoration: none; cursor: pointer; white-space: nowrap; }
  .import-button:hover:not(:disabled) { border-color: #9ebac4; background: #f8fbfb; }
  .import-button:focus-visible, .import-search:focus-visible, .import-file-input:focus-visible + .import-dropzone { outline: 3px solid #a6d6e4; outline-offset: 2px; }
  .import-button:disabled { cursor: wait; opacity: .55; }
  .import-button-primary { border-color: var(--import-blue); background: var(--import-blue); color: #fff; }
  .import-button-primary:hover:not(:disabled) { border-color: var(--import-blue-hover); background: var(--import-blue-hover); }
  .import-button svg { width: 17px; height: 17px; flex: none; }
  .import-workspace { display: grid; grid-template-columns: minmax(280px, 350px) minmax(0, 1fr); align-items: start; gap: 20px; }
  .import-panel { min-width: 0; border: 1px solid var(--import-line); border-radius: 7px; background: var(--import-paper); }
  .import-panel-head { padding: 16px 18px 13px; border-bottom: 1px solid var(--import-line); }
  .import-panel-head h2 { margin: 0; font-size: 15px; }
  .import-panel-head p { margin: 6px 0 0; color: var(--import-muted); font-size: 12px; line-height: 1.5; }
  .import-panel-body { padding: 18px; }
  .import-file-input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; clip-path: inset(50%); }
  .import-dropzone { min-height: 180px; display: grid; place-content: center; justify-items: center; gap: 10px; padding: 18px; border: 1px dashed #9fb2ba; border-radius: 6px; background: #f8fbfa; text-align: center; cursor: pointer; }
  .import-dropzone:hover { border-color: var(--import-blue); background: #f2f9fa; }
  .import-dropzone svg { width: 28px; height: 28px; color: var(--import-blue); }
  .import-drop-title { font-size: 14px; font-weight: 650; }
  .import-drop-note { color: var(--import-muted); font-size: 12px; line-height: 1.5; }
  .import-file-name { max-width: 100%; overflow-wrap: anywhere; color: var(--import-blue); font-size: 13px; font-weight: 650; }
  .import-file-meta { color: var(--import-muted); font-size: 12px; }
  .import-actions { display: grid; gap: 9px; margin-top: 14px; }
  .import-actions .import-button { width: 100%; }
  .import-notice { margin: 14px 0 0; padding: 11px 12px; border: 1px solid #efc9c5; border-radius: 5px; background: #fff7f6; color: var(--import-red); font-size: 13px; line-height: 1.5; }
  .import-notice-success { border-color: #b9d9c9; background: #f3faf6; color: var(--import-green); }
  .import-summary { display: grid; grid-template-columns: repeat(4, minmax(84px, 1fr)); border-bottom: 1px solid var(--import-line); }
  .import-stat { min-width: 0; padding: 15px 16px; border-right: 1px solid var(--import-line); }
  .import-stat:last-child { border-right: 0; }
  .import-stat strong { display: block; font-size: 21px; line-height: 1.1; }
  .import-stat span { display: block; margin-top: 5px; color: var(--import-muted); font-size: 11px; }
  .import-stat-create strong { color: var(--import-green); }
  .import-stat-update strong { color: var(--import-blue); }
  .import-stat-error strong { color: var(--import-red); }
  .import-table-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--import-line); }
  .import-filter { display: flex; align-items: center; gap: 8px; color: var(--import-muted); font-size: 12px; }
  .import-search { width: min(240px, 48vw); min-height: 36px; padding: 0 10px; border: 1px solid var(--import-line); border-radius: 5px; background: #fff; color: var(--import-ink); font: inherit; font-size: 13px; }
  .import-page-count { color: var(--import-muted); font-size: 12px; white-space: nowrap; }
  .import-table-wrap { width: 100%; overflow: auto; }
  .import-table { width: 100%; min-width: 760px; border-collapse: collapse; text-align: left; }
  .import-table th { padding: 10px 12px; background: #f7f9f9; color: var(--import-muted); font-size: 11px; font-weight: 700; text-transform: uppercase; }
  .import-table td { padding: 11px 12px; border-top: 1px solid #edf1f2; font-size: 13px; vertical-align: top; }
  .import-table tr:hover td { background: #fbfdfd; }
  .import-row-number { width: 54px; color: var(--import-muted); }
  .import-row-sku { font-weight: 700; white-space: nowrap; }
  .import-secondary { display: block; margin-top: 4px; color: var(--import-muted); font-size: 12px; }
  .import-state { display: inline-flex; align-items: center; gap: 6px; padding: 4px 7px; border-radius: 4px; font-size: 11px; font-weight: 700; white-space: nowrap; }
  .import-state-create { background: #eaf5ee; color: var(--import-green); }
  .import-state-update { background: #eaf3f6; color: var(--import-blue); }
  .import-state-error { background: #fbefed; color: var(--import-red); }
  .import-row-message { max-width: 260px; color: var(--import-muted); line-height: 1.4; }
  .import-row-error { color: var(--import-red); }
  .import-empty { padding: 32px 18px; color: var(--import-muted); font-size: 13px; text-align: center; }
  .import-pagination { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 11px 14px; border-top: 1px solid var(--import-line); }
  .import-pagination .import-button { min-height: 34px; padding: 0 10px; font-size: 12px; }
  .import-pagination span { min-width: 82px; color: var(--import-muted); font-size: 12px; text-align: center; }
  .import-unauthorized { max-width: 560px; margin: 80px auto; padding: 24px; border: 1px solid var(--import-line); border-radius: 7px; background: var(--import-paper); }
  .import-unauthorized h1 { margin: 0; font-size: 22px; }
  .import-unauthorized p { color: var(--import-muted); font-size: 14px; line-height: 1.6; }
  @media (max-width: 900px) { .import-workspace { grid-template-columns: 1fr; } .import-heading { align-items: flex-start; flex-direction: column; } .import-heading .import-button { align-self: flex-start; } }
  @media (max-width: 560px) { .import-main { width: min(100% - 24px, 1280px); margin-top: 20px; } .import-topbar { padding-inline: 12px; } .import-heading h1 { font-size: 24px; } .import-summary { grid-template-columns: repeat(2, minmax(80px, 1fr)); } .import-stat:nth-child(2) { border-right: 0; } .import-stat:nth-child(n + 3) { border-top: 1px solid var(--import-line); } .import-table-toolbar { align-items: flex-start; flex-direction: column; } .import-search { width: min(100%, 300px); } .import-filter { width: 100%; align-items: flex-start; flex-direction: column; } }
`;

function getRoleFromAccessToken(): string {
  const token = window.sessionStorage.getItem("access_token");
  if (!token) return "";
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(payload)) as { role?: string; role_code?: string };
    return (decoded.role ?? decoded.role_code ?? "").trim().toLowerCase();
  } catch {
    return "";
  }
}

function getApiMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Không thể kết nối đến máy chủ. Vui lòng thử lại.";
}

async function readErrorMessage(response: Response): Promise<string> {
  const result = await response.json().catch(() => ({})) as ApiError;
  if (typeof result.detail === "string") return result.detail;
  return result.detail?.message ?? "Yêu cầu không thành công. Vui lòng thử lại.";
}

function errorFromResponse(response: Response, message: string): Error {
  return new Error(response.status === 413
    ? "Tệp vượt quá giới hạn 10 MB."
    : response.status === 415
      ? "Chỉ hỗ trợ tệp Excel .xlsx."
      : message);
}

function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProductImport() {
  useEffect(() => {
    document.title = "Nhập sản phẩm từ Excel · OMS";
  }, []);

  const role = getRoleFromAccessToken();
  const canImport = role === "sales manager" || role === "admin";
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<"template" | "preview" | "commit" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const filteredRows = useMemo(() => {
    if (!preview) return [];
    const query = filter.trim().toLocaleLowerCase("vi");
    if (!query) return preview.rows;
    return preview.rows.filter((row) =>
      [row.sku, row.item.name ?? "", row.item.category ?? "", row.message]
        .some((value) => value.toLocaleLowerCase("vi").includes(query)),
    );
  }, [filter, preview]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visibleRows = filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function selectFile(nextFile?: File) {
    setError("");
    setSuccess("");
    setPreview(null);
    setFilter("");
    setPage(0);
    if (!nextFile) {
      setFile(null);
      return;
    }
    if (!nextFile.name.toLowerCase().endsWith(".xlsx")) {
      setFile(null);
      setError("Chỉ chọn tệp Excel có định dạng .xlsx.");
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setFile(null);
      setError("Tệp vượt quá giới hạn 10 MB.");
      return;
    }
    setFile(nextFile);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0]);
    event.target.value = "";
  }

  async function downloadTemplate() {
    setBusy("template");
    setError("");
    try {
      const response = await authenticatedFetch("/api/v1/products/import/template");
      if (!response.ok) throw errorFromResponse(response, await readErrorMessage(response));
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "product-import-template.xlsx";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      setError(getApiMessage(requestError));
    } finally {
      setBusy(null);
    }
  }

  async function requestPreview() {
    if (!file) return;
    setBusy("preview");
    setError("");
    setSuccess("");
    setPreview(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await authenticatedFetch("/api/v1/products/import/preview", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw errorFromResponse(response, await readErrorMessage(response));
      setPreview(await response.json() as PreviewResult);
    } catch (requestError) {
      setError(getApiMessage(requestError));
    } finally {
      setBusy(null);
    }
  }

  async function commitImport() {
    if (!file || !preview || preview.error_count > 0) return;
    setBusy("commit");
    setError("");
    setSuccess("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await authenticatedFetch("/api/v1/products/import/commit", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw errorFromResponse(response, await readErrorMessage(response));
      const result = await response.json() as { created_count: number; updated_count: number };
      setSuccess(`Đã nhập ${result.created_count} SKU mới và cập nhật ${result.updated_count} SKU.`);
      setFile(null);
      setPreview(null);
      setFilter("");
      setPage(0);
    } catch (requestError) {
      setError(getApiMessage(requestError));
    } finally {
      setBusy(null);
    }
  }

  if (!canImport) {
    return (
      <>
        <style>{styles}</style>
        <main className="product-import">
          <section className="import-unauthorized">
            <h1>Không có quyền nhập sản phẩm</h1>
            <p>Chức năng này dành cho Quản lý kinh doanh và Quản trị hệ thống.</p>
            <a className="import-toplink" href="/navigation">Quay lại menu</a>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <style>{styles}</style>
      <div className="product-import">
        <header className="import-topbar">
          <a className="import-brand" href="/navigation">OMS · Bán hàng &amp; Kho</a>
          <a className="import-toplink" href="/navigation">Menu nghiệp vụ</a>
        </header>
        <main className="import-main">
          <div className="import-heading">
            <div>
              <p className="import-eyebrow">Danh mục sản phẩm · SCRUM-78</p>
              <h1>Nhập sản phẩm từ Excel</h1>
              <p>Tải mẫu, chọn tệp và kiểm tra từng SKU trước khi ghi nhận. SKU đã có sẽ được cập nhật, SKU mới sẽ được tạo.</p>
            </div>
            <button className="import-button" type="button" onClick={downloadTemplate} disabled={busy !== null}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/></svg>
              {busy === "template" ? "Đang tải…" : "Tải tệp mẫu"}
            </button>
          </div>

          <div className="import-workspace">
            <section className="import-panel" aria-labelledby="upload-title">
              <div className="import-panel-head">
                <h2 id="upload-title">1. Chọn tệp Excel</h2>
                <p>Định dạng .xlsx, tối đa 10 MB. Tệp mẫu có sẵn tên cột và một dòng minh họa.</p>
              </div>
              <div className="import-panel-body">
                <input className="import-file-input" id="product-import-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFileChange} />
                <label className="import-dropzone" htmlFor="product-import-file">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/></svg>
                  <span className="import-drop-title">{file ? "Đổi tệp Excel" : "Chọn tệp .xlsx"}</span>
                  <span className="import-drop-note">Cột bắt buộc: sku, name, category</span>
                  {file && <><span className="import-file-name">{file.name}</span><span className="import-file-meta">{formatFileSize(file.size)}</span></>}
                </label>
                <div className="import-actions">
                  <button className="import-button import-button-primary" type="button" onClick={requestPreview} disabled={!file || busy !== null}>
                    {busy === "preview" ? "Đang kiểm tra…" : "Xem trước dữ liệu"}
                  </button>
                  {preview && (
                    <button className="import-button" type="button" onClick={commitImport} disabled={busy !== null || preview.error_count > 0}>
                      {busy === "commit" ? "Đang nhập…" : `Xác nhận nhập ${preview.total.toLocaleString("vi-VN")} dòng`}
                    </button>
                  )}
                </div>
                {error && <p className="import-notice" role="alert">{error}</p>}
                {success && <p className="import-notice import-notice-success" role="status">{success}</p>}
                {preview?.error_count ? <p className="import-notice" role="status">Sửa {preview.error_count.toLocaleString("vi-VN")} dòng lỗi trong tệp rồi chọn lại để xem trước.</p> : null}
              </div>
            </section>

            <section className="import-panel" aria-labelledby="preview-title">
              <div className="import-panel-head">
                <h2 id="preview-title">2. Kiểm tra bản xem trước</h2>
                <p>{preview ? `${preview.total.toLocaleString("vi-VN")} dòng dữ liệu` : "Chọn tệp và xem trước để kiểm tra thay đổi."}</p>
              </div>
              {preview ? (
                <>
                  <div className="import-summary" aria-label="Tổng hợp kết quả kiểm tra">
                    <div className="import-stat"><strong>{preview.total.toLocaleString("vi-VN")}</strong><span>Tổng dòng</span></div>
                    <div className="import-stat import-stat-create"><strong>{preview.create_count.toLocaleString("vi-VN")}</strong><span>Tạo mới</span></div>
                    <div className="import-stat import-stat-update"><strong>{preview.update_count.toLocaleString("vi-VN")}</strong><span>Cập nhật SKU</span></div>
                    <div className="import-stat import-stat-error"><strong>{preview.error_count.toLocaleString("vi-VN")}</strong><span>Dòng lỗi</span></div>
                  </div>
                  <div className="import-table-toolbar">
                    <label className="import-filter" htmlFor="import-search">
                      Lọc bản xem trước
                      <input className="import-search" id="import-search" type="search" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(0); }} placeholder="SKU, tên, danh mục, trạng thái" />
                    </label>
                    <span className="import-page-count">{filteredRows.length.toLocaleString("vi-VN")} dòng phù hợp</span>
                  </div>
                  <div className="import-table-wrap">
                    <table className="import-table">
                      <thead><tr><th>Dòng</th><th>SKU</th><th>Tên sản phẩm</th><th>Danh mục</th><th>Hành động</th><th>Kiểm tra</th></tr></thead>
                      <tbody>
                        {visibleRows.map((row) => (
                          <tr key={`${row.row}-${row.sku}`}>
                            <td className="import-row-number">{row.row}</td>
                            <td className="import-row-sku">{row.sku || "—"}</td>
                            <td>{row.item.name || "—"}</td>
                            <td>{row.item.category || "—"}</td>
                            <td><span className={`import-state import-state-${row.action}`}>{row.action === "update" ? "Cập nhật" : row.action === "create" ? "Tạo mới" : "Lỗi"}</span></td>
                            <td className={`import-row-message${row.action === "error" ? " import-row-error" : ""}`}>{row.message}</td>
                          </tr>
                        ))}
                        {!visibleRows.length && <tr><td className="import-empty" colSpan={6}>Không tìm thấy dòng phù hợp.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="import-pagination" aria-label="Phân trang bản xem trước">
                    <button className="import-button" type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0}>Trước</button>
                    <span>Trang {page + 1} / {pageCount}</span>
                    <button className="import-button" type="button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={page >= pageCount - 1}>Sau</button>
                  </div>
                </>
              ) : (
                <div className="import-empty">Bản xem trước sẽ hiện tại đây sau khi tệp được kiểm tra.</div>
              )}
            </section>
          </div>
        </main>
      </div>
    </>
  );
}