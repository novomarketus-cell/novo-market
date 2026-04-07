import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  subscribeProducts, subscribeOrders, subscribePromos, subscribeCategories,
  addProduct, updateProduct, deleteProduct, reorderProducts,
  updateOrderStatus, updateOrderField,
  saveCategory, deleteCategory,
  addPromo, updatePromo, deletePromo,
  uploadProductMedia,
  loginAdmin, logoutAdmin, subscribeAuth,
} from "./firebase";

// MODULE-LEVEL CONSTANTS (never re-created)
const STATUS = {
  pending_payment: { label: "ê²°ì  ëê¸°", color: "#E67E22", bg: "#FFF3E0" },
  payment_submitted: { label: "ê²°ì  íì¸ì¤", color: "#F39C12", bg: "#FFF8E1" },
  confirmed: { label: "ê²°ì  íì¸", color: "#27AE60", bg: "#E8F5E9" },
  preparing: { label: "ì¤ë¹ì¤", color: "#2980B9", bg: "#E3F2FD" },
  shipped: { label: "ë°°ì¡ì¤", color: "#8E44AD", bg: "#F3E5F5" },
  delivered: { label: "ë°°ì¡ ìë£", color: "#2C3E50", bg: "#ECEFF1" },
  cancelled: { label: "ì·¨ì", color: "#95A5A6", bg: "#F5F5F5" },
};
const C = { bg:"#F0F2F5", primary:"#2D5A3D", pLight:"#E8F0EB", accent:"#D4956A", aLight:"#FFF3EB", text:"#1A1A1A", tLight:"#7A8599", border:"#E4E7EC", danger:"#E74C3C", dLight:"#FDEDED", success:"#27AE60", warn:"#F39C12", wLight:"#FFF8E1" };
const INP = { width:"100%", border:`1px solid ${C.border}`, borderRadius:"8px", padding:"10px 12px", fontSize:"13px", fontFamily:"'DM Sans',sans-serif", boxSizing:"border-box", outline:"none" };
const BTN = { border:"none", borderRadius:"8px", cursor:"pointer", fontWeight:600, fontFamily:"'DM Sans',sans-serif", background:C.primary, color:"#FFF", padding:"10px 20px", fontSize:"13px" };
const BTNS = { ...BTN, padding:"6px 12px", fontSize:"12px" };
const TAG_PRESETS = [
  {label:"ë¬´ì¼",color:"#E8F5E9",textColor:"#2E7D32"},{label:"ì ì¼",color:"#E8F5E9",textColor:"#2E7D32"},
  {label:"ì ê¸°ë",color:"#FFF8E1",textColor:"#F57F17"},{label:"ë¬´ì²¨ê°",color:"#E3F2FD",textColor:"#1565C0"},
  {label:"ì íµê¸°í ì§§ì",color:"#FDEDED",textColor:"#C0392B"},{label:"ëì¥ë³´ê´",color:"#E0F7FA",textColor:"#00838F"},
  {label:"ì¸ê¸°ìí",color:"#FFF0F3",textColor:"#C2185B"},{label:"ì ìí",color:"#F3E5F5",textColor:"#7B1FA2"},
];
const LBL = { fontSize:12, fontWeight:600, color:C.tLight, display:"block", marginBottom:4 };

// TAB ORDER: ëìë³´ë â ì£¼ë¬¸ê´ë¦¬ â ì¬ê³ ê´ë¦¬ â ì íê´ë¦¬ â ì¹´íê³ ë¦¬ â íë¡ëª¨ì
const TABS = [
  {k:"dashboard",i:"ð",l:"ëìë³´ë"},
  {k:"orders",i:"ð¦",l:"ì£¼ë¬¸ ê´ë¦¬"},
  {k:"inventory",i:"ð",l:"ì¬ê³  ê´ë¦¬"},
  {k:"products",i:"ð·ï¸",l:"ì í ê´ë¦¬"},
  {k:"categories",i:"ð",l:"ì¹´íê³ ë¦¬"},
  {k:"promos",i:"ðï¸",l:"íë¡ëª¨ì"},
];

