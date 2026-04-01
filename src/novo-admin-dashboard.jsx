import { useState, useEffect, useMemo } from "react";

// ─────────────────────────────────────────────
// 🔥 Firebase Imports
// ─────────────────────────────────────────────
import {
  subscribeProducts,
  subscribeOrders,
  subscribePromos,
  subscribeCategories,
  addProduct,
  updateProduct,
  deleteProduct,
  updateOrderStatus,
  updateOrderField,
  saveCategory,
  deleteCategory,
  addPromo,
  updatePromo,
  deletePromo,
  uploadProductMedia,
  deleteStorageFile,
  seedInitialData,
} from "./firebase";

const STATUS = {
  pending_payment: { label: "결제 대기", color: "#E67E22", bg: "#FFF3E0" },
  payment_submitted: { label: "결제 확인중", color: "#F39C12", bg: "#FFF8E1" },
  confirmed: { label: "결제 확인", color: "#27AE60", bg: "#E8F5E9" },
  preparing: { label: "준비중", color: "#2980B9", bg: "#E3F2FD" },
  shipped: { label: "배송중", color: "#8E44AD", bg: "#F3E5F5" },
  delivered: { label: "배송 완료", color: "#2C3E50", bg: "#ECEFF1" },
};

export default function Admin() {
  const [tab, setTab] = useState("orders");
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [promos, setPromos] = useState([]);
  const [categories, setCategories] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [showPF, setShowPF] = useState(false);
  const [editPid, setEditPid] = useState(null);
  const [showPrF, setShowPrF] = useState(false);
  const [editPrCode, setEditPrCode] = useState(null);
  const [showCatF, setShowCatF] = useState(false);
  const [catForm, setCatForm] = useState({ id: "", nameKo: "", nameEn: "" });
  const [editCatId, setEditCatId] = useState(null);
  const [oFilter, setOFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [notif, setNotif] = useState("");
  const [saving, setSaving] = useState(false);
  const [pf, setPf] = useState({
    id: "", category: "babyfood", nameEn: "", nameKo: "", price: 0, stock: 0,
    image: "📦", sale: false, salePrice: 0, active: true, media: [], tiered: [],
    descKo: "", descEn: "", tags: [],
  });
  const [prf, setPrf] = useState({ code: "", type: "percent", value: 0, minOrder: 0, active: true });

  // 🔥 Media upload state — track files to upload
  const [pendingFiles, setPendingFiles] = useState([]); // [{index, file}]

  // ─────────────────────────────────────────────
  // 🔥 Real-time Firestore Subscriptions
  // ─────────────────────────────────────────────
  useEffect(() => {
    const unsubs = [];
    unsubs.push(
      subscribeProducts((prods) => {
        setProducts(prods);
        setLoaded(true);
      })
    );
    unsubs.push(
      subscribeOrders((ords) => {
        setOrders(ords);
      })
    );
    unsubs.push(
      subscribePromos((prs) => {
        setPromos(prs);
      })
    );
    unsubs.push(
      subscribeCategories((cats) => {
        // Convert from {id: {nameKo, nameEn}} to {id: nameKo}
        const catMap = {};
        Object.entries(cats).forEach(([id, data]) => {
          catMap[id] = data.nameKo || data;
        });
        setCategories(catMap);
      })
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  const noti = (m) => {
    setNotif(m);
    setTimeout(() => setNotif(""), 3000);
  };

  const stats = useMemo(
    () => ({
      today: orders.filter((o) => {
        const d = o.createdAt?.toDate ? o.createdAt.toDate() : o.createdAt ? new Date(o.createdAt) : null;
        return d && d.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
      }).length,
      revenue: orders.filter((o) => o.status !== "pending_payment").reduce((s, o) => s + (o.total || 0), 0),
      pending: orders.filter((o) => o.status === "pending_payment" || o.status === "payment_submitted").length,
      lowStock: products.filter((p) => p.stock > 0 && p.stock <= 5).length,
      oos: products.filter((p) => p.stock === 0).length,
      total: orders.length,
    }),
    [orders, products]
  );

  const fOrders = useMemo(
    () =>
      orders
        .filter(
          (o) =>
            (oFilter === "all" || o.status === oFilter) &&
            (!search ||
              (o.orderNum || "").toLowerCase().includes(search.toLowerCase()) ||
              (o.customer?.name || "").toLowerCase().includes(search.toLowerCase()) ||
              (o.phone || "").includes(search))
        )
        .sort((a, b) => {
          const da = a.createdAt?.toDate ? a.createdAt.toDate() : a.createdAt ? new Date(a.createdAt) : new Date(0);
          const db2 = b.createdAt?.toDate ? b.createdAt.toDate() : b.createdAt ? new Date(b.createdAt) : new Date(0);
          return db2 - da;
        }),
    [orders, oFilter, search]
  );

  // 🔥 CSV Export
  const exportCSV = () => {
    const s = orders.filter((o) => o.status === "confirmed" || o.status === "preparing");
    if (!s.length) {
      noti("배송할 주문이 없습니다");
      return;
    }
    const csv =
      "Order Number,Name,Address,City,State,ZIP,Items,Total\n" +
      s
        .map(
          (o) =>
            `${o.orderNum},"${o.customer?.name}","${o.customer?.address}","${o.customer?.city}",${o.customer?.state},${o.customer?.zip},"${(o.items || []).map((i) => `${i.name} x${i.qty}`).join("; ")}",${(o.total || 0).toFixed(2)}`
        )
        .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `novo_shipping_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    noti(`${s.length}건 CSV 다운로드`);
  };

  // ─────────────────────────────────────────────
  // 🔥 Product Save (with Firebase Storage upload)
  // ─────────────────────────────────────────────
  const handleSaveProduct = async () => {
    if (!pf.nameEn || !pf.nameKo) {
      noti("제품명을 입력하세요");
      return;
    }
    setSaving(true);
    try {
      const productId = editPid || `p${Date.now()}`;

      // Upload pending files to Firebase Storage
      let updatedMedia = [...(pf.media || [])];
      for (const { index, file } of pendingFiles) {
        try {
          const url = await uploadProductMedia(productId, file, index);
          if (updatedMedia[index]) {
            updatedMedia[index] = { ...updatedMedia[index], url, fileName: file.name };
          }
        } catch (err) {
          console.error("Upload failed for file:", file.name, err);
          noti(`이미지 업로드 실패: ${file.name}`);
        }
      }

      // Remove base64 data from media before saving to Firestore
      const cleanMedia = updatedMedia
        .filter((m) => m.url && !m.url.startsWith("data:"))
        .map((m) => ({
          type: m.type || "image",
          url: m.url,
          alt: m.alt || "",
          ...(m.poster ? { poster: m.poster } : {}),
        }));

      const productData = {
        category: pf.category,
        nameEn: pf.nameEn,
        nameKo: pf.nameKo,
        price: Number(pf.price),
        stock: Number(pf.stock),
        image: pf.image || "📦",
        sale: pf.sale || false,
        salePrice: Number(pf.salePrice) || 0,
        active: pf.active !== false,
        media: cleanMedia,
        tiered: (pf.tiered || []).map((t) => ({ qty: Number(t.qty), price: Number(t.price) })),
        descKo: pf.descKo || "",
        descEn: pf.descEn || "",
        tags: pf.tags || [],
      };

      if (editPid) {
        await updateProduct(editPid, productData);
        noti("수정 완료");
      } else {
        await addProduct({ id: productId, ...productData });
        noti("추가 완료");
      }

      setPendingFiles([]);
      setShowPF(false);
    } catch (err) {
      console.error("Product save error:", err);
      noti("저장 실패: " + err.message);
    }
    setSaving(false);
  };

  // 🔥 Product Delete
  const handleDeleteProduct = async (id) => {
    try {
      await deleteProduct(id);
      noti("제품 삭제 완료");
    } catch (err) {
      noti("삭제 실패");
    }
  };

  // 🔥 Order Status Update
  const handleOrderStatus = async (docId, newStatus, label) => {
    try {
      await updateOrderStatus(docId, newStatus);
      noti(`→ ${label}`);
    } catch (err) {
      noti("상태 변경 실패");
    }
  };

  // 🔥 Order Tracking Number Update
  const handleTrackingUpdate = async (docId, trackingNum) => {
    try {
      await updateOrderField(docId, { trackingNum });
    } catch (err) {
      console.warn("Tracking update failed:", err);
    }
  };

  // 🔥 Promo Save
  const handleSavePromo = async () => {
    if (!prf.code) {
      noti("코드 입력");
      return;
    }
    try {
      if (editPrCode) {
        await updatePromo(prf.code, { ...prf });
        noti("수정 완료");
      } else {
        await addPromo({ ...prf });
        noti("추가 완료");
      }
      setShowPrF(false);
    } catch (err) {
      noti("저장 실패");
    }
  };

  // 🔥 Promo Delete
  const handleDeletePromo = async (code) => {
    try {
      await deletePromo(code);
      noti("삭제 완료");
    } catch (err) {
      noti("삭제 실패");
    }
  };

  // 🔥 Category Save
  const handleSaveCategory = async () => {
    if (!catForm.id || !catForm.nameKo) {
      noti("ID와 이름을 입력하세요");
      return;
    }
    if (!editCatId && categories[catForm.id]) {
      noti("이미 존재하는 ID입니다");
      return;
    }
    try {
      await saveCategory(catForm.id, { nameKo: catForm.nameKo, nameEn: catForm.nameEn || catForm.id });
      noti(editCatId ? "카테고리 수정 완료" : "카테고리 추가 완료");
      setShowCatF(false);
    } catch (err) {
      noti("저장 실패");
    }
  };

  // 🔥 Category Delete
  const handleDeleteCategory = async (id) => {
    if (products.some((p) => p.category === id)) {
      noti("해당 카테고리에 제품이 있어 삭제 불가");
      return;
    }
    try {
      await deleteCategory(id);
      noti("카테고리 삭제 완료");
    } catch (err) {
      noti("삭제 실패");
    }
  };

  // 🔥 Stock Update (direct Firestore)
  const handleStockChange = async (productId, newStock) => {
    try {
      await updateProduct(productId, { stock: Math.max(0, newStock) });
    } catch (err) {
      console.warn("Stock update failed:", err);
    }
  };

  // ─────────────────────────────────────────────
  // Media File Handling (with Firebase Storage upload prep)
  // ─────────────────────────────────────────────
  const handleFileSelect = (files) => {
    const maxCount = 10 - (pf.media || []).length;
    const validFiles = [...files].filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/")).slice(0, maxCount);

    validFiles.forEach((file) => {
      const r = new FileReader();
      r.onload = (ev) => {
        const isVid = file.type.startsWith("video/");
        setPf((prev) => {
          const newMedia = [...(prev.media || []), { type: isVid ? "video" : "image", url: ev.target.result, alt: file.name, fileName: file.name }];
          const newIndex = newMedia.length - 1;
          setPendingFiles((pf2) => [...pf2, { index: newIndex, file }]);
          return { ...prev, media: newMedia };
        });
      };
      r.readAsDataURL(file);
    });
  };

  // ─────────────────────────────────────────────
  // Styles
  // ─────────────────────────────────────────────
  const c = {
    bg: "#F0F2F5", primary: "#2D5A3D", pLight: "#E8F0EB", accent: "#D4956A", aLight: "#FFF3EB",
    text: "#1A1A1A", tLight: "#7A8599", border: "#E4E7EC", danger: "#E74C3C", dLight: "#FDEDED",
    success: "#27AE60", warn: "#F39C12", wLight: "#FFF8E1",
  };
  const inp = {
    width: "100%", border: `1px solid ${c.border}`, borderRadius: "8px", padding: "10px 12px",
    fontSize: "13px", fontFamily: "'DM Sans',sans-serif", boxSizing: "border-box", outline: "none",
  };
  const btn = {
    border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600,
    fontFamily: "'DM Sans',sans-serif", background: c.primary, color: "#FFF",
    padding: "10px 20px", fontSize: "13px",
  };
  const btnS = { ...btn, padding: "6px 12px", fontSize: "12px" };

  const Modal = ({ children, onClose, title }) => (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#FFF", borderRadius: 16, maxWidth: 520, width: "100%", maxHeight: "85vh", overflow: "auto", padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: c.tLight }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );

  const getOrderDate = (o) => {
    if (o.createdAt?.toDate) return o.createdAt.toDate().toLocaleDateString("ko-KR");
    if (o.createdAt) return new Date(o.createdAt).toLocaleDateString("ko-KR");
    return "";
  };

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: c.bg, minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <style>{`@keyframes si{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}input:focus,select:focus{border-color:#2D5A3D!important}`}</style>
      {notif && (
        <div style={{ position: "fixed", top: 16, right: 16, background: c.primary, color: "#FFF", padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 2000, boxShadow: "0 4px 20px rgba(0,0,0,.2)", animation: "si .3s ease" }}>
          ✓ {notif}
        </div>
      )}

      {/* Header */}
      <div style={{ background: "#1B2A3D", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20 }}>🌿</span>
          <span style={{ fontFamily: "'DM Serif Display',serif", color: "#FFF", fontSize: 18 }}>NOVO MARKET</span>
          <span style={{ color: "rgba(255,255,255,.5)", fontSize: 12 }}>Admin</span>
          <span style={{ color: "rgba(255,255,255,.3)", fontSize: 10, marginLeft: 4 }}>🔥 Firebase</span>
        </div>
        {stats.pending > 0 && (
          <span style={{ background: c.warn, color: "#FFF", borderRadius: 12, padding: "4px 10px", fontSize: 11, fontWeight: 700 }}>⚠ {stats.pending} pending</span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ background: "#FFF", borderBottom: `1px solid ${c.border}`, display: "flex", overflowX: "auto", padding: "0 12px" }}>
        {[
          { k: "dashboard", i: "📊", l: "대시보드" },
          { k: "orders", i: "📦", l: "주문 관리" },
          { k: "products", i: "🏷️", l: "제품 관리" },
          { k: "categories", i: "📂", l: "카테고리" },
          { k: "promos", i: "🎟️", l: "프로모션" },
          { k: "inventory", i: "📋", l: "재고 관리" },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            style={{
              padding: "14px 16px", border: "none", background: "none", cursor: "pointer", fontSize: 13,
              fontWeight: tab === t.k ? 700 : 500, color: tab === t.k ? c.primary : c.tLight,
              borderBottom: tab === t.k ? `3px solid ${c.primary}` : "3px solid transparent",
              fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap",
            }}
          >
            {t.i} {t.l}
          </button>
        ))}
      </div>

      <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
        {/* Loading */}
        {!loaded && (
          <div style={{ textAlign: "center", padding: "60px 0", color: c.tLight }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
            <div>Firebase 데이터 로딩 중...</div>
          </div>
        )}

        {/* ═══ DASHBOARD ═══ */}
        {loaded && tab === "dashboard" && (
          <div>
            <h2 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, marginBottom: 20 }}>📊 대시보드</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14, marginBottom: 24 }}>
              {[
                { l: "오늘 주문", v: stats.today, i: "📦", cl: c.primary },
                { l: "총 매출", v: `$${stats.revenue.toFixed(0)}`, i: "💰", cl: c.accent },
                { l: "처리 대기", v: stats.pending, i: "⏳", cl: c.warn },
                { l: "재고 부족", v: stats.lowStock, i: "⚠️", cl: c.danger },
                { l: "품절", v: stats.oos, i: "🚫", cl: "#666" },
                { l: "총 주문", v: stats.total, i: "📋", cl: "#2980B9" },
              ].map((s, i) => (
                <div key={i} style={{ background: "#FFF", borderRadius: 14, padding: 18, border: `1px solid ${c.border}`, position: "relative" }}>
                  <div style={{ position: "absolute", top: 12, right: 14, fontSize: 28, opacity: 0.15 }}>{s.i}</div>
                  <div style={{ fontSize: 11, color: c.tLight, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.l}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: s.cl }}>{s.v}</div>
                </div>
              ))}
            </div>
            <div style={{ background: "#FFF", borderRadius: 14, padding: 20, border: `1px solid ${c.border}` }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>최근 주문</h3>
              {orders.slice(0, 5).map((o) => (
                <div key={o._docId || o.orderNum} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${c.border}` }}>
                  <div>
                    <span style={{ fontWeight: 700, color: c.primary, marginRight: 10 }}>{o.orderNum}</span>
                    <span style={{ fontSize: 13 }}>{o.customer?.name}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>${(o.total || 0).toFixed(2)}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: STATUS[o.status]?.bg, color: STATUS[o.status]?.color }}>
                      {STATUS[o.status]?.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ ORDERS ═══ */}
        {loaded && tab === "orders" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, margin: 0 }}>📦 주문 관리</h2>
              <button onClick={exportCSV} style={btn}>📄 배송 CSV 다운로드</button>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="주문번호, 이름, 전화번호 검색..." style={{ ...inp, maxWidth: 280 }} />
              <select value={oFilter} onChange={(e) => setOFilter(e.target.value)} style={{ ...inp, maxWidth: 160 }}>
                <option value="all">전체 상태</option>
                {Object.entries(STATUS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            {fOrders.map((o) => (
              <div key={o._docId || o.orderNum} style={{ background: "#FFF", borderRadius: 12, padding: 16, marginBottom: 10, border: `1px solid ${c.border}`, borderLeft: `4px solid ${STATUS[o.status]?.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, fontSize: 16, color: c.primary }}>{o.orderNum}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: STATUS[o.status]?.bg, color: STATUS[o.status]?.color }}>
                        {STATUS[o.status]?.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: c.tLight }}>{o.customer?.name} · {o.phone}</div>
                    <div style={{ fontSize: 12, color: c.tLight }}>{o.customer?.address}, {o.customer?.city}, {o.customer?.state} {o.customer?.zip}</div>
                    <div style={{ fontSize: 12, color: c.tLight }}>Venmo/Zelle: {o.customer?.venmoName}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>${(o.total || 0).toFixed(2)}</div>
                    <div style={{ fontSize: 11, color: c.tLight }}>{getOrderDate(o)}</div>
                  </div>
                </div>
                <div style={{ margin: "10px 0", padding: "8px 12px", background: "#F8F9FA", borderRadius: 8 }}>
                  {(o.items || []).map((it, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}>
                      <span>{it.name} × {it.qty}</span>
                      <span style={{ fontWeight: 600 }}>${(it.price * it.qty).toFixed(2)}</span>
                    </div>
                  ))}
                  {(o.discount || 0) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: c.danger }}>
                      <span>할인</span>
                      <span>-${o.discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span>배송비</span>
                    <span>{o.shipping === 0 ? "무료" : `$${(o.shipping || 0).toFixed(2)}`}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {o.status === "pending_payment" && (
                    <button onClick={() => handleOrderStatus(o._docId, "confirmed", `${o.orderNum} → 결제 확인`)} style={{ ...btnS, background: c.warn }}>💳 결제 확인</button>
                  )}
                  {o.status === "payment_submitted" && (
                    <button onClick={() => handleOrderStatus(o._docId, "confirmed", `${o.orderNum} → 결제 승인`)} style={{ ...btnS, background: c.success }}>✓ 결제 승인</button>
                  )}
                  {o.status === "confirmed" && (
                    <button onClick={() => handleOrderStatus(o._docId, "preparing", `${o.orderNum} → 준비중`)} style={{ ...btnS, background: "#2980B9" }}>📦 준비 시작</button>
                  )}
                  {(o.status === "preparing" || o.status === "confirmed") && (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        value={o.trackingNum || ""}
                        onChange={(e) => handleTrackingUpdate(o._docId, e.target.value)}
                        placeholder="트래킹 번호"
                        style={{ ...inp, maxWidth: 200, padding: "6px 10px", fontSize: 12 }}
                      />
                      {o.trackingNum && (
                        <button onClick={() => handleOrderStatus(o._docId, "shipped", `${o.orderNum} → 발송`)} style={{ ...btnS, background: "#8E44AD" }}>🚚 발송</button>
                      )}
                    </div>
                  )}
                  {o.status === "shipped" && (
                    <button onClick={() => handleOrderStatus(o._docId, "delivered", `${o.orderNum} → 배송완료`)} style={{ ...btnS, background: "#2C3E50" }}>✓ 배송 완료</button>
                  )}
                  {o.trackingNum && <span style={{ fontSize: 11, color: c.tLight }}>📍 {o.trackingNum}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ PRODUCTS ═══ */}
        {loaded && tab === "products" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, margin: 0 }}>🏷️ 제품 관리</h2>
              <button
                onClick={() => {
                  setPf({ id: `p${Date.now()}`, category: "babyfood", nameEn: "", nameKo: "", price: 0, stock: 0, image: "📦", sale: false, salePrice: 0, active: true, media: [], tiered: [], descKo: "", descEn: "", tags: [] });
                  setEditPid(null);
                  setPendingFiles([]);
                  setShowPF(true);
                }}
                style={btn}
              >
                + 제품 추가
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
              {products.map((p) => (
                <div key={p.id} style={{ background: "#FFF", borderRadius: 12, padding: 16, border: `1px solid ${c.border}`, opacity: p.active ? 1 : 0.5, position: "relative" }}>
                  {!p.active && <div style={{ position: "absolute", top: 8, right: 8, fontSize: 10, background: "#EEE", padding: "2px 6px", borderRadius: 4, color: "#999" }}>비활성</div>}
                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ width: 60, height: 60, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "#F0EDE8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {p.media && p.media.length > 0 && p.media[0].url ? (
                        <img src={p.media[0].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                      ) : (
                        <span style={{ fontSize: 30 }}>{p.image || "📦"}</span>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{p.nameKo}</div>
                      <div style={{ fontSize: 11, color: c.tLight, marginBottom: 6 }}>{p.nameEn}</div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                        {p.sale ? (
                          <>
                            <span style={{ fontWeight: 800, color: c.danger }}>${(p.salePrice || 0).toFixed(2)}</span>
                            <span style={{ fontSize: 11, color: c.tLight, textDecoration: "line-through" }}>${(p.price || 0).toFixed(2)}</span>
                          </>
                        ) : (
                          <span style={{ fontWeight: 800, color: c.primary }}>${(p.price || 0).toFixed(2)}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: p.stock === 0 ? c.danger : p.stock <= 5 ? c.warn : c.tLight, fontWeight: p.stock <= 5 ? 700 : 400 }}>
                        재고: {p.stock}개{p.stock === 0 && " ⚠️ 품절"}
                      </div>
                      <div style={{ fontSize: 11, color: c.tLight }}>
                        {categories[p.category] || p.category}
                        {p.media && p.media.length > 0 && <span style={{ marginLeft: 6 }}>📷 {p.media.length}</span>}
                        {p.tiered && p.tiered.length > 0 && <span style={{ marginLeft: 6, color: c.primary }}>📦 {p.tiered.length}구간</span>}
                      </div>
                      {p.tags && p.tags.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                          {p.tags.map((tag, i) => (
                            <span key={i} style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 10, background: tag.color || "#EEE", color: tag.textColor || "#555" }}>
                              {tag.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 10, justifyContent: "flex-end" }}>
                    <button
                      onClick={() => {
                        setPf({ ...p });
                        setEditPid(p.id);
                        setPendingFiles([]);
                        setShowPF(true);
                      }}
                      style={{ ...btnS, background: "#3498DB" }}
                    >
                      ✏️ 수정
                    </button>
                    <button onClick={() => handleDeleteProduct(p.id)} style={{ ...btnS, background: c.danger }}>🗑 삭제</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Product Form Modal */}
            {showPF && (
              <Modal title={editPid ? "제품 수정" : "새 제품 추가"} onClose={() => setShowPF(false)}>
                {[
                  { k: "nameKo", l: "제품명 (한국어)", t: "text" },
                  { k: "nameEn", l: "Product Name (EN)", t: "text" },
                  { k: "price", l: "가격 ($)", t: "number" },
                  { k: "stock", l: "재고", t: "number" },
                  { k: "image", l: "이모지 (대체용)", t: "text" },
                ].map((f) => (
                  <div key={f.k} style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: c.tLight, display: "block", marginBottom: 4 }}>{f.l}</label>
                    <input value={pf[f.k]} onChange={(e) => setPf({ ...pf, [f.k]: f.t === "number" ? Number(e.target.value) : e.target.value })} type={f.t} style={inp} />
                  </div>
                ))}

                {/* Description */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: c.tLight, display: "block", marginBottom: 4 }}>📝 제품 설명 (한국어)</label>
                  <textarea value={pf.descKo || ""} onChange={(e) => setPf({ ...pf, descKo: e.target.value })} placeholder="예: 4개월 이상 아기를 위한 유기농 쌀미음" rows={3} style={{ ...inp, resize: "vertical" }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: c.tLight, display: "block", marginBottom: 4 }}>📝 Description (EN)</label>
                  <textarea value={pf.descEn || ""} onChange={(e) => setPf({ ...pf, descEn: e.target.value })} placeholder="e.g. Organic rice porridge for babies 4+ months" rows={3} style={{ ...inp, resize: "vertical" }} />
                </div>

                {/* Tags */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: c.tLight, display: "block", marginBottom: 6 }}>🏷️ 제품 태그</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {(pf.tags || []).map((tag, i) => (
                      <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: tag.color || "#EAF5FA", color: tag.textColor || "#2980B9", padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                        {tag.label}
                        <button onClick={() => { const nt = [...(pf.tags || [])]; nt.splice(i, 1); setPf({ ...pf, tags: nt }); }} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 14, padding: 0, marginLeft: 2 }}>✕</button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
                    {[
                      { label: "무염", color: "#E8F5E9", textColor: "#2E7D32" },
                      { label: "저염", color: "#E8F5E9", textColor: "#2E7D32" },
                      { label: "유기농", color: "#FFF8E1", textColor: "#F57F17" },
                      { label: "무첨가", color: "#E3F2FD", textColor: "#1565C0" },
                      { label: "유통기한 짧음", color: "#FDEDED", textColor: "#C0392B" },
                      { label: "냉장보관", color: "#E0F7FA", textColor: "#00838F" },
                      { label: "인기상품", color: "#FFF0F3", textColor: "#C2185B" },
                      { label: "신상품", color: "#F3E5F5", textColor: "#7B1FA2" },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => {
                          if ((pf.tags || []).some((t) => t.label === preset.label)) return;
                          setPf({ ...pf, tags: [...(pf.tags || []), preset] });
                        }}
                        style={{ ...btnS, padding: "3px 8px", fontSize: 10, background: preset.color, color: preset.textColor, border: `1px solid ${preset.textColor}22`, opacity: (pf.tags || []).some((t) => t.label === preset.label) ? 0.4 : 1 }}
                      >
                        + {preset.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input id="novo-custom-tag" placeholder="커스텀 태그 입력" style={{ ...inp, flex: 1, padding: "6px 10px", fontSize: 12 }} />
                    <button
                      onClick={() => { const el = document.getElementById("novo-custom-tag"); if (!el || !el.value.trim()) return; setPf({ ...pf, tags: [...(pf.tags || []), { label: el.value.trim(), color: "#F5F5F5", textColor: "#555" }] }); el.value = ""; }}
                      style={{ ...btnS, background: "#7F8C8D" }}
                    >
                      + 추가
                    </button>
                  </div>
                </div>

                {/* 🔥 Media Upload — Firebase Storage */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: c.tLight, display: "block", marginBottom: 8 }}>📷 제품 이미지/영상 (최대 10개) — Firebase Storage 업로드</label>

                  {(pf.media || []).length < 10 && (
                    <div style={{ marginBottom: 10 }}>
                      <div
                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = c.primary; }}
                        onDragLeave={(e) => { e.currentTarget.style.borderColor = c.border; }}
                        onDrop={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = c.border; handleFileSelect(e.dataTransfer.files); }}
                        style={{ border: `2px dashed ${c.border}`, borderRadius: 12, padding: "20px 16px", textAlign: "center", cursor: "pointer", background: "#FAFAFA", transition: "border-color 0.2s" }}
                        onClick={() => document.getElementById("novo-file-input")?.click()}
                      >
                        <div style={{ fontSize: 28, marginBottom: 6 }}>📤</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: c.tLight }}>사진을 끌어오거나 탭하세요</div>
                        <div style={{ fontSize: 11, color: "#AAA", marginTop: 4 }}>🔥 Firebase Storage에 자동 업로드</div>
                      </div>
                      <input
                        id="novo-file-input"
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        capture="environment"
                        style={{ display: "none" }}
                        onChange={(e) => { handleFileSelect(e.target.files); e.target.value = ""; }}
                      />
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <button onClick={() => { const inp2 = document.getElementById("novo-file-input"); if (inp2) { inp2.removeAttribute("capture"); inp2.click(); } }} style={{ ...btnS, background: "#3498DB", flex: 1 }}>📁 갤러리</button>
                        <button onClick={() => { const inp2 = document.getElementById("novo-file-input"); if (inp2) { inp2.setAttribute("capture", "environment"); inp2.click(); } }} style={{ ...btnS, background: c.primary, flex: 1 }}>📸 카메라</button>
                        <button onClick={() => setPf({ ...pf, media: [...(pf.media || []), { type: "image", url: "", alt: "" }] })} style={{ ...btnS, background: "#7F8C8D", flex: 1 }}>🔗 URL</button>
                      </div>
                    </div>
                  )}

                  {(pf.media || []).length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(90px,1fr))", gap: 8, marginTop: 8 }}>
                      {(pf.media || []).map((m, i) => (
                        <div key={i} style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: `1px solid ${c.border}`, background: "#F0EDE8" }}>
                          {m.type === "video" ? (
                            <div style={{ width: "100%", height: 90, display: "flex", alignItems: "center", justifyContent: "center", background: "#1A1A1A" }}>
                              <span style={{ fontSize: 24, color: "#FFF" }}>🎬</span>
                            </div>
                          ) : m.url ? (
                            <img src={m.url} alt={m.alt || ""} style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }} onError={(e) => { e.target.style.display = "none"; }} />
                          ) : (
                            <div style={{ width: "100%", height: 90, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <input value={m.url} onChange={(e) => { const nm = [...(pf.media || [])]; nm[i] = { ...nm[i], url: e.target.value }; setPf({ ...pf, media: nm }); }} placeholder="URL" style={{ width: "80%", border: `1px solid ${c.border}`, borderRadius: 4, padding: "4px 6px", fontSize: 10, textAlign: "center" }} />
                            </div>
                          )}
                          <button onClick={() => { const nm = [...(pf.media || [])]; nm.splice(i, 1); setPf({ ...pf, media: nm }); setPendingFiles((pf2) => pf2.filter((f) => f.index !== i).map((f) => f.index > i ? { ...f, index: f.index - 1 } : f)); }} style={{ position: "absolute", top: 3, right: 3, width: 20, height: 20, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)", color: "#FFF", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>✕</button>
                          {i === 0 && <div style={{ position: "absolute", bottom: 3, left: 3, background: c.primary, color: "#FFF", fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 3 }}>대표</div>}
                        </div>
                      ))}
                    </div>
                  )}
                  {(pf.media || []).length > 0 && (
                    <div style={{ fontSize: 11, color: c.tLight, marginTop: 6 }}>
                      📷 {(pf.media || []).filter((m) => m.type === "image").length}개 이미지 · 🎬 {(pf.media || []).filter((m) => m.type === "video").length}개 영상
                      {pendingFiles.length > 0 && <span style={{ color: c.warn, marginLeft: 8 }}>⏳ {pendingFiles.length}개 업로드 대기중</span>}
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: c.tLight, display: "block", marginBottom: 4 }}>카테고리</label>
                  <select value={pf.category} onChange={(e) => setPf({ ...pf, category: e.target.value })} style={inp}>
                    {Object.entries(categories).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={pf.sale} onChange={(e) => setPf({ ...pf, sale: e.target.checked })} />세일
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={pf.active} onChange={(e) => setPf({ ...pf, active: e.target.checked })} />활성
                  </label>
                </div>
                {pf.sale && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: c.tLight, display: "block", marginBottom: 4 }}>세일 가격</label>
                    <input value={pf.salePrice} onChange={(e) => setPf({ ...pf, salePrice: Number(e.target.value) })} type="number" style={inp} />
                  </div>
                )}

                {/* Tiered Pricing */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: c.tLight, display: "block", marginBottom: 6 }}>📦 수량별 할인 (선택사항)</label>
                  {(pf.tiered || []).map((tier, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <input value={tier.qty} onChange={(e) => { const nt = [...(pf.tiered || [])]; nt[i] = { ...nt[i], qty: Number(e.target.value) }; setPf({ ...pf, tiered: nt }); }} type="number" placeholder="수량" style={{ ...inp, padding: "6px 10px", fontSize: 12 }} />
                      </div>
                      <span style={{ fontSize: 12, color: c.tLight }}>개 이상 →</span>
                      <div style={{ flex: 1 }}>
                        <input value={tier.price} onChange={(e) => { const nt = [...(pf.tiered || [])]; nt[i] = { ...nt[i], price: Number(e.target.value) }; setPf({ ...pf, tiered: nt }); }} type="number" step="0.01" placeholder="개당 가격" style={{ ...inp, padding: "6px 10px", fontSize: 12 }} />
                      </div>
                      <span style={{ fontSize: 12, color: c.tLight }}>$</span>
                      <button onClick={() => { const nt = [...(pf.tiered || [])]; nt.splice(i, 1); setPf({ ...pf, tiered: nt }); }} style={{ ...btnS, padding: "4px 8px", background: c.danger }}>✕</button>
                    </div>
                  ))}
                  <button onClick={() => setPf({ ...pf, tiered: [...(pf.tiered || []), { qty: 3, price: 0 }] })} style={{ ...btnS, background: "#3498DB", marginTop: 4 }}>+ 수량 구간 추가</button>
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                  <button onClick={() => setShowPF(false)} style={{ ...btn, background: "transparent", color: c.primary, border: `1px solid ${c.primary}` }}>취소</button>
                  <button onClick={handleSaveProduct} disabled={saving} style={{ ...btn, opacity: saving ? 0.5 : 1 }}>
                    {saving ? "저장 중..." : "저장"}
                  </button>
                </div>
              </Modal>
            )}
          </div>
        )}

        {/* ═══ CATEGORIES ═══ */}
        {loaded && tab === "categories" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, margin: 0 }}>📂 카테고리 관리</h2>
              <button onClick={() => { setCatForm({ id: "", nameKo: "", nameEn: "" }); setEditCatId(null); setShowCatF(true); }} style={btn}>+ 카테고리 추가</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 12 }}>
              {Object.entries(categories).map(([id, name]) => {
                const count = products.filter((p) => p.category === id).length;
                return (
                  <div key={id} style={{ background: "#FFF", borderRadius: 12, padding: 16, border: `1px solid ${c.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: c.primary }}>{name}</div>
                      <div style={{ fontSize: 12, color: c.tLight, marginTop: 4 }}>ID: {id} · 제품 {count}개</div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => { setCatForm({ id, nameKo: name, nameEn: id }); setEditCatId(id); setShowCatF(true); }} style={{ ...btnS, background: "#3498DB" }}>✏️</button>
                      <button onClick={() => handleDeleteCategory(id)} style={{ ...btnS, background: c.danger }}>🗑</button>
                    </div>
                  </div>
                );
              })}
            </div>
            {showCatF && (
              <Modal title={editCatId ? "카테고리 수정" : "새 카테고리 추가"} onClose={() => setShowCatF(false)}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: c.tLight, display: "block", marginBottom: 4 }}>카테고리 ID (영문, 수정불가)</label>
                  <input value={catForm.id} onChange={(e) => setCatForm({ ...catForm, id: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "") })} disabled={!!editCatId} placeholder="예: babyfood" style={{ ...inp, background: editCatId ? "#F5F5F5" : "#FFF" }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: c.tLight, display: "block", marginBottom: 4 }}>카테고리 이름 (한국어)</label>
                  <input value={catForm.nameKo} onChange={(e) => setCatForm({ ...catForm, nameKo: e.target.value })} placeholder="예: 이유식" style={inp} />
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                  <button onClick={() => setShowCatF(false)} style={{ ...btn, background: "transparent", color: c.primary, border: `1px solid ${c.primary}` }}>취소</button>
                  <button onClick={handleSaveCategory} style={btn}>저장</button>
                </div>
              </Modal>
            )}
          </div>
        )}

        {/* ═══ PROMOS ═══ */}
        {loaded && tab === "promos" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, margin: 0 }}>🎟️ 프로모션 관리</h2>
              <button onClick={() => { setPrf({ code: "", type: "percent", value: 0, minOrder: 0, active: true }); setEditPrCode(null); setShowPrF(true); }} style={btn}>+ 추가</button>
            </div>
            {promos.map((p) => (
              <div key={p.code || p._docId} style={{ background: "#FFF", borderRadius: 12, padding: 16, marginBottom: 10, border: `1px solid ${c.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", opacity: p.active ? 1 : 0.5 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: c.primary, letterSpacing: 1 }}>{p.code}</div>
                  <div style={{ fontSize: 13, color: c.tLight, marginTop: 4 }}>
                    {p.type === "percent" ? `${p.value}% 할인` : `$${p.value} 할인`}
                    {p.minOrder > 0 && ` · 최소 $${p.minOrder}`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => { setPrf({ ...p }); setEditPrCode(p.code); setShowPrF(true); }} style={{ ...btnS, background: "#3498DB" }}>✏️</button>
                  <button onClick={() => handleDeletePromo(p.code)} style={{ ...btnS, background: c.danger }}>🗑</button>
                </div>
              </div>
            ))}
            {showPrF && (
              <Modal title={editPrCode ? "프로모션 수정" : "새 프로모션"} onClose={() => setShowPrF(false)}>
                <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, fontWeight: 600, color: c.tLight, display: "block", marginBottom: 4 }}>코드</label><input value={prf.code} onChange={(e) => setPrf({ ...prf, code: e.target.value.toUpperCase() })} style={inp} placeholder="예: SUMMER30" /></div>
                <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, fontWeight: 600, color: c.tLight, display: "block", marginBottom: 4 }}>타입</label><select value={prf.type} onChange={(e) => setPrf({ ...prf, type: e.target.value })} style={inp}><option value="percent">% 할인</option><option value="fixed">$ 할인</option></select></div>
                <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, fontWeight: 600, color: c.tLight, display: "block", marginBottom: 4 }}>할인 값</label><input value={prf.value} onChange={(e) => setPrf({ ...prf, value: Number(e.target.value) })} type="number" style={inp} /></div>
                <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, fontWeight: 600, color: c.tLight, display: "block", marginBottom: 4 }}>최소 주문 ($)</label><input value={prf.minOrder} onChange={(e) => setPrf({ ...prf, minOrder: Number(e.target.value) })} type="number" style={inp} /></div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", marginBottom: 16 }}><input type="checkbox" checked={prf.active} onChange={(e) => setPrf({ ...prf, active: e.target.checked })} />활성화</label>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => setShowPrF(false)} style={{ ...btn, background: "transparent", color: c.primary, border: `1px solid ${c.primary}` }}>취소</button>
                  <button onClick={handleSavePromo} style={btn}>저장</button>
                </div>
              </Modal>
            )}
          </div>
        )}

        {/* ═══ INVENTORY ═══ */}
        {loaded && tab === "inventory" && (
          <div>
            <h2 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, marginBottom: 16 }}>📋 재고 관리</h2>
            {products.filter((p) => p.stock <= 5 && p.active).length > 0 && (
              <div style={{ background: c.wLight, border: `1px solid ${c.warn}33`, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: c.warn, marginBottom: 6 }}>⚠️ 재고 부족 / 품절</div>
                {products.filter((p) => p.stock <= 5 && p.active).map((p) => (
                  <div key={p.id} style={{ fontSize: 12, padding: "2px 0" }}>
                    {p.image || "📦"} {p.nameKo} — <strong style={{ color: p.stock === 0 ? c.danger : c.warn }}>{p.stock === 0 ? "품절" : `${p.stock}개`}</strong>
                  </div>
                ))}
              </div>
            )}
            <div style={{ background: "#FFF", borderRadius: 14, border: `1px solid ${c.border}`, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#F8F9FA" }}>
                    {["제품", "카테고리", "가격", "재고", "수정"].map((h) => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: h === "제품" ? "left" : "center", fontWeight: 700, color: c.tLight, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.filter((p) => p.active).sort((a, b) => a.stock - b.stock).map((p) => (
                    <tr key={p.id} style={{ borderTop: `1px solid ${c.border}` }}>
                      <td style={{ padding: "10px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {p.media && p.media.length > 0 && p.media[0].url ? (
                            <div style={{ width: 28, height: 28, borderRadius: 4, overflow: "hidden", flexShrink: 0 }}>
                              <img src={p.media[0].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                            </div>
                          ) : (
                            <span style={{ fontSize: 20 }}>{p.image || "📦"}</span>
                          )}
                          <span style={{ fontWeight: 600 }}>{p.nameKo}</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "center", color: c.tLight }}>{categories[p.category] || p.category}</td>
                      <td style={{ padding: "10px 16px", textAlign: "center", fontWeight: 700 }}>${(p.sale ? p.salePrice : p.price || 0).toFixed(2)}</td>
                      <td style={{ padding: "10px 16px", textAlign: "center" }}>
                        <span style={{ fontWeight: 700, padding: "3px 10px", borderRadius: 6, fontSize: 12, background: p.stock === 0 ? c.dLight : p.stock <= 5 ? c.wLight : c.pLight, color: p.stock === 0 ? c.danger : p.stock <= 5 ? c.warn : c.primary }}>
                          {p.stock}
                        </span>
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                          <button onClick={() => handleStockChange(p.id, p.stock - 1)} style={{ ...btnS, padding: "4px 8px", background: c.tLight }}>−</button>
                          <input
                            value={p.stock}
                            onChange={(e) => { const v = Math.max(0, parseInt(e.target.value) || 0); handleStockChange(p.id, v); }}
                            style={{ width: 50, textAlign: "center", border: `1px solid ${c.border}`, borderRadius: 6, padding: 4, fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}
                          />
                          <button onClick={() => handleStockChange(p.id, p.stock + 1)} style={{ ...btnS, padding: "4px 8px" }}>+</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
