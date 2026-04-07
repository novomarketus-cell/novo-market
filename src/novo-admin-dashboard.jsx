import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  subscribeProducts, subscribeOrders, subscribePromos, subscribeCategories,
  addProduct, updateProduct, deleteProduct,
  updateOrderStatus, updateOrderField, deleteOrder,
  saveCategory, deleteCategory,
  addPromo, updatePromo, deletePromo,
  uploadProductMedia,
  loginAdmin, logoutAdmin, subscribeAuth, reorderProducts,
} from "./firebase";

// MODULE-LEVEL CONSTANTS (never re-created)
const STATUS = {
  pending_payment: { label: "결제 대기", color: "#E67E22", bg: "#FFF3E0" },
  payment_submitted: { label: "결제 확인중", color: "#F39C12", bg: "#FFF8E1" },
  confirmed: { label: "결제 확인", color: "#27AE60", bg: "#E8F5E9" },
  preparing: { label: "준비중", color: "#2980B9", bg: "#E3F2FD" },
  shipped: { label: "배송중", color: "#8E44AD", bg: "#F3E5F5" },
  delivered: { label: "배송 완료", color: "#2C3E50", bg: "#ECEFF1" },
  cancelled: { label: "취소", color: "#95A5A6", bg: "#F5F5F5" },
};
const PREV_STATUS = {
  payment_submitted: "pending_payment",
  confirmed: "payment_submitted",
  preparing: "confirmed",
  shipped: "preparing",
  delivered: "shipped",
};
const C = { bg:"#F0F2F5", primary:"#2D5A3D", pLight:"#E8F0EB", accent:"#D4956A", aLight:"#FFF3EB", text:"#1A1A1A", tLight:"#7A8599", border:"#E4E7EC", danger:"#E74C3C", dLight:"#FDEDED", success:"#27AE60", warn:"#F39C12", wLight:"#FFF8E1" };
const INP = { width:"100%", border:`1px solid ${C.border}`, borderRadius:"8px", padding:"10px 12px", fontSize:"13px", fontFamily:"'DM Sans',sans-serif", boxSizing:"border-box", outline:"none" };
const BTN = { border:"none", borderRadius:"8px", cursor:"pointer", fontWeight:600, fontFamily:"'DM Sans',sans-serif", background:C.primary, color:"#FFF", padding:"10px 20px", fontSize:"13px" };
const BTNS = { ...BTN, padding:"6px 12px", fontSize:"12px" };
const TAG_PRESETS = [
  {label:"무염",color:"#E8F5E9",textColor:"#2E7D32"},{label:"저염",color:"#E8F5E9",textColor:"#2E7D32"},
  {label:"유기농",color:"#FFF8E1",textColor:"#F57F17"},{label:"무첨가",color:"#E3F2FD",textColor:"#1565C0"},
  {label:"유통기한 짧음",color:"#FDEDED",textColor:"#C0392B"},{label:"냉장보관",color:"#E0F7FA",textColor:"#00838F"},
  {label:"인기상품",color:"#FFF0F3",textColor:"#C2185B"},{label:"신상품",color:"#F3E5F5",textColor:"#7B1FA2"},
];
const LBL = { fontSize:12, fontWeight:600, color:C.tLight, display:"block", marginBottom:4 };