// ProductFormModal â 100% self-contained, own state/styles/saving
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
    if (!pf.nameEn || !pf.nameKo) { setMsg("ì íëªì ìë ¥íì¸ì"); setTimeout(()=>setMsg(""),2000); return; }
    setSaving(true);
    try {
      const productId = editPid || `p${Date.now()}`;
      let updatedMedia = [...(pf.media||[])];
      for (const {index,file} of pendingFiles) { try { const url = await uploadProductMedia(productId,file,index); if(updatedMedia[index]) updatedMedia[index]={...updatedMedia[index],url,fileName:file.name}; } catch(err){console.error("Upload failed:",err);} }
      const cleanMedia = updatedMedia.filter(m=>m.url&&!m.url.startsWith("data:")).map(m=>({type:m.type||"image",url:m.url,alt:m.alt||"",...(m.poster?{poster:m.poster}:{})}));
      const data = { category:pf.category, brand:pf.brand||"", nameEn:pf.nameEn, nameKo:pf.nameKo, price:Number(pf.price)||0, stock:Number(pf.stock)||0, image:pf.image||"ð¦", sale:pf.sale||false, salePrice:Number(pf.salePrice)||0, active:pf.active!==false, media:cleanMedia, tiered:(pf.tiered||[]).map(t=>({qty:Number(t.qty),price:Number(t.price)})), descKo:pf.descKo||"", descEn:pf.descEn||"", tags:pf.tags||[] };
      if (editPid) await updateProduct(editPid, data); else await addProduct({id:productId,...data});
      onDone(editPid ? "ìì  ìë£" : "ì¶ê° ìë£");
    } catch(err) { setMsg("ì ì¥ ì¤í¨: "+err.message); }
    setSaving(false);
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#FFF",borderRadius:16,maxWidth:520,width:"100%",maxHeight:"85vh",overflow:"auto",padding:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h3 style={{margin:0,fontSize:18,fontWeight:700}}>{editPid?"ì í ìì ":"ì ì í ì¶ê°"}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:C.tLight}}>â</button>
        </div>
        {msg&&<div style={{background:C.dLight,color:C.danger,padding:"8px 12px",borderRadius:8,fontSize:12,marginBottom:12}}>{msg}</div>}
        <div style={{marginBottom:12}}><label style={LBL}>ë¸ëë (Brand)</label><input value={pf.brand||""} onChange={e=>setPf(p=>({...p,brand:e.target.value}))} type="text" placeholder="ì: ë² ë² ì¿¡, ì§±ì£½, ë§ë§ë°" style={INP}/></div>
        <div style={{marginBottom:12}}><label style={LBL}>ì íëª (íêµ­ì´)</label><input value={pf.nameKo} onChange={e=>setPf(p=>({...p,nameKo:e.target.value}))} type="text" style={INP}/></div>
        <div style={{marginBottom:12}}><label style={LBL}>Product Name (EN)</label><input value={pf.nameEn} onChange={e=>setPf(p=>({...p,nameEn:e.target.value}))} type="text" style={INP}/></div>
        <div style={{marginBottom:12}}><label style={LBL}>ê°ê²© ($)</label><input value={pf.price} onChange={e=>setPf(p=>({...p,price:e.target.value}))} type="number" placeholder="0.00" style={INP}/></div>
        <div style={{marginBottom:12}}><label style={LBL}>ì¬ê³ </label><input value={pf.stock} onChange={e=>setPf(p=>({...p,stock:e.target.value}))} type="number" placeholder="0" style={INP}/></div>
        <div style={{marginBottom:12}}><label style={LBL}>ì´ëª¨ì§ (ëì²´ì©)</label><input value={pf.image} onChange={e=>setPf(p=>({...p,image:e.target.value}))} type="text" style={INP}/></div>
        <div style={{marginBottom:12}}><label style={LBL}>ð ì í ì¤ëª (íêµ­ì´)</label><textarea value={pf.descKo||""} onChange={e=>setPf(p=>({...p,descKo:e.target.value}))} placeholder="ì: 4ê°ì ì´ì ìê¸°ë¥¼ ìí ì ê¸°ë ìë¯¸ì&#10;&#10;**êµµê²** íì ê°ë¥, ì¤ë°ê¿ ì§ì" rows={5} style={{...INP,resize:"vertical",lineHeight:1.5}}/><div style={{fontSize:10,color:C.tLight,marginTop:4}}>ð¡ <code style={{background:"#F0F0F0",padding:"1px 4px",borderRadius:3}}>**êµµê²**</code>ë¡ ê°ì¡°, Enterë¡ ì¤ë°ê¿</div></div>
        <div style={{marginBottom:12}}><label style={LBL}>ð Description (EN)</label><textarea value={pf.descEn||""} onChange={e=>setPf(p=>({...p,descEn:e.target.value}))} placeholder="e.g. Organic rice porridge for babies 4+ months&#10;&#10;Use **bold** for emphasis" rows={5} style={{...INP,resize:"vertical",lineHeight:1.5}}/><div style={{fontSize:10,color:C.tLight,marginTop:4}}>ð¡ <code style={{background:"#F0F0F0",padding:"1px 4px",borderRadius:3}}>**bold**</code> for emphasis, Enter for line breaks</div></div>
        <div style={{marginBottom:12}}>
          <label style={{...LBL,marginBottom:6}}>ð·ï¸ ì í íê·¸</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>{(pf.tags||[]).map((tag,i)=>(<span key={i} style={{display:"inline-flex",alignItems:"center",gap:6,background:tag.color||"#EAF5FA",color:tag.textColor||"#2980B9",padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:600}}><span>{tag.label}</span><button onClick={()=>setPf(p=>{const nt=[...(p.tags||[])];nt.splice(i,1);return{...p,tags:nt};})} style={{background:"none",border:"none",cursor:"pointer",color:"inherit",fontSize:13,padding:0,lineHeight:1,fontWeight:700}}>â</button></span>))}</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>{TAG_PRESETS.map(preset=>(<button key={preset.label} onClick={()=>setPf(p=>{if((p.tags||[]).some(t=>t.label===preset.label))return p;return{...p,tags:[...(p.tags||[]),preset]};})} style={{...BTNS,padding:"3px 8px",fontSize:10,background:preset.color,color:preset.textColor,border:`1px solid ${preset.textColor}22`,opacity:(pf.tags||[]).some(t=>t.label===preset.label)?0.4:1}}>+ {preset.label}</button>))}</div>
          <div style={{fontSize:11,fontWeight:600,color:C.tLight,marginBottom:4}}>ì»¤ì¤í íê·¸ ì¶ê°</div>
          <div style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
            <input id="novo-custom-tag" placeholder="íê·¸ ì´ë¦ ìë ¥" style={{...INP,flex:1,padding:"6px 10px",fontSize:12}}/>
            <button onClick={()=>{const el=document.getElementById("novo-custom-tag");if(!el||!el.value.trim())return;setPf(p=>({...p,tags:[...(p.tags||[]),{label:el.value.trim(),color:customColor.bg,textColor:customColor.fg}]}));el.value="";}} style={{...BTNS,background:C.primary,whiteSpace:"nowrap"}}>+ ì¶ê°</button>
          </div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8,alignItems:"center"}}>
            <span style={{fontSize:10,color:C.tLight,marginRight:2}}>ìì:</span>
            {[{label:"í°ì",bg:"#FFFFFF",fg:"#333333"},{label:"ë¹¨ê°",bg:"#FDEDED",fg:"#C0392B"},{label:"ì£¼í©",bg:"#FFF3E0",fg:"#E67E22"},{label:"ë¸ë",bg:"#FFF8E1",fg:"#F57F17"},{label:"ì´ë¡",bg:"#E8F5E9",fg:"#2E7D32"},{label:"íë",bg:"#E3F2FD",fg:"#1565C0"},{label:"ë³´ë¼",bg:"#F3E5F5",fg:"#7B1FA2"},{label:"ë¶í",bg:"#FFF0F3",fg:"#C2185B"},{label:"íë",bg:"#E0F7FA",fg:"#00838F"},{label:"íì",bg:"#F5F5F5",fg:"#555555"}].map(c2=>(
              <button key={c2.label} onClick={()=>setCustomColor({bg:c2.bg,fg:c2.fg})} style={{padding:"4px 10px",borderRadius:12,fontSize:10,fontWeight:600,border:`1px solid ${c2.fg}33`,background:c2.bg,color:c2.fg,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",outline:customColor.bg===c2.bg?"2px solid #333":"none",outlineOffset:1}}>
                {c2.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{marginBottom:12}}>
          <label style={{...LBL,marginBottom:8}}>ð· ì í ì´ë¯¸ì§/ìì (ìµë 10ê°)</label>
          {(pf.media||[]).length<10&&<div style={{marginBottom:10}}>
            <div onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor=C.primary;}} onDragLeave={e=>{e.currentTarget.style.borderColor=C.border;}} onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor=C.border;handleFileSelect(e.dataTransfer.files);}} style={{border:`2px dashed ${C.border}`,borderRadius:12,padding:"20px 16px",textAlign:"center",cursor:"pointer",background:"#FAFAFA"}} onClick={()=>document.getElementById("novo-file-input")?.click()}><div style={{fontSize:28,marginBottom:6}}>ð¤</div><div style={{fontSize:13,fontWeight:600,color:C.tLight}}>ì¬ì§ì ëì´ì¤ê±°ë í­íì¸ì</div></div>
            <input id="novo-file-input" type="file" accept="image/*,video/*" multiple capture="environment" style={{display:"none"}} onChange={e=>{handleFileSelect(e.target.files);e.target.value="";}}/>
            <div style={{display:"flex",gap:6,marginTop:8}}><button onClick={()=>{const i=document.getElementById("novo-file-input");if(i){i.removeAttribute("capture");i.click();}}} style={{...BTNS,background:"#3498DB",flex:1}}>ð ê°¤ë¬ë¦¬</button><button onClick={()=>{const i=document.getElementById("novo-file-input");if(i){i.setAttribute("capture","environment");i.click();}}} style={{...BTNS,background:C.primary,flex:1}}>ð¸ ì¹´ë©ë¼</button><button onClick={()=>setPf(p=>({...p,media:[...(p.media||[]),{type:"image",url:"",alt:""}]}))} style={{...BTNS,background:"#7F8C8D",flex:1}}>ð URL</button></div>
          </div>}
          {(pf.media||[]).length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:8,marginTop:8}}>{(pf.media||[]).map((m,i)=>(<div key={i} style={{position:"relative",borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`,background:"#F0EDE8"}}>{m.type==="video"?<div style={{width:"100%",height:90,display:"flex",alignItems:"center",justifyContent:"center",background:"#1A1A1A"}}><span style={{fontSize:24,color:"#FFF"}}>ð¬</span></div>:m.url?<img src={m.url} alt="" style={{width:"100%",height:90,objectFit:"contain",display:"block",background:"#F5F2ED"}} onError={e=>{e.target.style.display="none";}}/>:<div style={{width:"100%",height:90,display:"flex",alignItems:"center",justifyContent:"center"}}><input value={m.url} onChange={e=>setPf(p=>{const nm=[...(p.media||[])];nm[i]={...nm[i],url:e.target.value};return{...p,media:nm};})} placeholder="URL" style={{width:"80%",border:`1px solid ${C.border}`,borderRadius:4,padding:"4px 6px",fontSize:10,textAlign:"center"}}/></div>}<button onClick={()=>{setPf(p=>{const nm=[...(p.media||[])];nm.splice(i,1);return{...p,media:nm};});setPendingFiles(pf2=>pf2.filter(f=>f.index!==i).map(f=>f.index>i?{...f,index:f.index-1}:f));}} style={{position:"absolute",top:3,right:3,width:20,height:20,borderRadius:"50%",border:"none",background:"rgba(0,0,0,0.6)",color:"#FFF",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>â</button>{i===0&&<div style={{position:"absolute",bottom:3,left:3,background:C.primary,color:"#FFF",fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:3}}>ëí</div>}</div>))}</div>}
          {(pf.media||[]).length>0&&<div style={{fontSize:11,color:C.tLight,marginTop:6}}>ð· {(pf.media||[]).filter(m=>m.type==="image").length}ê° ì´ë¯¸ì§ Â· ð¬ {(pf.media||[]).filter(m=>m.type==="video").length}ê° ìì{pendingFiles.length>0&&<span style={{color:C.warn,marginLeft:8}}>â³ {pendingFiles.length}ê° ëê¸°ì¤</span>}</div>}
        </div>
        <div style={{marginBottom:12}}><label style={LBL}>ì¹´íê³ ë¦¬</label><select value={pf.category} onChange={e=>setPf(p=>({...p,category:e.target.value}))} style={INP}>{Object.entries(initialCategories).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
        <div style={{display:"flex",gap:12,marginBottom:12}}><label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,cursor:"pointer"}}><input type="checkbox" checked={pf.sale} onChange={e=>setPf(p=>({...p,sale:e.target.checked}))}/>ì¸ì¼</label><label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,cursor:"pointer"}} title="ì²´í¬ í´ì  ì ê³ ê° ì¬ì´í¸ìì ì´ ì íì´ ì¨ê²¨ì§ëë¤"><input type="checkbox" checked={pf.active} onChange={e=>setPf(p=>({...p,active:e.target.checked}))}/>ì¬ì´í¸ì íì</label></div>
        {!pf.active&&<div style={{background:C.wLight,border:`1px solid ${C.warn}33`,borderRadius:8,padding:"8px 12px",fontSize:11,color:C.warn,fontWeight:600,marginBottom:12}}>â ï¸ "ì¬ì´í¸ì íì"ê° êº¼ì ¸ ìì¼ë©´ ê³ ê°ìê² ì´ ì íì´ ë³´ì´ì§ ììµëë¤</div>}
        {pf.sale&&<div style={{marginBottom:12}}><label style={LBL}>ì¸ì¼ ê°ê²©</label><input value={pf.salePrice} onChange={e=>setPf(p=>({...p,salePrice:e.target.value}))} type="number" placeholder="0.00" style={INP}/></div>}
        <div style={{marginBottom:14}}>
          <label style={{...LBL,marginBottom:6}}>ð¦ ìëë³ í ì¸ (ì íì¬í­)</label>
          {(pf.tiered||[]).map((tier,i)=>(<div key={i} style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}><div style={{flex:1}}><input value={tier.qty} onChange={e=>setPf(p=>{const nt=[...(p.tiered||[])];nt[i]={...nt[i],qty:e.target.value};return{...p,tiered:nt};})} type="number" placeholder="ìë" style={{...INP,padding:"6px 10px",fontSize:12}}/></div><span style={{fontSize:12,color:C.tLight}}>ê° ì´ì â</span><div style={{flex:1}}><input value={tier.price} onChange={e=>setPf(p=>{const nt=[...(p.tiered||[])];nt[i]={...nt[i],price:e.target.value};return{...p,tiered:nt};})} type="number" step="0.01" placeholder="ê°ë¹ ê°ê²©" style={{...INP,padding:"6px 10px",fontSize:12}}/></div><span style={{fontSize:12,color:C.tLight}}>$</span><button onClick={()=>setPf(p=>{const nt=[...(p.tiered||[])];nt.splice(i,1);return{...p,tiered:nt};})} style={{...BTNS,padding:"4px 8px",background:C.danger}}>â</button></div>))}
          <button onClick={()=>setPf(p=>({...p,tiered:[...(p.tiered||[]),{qty:"",price:""}]}))} style={{...BTNS,background:"#3498DB",marginTop:4}}>+ ìë êµ¬ê° ì¶ê°</button>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}><button onClick={onClose} style={{...BTN,background:"transparent",color:C.primary,border:`1px solid ${C.primary}`}}>ì·¨ì</button><button onClick={handleSave} disabled={saving} style={{...BTN,opacity:saving?0.5:1}}>{saving?"ì ì¥ ì¤...":"ì ì¥"}</button></div>
      </div>
    </div>
  );
}

// Admin Component
export default function Admin() {
  // Firebase Auth state
  const [authUser,setAuthUser]=useState(null);
  const [authChecked,setAuthChecked]=useState(false);
  const [loginEmail,setLoginEmail]=useState("");
  const [loginPw,setLoginPw]=useState("");
  const [loginErr,setLoginErr]=useState("");
  const [loggingIn,setLoggingIn]=useState(false);

  useEffect(()=>{
    const unsub=subscribeAuth(u=>{setAuthUser(u);setAuthChecked(true);});
    return()=>unsub();
  },[]);

  const handleLogin=async()=>{
    if(!loginEmail||!loginPw){setLoginErr("ì´ë©ì¼ê³¼ ë¹ë°ë²í¸ë¥¼ ìë ¥íì¸ì");return;}
    setLoggingIn(true);setLoginErr("");
    try{
      await loginAdmin(loginEmail.trim(),loginPw);
      setLoginPw("");
    }catch(err){
      const code=err?.code||"";
      if(code==="auth/invalid-credential"||code==="auth/wrong-password"||code==="auth/user-not-found"){
        setLoginErr("ì´ë©ì¼ ëë ë¹ë°ë²í¸ê° íë ¸ìµëë¤");
      }else if(code==="auth/too-many-requests"){
        setLoginErr("ìëê° ëë¬´ ë§ìµëë¤. ì ì í ë¤ì ìëíì¸ì");
      }else if(code==="auth/invalid-email"){
        setLoginErr("ì¬ë°ë¥¸ ì´ë©ì¼ íìì´ ìëëë¤");
      }else{
        setLoginErr("ë¡ê·¸ì¸ ì¤í¨: "+(err?.message||code));
      }
    }
    setLoggingIn(false);
  };

  const handleLogout=async()=>{try{await logoutAdmin();}catch(e){console.error(e);}};

  const authed=!!authUser;

  const [tab,setTab]=useState("dashboard");const [products,setProducts]=useState([]);const [orders,setOrders]=useState([]);const [promos,setPromos]=useState([]);const [categories,setCategories]=useState({});const [loaded,setLoaded]=useState(false);
  const [showPF,setShowPF]=useState(false);const [editPid,setEditPid]=useState(null);const [pfInitial,setPfInitial]=useState(null);
  const [showPrF,setShowPrF]=useState(false);const [editPrCode,setEditPrCode]=useState(null);const [showCatF,setShowCatF]=useState(false);const [catForm,setCatForm]=useState({id:"",nameKo:"",nameEn:""});const [editCatId,setEditCatId]=useState(null);
  const [oFilter,setOFilter]=useState("all");const [search,setSearch]=useState("");const [notif,setNotif]=useState("");const [prf,setPrf]=useState({code:"",type:"percent",value:0,minOrder:0,active:true});
  const trackingTimers=useRef({});const stockTimers=useRef({});

  // Drag-and-drop state for reordering products
  const [dragIdx,setDragIdx]=useState(null);
  const [dragOverIdx,setDragOverIdx]=useState(null);
  const [reordering,setReordering]=useState(false);

  // Products sorted by `order` field (new products without `order` go to the bottom)
  const sortedProducts=useMemo(()=>[...products].sort((a,b)=>{
    const ao=typeof a.order==="number"?a.order:9999;
    const bo=typeof b.order==="number"?b.order:9999;
    if(ao!==bo)return ao-bo;
    return(a.nameKo||"").localeCompare(b.nameKo||"");
  }),[products]);

  // Drag handlers â list is the currently visible array (sortedProducts or filtered)
  const handleDragStart=(idx)=>{setDragIdx(idx);};
  const handleDragOver=(e,idx)=>{e.preventDefault();e.dataTransfer.dropEffect="move";if(idx!==dragOverIdx)setDragOverIdx(idx);};
  const handleDragLeave=()=>{setDragOverIdx(null);};
  const handleDragEnd=()=>{setDragIdx(null);setDragOverIdx(null);};
  const handleDrop=async(e,targetIdx,list)=>{
    e.preventDefault();
    const from=dragIdx;
    setDragIdx(null);setDragOverIdx(null);
    if(from===null||from===targetIdx)return;
    const next=[...list];
    const [moved]=next.splice(from,1);
    next.splice(targetIdx,0,moved);
    setReordering(true);
    try{
      await reorderProducts(next.map(p=>p.id));
      noti("ìì ì ì¥ë¨");
    }catch(err){
      console.error(err);
      noti("ìì ì ì¥ ì¤í¨");
    }
    setReordering(false);
  };


  useEffect(()=>{
    if(!authed)return;
    const unsubs=[];
    unsubs.push(subscribeProducts(prods=>{setProducts(prods);setLoaded(true);}));
    unsubs.push(subscribeOrders(ords=>{setOrders(ords);}));
    unsubs.push(subscribePromos(prs=>{setPromos(prs);}));
    unsubs.push(subscribeCategories(cats=>{const m={};Object.entries(cats).forEach(([id,d])=>{m[id]=d.nameKo||d;});setCategories(m);}));
    return()=>unsubs.forEach(u=>u());
  },[authed]);

  const noti=m=>{setNotif(m);setTimeout(()=>setNotif(""),3000);};
  const stats=useMemo(()=>({today:orders.filter(o=>{const d=o.createdAt?.toDate?o.createdAt.toDate():o.createdAt?new Date(o.createdAt):null;return d&&d.toISOString().slice(0,10)===new Date().toISOString().slice(0,10);}).length,revenue:orders.filter(o=>o.status!=="pending_payment"&&o.status!=="cancelled").reduce((s,o)=>s+(o.total||0),0),pending:orders.filter(o=>o.status==="pending_payment"||o.status==="payment_submitted").length,lowStock:products.filter(p=>p.stock>0&&p.stock<=5).length,oos:products.filter(p=>p.stock===0).length,total:orders.length}),[orders,products]);
  const fOrders=useMemo(()=>orders.filter(o=>(oFilter==="all"||o.status===oFilter)&&(!search||(o.orderNum||"").toLowerCase().includes(search.toLowerCase())||(o.customer?.name||"").toLowerCase().includes(search.toLowerCase())||(o.phone||"").includes(search))).sort((a,b)=>{const da=a.createdAt?.toDate?a.createdAt.toDate():a.createdAt?new Date(a.createdAt):new Date(0);const db2=b.createdAt?.toDate?b.createdAt.toDate():b.createdAt?new Date(b.createdAt):new Date(0);return db2-da;}),[orders,oFilter,search]);

  const exportCSV=()=>{const s=orders.filter(o=>o.status==="confirmed"||o.status==="preparing");if(!s.length){noti("ë°°ì¡í  ì£¼ë¬¸ì´ ììµëë¤");return;}const esc=v=>{const str=String(v==null?"":v).replace(/"/g,'""');return /^[=+\-@\t\r]/.test(str)?`"'${str}"`:`"${str}"`;};const csv="Order Number,Name,Address,City,State,ZIP,Phone,Items,Total\n"+s.map(o=>[esc(o.orderNum),esc(o.customer?.name),esc(o.customer?.address),esc(o.customer?.city),esc(o.customer?.state),esc(o.customer?.zip),esc(o.phone),esc((o.items||[]).map(i=>`${i.name} x${i.qty}`).join("; ")),esc((o.total||0).toFixed(2))].join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));a.download=`novo_shipping_${new Date().toISOString().slice(0,10)}.csv`;a.click();noti(`${s.length}ê±´ CSV ë¤ì´ë¡ë`);};
  const handleDeleteProduct=async id=>{try{await deleteProduct(id);noti("ì í ì­ì  ìë£");}catch{noti("ì­ì  ì¤í¨");}};
  const handleOrderStatus=async(docId,status,label)=>{try{await updateOrderStatus(docId,status);noti(`â ${label}`);}catch{noti("ìí ë³ê²½ ì¤í¨");}};
  // Revert order to previous status (with confirmation)
  const PREV_STATUS={payment_submitted:"pending_payment",confirmed:"payment_submitted",preparing:"confirmed",shipped:"preparing",delivered:"shipped",cancelled:"pending_payment"};
  const handleRevertStatus=async(o)=>{const prev=PREV_STATUS[o.status];if(!prev){noti("ëëë¦´ ì ìë ìíìëë¤");return;}if(!window.confirm(`${o.orderNum}\n\n"${STATUS[o.status]?.label}" â "${STATUS[prev]?.label}"\n\nëëë¦¬ìê² ìµëê¹?`))return;try{await updateOrderStatus(o._docId,prev);noti(`â¶ ${o.orderNum} â ${STATUS[prev]?.label}`);}catch{noti("ëëë¦¬ê¸° ì¤í¨");}};
  const handleTrackingUpdate=(docId,val)=>{setOrders(prev=>prev.map(o=>o._docId===docId?{...o,trackingNum:val}:o));if(trackingTimers.current[docId])clearTimeout(trackingTimers.current[docId]);trackingTimers.current[docId]=setTimeout(async()=>{try{await updateOrderField(docId,{trackingNum:val});}catch{}},800);};
  const handleStockChange=(pid,val)=>{const s=Math.max(0,val);setProducts(prev=>prev.map(p=>p.id===pid?{...p,stock:s}:p));if(stockTimers.current[pid])clearTimeout(stockTimers.current[pid]);stockTimers.current[pid]=setTimeout(async()=>{try{await updateProduct(pid,{stock:s});}catch{}},500);};
  const handleSavePromo=async()=>{if(!prf.code){noti("ì½ë ìë ¥");return;}try{if(editPrCode)await updatePromo(prf.code,{...prf});else await addPromo({...prf});noti(editPrCode?"ìì  ìë£":"ì¶ê° ìë£");setShowPrF(false);}catch{noti("ì ì¥ ì¤í¨");}};
  const handleDeletePromo=async code=>{try{await deletePromo(code);noti("ì­ì  ìë£");}catch{noti("ì­ì  ì¤í¨");}};
  const handleSaveCategory=async()=>{if(!catForm.id||!catForm.nameKo){noti("IDì ì´ë¦ì ìë ¥íì¸ì");return;}if(!editCatId&&categories[catForm.id]){noti("ì´ë¯¸ ì¡´ì¬íë IDìëë¤");return;}try{await saveCategory(catForm.id,{nameKo:catForm.nameKo,nameEn:catForm.nameEn||catForm.id});noti(editCatId?"ì¹´íê³ ë¦¬ ìì  ìë£":"ì¹´íê³ ë¦¬ ì¶ê° ìë£");setShowCatF(false);}catch{noti("ì ì¥ ì¤í¨");}};
  const handleDeleteCategory=async id=>{if(products.some(p=>p.category===id)){noti("í´ë¹ ì¹´íê³ ë¦¬ì ì íì´ ìì´ ì­ì  ë¶ê°");return;}try{await deleteCategory(id);noti("ì¹´íê³ ë¦¬ ì­ì  ìë£");}catch{noti("ì­ì  ì¤í¨");}};
  const getOrderDate=o=>{if(o.createdAt?.toDate)return o.createdAt.toDate().toLocaleDateString("ko-KR");if(o.createdAt)return new Date(o.createdAt).toLocaleDateString("ko-KR");return"";};
  const openProductForm=product=>{const init=product?{...product}:{id:`p${Date.now()}`,category:Object.keys(categories)[0]||"babyfood",brand:"",nameEn:"",nameKo:"",price:0,stock:0,image:"ð¦",sale:false,salePrice:0,active:true,media:[],tiered:[],descKo:"",descEn:"",tags:[]};setPfInitial(init);setEditPid(product?product.id:null);setShowPF(true);};
  const handleProductDone=message=>{setShowPF(false);noti(message);};

  // Auth check loading
  if(!authChecked){
    return (
      <div style={{fontFamily:"'DM Sans',sans-serif",background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{textAlign:"center",color:C.tLight}}><div style={{fontSize:40,marginBottom:12}}>â³</div><div>ì¸ì¦ íì¸ ì¤...</div></div>
      </div>
    );
  }

  // Login gate â block all rendering until authenticated via Firebase Auth
  if(!authed){
    return (
      <div style={{fontFamily:"'DM Sans',sans-serif",background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet"/>
        <div style={{background:"#FFF",borderRadius:16,padding:32,maxWidth:380,width:"100%",boxShadow:"0 4px 20px rgba(0,0,0,.08)",border:`1px solid ${C.border}`}}>
          <div style={{textAlign:"center",marginBottom:24}}>
            <div style={{fontSize:32,marginBottom:8}}>ð</div>
            <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:22,margin:0,color:C.primary}}>NOVO MARKET</h2>
            <div style={{fontSize:12,color:C.tLight,marginTop:4}}>Admin Login</div>
          </div>
          <div style={{marginBottom:12}}>
            <label style={LBL}>ì´ë©ì¼</label>
            <input type="email" value={loginEmail} onChange={e=>{setLoginEmail(e.target.value);setLoginErr("");}} onKeyDown={e=>{if(e.key==="Enter")handleLogin();}} autoFocus autoComplete="email" placeholder="admin@novomarket.us" style={INP}/>
          </div>
          <div style={{marginBottom:12}}>
            <label style={LBL}>ë¹ë°ë²í¸</label>
            <input type="password" value={loginPw} onChange={e=>{setLoginPw(e.target.value);setLoginErr("");}} onKeyDown={e=>{if(e.key==="Enter")handleLogin();}} autoComplete="current-password" style={INP}/>
          </div>
          {loginErr&&<div style={{background:C.dLight,color:C.danger,padding:"8px 12px",borderRadius:8,fontSize:12,marginBottom:12}}>{loginErr}</div>}
          <button onClick={handleLogin} disabled={loggingIn} style={{...BTN,width:"100%",opacity:loggingIn?0.6:1}}>{loggingIn?"ë¡ê·¸ì¸ ì¤...":"ë¡ê·¸ì¸"}</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:C.bg,minHeight:"100vh"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet"/>
      <style>{`@keyframes si{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}input:focus,select:focus,textarea:focus{border-color:#2D5A3D!important}`}</style>
      {notif&&<div style={{position:"fixed",top:16,right:16,background:C.primary,color:"#FFF",padding:"12px 20px",borderRadius:10,fontSize:13,fontWeight:600,zIndex:2000,boxShadow:"0 4px 20px rgba(0,0,0,.2)",animation:"si .3s ease"}}>â {notif}</div>}
      <div style={{background:"#1B2A3D",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:20}}>ð¿</span><span style={{fontFamily:"'DM Serif Display',serif",color:"#FFF",fontSize:18}}>NOVO MARKET</span><span style={{color:"rgba(255,255,255,.5)",fontSize:12}}>Admin</span></div><div style={{display:"flex",alignItems:"center",gap:10}}>{stats.pending>0&&<span style={{background:C.warn,color:"#FFF",borderRadius:12,padding:"4px 10px",fontSize:11,fontWeight:700}}>â  {stats.pending} pending</span>}<button onClick={handleLogout} style={{background:"transparent",border:"1px solid rgba(255,255,255,.3)",color:"#FFF",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>ðª ë¡ê·¸ìì</button></div></div>
      <div style={{background:"#FFF",borderBottom:`1px solid ${C.border}`,display:"flex",overflowX:"auto",padding:"0 12px"}}>{TABS.map(t=><button key={t.k} onClick={()=>setTab(t.k)} style={{padding:"14px 16px",border:"none",background:"none",cursor:"pointer",fontSize:13,fontWeight:tab===t.k?700:500,color:tab===t.k?C.primary:C.tLight,borderBottom:tab===t.k?`3px solid ${C.primary}`:"3px solid transparent",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap"}}>{t.i} {t.l}</button>)}</div>
      <div style={{padding:20,maxWidth:1100,margin:"0 auto"}}>
        {!loaded&&<div style={{textAlign:"center",padding:"60px 0",color:C.tLight}}><div style={{fontSize:40,marginBottom:12}}>â³</div><div>Firebase ë°ì´í° ë¡ë© ì¤...</div></div>}

        {loaded&&tab==="dashboard"&&<div><h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:24,marginBottom:20}}>ð ëìë³´ë</h2><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14,marginBottom:24}}>{[{l:"ì¤ë ì£¼ë¬¸",v:stats.today,i:"ð¦",cl:C.primary},{l:"ì´ ë§¤ì¶",v:`$${stats.revenue.toFixed(0)}`,i:"ð°",cl:C.accent},{l:"ì²ë¦¬ ëê¸°",v:stats.pending,i:"â³",cl:C.warn},{l:"ì¬ê³  ë¶ì¡±",v:stats.lowStock,i:"â ï¸",cl:C.danger},{l:"íì ",v:stats.oos,i:"ð«",cl:"#666"},{l:"ì´ ì£¼ë¬¸",v:stats.total,i:"ð",cl:"#2980B9"}].map((s,i)=><div key={i} style={{background:"#FFF",borderRadius:14,padding:18,border:`1px solid ${C.border}`,position:"relative"}}><div style={{position:"absolute",top:12,right:14,fontSize:28,opacity:0.15}}>{s.i}</div><div style={{fontSize:11,color:C.tLight,fontWeight:600,marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>{s.l}</div><div style={{fontSize:28,fontWeight:700,color:s.cl}}>{s.v}</div></div>)}</div><div style={{background:"#FFF",borderRadius:14,padding:20,border:`1px solid ${C.border}`}}><h3 style={{fontSize:15,fontWeight:700,marginBottom:14}}>ìµê·¼ ì£¼ë¬¸</h3>{orders.slice(0,5).map(o=><div key={o._docId||o.orderNum} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}><div><span style={{fontWeight:700,color:C.primary,marginRight:10}}>{o.orderNum}</span><span style={{fontSize:13}}>{o.customer?.name}</span></div><div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontWeight:700,fontSize:14}}>${(o.total||0).toFixed(2)}</span><span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:6,background:STATUS[o.status]?.bg,color:STATUS[o.status]?.color}}>{STATUS[o.status]?.label}</span></div></div>)}</div></div>}

        {loaded&&tab==="orders"&&<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}><h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:24,margin:0}}>ð¦ ì£¼ë¬¸ ê´ë¦¬</h2><button onClick={exportCSV} style={BTN}>ð ë°°ì¡ CSV ë¤ì´ë¡ë</button></div><div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ì£¼ë¬¸ë²í¸, ì´ë¦, ì íë²í¸ ê²ì..." style={{...INP,maxWidth:280}}/><select value={oFilter} onChange={e=>setOFilter(e.target.value)} style={{...INP,maxWidth:160}}><option value="all">ì ì²´ ìí</option>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
        {fOrders.map(o=><div key={o._docId||o.orderNum} style={{background:"#FFF",borderRadius:12,padding:16,marginBottom:10,border:`1px solid ${C.border}`,borderLeft:`4px solid ${STATUS[o.status]?.color||"#CCC"}`}}><div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}><div><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><span style={{fontWeight:800,fontSize:16,color:C.primary}}>{o.orderNum}</span><span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:6,background:STATUS[o.status]?.bg,color:STATUS[o.status]?.color}}>{STATUS[o.status]?.label}</span></div><div style={{fontSize:13,color:C.tLight}}>{o.customer?.name} Â· {o.phone}</div><div style={{fontSize:12,color:C.tLight}}>{o.customer?.address}, {o.customer?.city}, {o.customer?.state} {o.customer?.zip}</div><div style={{fontSize:12,color:C.tLight}}>Venmo/Zelle: {o.customer?.venmoName}</div></div><div style={{textAlign:"right"}}><div style={{fontWeight:800,fontSize:18}}>${(o.total||0).toFixed(2)}</div><div style={{fontSize:11,color:C.tLight}}>{getOrderDate(o)}</div></div></div><div style={{margin:"10px 0",padding:"8px 12px",background:"#F8F9FA",borderRadius:8}}>{(o.items||[]).map((it,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}><span>{it.name} Ã {it.qty}</span><span style={{fontWeight:600}}>${(it.price*it.qty).toFixed(2)}</span></div>)}{(o.discount||0)>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.danger}}><span>í ì¸</span><span>-${o.discount.toFixed(2)}</span></div>}<div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span>ë°°ì¡ë¹</span><span>{o.shipping===0?"ë¬´ë£":`$${(o.shipping||0).toFixed(2)}`}</span></div></div><div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>{o.status==="pending_payment"&&<button onClick={()=>handleOrderStatus(o._docId,"confirmed",`${o.orderNum} â ê²°ì  íì¸`)} style={{...BTNS,background:C.warn}}>ð³ ê²°ì  íì¸</button>}{o.status==="payment_submitted"&&<button onClick={()=>handleOrderStatus(o._docId,"confirmed",`${o.orderNum} â ê²°ì  ì¹ì¸`)} style={{...BTNS,background:C.success}}>â ê²°ì  ì¹ì¸</button>}{o.status==="confirmed"&&<button onClick={()=>handleOrderStatus(o._docId,"preparing",`${o.orderNum} â ì¤ë¹ì¤`)} style={{...BTNS,background:"#2980B9"}}>ð¦ ì¤ë¹ ìì</button>}{(o.status==="preparing"||o.status==="confirmed")&&<div style={{display:"flex",gap:6,alignItems:"center"}}><input value={o.trackingNum||""} onChange={e=>handleTrackingUpdate(o._docId,e.target.value)} placeholder="í¸ëí¹ ë²í¸" style={{...INP,maxWidth:200,padding:"6px 10px",fontSize:12}}/>{o.trackingNum&&<button onClick={()=>handleOrderStatus(o._docId,"shipped",`${o.orderNum} â ë°ì¡`)} style={{...BTNS,background:"#8E44AD"}}>ð ë°ì¡</button>}</div>}{o.status==="shipped"&&<button onClick={()=>handleOrderStatus(o._docId,"delivered",`${o.orderNum} â ë°°ì¡ìë£`)} style={{...BTNS,background:"#2C3E50"}}>â ë°°ì¡ ìë£</button>}{o.status!=="cancelled"&&o.status!=="delivered"&&<button onClick={()=>handleOrderStatus(o._docId,"cancelled",`${o.orderNum} â ì·¨ì`)} style={{...BTNS,background:"#95A5A6"}}>â ì·¨ì</button>}{PREV_STATUS[o.status]&&<button onClick={()=>handleRevertStatus(o)} title={`ì´ì  ë¨ê³(${STATUS[PREV_STATUS[o.status]]?.label})ë¡ ëëë¦¬ê¸°`} style={{...BTNS,background:"transparent",color:C.tLight,border:`1px solid ${C.border}`}}>â¶ ëëë¦¬ê¸°</button>}{o.trackingNum&&<span style={{fontSize:11,color:C.tLight}}>ð {o.trackingNum}</span>}</div></div>)}</div>}

        {loaded&&tab==="products"&&<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:24,margin:0}}>ð·ï¸ ì í ê´ë¦¬</h2><button onClick={()=>openProductForm(null)} style={BTN}>+ ì í ì¶ê°</button></div><div style={{fontSize:11,color:C.tLight,marginBottom:10,padding:"8px 12px",background:"#F8F9FA",borderRadius:8,border:`1px dashed ${C.border}`}}>ð¡ ì¹´ëë¥¼ ëëê·¸í´ì ììë¥¼ ë°ê¿ ì ììµëë¤ (ê³ ê° ì¬ì´í¸ì ì¦ì ë°ì){reordering&&" Â· ì ì¥ ì¤..."}</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>{sortedProducts.map((p,idx)=><div key={p.id} draggable onDragStart={()=>handleDragStart(idx)} onDragOver={e=>handleDragOver(e,idx)} onDragLeave={handleDragLeave} onDrop={e=>handleDrop(e,idx,sortedProducts)} onDragEnd={handleDragEnd} style={{background:"#FFF",borderRadius:12,padding:16,border:dragOverIdx===idx&&dragIdx!==idx?`2px solid ${C.primary}`:`1px solid ${C.border}`,opacity:dragIdx===idx?0.4:(p.active?1:0.5),position:"relative",cursor:"grab",transition:"border-color .15s, opacity .15s"}}><div style={{position:"absolute",top:8,left:8,fontSize:14,color:C.tLight,userSelect:"none"}}>â®â®</div>{!p.active&&<div style={{position:"absolute",top:8,right:8,fontSize:10,background:"#EEE",padding:"2px 6px",borderRadius:4,color:"#999"}}>ë¹íì±</div>}<div style={{display:"flex",gap:12,marginTop:4}}><div style={{width:60,height:60,borderRadius:8,overflow:"hidden",flexShrink:0,background:"#F0EDE8",display:"flex",alignItems:"center",justifyContent:"center"}}>{p.media?.length>0&&p.media[0].url?<img src={p.media[0].url} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} loading="lazy" draggable={false}/>:<span style={{fontSize:30}}>{p.image||"ð¦"}</span>}</div><div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,marginBottom:2}}>{p.brand&&<span style={{fontSize:10,color:C.accent,fontWeight:600,marginRight:4}}>{p.brand}</span>}{p.nameKo}</div><div style={{fontSize:11,color:C.tLight,marginBottom:6}}>{p.nameEn}</div><div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>{p.sale?<><span style={{fontWeight:800,color:C.danger}}>${(p.salePrice||0).toFixed(2)}</span><span style={{fontSize:11,color:C.tLight,textDecoration:"line-through"}}>${(p.price||0).toFixed(2)}</span></>:<span style={{fontWeight:800,color:C.primary}}>${(p.price||0).toFixed(2)}</span>}</div><div style={{fontSize:12,color:p.stock===0?C.danger:p.stock<=5?C.warn:C.tLight,fontWeight:p.stock<=5?700:400}}>ì¬ê³ : {p.stock}ê°{p.stock===0&&" â ï¸ íì "}</div><div style={{fontSize:11,color:C.tLight}}>{categories[p.category]||p.category}{p.media?.length>0&&<span style={{marginLeft:6}}>ð· {p.media.length}</span>}{p.tiered?.length>0&&<span style={{marginLeft:6,color:C.primary}}>ð¦ {p.tiered.length}êµ¬ê°</span>}</div>{p.tags?.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4}}>{p.tags.map((tag,i)=><span key={i} style={{fontSize:9,fontWeight:600,padding:"2px 6px",borderRadius:10,background:tag.color||"#EEE",color:tag.textColor||"#555"}}>{tag.label}</span>)}</div>}</div></div><div style={{display:"flex",gap:6,marginTop:10,justifyContent:"flex-end"}}><button onClick={()=>openProductForm(p)} style={{...BTNS,background:"#3498DB"}}>âï¸ ìì </button><button onClick={()=>handleDeleteProduct(p.id)} style={{...BTNS,background:C.danger}}>ð ì­ì </button></div></div>)}</div>
        {showPF&&pfInitial&&<ProductFormModal initialData={pfInitial} initialCategories={categories} editPid={editPid} onDone={handleProductDone} onClose={()=>setShowPF(false)}/>}
        </div>}

        {loaded&&tab==="categories"&&<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:24,margin:0}}>ð ì¹´íê³ ë¦¬ ê´ë¦¬</h2><button onClick={()=>{setCatForm({id:"",nameKo:"",nameEn:""});setEditCatId(null);setShowCatF(true);}} style={BTN}>+ ì¹´íê³ ë¦¬ ì¶ê°</button></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:12}}>{Object.entries(categories).map(([id,name])=>{const count=products.filter(p=>p.category===id).length;return<div key={id} style={{background:"#FFF",borderRadius:12,padding:16,border:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:16,fontWeight:700,color:C.primary}}>{name}</div><div style={{fontSize:12,color:C.tLight,marginTop:4}}>ID: {id} Â· ì í {count}ê°</div></div><div style={{display:"flex",gap:6}}><button onClick={()=>{setCatForm({id,nameKo:name,nameEn:id});setEditCatId(id);setShowCatF(true);}} style={{...BTNS,background:"#3498DB"}}>âï¸</button><button onClick={()=>handleDeleteCategory(id)} style={{...BTNS,background:C.danger}}>ð</button></div></div>;})}</div>
        {showCatF&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}><div style={{background:"#FFF",borderRadius:16,maxWidth:520,width:"100%",padding:24}}><h3 style={{margin:"0 0 20px",fontSize:18,fontWeight:700}}>{editCatId?"ì¹´íê³ ë¦¬ ìì ":"ì ì¹´íê³ ë¦¬ ì¶ê°"}</h3><div style={{marginBottom:12}}><label style={LBL}>ì¹´íê³ ë¦¬ ID (ìë¬¸)</label><input value={catForm.id} onChange={e=>setCatForm(p=>({...p,id:e.target.value.toLowerCase().replace(/[^a-z0-9]/g,"")}))} disabled={!!editCatId} placeholder="ì: babyfood" style={{...INP,background:editCatId?"#F5F5F5":"#FFF"}}/></div><div style={{marginBottom:12}}><label style={LBL}>ì¹´íê³ ë¦¬ ì´ë¦ (íêµ­ì´)</label><input value={catForm.nameKo} onChange={e=>setCatForm(p=>({...p,nameKo:e.target.value}))} placeholder="ì: ì´ì ì" style={INP}/></div><div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}><button onClick={()=>setShowCatF(false)} style={{...BTN,background:"transparent",color:C.primary,border:`1px solid ${C.primary}`}}>ì·¨ì</button><button onClick={handleSaveCategory} style={BTN}>ì ì¥</button></div></div></div>}
        </div>}

        {loaded&&tab==="promos"&&<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:24,margin:0}}>ðï¸ íë¡ëª¨ì ê´ë¦¬</h2><button onClick={()=>{setPrf({code:"",type:"percent",value:0,minOrder:0,active:true});setEditPrCode(null);setShowPrF(true);}} style={BTN}>+ ì¶ê°</button></div>{promos.map(p=><div key={p.code||p._docId} style={{background:"#FFF",borderRadius:12,padding:16,marginBottom:10,border:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",opacity:p.active?1:0.5}}><div><div style={{fontWeight:800,fontSize:16,color:C.primary,letterSpacing:1}}>{p.code}</div><div style={{fontSize:13,color:C.tLight,marginTop:4}}>{p.type==="percent"?`${p.value}% í ì¸`:`$${p.value} í ì¸`}{p.minOrder>0&&` Â· ìµì $${p.minOrder}`}</div></div><div style={{display:"flex",gap:6}}><button onClick={()=>{setPrf({...p});setEditPrCode(p.code);setShowPrF(true);}} style={{...BTNS,background:"#3498DB"}}>âï¸</button><button onClick={()=>handleDeletePromo(p.code)} style={{...BTNS,background:C.danger}}>ð</button></div></div>)}
        {showPrF&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}><div style={{background:"#FFF",borderRadius:16,maxWidth:520,width:"100%",padding:24}}><h3 style={{margin:"0 0 20px",fontSize:18,fontWeight:700}}>{editPrCode?"íë¡ëª¨ì ìì ":"ì íë¡ëª¨ì"}</h3><div style={{marginBottom:12}}><label style={LBL}>ì½ë</label><input value={prf.code} onChange={e=>setPrf(p=>({...p,code:e.target.value.toUpperCase()}))} style={INP} placeholder="ì: SUMMER30"/></div><div style={{marginBottom:12}}><label style={LBL}>íì</label><select value={prf.type} onChange={e=>setPrf(p=>({...p,type:e.target.value}))} style={INP}><option value="percent">% í ì¸</option><option value="fixed">$ í ì¸</option></select></div><div style={{marginBottom:12}}><label style={LBL}>í ì¸ ê°</label><input value={prf.value} onChange={e=>setPrf(p=>({...p,value:Number(e.target.value)}))} type="number" style={INP}/></div><div style={{marginBottom:12}}><label style={LBL}>ìµì ì£¼ë¬¸ ($)</label><input value={prf.minOrder} onChange={e=>setPrf(p=>({...p,minOrder:Number(e.target.value)}))} type="number" style={INP}/></div><label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,cursor:"pointer",marginBottom:16}}><input type="checkbox" checked={prf.active} onChange={e=>setPrf(p=>({...p,active:e.target.checked}))}/>íì±í</label><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button onClick={()=>setShowPrF(false)} style={{...BTN,background:"transparent",color:C.primary,border:`1px solid ${C.primary}`}}>ì·¨ì</button><button onClick={handleSavePromo} style={BTN}>ì ì¥</button></div></div></div>}
        </div>}

        {loaded&&tab==="inventory"&&(()=>{const invList=sortedProducts.filter(p=>p.active);return <div><h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:24,marginBottom:16}}>ð ì¬ê³  ê´ë¦¬</h2>{products.filter(p=>p.stock<=5&&p.active).length>0&&<div style={{background:C.wLight,border:`1px solid ${C.warn}33`,borderRadius:12,padding:"14px 16px",marginBottom:16}}><div style={{fontWeight:700,fontSize:13,color:C.warn,marginBottom:6}}>â ï¸ ì¬ê³  ë¶ì¡± / íì </div>{products.filter(p=>p.stock<=5&&p.active).map(p=><div key={p.id} style={{fontSize:12,padding:"2px 0"}}>{p.image||"ð¦"} {p.nameKo} â <strong style={{color:p.stock===0?C.danger:C.warn}}>{p.stock===0?"íì ":`${p.stock}ê°`}</strong></div>)}</div>}<div style={{fontSize:11,color:C.tLight,marginBottom:10,padding:"8px 12px",background:"#F8F9FA",borderRadius:8,border:`1px dashed ${C.border}`}}>ð¡ íì ëëê·¸í´ì ììë¥¼ ë°ê¿ ì ììµëë¤ (ì í ê´ë¦¬ì ëì¼í ìì){reordering&&" Â· ì ì¥ ì¤..."}</div><div style={{background:"#FFF",borderRadius:14,border:`1px solid ${C.border}`,overflow:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr style={{background:"#F8F9FA"}}><th style={{padding:"12px 8px",width:24}}></th>{["ì í","ì¹´íê³ ë¦¬","ê°ê²©","ì¬ê³ ","ìì "].map(h=><th key={h} style={{padding:"12px 16px",textAlign:h==="ì í"?"left":"center",fontWeight:700,color:C.tLight,fontSize:11,textTransform:"uppercase"}}>{h}</th>)}</tr></thead><tbody>{invList.map((p,idx)=><tr key={p.id} draggable onDragStart={()=>handleDragStart(idx)} onDragOver={e=>handleDragOver(e,idx)} onDragLeave={handleDragLeave} onDrop={e=>handleDrop(e,idx,invList)} onDragEnd={handleDragEnd} style={{borderTop:`1px solid ${C.border}`,background:dragOverIdx===idx&&dragIdx!==idx?C.pLight:"transparent",opacity:dragIdx===idx?0.4:1,cursor:"grab",transition:"background .15s, opacity .15s"}}><td style={{padding:"10px 4px",textAlign:"center",color:C.tLight,fontSize:14,userSelect:"none"}}>â®â®</td><td style={{padding:"10px 16px"}}><div style={{display:"flex",alignItems:"center",gap:8}}>{p.media?.length>0&&p.media[0].url?<div style={{width:28,height:28,borderRadius:4,overflow:"hidden",flexShrink:0}}><img src={p.media[0].url} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} loading="lazy" draggable={false}/></div>:<span style={{fontSize:20}}>{p.image||"ð¦"}</span>}<span style={{fontWeight:600}}>{p.nameKo}</span></div></td><td style={{padding:"10px 16px",textAlign:"center",color:C.tLight}}>{categories[p.category]||p.category}</td><td style={{padding:"10px 16px",textAlign:"center",fontWeight:700}}>${(p.sale?p.salePrice:p.price||0).toFixed(2)}</td><td style={{padding:"10px 16px",textAlign:"center"}}><span style={{fontWeight:700,padding:"3px 10px",borderRadius:6,fontSize:12,background:p.stock===0?C.dLight:p.stock<=5?C.wLight:C.pLight,color:p.stock===0?C.danger:p.stock<=5?C.warn:C.primary}}>{p.stock}</span></td><td style={{padding:"10px 16px",textAlign:"center"}}><div style={{display:"flex",gap:4,justifyContent:"center",alignItems:"center"}} onMouseDown={e=>e.stopPropagation()}><button onClick={()=>handleStockChange(p.id,p.stock-1)} style={{...BTNS,padding:"4px 8px",background:C.tLight}}>â</button><input value={p.stock} onChange={e=>handleStockChange(p.id,parseInt(e.target.value)||0)} draggable={false} style={{width:50,textAlign:"center",border:`1px solid ${C.border}`,borderRadius:6,padding:4,fontSize:13,fontFamily:"'DM Sans',sans-serif"}}/><button onClick={()=>handleStockChange(p.id,p.stock+1)} style={{...BTNS,padding:"4px 8px"}}>+</button></div></td></tr>)}</tbody></table></div></div>;})()}
      </div>
    </div>
  );
}
