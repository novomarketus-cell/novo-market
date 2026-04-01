import { useState, useEffect, useMemo, useRef } from "react";
import {
  subscribeProducts, subscribeOrders, subscribeCategories, subscribePromos,
  addOrder, updateOrderField, updateProduct,
} from "./firebase";
import novoLogo from "/novo-logo.png";

const FREE_SHIP = 150;
const SHIP_COST = 9.99;
const CARRIERS = { usps:"https://tools.usps.com/go/TrackConfirmAction?tLabels=", ups:"https://www.ups.com/track?tracknum=", fedex:"https://www.fedex.com/fedextrack/?trknbr=" };

const fmt = n => `$${n.toFixed(2)}`;

const basePrice = p => {
  if (p.sale && p.salePrice > 0) return p.salePrice;
  if (p.promo) return +(p.price * (1 - p.promo.value / 100)).toFixed(2);
  return p.price || 0;
};
const tieredPrice = (p, qty) => {
  if (!p.tiered || !p.tiered.length) return basePrice(p);
  const sorted = [...p.tiered].sort((a, b) => Number(b.qty) - Number(a.qty));
  for (const t of sorted) if (qty >= Number(t.qty)) return Number(t.price);
  return basePrice(p);
};
const genId = () => `NM-${Math.floor(Math.random() * 9000) + 1000}`;

const formatPhone = (val) => {
  const digits = val.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const englishOnly = (val) => val.replace(/[^\x20-\x7E]/g, "");

const T = {
  en: {
    brand: "NOVO MARKET", tag: "Premium Korean Baby & Kids Food",
    search: "Search products...", cart: "Cart", add: "Add to Cart", sold: "Sold Out", off: "OFF",
    sub: "Subtotal", ship: "Shipping", free: "FREE", freeNote: `Free shipping on orders $${FREE_SHIP}+`,
    total: "Total", checkout: "Place Order", empty: "Your cart is empty",
    info: "Order Information", name: "Full Name", phone: "Phone Number",
    addr: "Street Address", city: "City", state: "State", zip: "ZIP",
    vname: "Venmo / Zelle Name", save: "Save my info", submit: "Submit Order",
    done: "Order Submitted!", orderNum: "Order Number", amt: "Amount to Pay",
    payMsg: "Send payment via Venmo or Zelle with your order number in the memo, then tap 'I Paid' below.",
    paid: "I Paid ✓", paidOk: "Payment notification sent! We'll confirm and ship soon.",
    track: "Track", trackNum: "Tracking #", trackBtn: "Track Package →",
    history: "Orders", enterPhone: "Enter your phone number", none: "No orders found",
    promo: "Promo code", apply: "Apply", remove: "Remove", back: "← Back",
    moreFree: "more for free shipping!", ok: "Applied!", bad: "Invalid code", added: "Added!",
    shop: "Shop", items: "items",
    link: "Link to existing order (enter phone #)", linkNum: "Your phone number",
    linkSubmit: "Link & Submit", memo: "Write order # in Venmo/Zelle memo", shopNow: "Shop Now",
    bulk: "Buy more, save more!", bulkTag: "Bulk discount", ea: "ea", cur: "Current price",
    addrWarn: "⚠️ Please enter your address accurately. We are not responsible for incorrect deliveries.",
    cancelPolicy: "Cancellation Policy",
    cancelText: "Orders can only be cancelled before payment is confirmed. Once payment is verified and the order is being prepared, cancellations are not accepted. For any issues, please contact us via Instagram DM @novomarket.us",
    englishOnly: "Please enter all information in English only",
    phoneLookup: "Enter your phone to find past orders",
    allCat: "All",
    pendingPay: "Complete Payment",
    payNow: "Pay Now",
    backToOrders: "← Back to Orders",
  },
  ko: {
    brand: "노보마켓", tag: "프리미엄 한국 유아·아동 식품",
    search: "제품 검색...", cart: "장바구니", add: "담기", sold: "품절", off: "할인",
    sub: "소계", ship: "배송비", free: "무료", freeNote: `$${FREE_SHIP} 이상 무료배송`,
    total: "합계", checkout: "주문하기", empty: "장바구니가 비어있습니다",
    info: "주문 정보", name: "이름", phone: "전화번호",
    addr: "주소", city: "도시", state: "주(State)", zip: "우편번호",
    vname: "Venmo / Zelle 표시 이름", save: "다음 주문을 위해 정보 저장", submit: "주문 제출",
    done: "주문 접수 완료!", orderNum: "주문번호", amt: "결제 금액",
    payMsg: "Venmo 또는 Zelle로 결제 시 메모란에 주문번호를 적어주세요. 결제 후 아래 버튼을 눌러주세요.",
    paid: "결제 완료 ✓", paidOk: "결제 알림이 전송되었습니다! 확인 후 발송해 드리겠습니다.",
    track: "배송조회", trackNum: "운송장번호", trackBtn: "배송 추적 →",
    history: "주문내역", enterPhone: "전화번호 입력", none: "주문 내역 없음",
    promo: "쿠폰 코드", apply: "적용", remove: "삭제", back: "← 뒤로",
    moreFree: "추가 시 무료배송!", ok: "쿠폰 적용!", bad: "유효하지 않은 쿠폰", added: "담았습니다!",
    shop: "홈", items: "개",
    link: "기존 주문에 연결 (전화번호 입력)", linkNum: "전화번호",
    linkSubmit: "연결 주문", memo: "Venmo/Zelle 메모에 주문번호를 꼭 적어주세요", shopNow: "쇼핑하기",
    bulk: "많이 사면 더 저렴해요!", bulkTag: "묶음할인", ea: "개", cur: "현재 적용가",
    addrWarn: "⚠️ 주소를 정확히 입력해주세요. 잘못된 배송은 책임지지 않습니다.",
    cancelPolicy: "결제취소 정책",
    cancelText: "결제 확인 전에만 주문 취소가 가능합니다. 결제가 확인되고 준비가 시작되면 취소가 불가합니다. 문의사항은 인스타그램 DM @novomarket.us 으로 연락해주세요.",
    englishOnly: "모든 정보는 영어로만 입력해주세요",
    phoneLookup: "전화번호로 주문내역을 조회합니다",
    allCat: "전체",
    pendingPay: "결제 완료하기",
    payNow: "결제하기",
    backToOrders: "← 주문내역으로",
  },
};

const STATUS_LABEL = {
  en: { pending_payment:"Pending Payment", payment_submitted:"Payment Submitted", confirmed:"Confirmed", preparing:"Preparing", shipped:"Shipped", delivered:"Delivered", cancelled:"Cancelled" },
  ko: { pending_payment:"결제 대기", payment_submitted:"결제 확인중", confirmed:"결제 확인", preparing:"준비중", shipped:"배송중", delivered:"배송 완료", cancelled:"취소" },
};
const STATUS_COLOR = { pending_payment:"#E67E22", payment_submitted:"#F39C12", confirmed:"#27AE60", preparing:"#2980B9", shipped:"#8E44AD", delivered:"#2C3E50", cancelled:"#95A5A6" };

function LazyImg({ src, alt, style, onClick }) {
  const [ok, setOk] = useState(false);
  const [vis, setVis] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); o.disconnect(); } }, { rootMargin: "200px" });
    o.observe(ref.current); return () => o.disconnect();
  }, []);
  return <div ref={ref} style={{ ...style, background: "#F0EDE8", position: "relative", overflow: "hidden" }} onClick={onClick}>
    {vis && <img src={src} alt={alt || ""} loading="lazy" onLoad={() => setOk(true)} style={{ width: "100%", height: "100%", objectFit: "contain", opacity: ok ? 1 : 0, transition: "opacity .3s" }} />}
    {(!vis || !ok) && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#CCC", fontSize: 14 }}>⏳</div>}
  </div>;
}

