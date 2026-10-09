import React, { useEffect, useState } from "react";
import { createPriceList, fetchProducts, type PriceListLine } from "../../api";

type Product = { sku:string; name:string; sale_price:number };
export interface CreatePriceListModalProps { isOpen:boolean; onClose:()=>void; onCreated:(value:any)=>void; initialCode?:string; initialCustomerGroup?:string; initialItems?:PriceListLine[]; }

const today = () => new Date().toISOString().slice(0,10);
export const CreatePriceListModal: React.FC<CreatePriceListModalProps> = ({isOpen,onClose,onCreated,initialCode="",initialCustomerGroup="DEALER_LEVEL_1",initialItems}) => {
  const [code,setCode]=useState("");
  const [group,setGroup]=useState(initialCustomerGroup);
  const [start,setStart]=useState(today());
  const [end,setEnd]=useState(`${new Date().getFullYear()}-12-31`);
  const [products,setProducts]=useState<Product[]>([]);
  const [lines,setLines]=useState<Record<string,PriceListLine>>({});
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  useEffect(()=>{ if(!isOpen)return; setCode(initialCode);setGroup(initialCustomerGroup);fetchProducts().then((items)=>{setProducts(items);const previous=Object.fromEntries((initialItems||[]).map(line=>[line.sku,line]));setLines(Object.fromEntries(items.map(p=>[p.sku,previous[p.sku]||{sku:p.sku,sale_price:p.sale_price,floor_price:p.sale_price}])));}).catch(e=>setError(e.message)); },[isOpen,initialCode,initialCustomerGroup,initialItems]);
  if(!isOpen)return null;
  const setLine=(sku:string,key:"sale_price"|"floor_price",value:number)=>setLines(old=>({...old,[sku]:{...old[sku], [key]:value}}));
  const submit=async(e:React.FormEvent)=>{e.preventDefault();setError("");if(!code.trim()){setError("Vui lòng nhập mã bảng giá.");return;}if(products.length===0){setError("Danh mục sản phẩm đang trống.");return;}
    const invalid=products.find(p=>!lines[p.sku]||lines[p.sku].sale_price<lines[p.sku].floor_price);if(invalid){setError(`Giá bán của ${invalid.sku} phải bằng hoặc cao hơn giá sàn.`);return;}
    setBusy(true);try{const created=await createPriceList({code:code.trim().toUpperCase(),customer_group:group,start_date:start,end_date:end,items:products.map(p=>lines[p.sku])});onCreated(created);onClose();}catch(e:any){setError(e.message||"Không lưu được bảng giá.");}finally{setBusy(false);}};
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40"><div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-auto shadow-2xl">
    <div className="px-6 py-4 border-b flex justify-between"><div><h2 className="font-bold">Khai báo bảng giá</h2><p className="text-xs text-slate-500">Bảng giá theo nhóm khách hàng và thời hạn hiệu lực</p></div><button onClick={onClose}>✕</button></div>
    <form onSubmit={submit} className="p-6 space-y-4">{error&&<div className="p-3 bg-rose-50 text-rose-700 rounded">{error}</div>}
      <div className="grid md:grid-cols-4 gap-3"><label className="text-xs">Mã bảng giá<input required value={code} onChange={e=>setCode(e.target.value)} className="mt-1 w-full border rounded p-2"/></label><label className="text-xs">Nhóm khách hàng<select value={group} onChange={e=>setGroup(e.target.value)} className="mt-1 w-full border rounded p-2"><option value="DEALER_LEVEL_1">Đại lý cấp 1</option><option value="DEALER_LEVEL_2">Đại lý cấp 2</option><option value="RETAIL">Khách lẻ</option></select></label><label className="text-xs">Ngày bắt đầu<input type="date" required value={start} onChange={e=>setStart(e.target.value)} className="mt-1 w-full border rounded p-2"/></label><label className="text-xs">Ngày kết thúc<input type="date" required value={end} onChange={e=>setEnd(e.target.value)} className="mt-1 w-full border rounded p-2"/></label></div>
      <div><h3 className="font-semibold text-sm mb-2">Giá bán và giá sàn theo SKU</h3><div className="space-y-2 max-h-72 overflow-auto">{products.map(p=><div key={p.sku} className="grid grid-cols-12 gap-2 items-center border rounded-lg p-3"><div className="col-span-5"><b>{p.sku}</b><div className="text-xs text-slate-500">{p.name}</div></div><label className="col-span-3 text-xs">Giá bán<input type="number" min="0" value={lines[p.sku]?.sale_price??p.sale_price} onChange={e=>setLine(p.sku,"sale_price",Number(e.target.value))} className="w-full border rounded p-2"/></label><label className="col-span-3 text-xs">Giá sàn<input type="number" min="0" value={lines[p.sku]?.floor_price??p.sale_price} onChange={e=>setLine(p.sku,"floor_price",Number(e.target.value))} className="w-full border rounded p-2"/></label></div>)}</div></div>
      <p className="text-xs text-amber-700">Đơn bán dưới giá sàn sẽ chuyển sang trạng thái chờ Quản lý kinh doanh duyệt.</p><div className="flex justify-end gap-2 border-t pt-4"><button type="button" onClick={onClose} className="border rounded px-4 py-2">Hủy</button><button disabled={busy} className="bg-blue-600 text-white rounded px-4 py-2">{busy?"Đang lưu…":"Lưu bảng giá nháp"}</button></div>
    </form>
  </div></div>;
};
export default CreatePriceListModal;
