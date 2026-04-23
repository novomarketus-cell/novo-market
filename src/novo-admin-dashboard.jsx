import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  subscribeProducts, subscribeOrders, subscribePromos, subscribeCategories,
  addProduct, updateProduct, deleteProduct, reorderProducts,
  updateOrderStatus, updateOrderField,
  cancelOrderWithRestock, restoreStockTransaction,
  saveCategory, deleteCategory,
  addPromo, updatePromo, deletePromo,
  uploadProductMedia,
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
const VALID_TRANSITIONS = {
  pending_payment: ["payment_submitted", "confirmed", "cancelled"],
  payment_submitted: ["confirmed", "pending_payment", "cancelled"],
  confirmed: ["preparing", "shipped", "delivered", "cancelled"],
  preparing: ["shipped", "delivered", "confirmed", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
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
    const max = 20 - (pf.media || []).length;
    [...files].filter(f => f.type.startsWith("image/") || f.type.startsWith("video/")).slice(0, max).forEach(file => {
      const r = new FileReader();
      r.onload = ev => { const isVid = file.type.startsWith("video/"); setPf(prev => { const nm = [...(prev.media||[]),{type:isVid?"video":"image",url:ev.target.result,alt:file.name,fileName:file.name}]; setPendingFiles(pf2=>[...pf2,{index:nm.length-1,file}]); return {...prev,media:nm}; }); };
      r.readAsDataURL(file);
    });
  };
  const handleSave = async () => {
    const errors = [];
    if (!pf.nameEn || !pf.nameKo) errors.push("제품명을 입력하세요");
    if (Number(pf.price) < 0) errors.push("가격은 0 이상이어야 합니다");
    if (Number(pf.stock) < 0) errors.push("재고는 0 이상이어야 합니다");
    if (pf.sale && Number(pf.salePrice) <= 0) errors.push("세일가격을 입력하세요");
    if (pf.sale && Number(pf.salePrice) >= Number(pf.price)) errors.push("세일가격은 정가보다 낮아야 합니다");
    if (errors.length > 0) { setMsg(errors.join(", ")); setTimeout(()=>setMsg(""),3000); return; }
    setSaving(true);
    try {
      const productId = editPid || `p${Date.now()}`;
      let updatedMedia = [...(pf.media||[])];
      for (const {index,file} of pendingFiles) { try { const url = await uploadProductMedia(productId,file,index); if(updatedMedia[index]) updatedMedia[index]={...updatedMedia[index],url,fileName:file.name}; } catch(err){console.error("Upload failed:",err);} }
      const cleanMedia = updatedMedia.filter(m=>m.url&&!m.url.startsWith("data:")).map(m=>({type:m.type||"image",url:m.url,alt:m.alt||"",...(m.poster?{poster:m.poster}:{})}));
      const data = { category:pf.category, brand:pf.brand||"", nameEn:pf.nameEn, nameKo:pf.nameKo, price:Number(pf.price)||0, stock:Number(pf.stock)||0, image:pf.image||"📦", sale:pf.sale||false, salePrice:Number(pf.salePrice)||0, active:pf.active!==false, media:cleanMedia, tiered:(pf.tiered||[]).map(t=>({qty:Number(t.qty),price:Number(t.price)})), descKo:pf.descKo||"", descEn:pf.descEn||"", tags:pf.tags||[], variants:(pf.variants||[]).filter(v=>v.label&&v.price).map(v=>({label:v.label,price:Number(v.price),stock:Number(v.stock)||0})) };
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
            <input id="novo-custom-tag" placeholder="태그 이름 입력" style={{...INP,flex:1,padding:"6px 10px",fontSize:12}}/>
            <button onClick={()=>{const el=document.getElementById("novo-custom-tag");if(!el||!el.value.trim())return;setPf(p=>({...p,tags:[...(p.tags||[]),{label:el.value.trim(),color:customColor.bg,textColor:customColor.fg}]}));el.value="";}} style={{...BTNS,background:C.primary,whiteSpace:"nowrap"}}>+ 추가</button>
          </div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8,alignItems:"center"}}>
            <span style={{fontSize:10,color:C.tLight,marginRight:2}}>색상:</span>
            {[{label:"흰색",bg:"#FFFFFF",fg:"#333333"},{label:"빨강",bg:"#FDEDED",fg:"#C0392B"},{label:"주황",bg:"#FFF3E0",fg:"#E67E22"},{label:"노랑",bg:"#FFF8E1",fg:"#F57F17"},{label:"초록",bg:"#E8F5E9",fg:"#2E7D32"},{label:"파랑",bg:"#E3F2FD",fg:"#1565C0"},{label:"보라",bg:"#F3E5F5",fg:"#7B1FA2"},{label:"분홍",bg:"#FFF0F3",fg:"#C2185B"},{label:"하늘",bg:"#E0F7FA",fg:"#00838F"},{label:"회색",bg:"#F5F5F5",fg:"#555555"}].map(c2=>(
              <button key={c2.label} onClick={()=>setCustomColor({bg:c2.bg,fg:c2.fg})} style={{padding:"4px 10px",borderRadius:12,fontSize:10,fontWeight:600,border:`1px solid ${c2.fg}33`,background:c2.bg,color:c2.fg,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",outline:customColor.bg===c2.bg?"2px solid #333":"none",outlineOffset:1}}>
                {c2.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{marginBottom:12}}>
          <label style={{...LBL,marginBottom:8}}>📷 제품 이미지/영상 (최대 10개)</label>
          {(pf.media||[]).length<10&&<div style={{marginBottom:10}}>
            <div onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor=C.primary;}} onDragLeave={e=>{e.currentTarget.style.borderColor=C.border;}} onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor=C.border;handleFileSelect(e.dataTransfer.files);}} style={{border:`2px dashed ${C.border}`,borderRadius:12,padding:"20px 16px",textAlign:"center",cursor:"pointer",background:"#FAFAFA"}} onClick={()=>document.getElementById("novo-file-input")?.click()}><div style={{fontSize:28,marginBottom:6}}>📤</div><div style={{fontSize:13,fontWeight:600,color:C.tLight}}>사진을 끌어오거나 탭하세요</div></div>
            <input id="novo-file-input" type="file" accept="image/*,video/*" multiple capture="environment" style={{display:"none"}} onChange={e=>{handleFileSelect(e.target.files);e.target.value="";}}/>
            <div style={{display:"flex",gap:6,marginTop:8}}><button onClick={()=>{const i=document.getElementById("novo-file-input");if(i){i.removeAttribute("capture");i.click();}}} style={{...BTNS,background:"#3498DB",flex:1}}>📁 갤러리</button><button onClick={()=>{const i=document.getElementById("novo-file-input");if(i){i.setAttribute("capture","environment");i.click();}}} style={{...BTNS,background:C.primary,flex:1}}>📸 카메라</button><button onClick={()=>setPf(p=>({...p,media:[...(p.media||[]),{type:"image",url:"",alt:""}]}))} style={{...BTNS,background:"#7F8C8D",flex:1}}>🔗 URL</button></div>
          </div>}
          {(pf.media||[]).length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:8,marginTop:8}}>{(pf.media||[]).map((m,i)=>(<div key={i} style={{position:"relative",borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`,background:"#F0EDE8"}}>{m.type==="video"?<div style={{width:"100%",height:90,display:"flex",alignItems:"center",justifyContent:"center",background:"#1A1A1A"}}><span style={{fontSize:24,color:"#FFF"}}>🎬</span></div>:m.url?<img src={m.url} alt="" style={{width:"100%",height:90,objectFit:"contain",display:"block",background:"#F5F2ED"}} onError={e=>{e.target.style.display="none";}}/>:<div style={{width:"100%",height:90,display:"flex",alignItems:"center",justifyContent:"center"}}><input value={m.url} onChange={e=>setPf(p=>{const nm=[...(p.media||[])];nm[i]={...nm[i],url:e.target.value};return{...p,media:nm};})} placeholder="URL" style={{width:"80%",border:`1px solid ${C.border}`,borderRadius:4,padding:"4px 6px",fontSize:10,textAlign:"center"}}/></div>}<button onClick={()=>{setPf(p=>{const nm=[...(p.media||[])];nm.splice(i,1);return{...p,media:nm};});setPendingFiles(pf2=>pf2.filter(f=>f.index!==i).map(f=>f.index>i?{...f,index:f.index-1}:f));}} style={{position:"absolute",top:3,right:3,width:20,height:20,borderRadius:"50%",border:"none",background:"rgba(0,0,0,0.6)",color:"#FFF",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>✕</button>{i===0&&<div style={{position:"absolute",bottom:3,left:3,background:C.primary,color:"#FFF",fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:3}}>대표</div>}</div>))}</div>}
          {(pf.media||[]).length>0&&<div style={{fontSize:11,color:C.tLight,marginTop:6}}>📷 {(pf.media||[]).filter(m=>m.type==="image").length}개 이미지 · 🎬 {(pf.media||[]).filter(m=>m.type==="video").length}개 영상{pendingFiles.length>0&&<span style={{color:C.warn,marginLeft:8}}>⏳ {pendingFiles.length}개 대기중</span>}</div>}
        </div>
        <div style={{marginBottom:12}}><label style={LBL}>카테고리</label><select value={pf.category} onChange={e=>setPf(p=>({...p,category:e.target.value}))} style={INP}>{Object.entries(initialCategories).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
        <div style={{display:"flex",gap:12,marginBottom:12}}><label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,cursor:"pointer"}}><input type="checkbox" checked={pf.sale} onChange={e=>setPf(p=>({...p,sale:e.target.checked}))}/>세일</label><label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,cursor:"pointer"}} title="체크 해제 시 고객 사이트에서 이 제품이 숨겨집니다"><input type="checkbox" checked={pf.active} onChange={e=>setPf(p=>({...p,active:e.target.checked}))}/>사이트에 표시</label></div>
        {!pf.active&&<div style={{background:C.wLight,border:`1px solid ${C.warn}33`,borderRadius:8,padding:"8px 12px",fontSize:11,color:C.warn,fontWeight:600,marginBottom:12}}>⚠️ "사이트에 표시"가 꺼져 있으면 고객에게 이 제품이 보이지 않습니다</div>}
        {pf.sale&&<div style={{marginBottom:12}}><label style={LBL}>세일 가격</label><input value={pf.salePrice} onChange={e=>setPf(p=>({...p,salePrice:e.target.value}))} type="number" placeholder="0.00" style={INP}/></div>}
        <div style={{marginBottom:14}}>
          <label style={{...LBL,marginBottom:6}}>📦 수량별 할인 (선택사항)</label>
          {(pf.tiered||[]).map((tier,i)=>(<div key={i} style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}><div style={{flex:1}}><input value={tier.qty} onChange={e=>setPf(p=>{const nt=[...(p.tiered||[])];nt[i]={...nt[i],qty:e.target.value};return{...p,tiered:nt};})} type="number" placeholder="수량" style={{...INP,padding:"6px 10px",fontSize:12}}/></div><span style={{fontSize:12,color:C.tLight}}>개 이상 →</span><div style={{flex:1}}><input value={tier.price} onChange={e=>setPf(p=>{const nt=[...(p.tiered||[])];nt[i]={...nt[i],price:e.target.value};return{...p,tiered:nt};})} type="number" step="0.01" placeholder="개당 가격" style={{...INP,padding:"6px 10px",fontSize:12}}/></div><span style={{fontSize:12,color:C.tLight}}>$</span><button onClick={()=>setPf(p=>{const nt=[...(p.tiered||[])];nt.splice(i,1);return{...p,tiered:nt};})} style={{...BTNS,padding:"4px 8px",background:C.danger}}>✕</button></div>))}
          <button onClick={()=>setPf(p=>({...p,tiered:[...(p.tiered||[]),{qty:"",price:""}]}))} style={{...BTNS,background:"#3498DB",marginTop:4}}>+ 수량 구간 추가</button>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{...LBL,marginBottom:6}}>🔀 옵션/사이즈 (선택사항)</label>
          <div style={{fontSize:11,color:C.tLight,marginBottom:8}}>예: 30봉 / 50봉, S / M / L 등</div>
          {(pf.variants||[]).map((v,i)=>(<div key={i} style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}><div style={{flex:2}}><input value={v.label} onChange={e=>setPf(p=>{const nv=[...(p.variants||[])];nv[i]={...nv[i],label:e.target.value};return{...p,variants:nv};})} type="text" placeholder="옵션명 (예: 30봉)" style={{...INP,padding:"6px 10px",fontSize:12}}/></div><span style={{fontSize:12,color:C.tLight}}>→</span><div style={{flex:1}}><input value={v.price} onChange={e=>setPf(p=>{const nv=[...(p.variants||[])];nv[i]={...nv[i],price:e.target.value};return{...p,variants:nv};})} type="number" step="0.01" placeholder="가격($)" style={{...INP,padding:"6px 10px",fontSize:12}}/></div><div style={{flex:1}}><input value={v.stock==null?"":v.stock} onChange={e=>setPf(p=>{const nv=[...(p.variants||[])];nv[i]={...nv[i],stock:e.target.value};return{...p,variants:nv};})} type="number" placeholder="재고" style={{...INP,padding:"6px 10px",fontSize:12}}/></div><button onClick={()=>setPf(p=>{const nv=[...(p.variants||[])];nv.splice(i,1);return{...p,variants:nv};})} style={{...BTNS,padding:"4px 8px",background:C.danger}}>✕</button></div>))}
          <button onClick={()=>setPf(p=>({...p,variants:[...(p.variants||[]),{label:"",price:"",stock:""}]}))} style={{...BTNS,background:"#8E44AD",marginTop:4}}>+ 옵션 추가</button>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}><button onClick={onClose} style={{...BTN,background:"transparent",color:C.primary,border:`1px solid ${C.primary}`}}>취소</button><button onClick={handleSave} disabled={saving} style={{...BTN,opacity:saving?0.5:1}}>{saving?"저장 중...":"저장"}</button></div>
      </div>
    </div>
  );
}

// Admin Component
const ADMIN_PASS = "5711";

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [passError, setPassError] = useState(false);

  // Check sessionStorage for existing auth
  useEffect(() => {
    if (typeof window !== "undefined" && window.sessionStorage.getItem("novo_admin_auth") === "true") setAuthed(true);
  }, []);

  const handleLogin = () => {
    if (passInput === ADMIN_PASS) {
      setAuthed(true);
      setPassError(false);
      if (typeof window !== "undefined") window.sessionStorage.setItem("novo_admin_auth", "true");
    } else {
      setPassError(true);
    }
  };

  if (!authed) return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet"/>
      <div style={{background:"#FFF",borderRadius:16,padding:32,maxWidth:360,width:"100%",margin:16,boxShadow:"0 4px 24px rgba(0,0,0,.1)",textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:12}}>🌿</div>
        <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:22,marginBottom:4}}>NOVO MARKET</h2>
        <div style={{fontSize:12,color:C.tLight,marginBottom:24}}>관리자 로그인</div>
        <input value={passInput} onChange={e=>{setPassInput(e.target.value);setPassError(false);}} onKeyDown={e=>{if(e.key==="Enter")handleLogin();}} type="password" placeholder="비밀번호 입력" style={{...INP,textAlign:"center",fontSize:15,marginBottom:12}}/>
        {passError&&<div style={{fontSize:12,color:C.danger,marginBottom:8}}>비밀번호가 틀렸습니다</div>}
        <button onClick={handleLogin} style={{...BTN,width:"100%",padding:12,fontSize:14}}>로그인</button>
      </div>
    </div>
  );

  return <AdminDashboard/>;
}

function AdminDashboard() {
  const [tab,setTab]=useState("dashboard");const [products,setProducts]=useState([]);const [orders,setOrders]=useState([]);const [promos,setPromos]=useState([]);const [categories,setCategories]=useState({});const [loaded,setLoaded]=useState(false);
  const [showPF,setShowPF]=useState(false);const [editPid,setEditPid]=useState(null);const [pfInitial,setPfInitial]=useState(null);
  const [showPrF,setShowPrF]=useState(false);const [editPrCode,setEditPrCode]=useState(null);const [showCatF,setShowCatF]=useState(false);const [catForm,setCatForm]=useState({id:"",nameKo:"",nameEn:""});const [editCatId,setEditCatId]=useState(null);
  const [oFilter,setOFilter]=useState("all");const [search,setSearch]=useState("");const [notif,setNotif]=useState("");const [prf,setPrf]=useState({code:"",type:"percent",value:0,minOrder:0,active:true});
  const trackingTimers=useRef({});const stockTimers=useRef({});
  useEffect(()=>()=>{Object.values(trackingTimers.current).forEach(clearTimeout);Object.values(stockTimers.current).forEach(clearTimeout);},[]);
  const [dragIdx,setDragIdx]=useState(null);const [dragOverIdx,setDragOverIdx]=useState(null);
  const [pSearch,setPSearch]=useState("");const [pSort,setPSort]=useState("order");const [pCatFilter,setPCatFilter]=useState("all");
  const [iSearch,setISearch]=useState("");const [iSort,setISort]=useState("order");const [iCatFilter,setICatFilter]=useState("all");
  const [iDragIdx,setIDragIdx]=useState(null);const [iDragOverIdx,setIDragOverIdx]=useState(null);

  useEffect(()=>{
    const unsubs=[];
    unsubs.push(subscribeProducts(prods=>{setProducts(prods);setLoaded(true);}));
    unsubs.push(subscribeOrders(ords=>{setOrders(ords);}));
    unsubs.push(subscribePromos(prs=>{setPromos(prs);}));
    unsubs.push(subscribeCategories(cats=>{const m={};Object.entries(cats).forEach(([id,d])=>{m[id]=d.nameKo||d;});setCategories(m);}));
    return()=>unsubs.forEach(u=>u());
  },[]);

  const noti=m=>{setNotif(m);setTimeout(()=>setNotif(""),3000);};
  const stats=useMemo(()=>{const now=new Date();const todayStr=now.toISOString().slice(0,10);const weekAgo=new Date(now);weekAgo.setDate(weekAgo.getDate()-7);const getDate=o=>o.createdAt?.toDate?o.createdAt.toDate():o.createdAt?new Date(o.createdAt):null;const active=orders.filter(o=>o.status!=="cancelled");const paid=active.filter(o=>o.status!=="pending_payment");return{today:active.filter(o=>{const d=getDate(o);return d&&d.toISOString().slice(0,10)===todayStr;}).length,todayRev:paid.filter(o=>{const d=getDate(o);return d&&d.toISOString().slice(0,10)===todayStr;}).reduce((s,o)=>s+(o.total||0),0),weekRev:paid.filter(o=>{const d=getDate(o);return d&&d>=weekAgo;}).reduce((s,o)=>s+(o.total||0),0),totalRev:paid.reduce((s,o)=>s+(o.total||0),0),pending:orders.filter(o=>o.status==="pending_payment"||o.status==="payment_submitted").length,lowStock:products.filter(p=>p.stock>0&&p.stock<=5).length,oos:products.filter(p=>p.stock===0).length,activeOrders:active.length};},[orders,products]);
  const fOrders=useMemo(()=>orders.filter(o=>(oFilter==="all"||o.status===oFilter)&&(!search||(o.orderNum||"").toLowerCase().includes(search.toLowerCase())||(o.customer?.name||"").toLowerCase().includes(search.toLowerCase())||(o.phone||"").includes(search))).sort((a,b)=>{const da=a.createdAt?.toDate?a.createdAt.toDate():a.createdAt?new Date(a.createdAt):new Date(0);const db2=b.createdAt?.toDate?b.createdAt.toDate():b.createdAt?new Date(b.createdAt):new Date(0);return db2-da;}),[orders,oFilter,search]);

  const exportCSV=()=>{const s=orders.filter(o=>o.status==="confirmed"||o.status==="preparing");if(!s.length){noti("배송할 주문이 없습니다");return;}const csv="Order Number,Name,Address,City,State,ZIP,Phone,Items,Total,Delivery,Gate Code\n"+s.map(o=>`${o.orderNum},"${o.customer?.name}","${o.customer?.address}","${o.customer?.city}",${o.customer?.state},${o.customer?.zip},"${o.phone}","${(o.items||[]).map(i=>`${i.name} x${i.qty}`).join("; ")}",${(o.total||0).toFixed(2)},${o.deliveryMethod||"delivery"},${o.customer?.gateCode||""}`).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=`novo_shipping_${new Date().toISOString().slice(0,10)}.csv`;a.click();noti(`${s.length}건 CSV 다운로드`);};
  const handleDeleteProduct=async id=>{try{await deleteProduct(id);noti("제품 삭제 완료");}catch{noti("삭제 실패");}};
  const handleOrderStatus=async(docId,newStatus,label,orderItems)=>{
    // Find current order to validate transition
    const currentOrder=orders.find(o=>o._docId===docId);
    const currentStatus=currentOrder?.status;
    if(currentStatus&&VALID_TRANSITIONS[currentStatus]&&!VALID_TRANSITIONS[currentStatus].includes(newStatus)){noti(`잘못된 상태 전환: ${STATUS[currentStatus]?.label||currentStatus} → ${STATUS[newStatus]?.label||newStatus}`);return;}
    try{if(newStatus==="cancelled"&&orderItems&&orderItems.length>0){const needsRestock=currentStatus&&currentStatus!=="pending_payment";await cancelOrderWithRestock(docId,needsRestock?orderItems.map(i=>({id:i.id||i.productId,qty:i.qty,...(i.variant?{variant:i.variant}:{})})):[]);noti(`→ ${label} ${needsRestock?"(재고 복원됨)":""}`);}else{await updateOrderStatus(docId,newStatus);noti(`→ ${label}`);}}catch(err){noti("상태 변경 실패: "+err.message);}
  };
  const handleTrackingUpdate=(docId,val)=>{setOrders(prev=>prev.map(o=>o._docId===docId?{...o,trackingNum:val}:o));if(trackingTimers.current[docId])clearTimeout(trackingTimers.current[docId]);trackingTimers.current[docId]=setTimeout(async()=>{try{await updateOrderField(docId,{trackingNum:val});}catch{}},800);};
  const handleStockChange=(pid,val)=>{const s=Math.max(0,val);setProducts(prev=>prev.map(p=>p.id===pid?{...p,stock:s}:p));if(stockTimers.current[pid])clearTimeout(stockTimers.current[pid]);stockTimers.current[pid]=setTimeout(async()=>{try{await updateProduct(pid,{stock:s});}catch{}},500);};
  const handleSavePromo=async()=>{if(!prf.code){noti("코드 입력");return;}try{if(editPrCode)await updatePromo(prf.code,{...prf});else await addPromo({...prf});noti(editPrCode?"수정 완료":"추가 완료");setShowPrF(false);}catch{noti("저장 실패");}};
  const handleTrackingCSV=async(file)=>{if(!file)return;const text=await file.text();const lines=text.split("\n").map(l=>l.split(",").map(c=>c.trim().replace(/^"|"$/g,"")));if(lines.length<2){noti("CSV 데이터 없음");return;}const headers=lines[0].map(h=>h.toLowerCase());const orderIdx=headers.findIndex(h=>h.includes("order"));const trackIdx=headers.findIndex(h=>h.includes("track"));if(orderIdx===-1||trackIdx===-1){noti("Order Number 또는 Tracking Number 컬럼을 찾을 수 없습니다");return;}let matched=0;for(let i=1;i<lines.length;i++){const row=lines[i];if(!row||row.length<=Math.max(orderIdx,trackIdx))continue;const orderNum=row[orderIdx]?.trim();const tracking=row[trackIdx]?.trim();if(!orderNum||!tracking)continue;const found=orders.find(o=>o.orderNum===orderNum);if(found&&found._docId){try{await updateOrderField(found._docId,{trackingNum:tracking,status:"shipped"});matched++;}catch(e){console.error(e);}}}noti(`${matched}건 트래킹 업데이트 완료`);};
  const handleDeletePromo=async code=>{try{await deletePromo(code);noti("삭제 완료");}catch{noti("삭제 실패");}};
  const handleSaveCategory=async()=>{if(!catForm.id||!catForm.nameKo){noti("ID와 이름을 입력하세요");return;}if(!editCatId&&categories[catForm.id]){noti("이미 존재하는 ID입니다");return;}try{await saveCategory(catForm.id,{nameKo:catForm.nameKo,nameEn:catForm.nameEn||catForm.id});noti(editCatId?"카테고리 수정 완료":"카테고리 추가 완료");setShowCatF(false);}catch{noti("저장 실패");}};
  const handleDeleteCategory=async id=>{if(products.some(p=>p.category===id)){noti("해당 카테고리에 제품이 있어 삭제 불가");return;}try{await deleteCategory(id);noti("카테고리 삭제 완료");}catch{noti("삭제 실패");}};
  const getOrderDate=o=>{if(o.createdAt?.toDate)return o.createdAt.toDate().toLocaleDateString("ko-KR");if(o.createdAt)return new Date(o.createdAt).toLocaleDateString("ko-KR");return"";};
  const openProductForm=product=>{const init=product?{...product}:{id:`p${Date.now()}`,category:Object.keys(categories)[0]||"babyfood",brand:"",nameEn:"",nameKo:"",price:0,stock:0,image:"📦",sale:false,salePrice:0,active:true,media:[],tiered:[],descKo:"",descEn:"",tags:[],variants:[]};setPfInitial(init);setEditPid(product?product.id:null);setShowPF(true);};
  const handleProductDone=message=>{setShowPF(false);noti(message);};

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:C.bg,minHeight:"100vh"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet"/>
      <style>{`@keyframes si{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}input:focus,select:focus,textarea:focus{border-color:#2D5A3D!important}@media(max-width:600px){.novo-admin-content{padding:12px!important}}`}</style>
      {notif&&<div style={{position:"fixed",top:16,right:16,background:C.primary,color:"#FFF",padding:"12px 20px",borderRadius:10,fontSize:13,fontWeight:600,zIndex:2000,boxShadow:"0 4px 20px rgba(0,0,0,.2)",animation:"si .3s ease"}}>✓ {notif}</div>}
      <div style={{background:"#1B2A3D",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:20}}>🌿</span><span style={{fontFamily:"'DM Serif Display',serif",color:"#FFF",fontSize:18}}>NOVO MARKET</span><span style={{color:"rgba(255,255,255,.5)",fontSize:12}}>Admin</span></div><div style={{display:"flex",alignItems:"center",gap:10}}>{stats.pending>0&&<span style={{background:C.warn,color:"#FFF",borderRadius:12,padding:"4px 10px",fontSize:11,fontWeight:700}}>⚠ {stats.pending} pending</span>}<button onClick={()=>{if(typeof window!=="undefined")window.sessionStorage.removeItem("novo_admin_auth");window.location.reload();}} style={{...BTNS,background:"transparent",color:"rgba(255,255,255,.5)",border:"1px solid rgba(255,255,255,.2)"}}>로그아웃</button></div></div>
      <div style={{background:"#FFF",borderBottom:`1px solid ${C.border}`,display:"flex",overflowX:"auto",padding:"0 12px"}}>{TABS.map(t=><button key={t.k} onClick={()=>setTab(t.k)} style={{padding:"14px 16px",border:"none",background:"none",cursor:"pointer",fontSize:13,fontWeight:tab===t.k?700:500,color:tab===t.k?C.primary:C.tLight,borderBottom:tab===t.k?`3px solid ${C.primary}`:"3px solid transparent",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap"}}>{t.i} {t.l}</button>)}</div>
      <div style={{padding:20,maxWidth:1100,margin:"0 auto"}}>
        {!loaded&&<div style={{textAlign:"center",padding:"60px 0",color:C.tLight}}><div style={{fontSize:40,marginBottom:12}}>⏳</div><div>Firebase 데이터 로딩 중...</div></div>}

        {loaded&&tab==="dashboard"&&<div><h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:24,marginBottom:20}}>📊 대시보드</h2><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:24}}>{[{l:"오늘 주문",v:stats.today,i:"📦",cl:C.primary},{l:"오늘 매출",v:`$${stats.todayRev.toFixed(0)}`,i:"💵",cl:C.success},{l:"이번주 매출",v:`$${stats.weekRev.toFixed(0)}`,i:"📈",cl:C.accent},{l:"총 매출",v:`$${stats.totalRev.toFixed(0)}`,i:"💰",cl:"#2980B9"},{l:"처리 대기",v:stats.pending,i:"⏳",cl:C.warn},{l:"재고 부족",v:stats.lowStock,i:"⚠️",cl:C.danger},{l:"품절",v:stats.oos,i:"🚫",cl:"#666"},{l:"활성 주문",v:stats.activeOrders,i:"📋",cl:C.primary}].map((s,i)=><div key={i} style={{background:"#FFF",borderRadius:14,padding:16,border:`1px solid ${C.border}`,position:"relative"}}><div style={{position:"absolute",top:10,right:12,fontSize:24,opacity:0.12}}>{s.i}</div><div style={{fontSize:10,color:C.tLight,fontWeight:600,marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>{s.l}</div><div style={{fontSize:24,fontWeight:700,color:s.cl}}>{s.v}</div></div>)}</div><div style={{background:"#FFF",borderRadius:14,padding:20,border:`1px solid ${C.border}`}}><h3 style={{fontSize:15,fontWeight:700,marginBottom:14}}>최근 주문</h3>{orders.filter(o=>o.status!=="cancelled").slice(0,5).map(o=><div key={o._docId||o.orderNum} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}><div><span style={{fontWeight:700,color:C.primary,marginRight:10}}>{o.orderNum}</span><span style={{fontSize:13}}>{o.customer?.name}</span></div><div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontWeight:700,fontSize:14}}>${(o.total||0).toFixed(2)}</span><span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:6,background:STATUS[o.status]?.bg,color:STATUS[o.status]?.color}}>{STATUS[o.status]?.label}</span></div></div>)}</div></div>}

        {loaded&&tab==="orders"&&<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}><h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:24,margin:0}}>📦 주문 관리</h2><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button onClick={exportCSV} style={BTN}>📄 배송 CSV</button><label style={{...BTN,background:"#8E44AD",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:4}}>📥 트래킹 CSV 업로드<input type="file" accept=".csv,.xlsx,.xls" style={{display:"none"}} onChange={e=>{handleTrackingCSV(e.target.files[0]);e.target.value="";}}/></label></div></div><div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="주문번호, 이름, 전화번호 검색..." style={{...INP,maxWidth:280}}/><select value={oFilter} onChange={e=>setOFilter(e.target.value)} style={{...INP,maxWidth:160}}><option value="all">전체 상태</option>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
        {fOrders.map(o=><div key={o._docId||o.orderNum} style={{background:"#FFF",borderRadius:12,padding:16,marginBottom:10,border:`1px solid ${C.border}`,borderLeft:`4px solid ${STATUS[o.status]?.color||"#CCC"}`}}><div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}><div><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><span style={{fontWeight:800,fontSize:16,color:C.primary}}>{o.orderNum}</span><span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:6,background:STATUS[o.status]?.bg,color:STATUS[o.status]?.color}}>{STATUS[o.status]?.label}</span></div><div style={{fontSize:13,color:C.tLight}}>{o.customer?.name} · {o.phone}</div><div style={{fontSize:12,color:C.tLight}}>{o.customer?.address}, {o.customer?.city}, {o.customer?.state} {o.customer?.zip}</div><div style={{fontSize:12,color:C.tLight}}>{o.deliveryMethod==="irvine"?"🏠 얼바인 배달":o.deliveryMethod==="buena_park"?"📍 부에나파크 픽업":"🚚 택배"}{o.customer?.gateCode&&` · Gate: ${o.customer.gateCode}`}{o.paymentMethod&&` · ${o.paymentMethod}`}</div></div><div style={{textAlign:"right"}}><div style={{fontWeight:800,fontSize:18}}>${(o.total||0).toFixed(2)}</div><div style={{fontSize:11,color:C.tLight}}>{getOrderDate(o)}</div></div></div><div style={{margin:"10px 0",padding:"8px 12px",background:"#F8F9FA",borderRadius:8}}>{(o.items||[]).map((it,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}><span>{it.name} × {it.qty}</span><span style={{fontWeight:600}}>${(it.price*it.qty).toFixed(2)}</span></div>)}{(o.discount||0)>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.danger}}><span>할인</span><span>-${o.discount.toFixed(2)}</span></div>}<div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span>배송비</span><span>{o.shipping===0?"무료":`$${(o.shipping||0).toFixed(2)}`}</span></div></div><div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>{o.status==="pending_payment"&&<button onClick={()=>handleOrderStatus(o._docId,"confirmed",`${o.orderNum} → 결제 확인`)} style={{...BTNS,background:C.warn}}>💳 결제 확인</button>}{o.status==="payment_submitted"&&<button onClick={()=>handleOrderStatus(o._docId,"confirmed",`${o.orderNum} → 결제 승인`)} style={{...BTNS,background:C.success}}>✓ 결제 승인</button>}{o.status==="confirmed"&&<button onClick={()=>handleOrderStatus(o._docId,"preparing",`${o.orderNum} → 준비중`)} style={{...BTNS,background:"#2980B9"}}>📦 준비 시작</button>}{(o.status==="preparing"||o.status==="confirmed")&&<div style={{display:"flex",gap:6,alignItems:"center"}}><input value={o.trackingNum||""} onChange={e=>handleTrackingUpdate(o._docId,e.target.value)} placeholder="트래킹 번호" style={{...INP,maxWidth:200,padding:"6px 10px",fontSize:12}}/>{o.trackingNum&&<button onClick={()=>handleOrderStatus(o._docId,"shipped",`${o.orderNum} → 발송`)} style={{...BTNS,background:"#8E44AD"}}>🚚 발송</button>}</div>}{o.status==="shipped"&&<button onClick={()=>handleOrderStatus(o._docId,"delivered",`${o.orderNum} → 배송완료`)} style={{...BTNS,background:"#2C3E50"}}>✓ 배송 완료</button>}{(o.status==="confirmed"||o.status==="preparing")&&(o.deliveryMethod==="irvine"||o.deliveryMethod==="buena_park")&&<button onClick={()=>handleOrderStatus(o._docId,"delivered",`${o.orderNum} → ${o.deliveryMethod==="irvine"?"배달":"픽업"} 완료`)} style={{...BTNS,background:"#2C3E50"}}>{o.deliveryMethod==="irvine"?"🏠 배달 완료":"📍 픽업 완료"}</button>}{o.status!=="cancelled"&&o.status!=="delivered"&&<button onClick={()=>{if(window.confirm(`${o.orderNum} 주문을 취소하시겠습니까? 재고가 복원됩니다.`))handleOrderStatus(o._docId,"cancelled",`${o.orderNum} → 취소`,o.items);}} style={{...BTNS,background:"#95A5A6"}}>✕ 취소</button>}{o.trackingNum&&<a href={o.trackingNum.trim().toUpperCase().startsWith("1Z")?`https://www.ups.com/track?tracknum=${o.trackingNum.trim()}`:(o.trackingNum.trim().length>=20?`https://tools.usps.com/go/TrackConfirmAction?tLabels=${o.trackingNum.trim()}`:`https://www.fedex.com/fedextrack/?trknbr=${o.trackingNum.trim()}`)} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#8E44AD",fontWeight:600,textDecoration:"underline",cursor:"pointer"}}>📍 {o.trackingNum} →</a>}{PREV_STATUS[o.status]&&<button onClick={()=>{if(window.confirm(`${o.orderNum}: ${STATUS[o.status]?.label} → ${STATUS[PREV_STATUS[o.status]]?.label} 되돌리시겠습니까?`))handleOrderStatus(o._docId,PREV_STATUS[o.status],`${o.orderNum} ← ${STATUS[PREV_STATUS[o.status]]?.label}`);}} style={{...BTNS,background:"transparent",color:C.tLight,border:`1px solid ${C.border}`}}>↩ 되돌리기</button>}</div></div>)}</div>}

        {loaded&&tab==="products"&&(()=>{
          const base=[...products].filter(p=>{
            if(pCatFilter!=="all"&&p.category!==pCatFilter)return false;
            if(!pSearch)return true;
            const q=pSearch.toLowerCase();
            return (p.nameKo||"").toLowerCase().includes(q)||(p.nameEn||"").toLowerCase().includes(q)||(p.brand||"").toLowerCase().includes(q);
          });
          const sorted=base.sort((a,b)=>{
            if(pSort==="order"){const ao=typeof a.order==="number"?a.order:9999;const bo=typeof b.order==="number"?b.order:9999;return ao!==bo?ao-bo:(a.nameKo||"").localeCompare(b.nameKo||"");}
            if(pSort==="name")return(a.nameKo||"").localeCompare(b.nameKo||"");
            if(pSort==="price")return(a.sale?a.salePrice:a.price)-(b.sale?b.salePrice:b.price);
            if(pSort==="priceDesc")return(b.sale?b.salePrice:b.price)-(a.sale?a.salePrice:a.price);
            if(pSort==="stock")return a.stock-b.stock;
            if(pSort==="stockDesc")return b.stock-a.stock;
            return 0;
          });
          const handleDrop=async(e,targetIdx)=>{
            e.preventDefault();
            if(dragIdx===null||dragIdx===targetIdx){setDragIdx(null);setDragOverIdx(null);return;}
            const next=[...sorted];const[moved]=next.splice(dragIdx,1);next.splice(targetIdx,0,moved);
            setDragIdx(null);setDragOverIdx(null);
            try{await reorderProducts(next.map(p=>p.id));noti(`${moved.nameKo}: #${dragIdx+1} → #${targetIdx+1}`);}catch{noti("순서 변경 실패");}
          };
          // direction indicator
          const getDir=(from,to)=>{
            if(from===null||to===null||from===to)return null;
            const diff=to-from;
            return diff<0?"⬆ 여기 위로":"⬇ 여기 아래로";
          };
          return <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:24,margin:0}}>🏷️ 제품 관리</h2>
              <button onClick={()=>openProductForm(null)} style={BTN}>+ 제품 추가</button>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
              <input value={pSearch} onChange={e=>setPSearch(e.target.value)} placeholder="제품명, 브랜드 검색..." style={{...INP,maxWidth:220,padding:"8px 12px",fontSize:12}}/>
              <select value={pCatFilter} onChange={e=>setPCatFilter(e.target.value)} style={{...INP,maxWidth:150,padding:"8px 12px",fontSize:12}}>
                <option value="all">전체 카테고리</option>
                {Object.entries(categories).map(([id,name])=><option key={id} value={id}>{name}</option>)}
              </select>
              <select value={pSort} onChange={e=>setPSort(e.target.value)} style={{...INP,maxWidth:150,padding:"8px 12px",fontSize:12}}>
                <option value="order">순서 (드래그)</option>
                <option value="name">이름순</option>
                <option value="price">가격 낮은순</option>
                <option value="priceDesc">가격 높은순</option>
                <option value="stock">재고 적은순</option>
                <option value="stockDesc">재고 많은순</option>
              </select>
              <span style={{fontSize:11,color:C.tLight}}>{sorted.length}개 제품</span>
            </div>
            {pSort==="order"&&<div style={{fontSize:11,color:C.tLight,marginBottom:12,padding:"8px 12px",background:"#F8F9FA",borderRadius:8,border:`1px dashed ${C.border}`}}>
              💡 드래그해서 순서 변경 · 변경 즉시 고객 사이트 반영
            </div>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
              {sorted.map((p,idx)=><div key={p.id}
                draggable={pSort==="order"&&!pSearch&&pCatFilter==="all"}
                onDragStart={()=>{if(pSort==="order"&&!pSearch&&pCatFilter==="all")setDragIdx(idx);}}
                onDragOver={e=>{e.preventDefault();if(dragOverIdx!==idx)setDragOverIdx(idx);}}
                onDragLeave={()=>{if(dragOverIdx===idx)setDragOverIdx(null);}}
                onDrop={e=>handleDrop(e,idx)}
                onDragEnd={()=>{setDragIdx(null);setDragOverIdx(null);}}
                onTouchStart={e=>{setDragIdx(idx);}}
                onTouchEnd={()=>{if(dragIdx!==null&&dragOverIdx!==null&&dragIdx!==dragOverIdx){const fakeE={preventDefault:()=>{}};handleDrop(fakeE,dragOverIdx);}else{setDragIdx(null);setDragOverIdx(null);}}}
                style={{
                  background:dragIdx===idx?"#E8F0EB":dragOverIdx===idx&&dragIdx!==null?"#FFF3EB":"#FFF",
                  borderRadius:12,padding:16,
                  border:dragOverIdx===idx&&dragIdx!==null?`2px solid ${C.accent}`:`1px solid ${C.border}`,
                  opacity:dragIdx===idx?0.5:p.active?1:0.5,
                  position:"relative",cursor:"grab",
                  transition:"border-color 0.15s, background 0.15s, opacity 0.15s, transform 0.15s",
                  transform:dragOverIdx===idx&&dragIdx!==null?"scale(1.02)":"scale(1)",
                  userSelect:"none",
                }}>
                {/* Position badge */}
                <div style={{position:"absolute",top:8,left:8,background:C.primary,color:"#FFF",fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:10,zIndex:1}}>#{idx+1}</div>
                {/* Drop direction indicator */}
                {dragOverIdx===idx&&dragIdx!==null&&dragIdx!==idx&&<div style={{position:"absolute",top:8,right:8,background:C.accent,color:"#FFF",fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:8,zIndex:2,animation:"si .2s ease"}}>{getDir(dragIdx,idx)}</div>}
                {/* Drag being dragged indicator */}
                {dragIdx===idx&&<div style={{position:"absolute",top:8,right:8,background:C.primary,color:"#FFF",fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:8,zIndex:2}}>✊ 드래그 중</div>}
                {!p.active&&dragIdx!==idx&&!(dragOverIdx===idx&&dragIdx!==null)&&<div style={{position:"absolute",top:8,right:8,fontSize:10,background:"#EEE",padding:"2px 6px",borderRadius:4,color:"#999"}}>비활성</div>}
                <div style={{display:"flex",gap:12,marginTop:4}}>
                  <div style={{width:60,height:60,borderRadius:8,overflow:"hidden",flexShrink:0,background:"#F0EDE8",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {p.media?.length>0&&p.media[0].url?<img src={p.media[0].url} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} loading="lazy" draggable={false}/>:<span style={{fontSize:30}}>{p.image||"📦"}</span>}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>{p.brand&&<span style={{fontSize:10,color:C.accent,fontWeight:600,marginRight:4}}>{p.brand}</span>}{p.nameKo}</div>
                    <div style={{fontSize:11,color:C.tLight,marginBottom:6}}>{p.nameEn}</div>
                    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                      {p.sale?<><span style={{fontWeight:800,color:C.danger}}>${(p.salePrice||0).toFixed(2)}</span><span style={{fontSize:11,color:C.tLight,textDecoration:"line-through"}}>${(p.price||0).toFixed(2)}</span></>:<span style={{fontWeight:800,color:C.primary}}>${(p.price||0).toFixed(2)}</span>}
                    </div>
                    <div style={{fontSize:12,color:p.stock===0?C.danger:p.stock<=5?C.warn:C.tLight,fontWeight:p.stock<=5?700:400}}>재고: {p.stock}개{p.stock===0&&" ⚠️ 품절"}</div>
                    <div style={{fontSize:11,color:C.tLight}}>{categories[p.category]||p.category}{p.media?.length>0&&<span style={{marginLeft:6}}>📷 {p.media.length}</span>}{p.tiered?.length>0&&<span style={{marginLeft:6,color:C.primary}}>📦 {p.tiered.length}구간</span>}</div>
                    {p.tags?.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4}}>{p.tags.map((tag,i)=><span key={i} style={{fontSize:9,fontWeight:600,padding:"2px 6px",borderRadius:10,background:tag.color||"#EEE",color:tag.textColor||"#555"}}>{tag.label}</span>)}</div>}
                  </div>
                </div>
                <div style={{display:"flex",gap:6,marginTop:10,justifyContent:"flex-end"}}>
                  <button onClick={()=>openProductForm(p)} onMouseDown={e=>e.stopPropagation()} style={{...BTNS,background:"#3498DB"}}>✏️ 수정</button>
                  <button onClick={()=>handleDeleteProduct(p.id)} onMouseDown={e=>e.stopPropagation()} style={{...BTNS,background:C.danger}}>🗑 삭제</button>
                </div>
              </div>)}
            </div>
            {showPF&&pfInitial&&<ProductFormModal initialData={pfInitial} initialCategories={categories} editPid={editPid} onDone={handleProductDone} onClose={()=>setShowPF(false)}/>}
          </div>;
        })()}

        {loaded&&tab==="categories"&&<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:24,margin:0}}>📂 카테고리 관리</h2><button onClick={()=>{setCatForm({id:"",nameKo:"",nameEn:""});setEditCatId(null);setShowCatF(true);}} style={BTN}>+ 카테고리 추가</button></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:12}}>{Object.entries(categories).map(([id,name])=>{const count=products.filter(p=>p.category===id).length;return<div key={id} style={{background:"#FFF",borderRadius:12,padding:16,border:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:16,fontWeight:700,color:C.primary}}>{name}</div><div style={{fontSize:12,color:C.tLight,marginTop:4}}>ID: {id} · 제품 {count}개</div></div><div style={{display:"flex",gap:6}}><button onClick={()=>{setCatForm({id,nameKo:name,nameEn:id});setEditCatId(id);setShowCatF(true);}} style={{...BTNS,background:"#3498DB"}}>✏️</button><button onClick={()=>handleDeleteCategory(id)} style={{...BTNS,background:C.danger}}>🗑</button></div></div>;})}</div>
        {showCatF&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}><div style={{background:"#FFF",borderRadius:16,maxWidth:520,width:"100%",padding:24}}><h3 style={{margin:"0 0 20px",fontSize:18,fontWeight:700}}>{editCatId?"카테고리 수정":"새 카테고리 추가"}</h3><div style={{marginBottom:12}}><label style={LBL}>카테고리 ID (영문, 소문자)</label><input value={catForm.id} onChange={e=>setCatForm(p=>({...p,id:e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,"")}))} disabled={!!editCatId} placeholder="예: baby_food" style={{...INP,background:editCatId?"#F5F5F5":"#FFF"}}/></div><div style={{marginBottom:12}}><label style={LBL}>카테고리 이름 (한국어)</label><input value={catForm.nameKo} onChange={e=>setCatForm(p=>({...p,nameKo:e.target.value}))} placeholder="예: 이유식" style={INP}/></div><div style={{marginBottom:12}}><label style={LBL}>Category Name (English)</label><input value={catForm.nameEn||""} onChange={e=>setCatForm(p=>({...p,nameEn:e.target.value}))} placeholder="예: Baby Food" style={INP}/></div><div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}><button onClick={()=>setShowCatF(false)} style={{...BTN,background:"transparent",color:C.primary,border:`1px solid ${C.primary}`}}>취소</button><button onClick={handleSaveCategory} style={BTN}>저장</button></div></div></div>}
        </div>}

        {loaded&&tab==="promos"&&<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:24,margin:0}}>🎟️ 프로모션 관리</h2><button onClick={()=>{setPrf({code:"",type:"percent",value:0,minOrder:0,active:true});setEditPrCode(null);setShowPrF(true);}} style={BTN}>+ 추가</button></div>{promos.map(p=><div key={p.code||p._docId} style={{background:"#FFF",borderRadius:12,padding:16,marginBottom:10,border:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",opacity:p.active?1:0.5}}><div><div style={{fontWeight:800,fontSize:16,color:C.primary,letterSpacing:1}}>{p.code}</div><div style={{fontSize:13,color:C.tLight,marginTop:4}}>{p.type==="percent"?`${p.value}% 할인`:`$${p.value} 할인`}{p.minOrder>0&&` · 최소 $${p.minOrder}`}</div></div><div style={{display:"flex",gap:6}}><button onClick={()=>{setPrf({...p});setEditPrCode(p.code);setShowPrF(true);}} style={{...BTNS,background:"#3498DB"}}>✏️</button><button onClick={()=>handleDeletePromo(p.code)} style={{...BTNS,background:C.danger}}>🗑</button></div></div>)}
        {showPrF&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}><div style={{background:"#FFF",borderRadius:16,maxWidth:520,width:"100%",padding:24}}><h3 style={{margin:"0 0 20px",fontSize:18,fontWeight:700}}>{editPrCode?"프로모션 수정":"새 프로모션"}</h3><div style={{marginBottom:12}}><label style={LBL}>코드</label><input value={prf.code} onChange={e=>setPrf(p=>({...p,code:e.target.value.toUpperCase()}))} style={INP} placeholder="예: SUMMER30"/></div><div style={{marginBottom:12}}><label style={LBL}>타입</label><select value={prf.type} onChange={e=>setPrf(p=>({...p,type:e.target.value}))} style={INP}><option value="percent">% 할인</option><option value="fixed">$ 할인</option></select></div><div style={{marginBottom:12}}><label style={LBL}>할인 값</label><input value={prf.value} onChange={e=>setPrf(p=>({...p,value:Number(e.target.value)}))} type="number" style={INP}/></div><div style={{marginBottom:12}}><label style={LBL}>최소 주문 ($)</label><input value={prf.minOrder} onChange={e=>setPrf(p=>({...p,minOrder:Number(e.target.value)}))} type="number" style={INP}/></div><label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,cursor:"pointer",marginBottom:16}}><input type="checkbox" checked={prf.active} onChange={e=>setPrf(p=>({...p,active:e.target.checked}))}/>활성화</label><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button onClick={()=>setShowPrF(false)} style={{...BTN,background:"transparent",color:C.primary,border:`1px solid ${C.primary}`}}>취소</button><button onClick={handleSavePromo} style={BTN}>저장</button></div></div></div>}
        </div>}

        {loaded&&tab==="inventory"&&(()=>{
          const canDrag=iSort==="order"&&!iSearch&&iCatFilter==="all";
          const iBase=products.filter(p=>{
            if(!p.active)return false;
            if(iCatFilter!=="all"&&p.category!==iCatFilter)return false;
            if(!iSearch)return true;
            const q=iSearch.toLowerCase();
            return(p.nameKo||"").toLowerCase().includes(q)||(p.nameEn||"").toLowerCase().includes(q)||(p.brand||"").toLowerCase().includes(q);
          });
          const iSorted=[...iBase].sort((a,b)=>{
            if(iSort==="order"){const ao=typeof a.order==="number"?a.order:9999;const bo=typeof b.order==="number"?b.order:9999;return ao!==bo?ao-bo:(a.nameKo||"").localeCompare(b.nameKo||"");}
            if(iSort==="name")return(a.nameKo||"").localeCompare(b.nameKo||"");
            if(iSort==="price")return(a.sale?a.salePrice:a.price)-(b.sale?b.salePrice:b.price);
            if(iSort==="priceDesc")return(b.sale?b.salePrice:b.price)-(a.sale?a.salePrice:a.price);
            if(iSort==="stock")return a.stock-b.stock;
            if(iSort==="stockDesc")return b.stock-a.stock;
            return 0;
          });
          const iHandleDrop=async(e,targetIdx)=>{
            e.preventDefault();
            if(iDragIdx===null||iDragIdx===targetIdx){setIDragIdx(null);setIDragOverIdx(null);return;}
            const next=[...iSorted];const[moved]=next.splice(iDragIdx,1);next.splice(targetIdx,0,moved);
            setIDragIdx(null);setIDragOverIdx(null);
            try{await reorderProducts(next.map(p=>p.id));noti(`${moved.nameKo}: #${iDragIdx+1} → #${targetIdx+1}`);}catch{noti("순서 변경 실패");}
          };
          const iGetDir=(from,to)=>{if(from===null||to===null||from===to)return null;return to<from?"⬆ 위로":"⬇ 아래로";};
          return <div><h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:24,marginBottom:12}}>📋 재고 관리</h2>
          <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
            <input value={iSearch} onChange={e=>setISearch(e.target.value)} placeholder="제품명, 브랜드 검색..." style={{...INP,maxWidth:220,padding:"8px 12px",fontSize:12}}/>
            <select value={iCatFilter} onChange={e=>setICatFilter(e.target.value)} style={{...INP,maxWidth:150,padding:"8px 12px",fontSize:12}}>
              <option value="all">전체 카테고리</option>
              {Object.entries(categories).map(([id,name])=><option key={id} value={id}>{name}</option>)}
            </select>
            <select value={iSort} onChange={e=>setISort(e.target.value)} style={{...INP,maxWidth:150,padding:"8px 12px",fontSize:12}}>
              <option value="order">순서 (드래그)</option>
              <option value="name">이름순</option>
              <option value="stock">재고 적은순</option>
              <option value="stockDesc">재고 많은순</option>
              <option value="price">가격 낮은순</option>
              <option value="priceDesc">가격 높은순</option>
            </select>
            <span style={{fontSize:11,color:C.tLight}}>{iSorted.length}개 제품</span>
          </div>
          {canDrag&&<div style={{fontSize:11,color:C.tLight,marginBottom:10,padding:"8px 12px",background:"#F8F9FA",borderRadius:8,border:`1px dashed ${C.border}`}}>💡 드래그해서 순서 변경 · 변경 즉시 고객 사이트 반영</div>}
          {(()=>{const lowItems=[];products.filter(p=>p.active).forEach(p=>{if(p.variants?.length>0){p.variants.forEach(v=>{if((v.stock||0)<=5)lowItems.push({key:`${p.id}_${v.label}`,image:p.image,name:`${p.nameKo} (${v.label})`,stock:v.stock||0});});}else if(p.stock<=5){lowItems.push({key:p.id,image:p.image,name:p.nameKo,stock:p.stock});}});return lowItems.length>0&&<div style={{background:C.wLight,border:`1px solid ${C.warn}33`,borderRadius:12,padding:"14px 16px",marginBottom:16}}><div style={{fontWeight:700,fontSize:13,color:C.warn,marginBottom:6}}>⚠️ 재고 부족 / 품절</div>{lowItems.map(item=><div key={item.key} style={{fontSize:12,padding:"2px 0"}}>{item.image||"📦"} {item.name} — <strong style={{color:item.stock===0?C.danger:C.warn}}>{item.stock===0?"품절":`${item.stock}개`}</strong></div>)}</div>;})()}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>{iSorted.map((p,idx)=><div key={p.id}
            draggable={canDrag}
            onDragStart={()=>{if(canDrag)setIDragIdx(idx);}}
            onDragOver={e=>{e.preventDefault();if(iDragOverIdx!==idx)setIDragOverIdx(idx);}}
            onDragLeave={()=>{if(iDragOverIdx===idx)setIDragOverIdx(null);}}
            onDrop={e=>iHandleDrop(e,idx)}
            onDragEnd={()=>{setIDragIdx(null);setIDragOverIdx(null);}}
            style={{background:iDragIdx===idx?"#E8F0EB":iDragOverIdx===idx&&iDragIdx!==null?"#FFF3EB":"#FFF",borderRadius:12,padding:"12px 16px",border:iDragOverIdx===idx&&iDragIdx!==null?`2px solid ${C.accent}`:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12,opacity:iDragIdx===idx?0.5:1,cursor:canDrag?"grab":"default",transition:"border-color 0.15s, background 0.15s, opacity 0.15s",position:"relative",userSelect:"none"}}>
            {canDrag&&<div style={{flexShrink:0,fontSize:10,fontWeight:700,color:"#FFF",background:C.primary,borderRadius:10,padding:"2px 7px",minWidth:24,textAlign:"center"}}>#{idx+1}</div>}
            {iDragOverIdx===idx&&iDragIdx!==null&&iDragIdx!==idx&&<div style={{position:"absolute",top:4,right:8,background:C.accent,color:"#FFF",fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:8,zIndex:2,animation:"si .2s ease"}}>{iGetDir(iDragIdx,idx)}</div>}
            {iDragIdx===idx&&<div style={{position:"absolute",top:4,right:8,background:C.primary,color:"#FFF",fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:8,zIndex:2}}>✊ 드래그 중</div>}
            <div style={{flexShrink:0,width:36,height:36,borderRadius:6,overflow:"hidden",background:"#F0EDE8",display:"flex",alignItems:"center",justifyContent:"center"}}>{p.media?.length>0&&p.media[0].url?<img src={p.media[0].url} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} loading="lazy" draggable={false}/>:<span style={{fontSize:18}}>{p.image||"📦"}</span>}</div>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.brand&&<span style={{fontSize:10,color:C.accent,fontWeight:600,marginRight:4}}>{p.brand}</span>}{p.nameKo}</div><div style={{fontSize:11,color:C.tLight}}>{categories[p.category]||p.category} · ${(p.sale?p.salePrice:p.price||0).toFixed(2)}</div></div>
            {p.variants?.length>0?<div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}} onMouseDown={e=>e.stopPropagation()}>{p.variants.map((v,vi)=><div key={vi} style={{display:"flex",gap:4,alignItems:"center"}}><span style={{fontSize:11,color:C.tLight,minWidth:50,textAlign:"right"}}>{v.label}</span><span style={{fontWeight:700,padding:"2px 8px",borderRadius:6,fontSize:11,background:(v.stock||0)===0?C.dLight:(v.stock||0)<=5?C.wLight:C.pLight,color:(v.stock||0)===0?C.danger:(v.stock||0)<=5?C.warn:C.primary,minWidth:24,textAlign:"center"}}>{v.stock||0}</span><button onClick={()=>{const nv=[...p.variants];nv[vi]={...nv[vi],stock:Math.max(0,(nv[vi].stock||0)-1)};updateProduct(p.id,{variants:nv}).then(()=>noti(`${p.nameKo} ${v.label}: ${nv[vi].stock}`));}} style={{...BTNS,padding:"3px 8px",fontSize:11,background:C.tLight}}>−</button><input value={v.stock||0} onChange={e=>{const val=Math.max(0,parseInt(e.target.value)||0);const nv=[...p.variants];nv[vi]={...nv[vi],stock:val};if(stockTimers.current[`${p.id}_${vi}`])clearTimeout(stockTimers.current[`${p.id}_${vi}`]);setProducts(prev=>prev.map(pr=>pr.id===p.id?{...pr,variants:nv}:pr));stockTimers.current[`${p.id}_${vi}`]=setTimeout(()=>{updateProduct(p.id,{variants:nv});},500);}} style={{width:36,textAlign:"center",border:`1px solid ${C.border}`,borderRadius:4,padding:2,fontSize:11,fontFamily:"'DM Sans',sans-serif"}}/><button onClick={()=>{const nv=[...p.variants];nv[vi]={...nv[vi],stock:(nv[vi].stock||0)+1};updateProduct(p.id,{variants:nv}).then(()=>noti(`${p.nameKo} ${v.label}: ${nv[vi].stock}`));}} style={{...BTNS,padding:"3px 8px",fontSize:11}}>+</button></div>)}</div>:<>
            <span style={{fontWeight:700,padding:"3px 10px",borderRadius:6,fontSize:12,background:p.stock===0?C.dLight:p.stock<=5?C.wLight:C.pLight,color:p.stock===0?C.danger:p.stock<=5?C.warn:C.primary,flexShrink:0}}>{p.stock}</span>
            <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}} onMouseDown={e=>e.stopPropagation()}><button onClick={()=>handleStockChange(p.id,p.stock-1)} style={{...BTNS,padding:"6px 10px",background:C.tLight}}>−</button><input value={p.stock} onChange={e=>handleStockChange(p.id,parseInt(e.target.value)||0)} style={{width:44,textAlign:"center",border:`1px solid ${C.border}`,borderRadius:6,padding:4,fontSize:13,fontFamily:"'DM Sans',sans-serif"}}/><button onClick={()=>handleStockChange(p.id,p.stock+1)} style={{...BTNS,padding:"6px 10px"}}>+</button></div></>}
          </div>)}</div></div>;
        })()}
      </div>
    </div>
  );
}