function Gallery({ media, emoji, name }) {
  const [idx, setIdx] = useState(0);
  const [ts, setTs] = useState(null);
  const [playing, setPlaying] = useState(false);
  const vRef = useRef(null);
  const [imgH, setImgH] = useState(300);
  const imgRef = useRef(null);
  const cur = media && media.length ? media[idx] : null;
  const multi = media && media.length > 1;
  const go = i => { setIdx(i); setPlaying(false); if (vRef.current) vRef.current.pause(); };
  const next = () => go(idx < media.length - 1 ? idx + 1 : 0);
  const prev = () => go(idx > 0 ? idx - 1 : media.length - 1);
  const handleImgLoad = (e) => {
    const img = e.target;
    if (img.naturalWidth && img.naturalHeight) {
      const containerWidth = imgRef.current?.clientWidth || 400;
      const ratio = img.naturalHeight / img.naturalWidth;
      setImgH(Math.min(Math.max(containerWidth * ratio, 200), 500));
    }
  };
  if (!media || !media.length) return <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 80, background: "#F5F2ED", borderRadius: 14 }}>{emoji || "📦"}</div>;
  return <div>
    <div ref={imgRef} style={{ width: "100%", height: imgH, borderRadius: 14, overflow: "hidden", background: "#F5F2ED", position: "relative" }}
      onTouchStart={e => setTs(e.touches[0].clientX)} onTouchEnd={e => { if (ts === null) return; const d = ts - e.changedTouches[0].clientX; if (Math.abs(d) > 50) { d > 0 ? next() : prev(); } setTs(null); }}>
      {cur.type === "video" ? <div style={{ width: "100%", height: "100%", position: "relative" }}>
        <video ref={vRef} src={cur.url} poster={cur.poster} controls={playing} playsInline preload="none" style={{ width: "100%", height: "100%", objectFit: "contain" }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
        {!playing && <div onClick={() => { if (vRef.current) vRef.current.play(); }} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.25)", cursor: "pointer" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,.9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: "0 4px 16px rgba(0,0,0,.2)" }}>▶</div>
        </div>}
      </div> : <img src={cur.url} alt={name} onLoad={handleImgLoad} style={{ width: "100%", height: "100%", objectFit: "contain" }} />}
      {multi && <><button onClick={e => { e.stopPropagation(); prev(); }} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 32, height: 32, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.85)", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
        <button onClick={e => { e.stopPropagation(); next(); }} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 32, height: 32, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.85)", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button></>}
      {multi && <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,.6)", color: "#FFF", borderRadius: 10, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>{idx + 1}/{media.length}</div>}
    </div>
    {multi && <div style={{ display: "flex", gap: 5, marginTop: 8, overflowX: "auto" }}>
      {media.map((m, i) => <div key={i} onClick={() => go(i)} style={{ width: 50, height: 50, borderRadius: 7, overflow: "hidden", border: idx === i ? "2px solid #6AADCC" : "2px solid transparent", cursor: "pointer", flexShrink: 0, opacity: idx === i ? 1 : .6, background: "#F0EDE8" }}>
        {m.type === "video" ? <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#222", color: "#FFF", fontSize: 16 }}>▶</div>
          : <img src={m.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain" }} />}
      </div>)}
    </div>}
    {multi && <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 6 }}>
      {media.map((_, i) => <div key={i} onClick={() => go(i)} style={{ width: idx === i ? 16 : 6, height: 6, borderRadius: 3, background: idx === i ? "#6AADCC" : "#D0CCC5", cursor: "pointer", transition: "all .2s" }} />)}
    </div>}
  </div>;
}