// CSV injection defense function
const esc = (v) => {
  const s = String(v ?? "");
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

// TAB ORDER: 대시보드 → 주문관리 → 재고관리 → 제품관리 → 카테고리 → 프로모션
const TABS = [
  {k:"dashboard",i:"📊",l:"대시보드"},
  {k:"orders",i:"📦",l:"주문 관리"},
  {k:"inventory",i:"📋",l:"재고 관리"},
  {k:"products",i:"🏷️",l:"제품 관리"},
  {k:"categories",i:"📂",l:"카테고리"},
  {k:"promos",i:"🎟️",l:"프로모션"},
];

// ProductFormModal — 100% self-contained, own state/styles/saving
function ProductFormModal({ initialData, initialCategories, editPid, onDone, onClose }) {
  const [pf, setPf] = useState({...initialData, price: initialData.price || "", stock: initialData.stock || "", salePrice: initialData.salePrice || ""});
  const [pendingFiles, setPendingFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [customColor, setCustomColor] = useState({bg:"#FFFFFF",fg:"#333333"});
  const handleFileSelect = (files) => {
    const max = 10 - (pf.media || []).length;
    [...files].filter(f => f.type.startsWith("image/") || f.type.startsWith("video/")).slice(0, max).forEach(file => {
      const r = new FileReader();
      r.onload = ev => { const isVid = file.type.startsWith("video/"); setPf(prev => { const nm = [...(prev.media||[]),{type:isVid?"video":"image",url:ev.target.result,alt:file.name,fileName:file.name}]; setPendingFiles(pf2=>[...pf2,{index:nm.length-1,file}]); return {...prev,media:nm}; }); };
      r.readAsDataURL(file);
    });
  };
  const handleSave = async () => {
    if (!pf.nameEn || !pf.nameKo) { setMsg("제품명을 입력하세요"); setTimeout(()=>setMsg(""),2000); return; }
    setSaving(true);
    try {
      const productId = editPid || `p${Date.now()}`;
      let updatedMedia = [...(pf.media||[])];
      for (const {index,file} of pendingFiles) { try { const url = await uploadProductMedia(productId,file,index); if(updatedMedia[index]) updatedMedia[index]={...updatedMedia[index],url,fileName:file.name}; } catch(err){console.error("Upload failed:",err);} }
      const cleanMedia = updatedMedia.filter(m=>m.url&&!m.url.startsWith("data:")).map(m=>({type:m.type||"image",url:m.url,alt:m.alt||"",...(m.poster?{poster:m.poster}:{})}));
      const data = { category:pf.category, brand:pf.brand||"", nameEn:pf.nameEn, nameKo:pf.nameKo, price:Number(pf.price)||0, stock:Number(pf.stock)||0, image:pf.image||"📦", sale:pf.sale||false, salePrice:Number(pf.salePrice)||0, active:pf.active!==false, media:cleanMedia, tiered:(pf.tiered||[]).map(t=>({qty:Number(t.qty),price:Number(t.price)})), descKo:pf.descKo||"", descEn:pf.descEn||"", tags:pf.tags||[] };
      if (editPid) await updateProduct(editPid, data); else await addProduct({id:productId,...data});
      onDone(editPid ? "수정 완료" : "추가 완료");
    } catch(err) { setMsg("저장 실패: "+err.message); }
    setSaving(false);
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#FFF",borderRadius:16,maxWidth:520,width:"100%",maxHeight:"85vh",overflow:"auto",padding:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h3 style={{margin:0,fontSize:18,fontWeight:700}}>{editPid?"제품 수정":"새 제품 추가"}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:C.tLight}}>✕</button>
        </div>
        {msg&&<div style={{background:C.dLight,color:C.danger,padding:"8px 12px",borderRadius:8,fontSize:12,marginBottom:12}}>{msg}</div>}
        <div style={{marginBottom:12}}><label style={LBL}>브랜드 (Brand)</label><input value={pf.brand||""} onChange={e=>setPf(p=>({...p,brand:e.target.value}))} type="text" placeholder="예: 베베쿡, 짱죽, 맘마밀" style={INP}/></div>
        <div style={{marginBottom:12}}><label style={LBL}>제품명 (한국어)</label><input value={pf.nameKo} onChange={e=>setPf(p=>({...p,nameKo:e.target.value}))} type="text" style={INP}/></div>
        <div style={{marginBottom:12}}><label style={LBL}>Product Name (EN)</label><input value={pf.nameEn} onChange={e=>setPf(p=>({...p,nameEn:e.target.value}))} type="text" style={INP}/></div>
        <div style={{marginBottom:12}}><label style={LBL}>가격 ($)</label><input value={pf.price} onChange={e=>setPf(p=>({...p,price:e.target.value}))} type="number" placeholder="0.00" style={INP}/></div>
        <div style={{marginBottom:12}}><label style={LBL}>재고</label><input value={pf.stock} onChange={e=>setPf(p=>({...p,stock:e.target.value}))} type="number" placeholder="0" style={INP}/></div>
        <div style={{marginBottom:12}}><label style={LBL}>이모지 (대체용)</label><input value={pf.image} onChange={e=>setPf(p=>({...p,image:e.target.value}))} type="text" style={INP}/></div>
        <div style={{marginBottom:12}}><label style={LBL}>📝 제품 설명 (한국어)</label><textarea value={pf.descKo||""} onChange={e=>setPf(p=>({...p,descKo:e.target.value}))} placeholder="예: 4개월 이상 아기를 위한 유기농 쌀미음" rows={3} style={{...INP,resize:"vertical"}}/></div>
        <div style={{marginBottom:12}}><label style={LBL}>📝 Description (EN)</label><textarea value={pf.descEn||""} onChange={e=>setPf(p=>({...p,descEn:e.target.value}))} placeholder="e.g. Organic rice porridge for babies 4+ months" rows={3} style={{...INP,resize:"vertical"}}/></div>
        <div style={{marginBottom:12}}>
          <label style={{...LBL,marginBottom:6}}>🏷️ 제품 태그</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>{(pf.tags||[]).map((tag,i)=>(<span key={i} style={{display:"inline-flex",alignItems:"center",gap:6,background:tag.color||"#EAF5FA",color:tag.textColor||"#2980B9",padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:600}}><span>{tag.label}</span><button onClick={()=>setPf(p=>{const nt=[...(p.tags||[])];nt.splice(i,1);return{...p,tags:nt};})} style={{background:"none",border:"none",cursor:"pointer",color:"inherit",fontSize:13,padding:0,lineHeight:1,fontWeight:700}}>✕</button></span>))}</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>{TAG_PRESETS.map(preset=>(<button key={preset.label} onClick={()=>setPf(p=>{if((p.tags||[]).some(t=>t.label===preset.label))return p;return{...p,tags:[...(p.tags||[]),preset]};})} style={{...BTNS,padding:"3px 8px",fontSize:10,background:preset.color,color:preset.textColor,border:`1px solid ${preset.textColor}22`,opacity:(pf.tags||[]).some(t=>t.label===preset.label)?0.4:1}}>+ {preset.label}</button>))}</div>
          <div style={{fontSize:11,fontWeight:600,color:C.tLight,marginBottom:4}}>커스텀 태그 추가</div>
          <div style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
            <input value={pf.customTag||""} onChange={e=>setPf(p=>({...p,customTag:e.target.value}))} placeholder="태그명" style={{...INP,flex:1,fontSize:12}}/>
            <input type="color" value={customColor.bg} onChange={e=>setCustomColor({...customColor,bg:e.target.value})} style={{width:40,height:40,border:`1px solid ${C.border}`,borderRadius:8,cursor:"pointer"}}/>
            <input type="color" value={customColor.fg} onChange={e=>setCustomColor({...customColor,fg:e.target.value})} style={{width:40,height:40,border:`1px solid ${C.border}`,borderRadius:8,cursor:"pointer"}}/>
            <button onClick={()=>{if(pf.customTag){setPf(p=>({...p,tags:[...(p.tags||[]),{label:pf.customTag,color:customColor.bg,textColor:customColor.fg}],customTag:""}));setCustomColor({bg:"#FFFFFF",fg:"#333333"});}}} style={{...BTNS,whiteSpace:"nowrap"}}>추가</button>
          </div>
        </div>
        <div style={{marginBottom:12}}>
          <label style={{...LBL,marginBottom:6}}>카테고리</label>
          <select value={pf.category||""} onChange={e=>setPf(p=>({...p,category:e.target.value}))} style={INP}>
            <option value="">-- 선택 --</option>
            {Object.keys(initialCategories||{}).map(cid=><option key={cid} value={cid}>{initialCategories[cid]?.name||cid}</option>)}
          </select>
        </div>
        <div style={{marginBottom:12}}>
          <label style={{...LBL,marginBottom:6}}>❌ 할인 활성화</label>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input type="checkbox" checked={pf.sale||false} onChange={e=>setPf(p=>({...p,sale:e.target.checked}))} style={{cursor:"pointer",width:18,height:18}}/>
            {pf.sale&&<><label style={{...LBL,marginBottom:0}}>할인가 ($)</label><input value={pf.salePrice} onChange={e=>setPf(p=>({...p,salePrice:e.target.value}))} type="number" placeholder="0.00" style={{...INP,flex:1}}/></>}
          </div>
        </div>
        <div style={{marginBottom:12}}>
          <label style={{...LBL,marginBottom:6}}>🎁 계층 가격제</label>
          {(pf.tiered||[]).map((t,i)=>(<div key={i} style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
            <input value={t.qty} onChange={e=>setPf(p=>{const nt=[...(p.tiered||[])];nt[i]={...nt[i],qty:e.target.value};return{...p,tiered:nt};})} type="number" placeholder="수량" style={{...INP,flex:0.5}}/>
            <span>개 이상</span>
            <input value={t.price} onChange={e=>setPf(p=>{const nt=[...(p.tiered||[])];nt[i]={...nt[i],price:e.target.value};return{...p,tiered:nt};})} type="number" placeholder="가격" style={{...INP,flex:0.7}}/>
            <button onClick={()=>setPf(p=>{const nt=[...(p.tiered||[])];nt.splice(i,1);return{...p,tiered:nt};})} style={{...BTNS,background:C.danger}}>삭제</button>
          </div>))}
          <button onClick={()=>setPf(p=>({...p,tiered:[...(p.tiered||[]),{qty:"",price:""}]}))} style={{...BTNS,marginTop:4}}>+ 계층 추가</button>
        </div>
        <div style={{marginBottom:12}}>
          <label style={{...LBL,marginBottom:6}}>🖼️ 미디어 (이미지/영상)</label>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(80px,1fr))",gap:8,marginBottom:8}}>
            {(pf.media||[]).map((m,i)=>(<div key={i} style={{position:"relative",aspectRatio:"1/1",background:C.pLight,borderRadius:8,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
              {m.url.startsWith("data:")?<div style={{width:"100%",height:"100%",background:m.type==="video"?"#000":"#EEE",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32}}>{m.type==="video"?"🎬":"🖼️"}</div>:<img src={m.url} alt={m.alt||"media"} style={{width:"100%",height:"100%",objectFit:"cover"}}/>}
              <button onClick={()=>setPf(p=>{const nm=[...(p.media||[])];nm.splice(i,1);return{...p,media:nm};})} style={{position:"absolute",top:2,right:2,background:"#FFF",border:"none",borderRadius:50,width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:12,fontWeight:700}}>✕</button>
            </div>))}
            {(pf.media||[]).length<10&&<label style={{aspectRatio:"1/1",background:C.pLight,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:32,border:`2px dashed ${C.border}`}}>
              ⊕
              <input type="file" multiple accept="image/*,video/*" onChange={e=>handleFileSelect(e.target.files||[])} style={{display:"none"}}/>
            </label>}
          </div>
          <div style={{fontSize:11,color:C.tLight}}>PNG, JPG, WebP (이미지) 또는 MP4, WebM (영상). 최대 10개</div>
        </div>
        <div style={{marginBottom:12}}><label style={{...LBL}}>❌ 비활성화</label><input type="checkbox" checked={pf.active===false} onChange={e=>setPf(p=>({...p,active:!e.target.checked}))} style={{cursor:"pointer"}}/></div>
        <button onClick={handleSave} disabled={saving} style={{...BTN,width:"100%",opacity:saving?0.6:1,cursor:saving?"not-allowed":"pointer"}}>{saving?"저장중...":"저장"}</button>
      </div>
    </div>
  );
}

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    const unsub = subscribeAuth((user) => {
      setAuthed(!!user);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const handleLogin = async () => {
    try {
      setLoginError("");
      await loginAdmin(email, password);
    } catch (err) {
      setLoginError("이메일 또는 비밀번호가 틀렸습니다");
    }
  };

  const handleLogout = async () => {
    await logoutAdmin();
  };

  if (authLoading) return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{fontSize:16,color:C.tLight}}>로딩중...</div>
    </div>
  );

  if (!authed) return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet"/>
      <div style={{background:"#FFF",borderRadius:16,padding:32,maxWidth:360,width:"100%",margin:16,boxShadow:"0 4px 24px rgba(0,0,0,.1)",textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:12}}>🌿</div>
        <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:22,marginBottom:4}}>NOVO MARKET</h2>
        <div style={{fontSize:12,color:C.tLight,marginBottom:24}}>관리자 로그인</div>
        <input value={email} onChange={e=>{setEmail(e.target.value);setLoginError("");}}
          type="email" placeholder="이메일"
          style={{...INP,textAlign:"center",fontSize:15,marginBottom:8}}/>
        <input value={password} onChange={e=>{setPassword(e.target.value);setLoginError("");}}
          onKeyDown={e=>{if(e.key==="Enter")handleLogin();}}
          type="password" placeholder="비밀번호"
          style={{...INP,textAlign:"center",fontSize:15,marginBottom:12}}/>
        {loginError&&<div style={{fontSize:12,color:C.danger,marginBottom:8}}>{loginError}</div>}
        <button onClick={handleLogin} style={{...BTN,width:"100%",padding:12,fontSize:14}}>로그인</button>
      </div>
    </div>
  );

  return <AdminDashboard handleLogout={handleLogout}/>;
}