export default function NovoMarket() {
  const [lang, setLang] = useState("en");
  const [page, setPage] = useState("shop");
  const [cat, setCat] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [toast, setToast] = useState(null);
  const [coupon, setCoupon] = useState(null);
  const [couponIn, setCouponIn] = useState("");
  const [selProd, setSelProd] = useState(null);
  const [step, setStep] = useState(0);
  const [info, setInfo] = useState({ name: "", phone: "", addr: "", city: "", state: "", zip: "", vname: "" });
  const [saveInfo, setSaveInfo] = useState(true);
  const [order, setOrder] = useState(null);
  const [paidDone, setPaidDone] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [linkPhone, setLinkPhone] = useState("");
  const [trackIn, setTrackIn] = useState("");
  const [histPhone, setHistPhone] = useState("");
  const [showCancelPolicy, setShowCancelPolicy] = useState(false);
  const [payingOrder, setPayingOrder] = useState(null); // for resuming pending payments from history
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [categories, setCategories] = useState({});
  const [promos, setPromos] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const t = T[lang];

  useEffect(() => {
    const unsubs = [];
    unsubs.push(subscribeProducts(prods => { setProducts(prods); setLoaded(true); }));
    unsubs.push(subscribeOrders(ords => { setOrders(ords); }));
    unsubs.push(subscribeCategories(cats => { setCategories(cats); }));
    unsubs.push(subscribePromos(prs => { setPromos(prs); }));
    return () => unsubs.forEach(u => u());
  }, []);

  useEffect(() => { if (toast) { const tm = setTimeout(() => setToast(null), 2e3); return () => clearTimeout(tm); } }, [toast]);

  const activeProducts = useMemo(() => products.filter(p => p.active !== false), [products]);
  const catList = useMemo(() => Object.entries(categories).map(([id, data]) => ({
    id, nameEn: typeof data === "string" ? data : (data.nameEn || id), nameKo: typeof data === "string" ? data : (data.nameKo || data),
  })), [categories]);

  const addToCart = p => { setCart(prev => { const ex = prev.find(c => c.id === p.id); if (ex) return prev.map(c => c.id === p.id ? { ...c, qty: c.qty + 1 } : c); return [...prev, { ...p, qty: 1 }]; }); setToast(t.added); };
  const updQty = (id, d) => setCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(1, c.qty + d) } : c));
  const rmItem = id => setCart(prev => prev.filter(c => c.id !== id));

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + (Math.round(tieredPrice(item, item.qty) * 100) * item.qty) / 100, 0), [cart]);
  const disc = useMemo(() => { if (!coupon) return 0; return coupon.type === "percent" ? Math.round(subtotal * coupon.value) / 100 : coupon.value; }, [coupon, subtotal]);
  const afterDisc = Math.round((subtotal - disc) * 100) / 100;
  const shipCost = afterDisc >= FREE_SHIP ? 0 : SHIP_COST;
  const total = Math.round((afterDisc + shipCost) * 100) / 100;
  const cartN = cart.reduce((s, c) => s + c.qty, 0);

  const filtered = useMemo(() => activeProducts.filter(p => {
    if (cat !== "all" && p.category !== cat) return false;
    const n = lang === "en" ? (p.nameEn || "") : (p.nameKo || "");
    return !search || n.toLowerCase().includes(search.toLowerCase());
  }), [cat, search, lang, activeProducts]);

  const handleInfoChange = (key, val) => {
    if (key === "phone") setInfo(prev => ({ ...prev, phone: formatPhone(val) }));
    else if (key === "state") setInfo(prev => ({ ...prev, state: englishOnly(val).toUpperCase().slice(0, 2) }));
    else if (key === "zip") setInfo(prev => ({ ...prev, zip: val.replace(/\D/g, "").slice(0, 5) }));
    else if (key === "name" || key === "addr" || key === "city") setInfo(prev => ({ ...prev, [key]: englishOnly(val).toUpperCase() }));
    else setInfo(prev => ({ ...prev, [key]: englishOnly(val) }));
  };

  const linkOrders = useMemo(() => {
    if (!linkMode || !linkPhone) return [];
    const d = linkPhone.replace(/\D/g, "");
    if (d.length < 7) return [];
    return orders.filter(o => (o.phone || "").replace(/\D/g, "") === d);
  }, [linkMode, linkPhone, orders]);

  const histOrders = useMemo(() => {
    const d = histPhone.replace(/\D/g, "");
    if (d.length < 10) return [];
    return orders.filter(o => (o.phone || "").replace(/\D/g, "") === d).sort((a, b) => {
      const da = a.createdAt?.toDate ? a.createdAt.toDate() : a.createdAt ? new Date(a.createdAt) : new Date(0);
      const db = b.createdAt?.toDate ? b.createdAt.toDate() : b.createdAt ? new Date(b.createdAt) : new Date(0);
      return db - da;
    });
  }, [histPhone, orders]);

  const applyPromo = () => {
    const code = couponIn.trim().toUpperCase();
    const found = promos.find(p => p.code === code && p.active);
    if (found) { setCoupon({ type: found.type, value: found.value }); setToast(t.ok); }
    else setToast(t.bad);
  };

  const handleSubmitOrder = async () => {
    const orderId = genId();
    const orderData = {
      orderNum: orderId, total, status: "pending_payment",
      items: cart.map(item => ({ id: item.id, name: lang === "en" ? (item.nameEn || "") : (item.nameKo || ""), price: tieredPrice(item, item.qty), qty: item.qty })),
      linkedTo: linkMode && linkOrders.length > 0 ? linkOrders[0].orderNum : null,
      customer: { name: info.name.toUpperCase(), address: info.addr.toUpperCase(), city: info.city.toUpperCase(), state: info.state.toUpperCase(), zip: info.zip, venmoName: info.vname },
      phone: info.phone, discount: disc, shipping: shipCost, createdAt: new Date(),
    };
    try {
      await addOrder(orderData);
      // Deduct stock for each item
      for (const item of cart) {
        const product = products.find(p => p.id === item.id);
        if (product) {
          const newStock = Math.max(0, (product.stock || 0) - item.qty);
          try { await updateProduct(item.id, { stock: newStock }); } catch (e) { console.error("Stock update failed:", e); }
        }
      }
    } catch (err) { console.error("Order save failed:", err); }
    setOrder({ id: orderId, total, linkedTo: orderData.linkedTo });
    setStep(2); setCart([]);
  };

  const C = { bg: "#F7FAFB", card: "#FFF", pri: "#6AADCC", priL: "#EAF5FA", acc: "#E8879A", accBg: "#FFF0F3", txt: "#2A2A2A", mid: "#5A5A5A", light: "#9AA5AE", bdr: "#E0EBF0", danger: "#D94F4F", wh: "#FFF" };
  const B = { border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontFamily: "'Nunito',sans-serif", transition: "all .15s" };
  const pName = (p) => lang === "en" ? (p.nameEn || p.name_en || "") : (p.nameKo || p.name_ko || "");
  const pDesc = (p) => lang === "en" ? (p.descEn || p.desc_en || "") : (p.descKo || p.desc_ko || "");
  const getOrderDate = o => { if (o.createdAt?.toDate) return o.createdAt.toDate().toLocaleDateString("en-US"); if (o.createdAt) return new Date(o.createdAt).toLocaleDateString("en-US"); return ""; };

  return <div style={{ fontFamily: "'Nunito',sans-serif", background: C.bg, minHeight: "100vh", maxWidth: 480, margin: "0 auto", color: C.txt, position: "relative", paddingBottom: 70 }}>
    <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Playfair+Display:wght@700&display=swap" rel="stylesheet" />
    {toast && <div style={{ position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 999, background: C.pri, color: "#FFF", padding: "8px 22px", borderRadius: 10, fontSize: 13, fontWeight: 700, boxShadow: "0 4px 16px rgba(0,0,0,.2)" }}>{toast}</div>}

    {showCancelPolicy && <div onClick={() => setShowCancelPolicy(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#FFF", borderRadius: 16, maxWidth: 400, width: "100%", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>📋 {t.cancelPolicy}</h3><button onClick={() => setShowCancelPolicy(false)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: C.light }}>✕</button></div>
        <p style={{ fontSize: 13, lineHeight: 1.8, color: C.mid, margin: 0 }}>{t.cancelText}</p>
      </div>
    </div>}

    <div style={{ background: "#FFF", padding: "10px 16px 8px", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 6px rgba(106,173,204,.1)", borderBottom: `1px solid ${C.bdr}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <button onClick={() => setLang(lang === "en" ? "ko" : "en")} style={{ ...B, background: C.priL, color: C.pri, padding: "4px 10px", fontSize: 10, borderRadius: 6 }}>{lang === "en" ? "한국어" : "EN"}</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setShowCancelPolicy(true)} style={{ ...B, background: "none", color: C.light, padding: "4px 8px", fontSize: 10, border: `1px solid ${C.bdr}` }}>📋</button>
          <div onClick={() => { setPage("cart"); setSelProd(null); setStep(0); }} style={{ position: "relative", cursor: "pointer", background: C.priL, borderRadius: "50%", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 16 }}>🛒</span>
            {cartN > 0 && <span style={{ position: "absolute", top: -3, right: -3, background: C.acc, color: "#FFF", borderRadius: "50%", width: 17, height: 17, fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{cartN}</span>}
          </div>
        </div>
      </div>
      <div onClick={() => { setPage("shop"); setSelProd(null); }} style={{ cursor: "pointer", textAlign: "center" }}>
        <img src={novoLogo} alt="NOVO MARKET" style={{ width: 80, height: "auto", marginBottom: 2 }} />
        <div style={{ fontSize: 9, color: C.light, letterSpacing: 1.5, fontWeight: 600, marginTop: 1, textTransform: "uppercase" }}>{t.tag}</div>
      </div>
    </div>

    {!loaded && <div style={{ textAlign: "center", padding: "60px 0", color: C.light }}><div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div><div>Loading...</div></div>}

    {/* PRODUCT DETAIL */}
    {loaded && selProd && page === "shop" && (() => {
      const p = activeProducts.find(x => x.id === selProd); if (!p) return null;
      const nm = pName(p); const dc = pDesc(p); const bp = basePrice(p);
      const ic = cart.find(c => c.id === p.id); const tp = ic ? tieredPrice(p, ic.qty) : bp;
      return <div style={{ padding: 16, paddingBottom: 100 }}>
        <button onClick={() => setSelProd(null)} style={{ ...B, background: "none", color: C.pri, padding: "0 0 12px", fontSize: 14 }}>{t.back}</button>
        <Gallery media={p.media} emoji={p.image} name={nm} />
        <div style={{ marginTop: 16 }}>
          {p.sale && <span style={{ background: C.danger, color: "#FFF", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 5, marginBottom: 8, display: "inline-block" }}>{Math.round((1 - p.salePrice / p.price) * 100)}% {t.off}</span>}
          {p.brand && <div style={{ fontSize: 11, color: C.acc, fontWeight: 700, marginBottom: 2 }}>{p.brand}</div>}
          <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, margin: "8px 0 6px", lineHeight: 1.3 }}>{nm}</h2>
          {p.tags && p.tags.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>{p.tags.map((tag, i) => <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: tag.color || "#EEE", color: tag.textColor || "#555" }}>{tag.label}</span>)}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: p.sale ? C.danger : C.pri }}>{fmt(bp)}</span>
            {p.sale && <span style={{ fontSize: 15, textDecoration: "line-through", color: C.light }}>{fmt(p.price)}</span>}
          </div>
          {p.tiered && p.tiered.length > 0 && <div style={{ background: C.priL, borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.pri, marginBottom: 6 }}>📦 {t.bulk}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 8, background: (!ic || ic.qty < Number(p.tiered[0].qty)) ? C.pri : "#FFF", color: (!ic || ic.qty < Number(p.tiered[0].qty)) ? "#FFF" : C.txt, border: `1px solid ${C.pri}` }}>
                <div style={{ fontSize: 10, opacity: .8 }}>1{t.ea}</div><div style={{ fontSize: 15, fontWeight: 800 }}>{fmt(bp)}</div></div>
              {p.tiered.map((tier, i) => { const active = ic && ic.qty >= Number(tier.qty) && (i === p.tiered.length - 1 || ic.qty < Number(p.tiered[i + 1].qty)); const pct = Math.round((1 - Number(tier.price) / bp) * 100);
                return <div key={i} style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 8, background: active ? C.pri : "#FFF", color: active ? "#FFF" : C.txt, border: `1px solid ${C.pri}`, position: "relative" }}>
                  {pct > 0 && <div style={{ position: "absolute", top: -8, right: -4, background: C.acc, color: "#FFF", fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 6 }}>-{pct}%</div>}
                  <div style={{ fontSize: 10, opacity: .8 }}>{tier.qty}+</div><div style={{ fontSize: 15, fontWeight: 800 }}>{fmt(Number(tier.price))}</div></div>; })}
            </div>
            {ic && <div style={{ fontSize: 11, color: C.pri, fontWeight: 600, marginTop: 6, textAlign: "center" }}>✓ {t.cur}: {fmt(tp)}/{t.ea}</div>}
          </div>}
          <p style={{ fontSize: 14, lineHeight: 1.7, color: C.mid, margin: "0 0 20px" }}>{dc}</p>
          {p.stock === 0 ? <div style={{ ...B, width: "100%", padding: 14, fontSize: 15, textAlign: "center", background: "#CCC", color: "#FFF", borderRadius: 12 }}>{t.sold}</div>
            : <div style={{ display: "flex", gap: 10 }}>
              {ic && <div style={{ display: "flex", alignItems: "center", gap: 12, background: C.priL, borderRadius: 12, padding: "0 14px" }}>
                <button onClick={() => updQty(p.id, -1)} style={{ ...B, background: "none", color: C.pri, fontSize: 20, padding: 8 }}>−</button>
                <span style={{ fontWeight: 800, fontSize: 16, minWidth: 20, textAlign: "center" }}>{ic.qty}</span>
                <button onClick={() => updQty(p.id, 1)} style={{ ...B, background: "none", color: C.pri, fontSize: 20, padding: 8 }}>+</button>
              </div>}
              <button onClick={() => addToCart(p)} style={{ ...B, flex: 1, padding: 14, fontSize: 15, background: C.pri, color: "#FFF", borderRadius: 12 }}>{ic ? `✓ ${t.add}` : t.add}</button>
            </div>}
          {p.stock > 0 && p.stock <= 10 && <div style={{ marginTop: 10, fontSize: 12, color: "#E67E22", fontWeight: 600 }}>⚡ {lang === "en" ? `Only ${p.stock} left!` : `${p.stock}개 남음!`}</div>}
        </div>
      </div>;
    })()}

    {/* SHOP GRID — uniform card layout with button always at bottom */}
    {loaded && page === "shop" && !selProd && <div style={{ padding: "12px 16px 20px" }}>
      <div style={{ background: C.wh, borderRadius: 10, border: `1px solid ${C.bdr}`, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span>🔍</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.search} style={{ border: "none", outline: "none", flex: 1, fontSize: 13, fontFamily: "'Nunito',sans-serif", background: "transparent" }} />
      </div>
      <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 10 }}>
        <button onClick={() => setCat("all")} style={{ ...B, padding: "5px 12px", fontSize: 11, whiteSpace: "nowrap", background: cat === "all" ? C.pri : C.wh, color: cat === "all" ? "#FFF" : C.light, border: `1px solid ${cat === "all" ? C.pri : C.bdr}` }}>{t.allCat}</button>
        {catList.map(c => <button key={c.id} onClick={() => setCat(c.id)} style={{ ...B, padding: "5px 12px", fontSize: 11, whiteSpace: "nowrap", background: cat === c.id ? C.pri : C.wh, color: cat === c.id ? "#FFF" : C.light, border: `1px solid ${cat === c.id ? C.pri : C.bdr}` }}>{lang === "en" ? c.nameEn : c.nameKo}</button>)}
      </div>
      <div style={{ background: C.accBg, borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: C.acc, fontWeight: 600 }}>🚚 {t.freeNote}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {filtered.map(p => {
          const nm = pName(p); const pr = basePrice(p); const so = p.stock === 0;
          const hasImg = p.media && p.media.length > 0 && p.media[0].url;
          return <div key={p.id} onClick={() => setSelProd(p.id)} style={{ background: C.card, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.bdr}`, position: "relative", cursor: "pointer", opacity: so ? .6 : 1, boxShadow: "0 1px 4px rgba(0,0,0,.04)", display: "flex", flexDirection: "column" }}>
            {p.sale && !so && <div style={{ position: "absolute", top: 6, left: 6, background: C.danger, color: "#FFF", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, zIndex: 2 }}>{Math.round((1 - p.salePrice / p.price) * 100)}% {t.off}</div>}
            {so && <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%) rotate(-12deg)", background: "rgba(0,0,0,.7)", color: "#FFF", fontSize: 12, fontWeight: 800, padding: "4px 16px", borderRadius: 4, zIndex: 2 }}>{t.sold}</div>}
            {p.media && p.media.length > 1 && <div style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,.5)", color: "#FFF", borderRadius: 10, padding: "1px 6px", fontSize: 9, fontWeight: 600, zIndex: 2 }}>📷 {p.media.length}</div>}
            <div style={{ height: 150, background: "#F5F2ED", flexShrink: 0 }}>
              {hasImg ? <LazyImg src={p.media[0].url} alt={nm} style={{ width: "100%", height: 150 }} /> : <div style={{ height: 150, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48 }}>{p.image || "📦"}</div>}
            </div>
            {/* Card body — flexbox column, button pinned to bottom */}
            <div style={{ padding: "8px 10px 10px", display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.3, marginBottom: 4, minHeight: 28 }}>{nm}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                {p.sale ? <><span style={{ fontSize: 14, fontWeight: 800, color: C.danger }}>{fmt(pr)}</span><span style={{ fontSize: 10, color: C.light, textDecoration: "line-through" }}>{fmt(p.price)}</span></> : <span style={{ fontSize: 14, fontWeight: 800, color: C.pri }}>{fmt(pr)}</span>}
              </div>
              <div style={{ minHeight: 20, marginBottom: 4 }}>
                {p.tiered && p.tiered.length > 0 && <div style={{ fontSize: 9, color: C.pri, fontWeight: 600, background: C.priL, padding: "2px 6px", borderRadius: 4, display: "inline-block" }}>📦 {p.tiered[0].qty}+ {fmt(Number(p.tiered[0].price))}</div>}
                {p.tags && p.tags.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 2 }}>
                  {p.tags.slice(0, 2).map((tag, i) => <span key={i} style={{ fontSize: 8, fontWeight: 600, padding: "1px 5px", borderRadius: 8, background: tag.color || "#EEE", color: tag.textColor || "#555" }}>{tag.label}</span>)}
                  {p.tags.length > 2 && <span style={{ fontSize: 8, color: C.light }}>+{p.tags.length - 2}</span>}
                </div>}
              </div>
              <button onClick={e => { e.stopPropagation(); if (!so) addToCart(p); }} disabled={so} style={{ ...B, width: "100%", padding: 7, fontSize: 11, background: so ? "#CCC" : C.pri, color: "#FFF", marginTop: "auto" }}>{so ? t.sold : t.add}</button>
            </div>
          </div>;
        })}
      </div>
    </div>}

    {/* CART */}
    {loaded && page === "cart" && step === 0 && <div style={{ padding: 16 }}>
      <button onClick={() => setPage("shop")} style={{ ...B, background: "none", color: C.pri, padding: "0 0 14px", fontSize: 14 }}>{t.back}</button>
      <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, marginBottom: 14 }}>🛒 {t.cart}</h2>
      {cart.length === 0 ? <div style={{ textAlign: "center", padding: "40px 0", color: C.light }}><div style={{ fontSize: 40, marginBottom: 8 }}>🛒</div><div>{t.empty}</div><button onClick={() => setPage("shop")} style={{ ...B, marginTop: 16, background: C.pri, color: "#FFF", padding: "10px 24px", fontSize: 13 }}>{t.shopNow}</button></div> : <>
        {cart.map(item => { const bp2 = basePrice(item); const tp2 = tieredPrice(item, item.qty); const isTiered = tp2 < bp2; const nm = pName(item); const hasImg = item.media && item.media[0]?.url; const lineTotal = Math.round(tp2 * item.qty * 100) / 100;
          return <div key={item.id} style={{ background: C.card, borderRadius: 12, padding: 10, marginBottom: 8, display: "flex", gap: 10, alignItems: "center", border: `1px solid ${C.bdr}` }}>
            {hasImg ? <div style={{ width: 50, height: 50, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}><img src={item.media[0].url} alt={nm} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain" }} /></div> : <div style={{ fontSize: 30, width: 50, textAlign: "center", flexShrink: 0 }}>{item.image || "📦"}</div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nm}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 13, fontWeight: 800, color: isTiered ? C.acc : C.pri }}>{fmt(tp2)}</span>{isTiered && <span style={{ fontSize: 10, color: C.light, textDecoration: "line-through" }}>{fmt(bp2)}</span>}<span style={{ fontSize: 11, color: C.mid, marginLeft: 4 }}>= {fmt(lineTotal)}</span></div>
              {isTiered && <div style={{ fontSize: 9, color: C.pri, fontWeight: 600 }}>📦 {t.bulkTag}</div>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><button onClick={() => updQty(item.id, -1)} style={{ ...B, width: 26, height: 26, background: C.priL, color: C.pri, fontSize: 14, padding: 0 }}>−</button><span style={{ fontWeight: 700, fontSize: 13, minWidth: 16, textAlign: "center" }}>{item.qty}</span><button onClick={() => updQty(item.id, 1)} style={{ ...B, width: 26, height: 26, background: C.priL, color: C.pri, fontSize: 14, padding: 0 }}>+</button></div>
            <button onClick={() => rmItem(item.id)} style={{ ...B, background: "none", color: C.danger, fontSize: 16, padding: 4 }}>✕</button>
          </div>; })}
        <div style={{ background: C.card, borderRadius: 10, padding: 10, margin: "10px 0", border: `1px solid ${C.bdr}` }}>
          <div style={{ display: "flex", gap: 6 }}><input value={couponIn} onChange={e => setCouponIn(e.target.value)} placeholder={t.promo} style={{ flex: 1, border: `1px solid ${C.bdr}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontFamily: "'Nunito',sans-serif" }} /><button onClick={applyPromo} style={{ ...B, background: C.pri, color: "#FFF", padding: "8px 14px", fontSize: 12 }}>{t.apply}</button></div>
          {coupon && <div style={{ marginTop: 6, fontSize: 11, color: C.pri, fontWeight: 600, display: "flex", justifyContent: "space-between" }}><span>✓ {couponIn.toUpperCase()}</span><button onClick={() => { setCoupon(null); setCouponIn(""); }} style={{ ...B, background: "none", color: C.danger, padding: 0, fontSize: 11 }}>{t.remove}</button></div>}
        </div>
        <div style={{ background: C.card, borderRadius: 12, padding: 14, border: `1px solid ${C.bdr}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}><span style={{ color: C.light }}>{t.sub}</span><span style={{ fontWeight: 700 }}>{fmt(subtotal)}</span></div>
          {disc > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, color: C.danger }}><span>Discount</span><span style={{ fontWeight: 700 }}>−{fmt(disc)}</span></div>}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 10 }}><span style={{ color: C.light }}>{t.ship}</span><span style={{ fontWeight: 700, color: shipCost === 0 ? C.pri : C.txt }}>{shipCost === 0 ? `🎉 ${t.free}` : fmt(shipCost)}</span></div>
          {shipCost > 0 && <div style={{ fontSize: 11, color: C.acc, background: C.accBg, padding: "5px 8px", borderRadius: 6, marginBottom: 10 }}>🚚 {fmt(FREE_SHIP - afterDisc)} {t.moreFree}</div>}
          <div style={{ borderTop: `1px solid ${C.bdr}`, paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 800 }}><span>{t.total}</span><span style={{ color: C.pri }}>{fmt(total)}</span></div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", color: C.mid, marginTop: 12 }}><input type="checkbox" checked={linkMode} onChange={e => setLinkMode(e.target.checked)} />{t.link}</label>
          {linkMode && <div style={{ marginTop: 6 }}>
            <input value={linkPhone} onChange={e => setLinkPhone(formatPhone(e.target.value))} placeholder="(123) 456-7890" style={{ width: "100%", border: `1px solid ${C.bdr}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "'Nunito',sans-serif", boxSizing: "border-box" }} />
            {linkOrders.length > 0 && <div style={{ marginTop: 8 }}><div style={{ fontSize: 11, fontWeight: 700, color: C.pri, marginBottom: 4 }}>📋 {lang === "en" ? "Found orders:" : "찾은 주문:"}</div>
              {linkOrders.map(o => <div key={o._docId || o.orderNum} style={{ fontSize: 12, padding: "4px 8px", background: C.priL, borderRadius: 6, marginBottom: 4, display: "flex", justifyContent: "space-between" }}><span style={{ fontWeight: 700 }}>{o.orderNum}</span><span style={{ color: C.mid }}>{fmt(o.total || 0)} · {STATUS_LABEL[lang][o.status] || o.status}</span></div>)}</div>}
            {linkPhone.replace(/\D/g, "").length >= 10 && linkOrders.length === 0 && <div style={{ fontSize: 11, color: C.light, marginTop: 4 }}>{t.none}</div>}
          </div>}
          <button onClick={() => setStep(1)} style={{ ...B, width: "100%", padding: 13, marginTop: 14, fontSize: 14, background: C.pri, color: "#FFF", borderRadius: 12 }}>{t.checkout} →</button>
        </div>
      </>}
    </div>}

    {/* CHECKOUT */}
    {loaded && page === "cart" && step === 1 && <div style={{ padding: 16, paddingBottom: 100 }}>
      <button onClick={() => setStep(0)} style={{ ...B, background: "none", color: C.pri, padding: "0 0 14px", fontSize: 14 }}>{t.back}</button>
      <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, marginBottom: 16 }}>{t.info}</h2>
      <div style={{ background: C.card, borderRadius: 14, padding: 14, border: `1px solid ${C.bdr}`, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🛒</div>
        {cart.map(item => { const nm = pName(item); const pr = tieredPrice(item, item.qty); return <div key={item.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}><span>{nm} × {item.qty}</span><span style={{ fontWeight: 700 }}>{fmt(Math.round(pr * item.qty * 100) / 100)}</span></div>; })}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", fontSize: 16, fontWeight: 800, borderTop: `1px solid ${C.bdr}`, marginTop: 8 }}><span>{t.total}</span><span>{fmt(total)}</span></div>
        {linkMode && linkOrders.length > 0 && <div style={{ fontSize: 12, color: C.acc, fontWeight: 600, marginTop: 6 }}>🔗 Linked to {linkOrders[0].orderNum}</div>}
      </div>
      <div style={{ background: "#FFF8E1", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 11, color: "#F57F17", fontWeight: 600 }}>✍️ {t.englishOnly}</div>
      <div style={{ marginBottom: 12 }}><label style={{ fontSize: 11, fontWeight: 700, color: C.light, marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: .5 }}>{t.name}</label><input value={info.name} onChange={e => handleInfoChange("name", e.target.value)} type="text" placeholder="JOHN DOE" style={{ width: "100%", border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "10px 14px", fontSize: 14, fontFamily: "'Nunito',sans-serif", boxSizing: "border-box", background: "#FFF" }} /></div>
      <div style={{ marginBottom: 12 }}><label style={{ fontSize: 11, fontWeight: 700, color: C.light, marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: .5 }}>{t.phone}</label><input value={info.phone} onChange={e => handleInfoChange("phone", e.target.value)} type="tel" placeholder="(123) 456-7890" style={{ width: "100%", border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "10px 14px", fontSize: 14, fontFamily: "'Nunito',sans-serif", boxSizing: "border-box", background: "#FFF" }} /></div>
      <div style={{ marginBottom: 12 }}><label style={{ fontSize: 11, fontWeight: 700, color: C.light, marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: .5 }}>{t.vname}</label><input value={info.vname} onChange={e => handleInfoChange("vname", e.target.value)} type="text" placeholder="@venmo-name" style={{ width: "100%", border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "10px 14px", fontSize: 14, fontFamily: "'Nunito',sans-serif", boxSizing: "border-box", background: "#FFF" }} /></div>
      {/* Address warning ABOVE address field */}
      <div style={{ background: "#FFF3E0", borderRadius: 8, padding: "8px 12px", marginBottom: 8, fontSize: 11, color: "#E67E22", fontWeight: 600, lineHeight: 1.5 }}>{t.addrWarn}</div>
      <div style={{ marginBottom: 12 }}><label style={{ fontSize: 11, fontWeight: 700, color: C.light, marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: .5 }}>{t.addr}</label><input value={info.addr} onChange={e => handleInfoChange("addr", e.target.value)} type="text" placeholder="123 MAIN ST, APT 4B" style={{ width: "100%", border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "10px 14px", fontSize: 14, fontFamily: "'Nunito',sans-serif", boxSizing: "border-box", background: "#FFF" }} /></div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div><label style={{ fontSize: 11, fontWeight: 700, color: C.light, marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: .5 }}>{t.city}</label><input value={info.city} onChange={e => handleInfoChange("city", e.target.value)} placeholder="LOS ANGELES" style={{ width: "100%", border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "10px 14px", fontSize: 14, fontFamily: "'Nunito',sans-serif", boxSizing: "border-box", background: "#FFF" }} /></div>
        <div><label style={{ fontSize: 11, fontWeight: 700, color: C.light, marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: .5 }}>{t.state}</label><input value={info.state} onChange={e => handleInfoChange("state", e.target.value)} placeholder="CA" style={{ width: "100%", border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "10px 14px", fontSize: 14, fontFamily: "'Nunito',sans-serif", boxSizing: "border-box", background: "#FFF" }} /></div>
        <div><label style={{ fontSize: 11, fontWeight: 700, color: C.light, marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: .5 }}>{t.zip}</label><input value={info.zip} onChange={e => handleInfoChange("zip", e.target.value)} placeholder="90001" style={{ width: "100%", border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "10px 14px", fontSize: 14, fontFamily: "'Nunito',sans-serif", boxSizing: "border-box", background: "#FFF" }} /></div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", color: C.mid }}><input type="checkbox" checked={saveInfo} onChange={e => setSaveInfo(e.target.checked)} />{t.save}</label>
      <div style={{ background: "#F5F5F5", borderRadius: 8, padding: "10px 12px", marginTop: 14, marginBottom: 6, fontSize: 11, color: C.mid, lineHeight: 1.6 }}>📋 <strong>{t.cancelPolicy}:</strong> {t.cancelText}</div>
      {(() => { const phoneDigits = info.phone.replace(/\D/g, ""); const ok = info.name && phoneDigits.length === 10 && info.addr && info.city && info.state && info.zip;
        return <button onClick={handleSubmitOrder} disabled={!ok} style={{ ...B, width: "100%", padding: 14, marginTop: 16, fontSize: 15, background: ok ? C.pri : "#CCC", color: "#FFF", borderRadius: 14, opacity: ok ? 1 : .5, pointerEvents: ok ? "auto" : "none" }}>{linkMode && linkOrders.length > 0 ? t.linkSubmit : t.submit}</button>; })()}
    </div>}

    {page === "cart" && step === 2 && order && !paidDone && <div style={{ padding: 20, paddingBottom: 100, textAlign: "center" }}>
      <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div><div style={{ fontSize: 22, fontWeight: 800, color: C.pri, marginBottom: 16 }}>{t.done}</div>
      <div style={{ background: C.priL, borderRadius: 14, padding: "16px 24px", display: "inline-block", marginBottom: 16 }}><div style={{ fontSize: 12, color: C.mid }}>{t.orderNum}</div><div style={{ fontSize: 28, fontWeight: 800, color: C.pri, letterSpacing: 2 }}>{order.id}</div></div>
      {order.linkedTo && <div style={{ fontSize: 13, color: C.acc, fontWeight: 600, marginBottom: 12 }}>🔗 Linked to {order.linkedTo}</div>}
      <div style={{ fontSize: 13, color: C.mid, marginBottom: 4 }}>{t.amt}</div><div style={{ fontSize: 32, fontWeight: 800, marginBottom: 16 }}>{fmt(order.total)}</div>
      <div style={{ fontSize: 14, color: C.mid, lineHeight: 1.6, marginBottom: 12 }}>{t.payMsg}</div>
      <div style={{ background: C.accBg, borderRadius: 12, padding: "10px 14px", marginBottom: 20, fontSize: 13, color: C.acc, fontWeight: 700 }}>📝 {t.memo}: <strong>{order.id}</strong></div>
      <div style={{ background: C.card, borderRadius: 14, padding: 16, border: `1px solid ${C.bdr}`, marginBottom: 10, textAlign: "left" }}><div style={{ fontSize: 12, fontWeight: 700, color: C.mid }}>Venmo</div><div style={{ fontSize: 16, fontWeight: 700 }}>@novo-market-us</div></div>
      <div style={{ background: C.card, borderRadius: 14, padding: 16, border: `1px solid ${C.bdr}`, marginBottom: 16, textAlign: "left" }}><div style={{ fontSize: 12, fontWeight: 700, color: C.mid }}>Zelle</div><div style={{ fontSize: 16, fontWeight: 700 }}>pay@novomarket.us</div></div>
      <button onClick={() => setPaidDone(true)} style={{ ...B, width: "100%", padding: 14, fontSize: 16, background: C.pri, color: "#FFF", borderRadius: 14 }}>✓ {t.paid}</button>
    </div>}

    {page === "cart" && step === 2 && paidDone && <div style={{ padding: 20, paddingBottom: 100, textAlign: "center" }}>
      <div style={{ background: C.priL, borderRadius: 14, padding: 24, color: C.pri, fontSize: 15, fontWeight: 600, lineHeight: 1.7 }}>✅ {t.paidOk}</div>
      <button onClick={() => { setPage("shop"); setStep(0); setOrder(null); setPaidDone(false); setLinkMode(false); setLinkPhone(""); }} style={{ ...B, marginTop: 20, padding: "14px 40px", fontSize: 15, background: C.pri, color: "#FFF", borderRadius: 14 }}>🛍 {t.shopNow}</button>
    </div>}

    {page === "track" && <div style={{ padding: 16 }}>
      <button onClick={() => setPage("shop")} style={{ ...B, background: "none", color: C.pri, padding: "0 0 14px", fontSize: 14 }}>{t.back}</button>
      <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, marginBottom: 16 }}>📦 {t.track}</h2>
      <div style={{ background: C.card, borderRadius: 14, padding: 20, border: `1px solid ${C.bdr}`, textAlign: "center" }}>
        <input value={trackIn} onChange={e => setTrackIn(e.target.value)} placeholder={t.trackNum} style={{ width: "100%", border: `1px solid ${C.bdr}`, borderRadius: 8, padding: 12, fontSize: 14, textAlign: "center", fontFamily: "'Nunito',sans-serif", boxSizing: "border-box", marginBottom: 10 }} />
        <button onClick={() => { if (!trackIn.trim()) return; const n = trackIn.trim().toUpperCase(); const u = n.startsWith("1Z") ? CARRIERS.ups + n : n.length >= 20 ? CARRIERS.usps + n : CARRIERS.fedex + n; window.open(u, "_blank"); }} disabled={!trackIn.trim()} style={{ ...B, width: "100%", padding: 12, fontSize: 14, background: trackIn.trim() ? C.pri : "#CCC", color: "#FFF", borderRadius: 10 }}>{t.trackBtn}</button>
      </div>
    </div>}

    {/* HISTORY — phone lookup with real Firebase orders + pending payment completion */}
    {page === "history" && !payingOrder && <div style={{ padding: 16 }}>
      <button onClick={() => setPage("shop")} style={{ ...B, background: "none", color: C.pri, padding: "0 0 14px", fontSize: 14 }}>{t.back}</button>
      <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, marginBottom: 16 }}>📋 {t.history}</h2>
      <div style={{ fontSize: 12, color: C.mid, marginBottom: 10 }}>{t.phoneLookup}</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input value={histPhone} onChange={e => setHistPhone(formatPhone(e.target.value))} placeholder="(123) 456-7890" style={{ flex: 1, border: `1px solid ${C.bdr}`, borderRadius: 8, padding: 10, fontSize: 13, fontFamily: "'Nunito',sans-serif" }} />
        <button style={{ ...B, background: C.pri, color: "#FFF", padding: "10px 14px", fontSize: 12 }}>🔍</button>
      </div>
      {histOrders.length > 0 ? <div>{histOrders.map(o => <div key={o._docId || o.orderNum} style={{ background: C.card, borderRadius: 12, padding: 14, marginBottom: 10, border: `1px solid ${C.bdr}`, borderLeft: `4px solid ${STATUS_COLOR[o.status] || "#CCC"}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div><span style={{ fontWeight: 800, fontSize: 15, color: C.pri }}>{o.orderNum}</span><span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, marginLeft: 8, background: `${STATUS_COLOR[o.status]}15`, color: STATUS_COLOR[o.status] }}>{STATUS_LABEL[lang][o.status] || o.status}</span></div>
          <span style={{ fontWeight: 800, fontSize: 16 }}>${(o.total || 0).toFixed(2)}</span>
        </div>
        <div style={{ fontSize: 12, color: C.light, marginBottom: 6 }}>{getOrderDate(o)}</div>
        {(o.items || []).map((it, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}><span>{it.name} × {it.qty}</span><span style={{ fontWeight: 600 }}>${(it.price * it.qty).toFixed(2)}</span></div>)}
        {o.trackingNum && <div style={{ marginTop: 8, fontSize: 12, color: C.pri, fontWeight: 600 }}>📍 Tracking: {o.trackingNum}</div>}
        {/* Show "Complete Payment" button for pending orders */}
        {(o.status === "pending_payment") && <button onClick={() => setPayingOrder(o)} style={{ ...B, width: "100%", padding: 10, marginTop: 10, fontSize: 13, background: "#E67E22", color: "#FFF", borderRadius: 10 }}>💳 {t.pendingPay}</button>}
      </div>)}</div> : <div style={{ textAlign: "center", padding: "30px 0", color: C.light, fontSize: 14 }}>{histPhone.replace(/\D/g, "").length >= 10 ? t.none : (lang === "en" ? "Enter your 10-digit phone number" : "10자리 전화번호를 입력하세요")}</div>}
    </div>}

    {/* PAYING ORDER — resume payment for a pending order from history */}
    {page === "history" && payingOrder && <div style={{ padding: 20, paddingBottom: 100, textAlign: "center" }}>
      <button onClick={() => setPayingOrder(null)} style={{ ...B, background: "none", color: C.pri, padding: "0 0 14px", fontSize: 14, textAlign: "left", width: "100%" }}>{t.backToOrders}</button>
      <div style={{ fontSize: 56, marginBottom: 12 }}>💳</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#E67E22", marginBottom: 16 }}>{t.pendingPay}</div>
      <div style={{ background: C.priL, borderRadius: 14, padding: "16px 24px", display: "inline-block", marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: C.mid }}>{t.orderNum}</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: C.pri, letterSpacing: 2 }}>{payingOrder.orderNum}</div>
      </div>
      <div style={{ fontSize: 13, color: C.mid, marginBottom: 4 }}>{t.amt}</div>
      <div style={{ fontSize: 32, fontWeight: 800, marginBottom: 16 }}>{fmt(payingOrder.total || 0)}</div>
      <div style={{ background: C.card, borderRadius: 14, padding: 14, border: `1px solid ${C.bdr}`, marginBottom: 16, textAlign: "left" }}>
        {(payingOrder.items || []).map((it, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}><span>{it.name} × {it.qty}</span><span style={{ fontWeight: 600 }}>${(it.price * it.qty).toFixed(2)}</span></div>)}
      </div>
      <div style={{ fontSize: 14, color: C.mid, lineHeight: 1.6, marginBottom: 12 }}>{t.payMsg}</div>
      <div style={{ background: C.accBg, borderRadius: 12, padding: "10px 14px", marginBottom: 20, fontSize: 13, color: C.acc, fontWeight: 700 }}>📝 {t.memo}: <strong>{payingOrder.orderNum}</strong></div>
      <div style={{ background: C.card, borderRadius: 14, padding: 16, border: `1px solid ${C.bdr}`, marginBottom: 10, textAlign: "left" }}><div style={{ fontSize: 12, fontWeight: 700, color: C.mid }}>Venmo</div><div style={{ fontSize: 16, fontWeight: 700 }}>@novo-market-us</div></div>
      <div style={{ background: C.card, borderRadius: 14, padding: 16, border: `1px solid ${C.bdr}`, marginBottom: 16, textAlign: "left" }}><div style={{ fontSize: 12, fontWeight: 700, color: C.mid }}>Zelle</div><div style={{ fontSize: 16, fontWeight: 700 }}>pay@novomarket.us</div></div>
      <button onClick={async () => {
        try { if (payingOrder._docId) await updateOrderField(payingOrder._docId, { status: "payment_submitted" }); } catch (e) { console.error(e); }
        setToast(lang === "en" ? "Payment notification sent!" : "결제 알림 전송 완료!");
        setPayingOrder(null);
      }} style={{ ...B, width: "100%", padding: 14, fontSize: 16, background: C.pri, color: "#FFF", borderRadius: 14 }}>✓ {t.paid}</button>
    </div>}

    <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: C.wh, borderTop: `1px solid ${C.bdr}`, display: "flex", zIndex: 100, boxShadow: "0 -2px 10px rgba(0,0,0,.06)" }}>
      {[{ k: "shop", i: "🏠", l: t.shop }, { k: "cart", i: "🛒", l: t.cart, badge: cartN }, { k: "track", i: "📦", l: t.track }, { k: "history", i: "📋", l: t.history }].map(tab =>
        <button key={tab.k} onClick={() => { setPage(tab.k); setSelProd(null); setStep(0); }} style={{ flex: 1, border: "none", background: "none", cursor: "pointer", padding: "10px 0 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, position: "relative", fontFamily: "'Nunito',sans-serif" }}>
          <div style={{ fontSize: 20, position: "relative" }}>{tab.i}{tab.badge > 0 && <span style={{ position: "absolute", top: -5, right: -10, background: C.acc, color: "#FFF", borderRadius: "50%", width: 16, height: 16, fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{tab.badge}</span>}</div>
          <span style={{ fontSize: 10, fontWeight: page === tab.k ? 800 : 500, color: page === tab.k ? C.pri : C.light }}>{tab.l}</span>
          {page === tab.k && <div style={{ position: "absolute", top: 0, left: "25%", right: "25%", height: 2, background: C.pri, borderRadius: "0 0 2px 2px" }} />}
        </button>)}
    </div>
  </div>;
}