function AdminDashboard({ handleLogout }) {
  const [tab, setTab] = useState("dashboard");
  const [loaded, setLoaded] = useState(false);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [categories, setCategories] = useState({});
  const [promos, setPromos] = useState([]);
  const [notis, setNotis] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingPromo, setEditingPromo] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [search, setSearch] = useState("");
  const [oFilter, setOFilter] = useState("all");
  const [dragIdx, setDragIdx] = useState(null);

  useEffect(() => {
    const unsub1 = subscribeProducts(ps => { setProducts(ps); setLoaded(true); });
    const unsub2 = subscribeOrders(os => setOrders(os));
    const unsub3 = subscribeCategories(cs => setCategories(cs));
    const unsub4 = subscribePromos(pms => setPromos(pms));
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, []);

  const noti = (msg, color = C.success) => {
    const id = Date.now();
    setNotis(n => [...n, { id, msg, color }]);
    setTimeout(() => setNotis(n => n.filter(x => x.id !== id)), 3000);
  };

  const exportCSV=()=>{
    const s=orders.filter(o=>o.status==="confirmed"||o.status==="preparing");
    if(!s.length){noti("배송할 주문이 없습니다");return;}
    const csv="Order Number,Name,Address,City,State,ZIP,Phone,Items,Total,Delivery,Gate Code\n"+s.map(o=>`${esc(o.orderNum)},"${esc(o.customer?.name)}","${esc(o.customer?.address)}","${esc(o.customer?.city)}",${esc(o.customer?.state)},${esc(o.customer?.zip)},"${esc(o.phone)}","${esc((o.items||[]).map(i=>`${i.name} x${i.qty}`).join("; "))}",${(o.total||0).toFixed(2)},${esc(o.deliveryMethod||"delivery")},${esc(o.customer?.gateCode||"")}`).join("\n");
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download=`novo_shipping_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    noti(`${s.length}건 CSV 다운로드`);
  };

  const handleTrackingCSV=async(file)=>{
    if(!file)return;
    const text=await file.text();
    const lines=text.split("\n").map(l=>l.split(",").map(c=>c.trim().replace(/^"|"$/g,"")));
    if(lines.length<2){noti("CSV 데이터 없음");return;}
    const headers=lines[0].map(h=>h.toLowerCase());
    const orderIdx=headers.findIndex(h=>h.includes("order"));
    const trackIdx=headers.findIndex(h=>h.includes("track"));
    if(orderIdx===-1||trackIdx===-1){noti("Order Number 또는 Tracking Number 컬럼을 찾을 수 없습니다");return;}
    let matched=0;
    for(let i=1;i<lines.length;i++){
      const row=lines[i];
      if(!row||row.length<=Math.max(orderIdx,trackIdx))continue;
      const orderNum=row[orderIdx]?.trim();
      const tracking=row[trackIdx]?.trim();
      if(!orderNum||!tracking)continue;
      const found=orders.find(o=>o.orderNum===orderNum);
      if(found&&found._docId){
        try{
          await updateOrderField(found._docId,{trackingNum:tracking,status:"shipped"});
          matched++;
        }catch(e){console.error(e);}
      }
    }
    noti(`${matched}건 트래킹 업데이트 완료`);
  };

  const handleRevertStatus = async (o) => {
    const prev = PREV_STATUS[o.status];
    if (!prev) return;
    await updateOrderStatus(o._docId, prev);
    noti(`${o.orderNum} → ${STATUS[prev]?.label}`);
  };

  if (!loaded) return <div style={{fontFamily:"'DM Sans',sans-serif",padding:40,textAlign:"center",color:C.tLight}}>로딩중...</div>;

  // --- Computed data for tabs ---
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayOrders = orders.filter(o => new Date(o.createdAt?.toDate?.() || o.createdAt || 0) >= todayStart);
  const todayRevenue = todayOrders.reduce((s,o) => s + (o.total||0), 0);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7); weekStart.setHours(0,0,0,0);
  const weekOrders = orders.filter(o => new Date(o.createdAt?.toDate?.() || o.createdAt || 0) >= weekStart);
  const weekRevenue = weekOrders.reduce((s,o) => s + (o.total||0), 0);
  const totalRevenue = orders.reduce((s,o) => s + (o.total||0), 0);
  const pendingOrders = orders.filter(o => o.status === "pending_payment").length;
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= 10).length;
  const outOfStock = products.filter(p => p.stock === 0).length;
  const activeOrders = orders.filter(o => !["delivered","cancelled"].includes(o.status)).length;
  const filteredOrders = orders
    .filter(o => oFilter === "all" || o.status === oFilter)
    .filter(o => !search || o.orderNum?.includes(search) || o.customer?.name?.includes(search) || o.phone?.includes(search));
  const inv = products.map(p => ({
    id: p.id, name: p.nameKo || p.nameEn, category: categories[p.category]?.name || p.category || "—",
    stock: p.stock || 0, price: p.price || 0,
    status: (p.stock || 0) === 0 ? "품절" : (p.stock || 0) <= 10 ? "낮음" : "정상",
  })).sort((a,b) => ({ "품절": 0, "낮음": 1, "정상": 2 })[a.status] - ({ "품절": 0, "낮음": 1, "정상": 2 })[b.status]);
  const sortedProducts = [...products].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const catList = Object.entries(categories).map(([k,v]) => ({id:k,...v}));

  // --- SINGLE RETURN: common layout with header + tabs + content ---
  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:C.bg,minHeight:"100vh",padding:20}}>
      {/* HEADER */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:20}}>
        <div>
          <h1 style={{fontFamily:"'DM Serif Display',serif",fontSize:28,margin:0}}>🌿 NOVO MARKET</h1>
          <div style={{fontSize:12,color:C.tLight,marginTop:4}}>관리자 대시보드</div>
        </div>
        <button onClick={handleLogout} style={{...BTN,background:C.danger}}>로그아웃</button>
      </div>

      {/* TAB NAVIGATION */}
      <div style={{display:"flex",justifyContent:"center",gap:10,marginBottom:24,flexWrap:"wrap"}}>
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{...BTN, background: tab === t.k ? C.primary : "#FFF", color: tab === t.k ? "#FFF" : C.text, border: `1px solid ${tab === t.k ? C.primary : C.border}`}}>
            {t.i} {t.l}
          </button>
        ))}
      </div>

      {/* ===== DASHBOARD ===== */}
      {tab === "dashboard" && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16,marginBottom:32}}>
          <div style={{background:"#FFF",borderRadius:12,padding:20,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
            <div style={{fontSize:12,color:C.tLight,marginBottom:6}}>오늘 주문</div>
            <div style={{fontSize:28,fontWeight:700,color:C.primary}}>{todayOrders.length}</div>
          </div>
          <div style={{background:"#FFF",borderRadius:12,padding:20,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
            <div style={{fontSize:12,color:C.tLight,marginBottom:6}}>오늘 매출</div>
            <div style={{fontSize:28,fontWeight:700,color:C.primary}}>${todayRevenue.toFixed(2)}</div>
          </div>
          <div style={{background:"#FFF",borderRadius:12,padding:20,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
            <div style={{fontSize:12,color:C.tLight,marginBottom:6}}>주간 매출</div>
            <div style={{fontSize:28,fontWeight:700,color:C.primary}}>${weekRevenue.toFixed(2)}</div>
          </div>
          <div style={{background:"#FFF",borderRadius:12,padding:20,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
            <div style={{fontSize:12,color:C.tLight,marginBottom:6}}>총 매출</div>
            <div style={{fontSize:28,fontWeight:700,color:C.primary}}>${totalRevenue.toFixed(2)}</div>
          </div>
          <div style={{background:"#FFF",borderRadius:12,padding:20,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
            <div style={{fontSize:12,color:C.tLight,marginBottom:6}}>결제 대기</div>
            <div style={{fontSize:28,fontWeight:700,color:C.warn}}>{pendingOrders}</div>
          </div>
          <div style={{background:"#FFF",borderRadius:12,padding:20,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
            <div style={{fontSize:12,color:C.tLight,marginBottom:6}}>낮은 재고</div>
            <div style={{fontSize:28,fontWeight:700,color:C.accent}}>{lowStock}</div>
          </div>
          <div style={{background:"#FFF",borderRadius:12,padding:20,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
            <div style={{fontSize:12,color:C.tLight,marginBottom:6}}>품절</div>
            <div style={{fontSize:28,fontWeight:700,color:C.danger}}>{outOfStock}</div>
          </div>
          <div style={{background:"#FFF",borderRadius:12,padding:20,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
            <div style={{fontSize:12,color:C.tLight,marginBottom:6}}>진행 중인 주문</div>
            <div style={{fontSize:28,fontWeight:700,color:C.primary}}>{activeOrders}</div>
          </div>
        </div>
      )}

      {/* ===== ORDERS ===== */}
      {tab === "orders" && (<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:24,margin:0}}>📦 주문 관리</h2>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={exportCSV} style={BTN}>📄 배송 CSV</button>
            <label style={{...BTN,background:"#8E44AD",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:4}}>
              📥 트래킹 CSV 업로드
              <input type="file" accept=".csv,.xlsx,.xls" style={{display:"none"}} onChange={e=>{handleTrackingCSV(e.target.files[0]);e.target.value="";}}/>
            </label>
          </div>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="주문번호, 이름, 전화번호 검색..." style={{...INP,maxWidth:280}}/>
          <select value={oFilter} onChange={e=>setOFilter(e.target.value)} style={{...INP,maxWidth:160}}>
            <option value="all">전체 상태</option>
            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div style={{background:"#FFF",borderRadius:12,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
          {filteredOrders.length === 0 ? (
            <div style={{padding:40,textAlign:"center",color:C.tLight}}>주문이 없습니다</div>
          ) : (
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{background:C.pLight,borderBottom:`1px solid ${C.border}`}}>
                    <th style={{padding:12,textAlign:"left",fontSize:12,fontWeight:700,color:C.text}}>주문번호</th>
                    <th style={{padding:12,textAlign:"left",fontSize:12,fontWeight:700,color:C.text}}>고객</th>
                    <th style={{padding:12,textAlign:"left",fontSize:12,fontWeight:700,color:C.text}}>전화</th>
                    <th style={{padding:12,textAlign:"left",fontSize:12,fontWeight:700,color:C.text}}>금액</th>
                    <th style={{padding:12,textAlign:"left",fontSize:12,fontWeight:700,color:C.text}}>상태</th>
                    <th style={{padding:12,textAlign:"left",fontSize:12,fontWeight:700,color:C.text}}>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o,i) => (
                    <tr key={o._docId} style={{borderBottom:`1px solid ${C.border}`}}>
                      <td style={{padding:12,fontSize:13,fontWeight:600,color:C.text}}>{o.orderNum}</td>
                      <td style={{padding:12,fontSize:13,color:C.text}}>{o.customer?.name}</td>
                      <td style={{padding:12,fontSize:13,color:C.tLight}}>{o.phone}</td>
                      <td style={{padding:12,fontSize:13,fontWeight:600,color:C.text}}>${(o.total||0).toFixed(2)}</td>
                      <td style={{padding:12,fontSize:12}}>
                        <span style={{background:STATUS[o.status]?.bg,color:STATUS[o.status]?.color,padding:"4px 8px",borderRadius:4,fontWeight:600}}>
                          {STATUS[o.status]?.label}
                        </span>
                      </td>
                      <td style={{padding:12,display:"flex",gap:4}}>
                        <button onClick={() => { const newStatus = Object.keys(STATUS).find((k,idx) => Object.keys(STATUS)[idx-1] === o.status) || "confirmed"; if (newStatus) updateOrderStatus(o._docId, newStatus); }} style={{...BTNS,background:C.primary}}>→</button>
                        {PREV_STATUS[o.status] && <button onClick={() => handleRevertStatus(o)} style={{...BTNS,background:C.warn}}>⟲</button>}
                        {o.trackingNum && <span style={{fontSize:11,color:C.tLight,padding:"6px 8px"}}>TRK: {o.trackingNum}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>)}

      {/* ===== INVENTORY ===== */}
      {tab === "inventory" && (<>
        <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:24,margin:"0 0 20px 0"}}>📋 재고 관리</h2>
        <div style={{background:"#FFF",borderRadius:12,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:C.pLight,borderBottom:`1px solid ${C.border}`}}>
                  <th style={{padding:12,textAlign:"left",fontSize:12,fontWeight:700,color:C.text}}>제품명</th>
                  <th style={{padding:12,textAlign:"left",fontSize:12,fontWeight:700,color:C.text}}>카테고리</th>
                  <th style={{padding:12,textAlign:"left",fontSize:12,fontWeight:700,color:C.text}}>가격</th>
                  <th style={{padding:12,textAlign:"left",fontSize:12,fontWeight:700,color:C.text}}>재고</th>
                  <th style={{padding:12,textAlign:"left",fontSize:12,fontWeight:700,color:C.text}}>상태</th>
                </tr>
              </thead>
              <tbody>
                {inv.map(item => (
                  <tr key={item.id} style={{borderBottom:`1px solid ${C.border}`}}>
                    <td style={{padding:12,fontSize:13,fontWeight:600,color:C.text}}>{item.name}</td>
                    <td style={{padding:12,fontSize:13,color:C.tLight}}>{item.category}</td>
                    <td style={{padding:12,fontSize:13,color:C.text}}>${item.price.toFixed(2)}</td>
                    <td style={{padding:12,fontSize:13,fontWeight:600,color:C.text}}>{item.stock}</td>
                    <td style={{padding:12,fontSize:12}}>
                      <span style={{background: item.status === "품절" ? C.dLight : item.status === "낮음" ? C.wLight : C.pLight, color: item.status === "품절" ? C.danger : item.status === "낮음" ? C.warn : C.success, padding:"4px 8px",borderRadius:4,fontWeight:600}}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>)}

      {/* ===== PRODUCTS ===== */}
      {tab === "products" && (<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:24,margin:0}}>🏷️ 제품 관리</h2>
          <button onClick={()=>setEditingProduct({})} style={{...BTN}}>+ 새 제품</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:16}}>
          {sortedProducts.map((p,i) => (
            <div
              key={p.id}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={async () => {
                if (dragIdx === null || dragIdx === i) return;
                const reordered = [...sortedProducts];
                const [moved] = reordered.splice(dragIdx, 1);
                reordered.splice(i, 0, moved);
                await reorderProducts(reordered.map(p => p.id));
                setDragIdx(null);
                noti("순서 변경 완료");
              }}
              onDragEnd={() => setDragIdx(null)}
              style={{background:"#FFF",borderRadius:12,padding:16,boxShadow:"0 2px 8px rgba(0,0,0,0.05)",cursor:"grab",opacity:dragIdx===i?0.7:1,transition:"opacity 0.2s"}}
            >
              <div style={{fontSize:24,marginBottom:8,textAlign:"center"}}>
                {p.media?.[0]?.url ? <img src={p.media[0].url} alt={p.nameKo} style={{width:"100%",height:120,objectFit:"cover",borderRadius:8,marginBottom:8}} /> : p.image}
              </div>
              <div style={{fontSize:12,color:C.tLight,marginBottom:2}}>☰ 드래그로 순서 변경</div>
              <h4 style={{margin:"8px 0 4px 0",fontSize:14,fontWeight:700,color:C.text}}>{p.nameKo}</h4>
              <div style={{fontSize:12,color:C.tLight,marginBottom:8}}>{p.nameEn}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:13,fontWeight:700,color:C.primary}}>${p.price?.toFixed(2) || "0.00"}</span>
                <span style={{fontSize:12,color:C.tLight}}>재고: {p.stock}</span>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>setEditingProduct(p)} style={{...BTNS,flex:1}}>수정</button>
                <button onClick={async()=>{await deleteProduct(p.id);noti("삭제 완료");}} style={{...BTNS,background:C.danger,flex:1}}>삭제</button>
              </div>
            </div>
          ))}
        </div>
        {editingProduct && (
          <ProductFormModal
            initialData={editingProduct || {}}
            initialCategories={categories}
            editPid={editingProduct?.id}
            onDone={(msg) => { setEditingProduct(null); noti(msg); }}
            onClose={() => setEditingProduct(null)}
          />
        )}
      </>)}

      {/* ===== CATEGORIES ===== */}
      {tab === "categories" && (<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:24,margin:0}}>📂 카테고리</h2>
          <button onClick={()=>setEditingCategory({})} style={{...BTN}}>+ 새 카테고리</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:16}}>
          {catList.map(c => (
            <div key={c.id} style={{background:"#FFF",borderRadius:12,padding:16,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
              <h4 style={{margin:0,fontSize:16,fontWeight:700,color:C.text,marginBottom:12}}>{c.name}</h4>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setEditingCategory(c)} style={{...BTNS,flex:1}}>수정</button>
                <button onClick={async()=>{await deleteCategory(c.id);noti("삭제 완료");}} style={{...BTNS,background:C.danger,flex:1}}>삭제</button>
              </div>
            </div>
          ))}
        </div>
        {editingCategory && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{background:"#FFF",borderRadius:16,maxWidth:400,width:"100%",padding:24}}>
              <h3 style={{margin:"0 0 20px 0",fontSize:18,fontWeight:700}}>{editingCategory?.id?"카테고리 수정":"새 카테고리"}</h3>
              <input
                value={editingCategory?.id || ""}
                onChange={e=>setEditingCategory(c=>({...c,id:e.target.value}))}
                placeholder="카테고리 ID"
                disabled={!!editingCategory?.id}
                style={{...INP,marginBottom:12}}
              />
              <input
                value={editingCategory?.name || ""}
                onChange={e=>setEditingCategory(c=>({...c,name:e.target.value}))}
                placeholder="카테고리명"
                style={{...INP,marginBottom:20}}
              />
              <div style={{display:"flex",gap:8}}>
                <button onClick={async()=>{await saveCategory(editingCategory.id,{name:editingCategory.name});setEditingCategory(null);noti("저장 완료");}} style={{...BTN,flex:1}}>저장</button>
                <button onClick={()=>setEditingCategory(null)} style={{...BTN,background:C.tLight,flex:1}}>취소</button>
              </div>
            </div>
          </div>
        )}
      </>)}

      {/* ===== PROMOS ===== */}
      {tab === "promos" && (<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:24,margin:0}}>🎟️ 프로모션</h2>
          <button onClick={()=>setEditingPromo({})} style={{...BTN}}>+ 새 프로모</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16}}>
          {promos.map(p => (
            <div key={p._docId} style={{background:"#FFF",borderRadius:12,padding:16,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
              <h4 style={{margin:"0 0 4px 0",fontSize:16,fontWeight:700,color:C.text}}>{p.code}</h4>
              <div style={{fontSize:12,color:C.tLight,marginBottom:12}}>
                <div>{p.desc}</div>
                <div style={{marginTop:4}}>
                  {p.type === "percent" ? `${p.value}% 할인` : `$${p.value} 할인`}
                  {p.maxUses && ` (최대 ${p.maxUses}회)`}
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setEditingPromo(p)} style={{...BTNS,flex:1}}>수정</button>
                <button onClick={async()=>{await deletePromo(p.code);noti("삭제 완료");}} style={{...BTNS,background:C.danger,flex:1}}>삭제</button>
              </div>
            </div>
          ))}
        </div>
        {editingPromo && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{background:"#FFF",borderRadius:16,maxWidth:400,width:"100%",maxHeight:"80vh",overflow:"auto",padding:24}}>
              <h3 style={{margin:"0 0 20px 0",fontSize:18,fontWeight:700}}>{editingPromo?.code?"프로모 수정":"새 프로모"}</h3>
              <input
                value={editingPromo?.code || ""}
                onChange={e=>setEditingPromo(p=>({...p,code:e.target.value}))}
                placeholder="프로모 코드"
                disabled={!!editingPromo?.code}
                style={{...INP,marginBottom:12,textTransform:"uppercase"}}
              />
              <input
                value={editingPromo?.desc || ""}
                onChange={e=>setEditingPromo(p=>({...p,desc:e.target.value}))}
                placeholder="설명"
                style={{...INP,marginBottom:12}}
              />
              <select value={editingPromo?.type || "percent"} onChange={e=>setEditingPromo(p=>({...p,type:e.target.value}))} style={{...INP,marginBottom:12}}>
                <option value="percent">퍼센트 할인 (%)</option>
                <option value="amount">금액 할인 ($)</option>
              </select>
              <input
                value={editingPromo?.value || ""}
                onChange={e=>setEditingPromo(p=>({...p,value:e.target.value}))}
                placeholder="할인값"
                type="number"
                style={{...INP,marginBottom:12}}
              />
              <input
                value={editingPromo?.maxUses || ""}
                onChange={e=>setEditingPromo(p=>({...p,maxUses:e.target.value}))}
                placeholder="최대 사용 횟수 (선택)"
                type="number"
                style={{...INP,marginBottom:20}}
              />
              <div style={{display:"flex",gap:8}}>
                <button onClick={async()=>{const pData={code:editingPromo.code,desc:editingPromo.desc,type:editingPromo.type,value:Number(editingPromo.value),maxUses:editingPromo.maxUses?Number(editingPromo.maxUses):null};if(editingPromo._docId){await updatePromo(editingPromo.code,pData);}else{await addPromo(pData);}setEditingPromo(null);noti("저장 완료");}} style={{...BTN,flex:1}}>저장</button>
                <button onClick={()=>setEditingPromo(null)} style={{...BTN,background:C.tLight,flex:1}}>취소</button>
              </div>
            </div>
          </div>
        )}
      </>)}

      {/* NOTIFICATIONS */}
      {notis.length > 0 && (
        <div style={{position:"fixed",top:20,right:20,zIndex:2000,display:"flex",flexDirection:"column",gap:8}}>
          {notis.map(n => (
            <div key={n.id} style={{background:n.color||C.primary,color:"#FFF",padding:"10px 16px",borderRadius:8,fontSize:13,fontWeight:600,boxShadow:"0 4px 12px rgba(0,0,0,0.15)"}}>
              {n.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
