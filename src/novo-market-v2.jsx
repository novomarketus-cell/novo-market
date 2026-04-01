import { useState, useEffect, useMemo, useRef } from "react";

// ─────────────────────────────────────────────
// 🔥 Firebase Imports
// ─────────────────────────────────────────────
import {
  subscribeProducts,
  createOrder,
  saveCustomer,
  fetchOrdersByPhone,
  validateCoupon,
  decrementStock,
} from "./firebase";

// ─────────────────────────────────────────────
// Constants (카테고리는 Firestore에서도 로드 가능하지만
// 고객용은 고정 카테고리 표시용으로 유지)
// ─────────────────────────────────────────────
const CATEGORY_MAP = {
  babyfood: { en: "Baby Food", ko: "이유식" },
  snacks: { en: "Snacks", ko: "간식" },
  drinks: { en: "Beverages", ko: "음료" },
  seasoning: { en: "Seasoning", ko: "조미료" },
  noodles: { en: "Noodles", ko: "면류" },
  rice: { en: "Rice", ko: "밥/죽" },
  sauce: { en: "Sauce", ko: "소스" },
};

const FREE_SHIP = 150;
const SHIP_COST = 9.99;
const CARRIERS = {
  usps: "https://tools.usps.com/go/TrackConfirmAction?tLabels=",
  ups: "https://www.ups.com/track?tracknum=",
  fedex: "https://www.fedex.com/fedextrack/?trknbr=",
};

const fmt = (n) => `$${n.toFixed(2)}`;
const basePrice = (p) =>
  p.promo ? +(p.price * (1 - p.promo.value / 100)).toFixed(2) : p.sale && p.salePrice ? p.salePrice : p.price;
const tieredPrice = (p, qty) => {
  if (!p.tiered || !p.tiered.length) return basePrice(p);
  const sorted = [...p.tiered].sort((a, b) => b.qty - a.qty);
  for (const t of sorted) if (qty >= t.qty) return t.price;
  return basePrice(p);
};
const genId = () => `NM-${Math.floor(Math.random() * 9000) + 1000}`;

const T = {
  en: {
    brand: "NOVO MARKET",
    tag: "Premium Korean Baby & Kids Food",
    search: "Search products...",
    cart: "Cart",
    add: "Add to Cart",
    sold: "Sold Out",
    off: "OFF",
    sub: "Subtotal",
    ship: "Shipping",
    free: "FREE",
    freeNote: `Free shipping on orders $${FREE_SHIP}+`,
    total: "Total",
    checkout: "Place Order",
    empty: "Your cart is empty",
    info: "Order Information",
    name: "Full Name",
    phone: "Phone Number",
    addr: "Street Address",
    city: "City",
    state: "State",
    zip: "ZIP",
    vname: "Venmo / Zelle Name",
    save: "Save my info",
    submit: "Submit Order",
    done: "Order Submitted!",
    orderNum: "Order Number",
    amt: "Amount to Pay",
    payMsg:
      "Send payment via Venmo or Zelle with your order number in the memo, then tap 'I Paid' below.",
    paid: "I Paid ✓",
    paidOk: "Payment notification sent! We'll confirm and ship soon.",
    track: "Track",
    trackNum: "Tracking #",
    trackBtn: "Track Package →",
    history: "Orders",
    enterPhone: "Enter phone to view orders",
    none: "No orders found",
    promo: "Promo code",
    apply: "Apply",
    remove: "Remove",
    back: "← Back",
    moreFree: "more for free shipping!",
    ok: "Applied!",
    bad: "Invalid code",
    added: "Added!",
    shop: "Shop",
    items: "items",
    link: "Link to existing order",
    linkNum: "Existing Order #",
    linkSubmit: "Link & Submit",
    memo: "Write order # in Venmo/Zelle memo",
    shopNow: "Shop Now",
    bulk: "Buy more, save more!",
    bulkTag: "Bulk discount",
    ea: "ea",
    cur: "Current price",
    loading: "Loading products...",
    submitting: "Submitting order...",
    lookUp: "Look Up",
  },
  ko: {
    brand: "노보마켓",
    tag: "프리미엄 한국 유아·아동 식품",
    search: "제품 검색...",
    cart: "장바구니",
    add: "담기",
    sold: "품절",
    off: "할인",
    sub: "소계",
    ship: "배송비",
    free: "무료",
    freeNote: `$${FREE_SHIP} 이상 무료배송`,
    total: "합계",
    checkout: "주문하기",
    empty: "장바구니가 비어있습니다",
    info: "주문 정보",
    name: "이름",
    phone: "전화번호",
    addr: "주소",
    city: "도시",
    state: "주(State)",
    zip: "우편번호",
    vname: "Venmo / Zelle 표시 이름",
    save: "다음 주문을 위해 정보 저장",
    submit: "주문 제출",
    done: "주문 접수 완료!",
    orderNum: "주문번호",
    amt: "결제 금액",
    payMsg:
      "Venmo 또는 Zelle로 결제 시 메모란에 주문번호를 적어주세요. 결제 후 아래 버튼을 눌러주세요.",
    paid: "결제 완료 ✓",
    paidOk: "결제 알림이 전송되었습니다! 확인 후 발송해 드리겠습니다.",
    track: "배송조회",
    trackNum: "운송장번호",
    trackBtn: "배송 추적 →",
    history: "주문내역",
    enterPhone: "전화번호 입력 시 주문내역 조회",
    none: "주문 내역 없음",
    promo: "쿠폰 코드",
    apply: "적용",
    remove: "삭제",
    back: "← 뒤로",
    moreFree: "추가 시 무료배송!",
    ok: "쿠폰 적용!",
    bad: "유효하지 않은 쿠폰",
    added: "담았습니다!",
    shop: "홈",
    items: "개",
    link: "기존 주문에 연결",
    linkNum: "기존 주문번호",
    linkSubmit: "연결 주문",
    memo: "Venmo/Zelle 메모에 주문번호를 꼭 적어주세요",
    shopNow: "쇼핑하기",
    bulk: "많이 사면 더 저렴해요!",
    bulkTag: "묶음할인",
    ea: "개",
    cur: "현재 적용가",
    loading: "제품 불러오는 중...",
    submitting: "주문 제출 중...",
    lookUp: "조회",
  },
};

// ─────────────────────────────────────────────
// LazyImg Component
// ─────────────────────────────────────────────
function LazyImg({ src, alt, style, onClick }) {
  const [ok, setOk] = useState(false);
  const [vis, setVis] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const o = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVis(true);
          o.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    o.observe(ref.current);
    return () => o.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ ...style, background: "#F5F2ED", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClick}
    >
      {vis && (
        <img
          src={src}
          alt={alt || ""}
          loading="lazy"
          onLoad={() => setOk(true)}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            opacity: ok ? 1 : 0,
            transition: "opacity .3s",
          }}
        />
      )}
      {(!vis || !ok) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#CCC",
            fontSize: 14,
          }}
        >
          ⏳
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Gallery Component
// ─────────────────────────────────────────────
function Gallery({ media, emoji, name }) {
  const [idx, setIdx] = useState(0);
  const [ts, setTs] = useState(null);
  const [playing, setPlaying] = useState(false);
  const vRef = useRef(null);
  const cur = media && media.length ? media[idx] : null;
  const multi = media && media.length > 1;
  const go = (i) => {
    setIdx(i);
    setPlaying(false);
    if (vRef.current) vRef.current.pause();
  };
  const next = () => go(idx < media.length - 1 ? idx + 1 : 0);
  const prev = () => go(idx > 0 ? idx - 1 : media.length - 1);
  if (!media || !media.length)
    return (
      <div
        style={{
          height: 280,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 80,
          background: "#F5F2ED",
          borderRadius: 14,
        }}
      >
        {emoji}
      </div>
    );
  return (
    <div>
      <div
        style={{
          width: "100%",
          minHeight: 200,
          maxHeight: 400,
          borderRadius: 14,
          overflow: "hidden",
          background: "#F5F2ED",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onTouchStart={(e) => setTs(e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (ts === null) return;
          const d = ts - e.changedTouches[0].clientX;
          if (Math.abs(d) > 50) {
            d > 0 ? next() : prev();
          }
          setTs(null);
        }}
      >
        {cur.type === "video" ? (
          <div style={{ width: "100%", height: "100%", position: "relative" }}>
            <video
              ref={vRef}
              src={cur.url}
              poster={cur.poster}
              controls={playing}
              playsInline
              preload="none"
              style={{ width: "100%", maxHeight: 400, objectFit: "contain" }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
            {!playing && (
              <div
                onClick={() => {
                  if (vRef.current) vRef.current.play();
                }}
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,.25)",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,.9)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    boxShadow: "0 4px 16px rgba(0,0,0,.2)",
                  }}
                >
                  ▶
                </div>
              </div>
            )}
          </div>
        ) : (
          <img
            src={cur.url}
            alt={name}
            style={{ width: "100%", maxHeight: 400, objectFit: "contain" }}
          />
        )}
        {multi && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                prev();
              }}
              style={{
                position: "absolute",
                left: 8,
                top: "50%",
                transform: "translateY(-50%)",
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "none",
                background: "rgba(255,255,255,.85)",
                cursor: "pointer",
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ‹
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "none",
                background: "rgba(255,255,255,.85)",
                cursor: "pointer",
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ›
            </button>
          </>
        )}
        {multi && (
          <div
            style={{
              position: "absolute",
              bottom: 8,
              right: 8,
              background: "rgba(0,0,0,.6)",
              color: "#FFF",
              borderRadius: 10,
              padding: "2px 8px",
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            {idx + 1}/{media.length}
          </div>
        )}
      </div>
      {multi && (
        <div style={{ display: "flex", gap: 5, marginTop: 8, overflowX: "auto" }}>
          {media.map((m, i) => (
            <div
              key={i}
              onClick={() => go(i)}
              style={{
                width: 50,
                height: 50,
                borderRadius: 7,
                overflow: "hidden",
                border: idx === i ? "2px solid #6AADCC" : "2px solid transparent",
                cursor: "pointer",
                flexShrink: 0,
                opacity: idx === i ? 1 : 0.6,
                background: "#F0EDE8",
              }}
            >
              {m.type === "video" ? (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#222",
                    color: "#FFF",
                    fontSize: 16,
                  }}
                >
                  ▶
                </div>
              ) : (
                <img
                  src={m.url}
                  alt=""
                  loading="lazy"
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              )}
            </div>
          ))}
        </div>
      )}
      {multi && (
        <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 6 }}>
          {media.map((_, i) => (
            <div
              key={i}
              onClick={() => go(i)}
              style={{
                width: idx === i ? 16 : 6,
                height: 6,
                borderRadius: 3,
                background: idx === i ? "#6AADCC" : "#D0CCC5",
                cursor: "pointer",
                transition: "all .2s",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 🔥 Main Component — Firebase 연동
// ─────────────────────────────────────────────
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
  const [linkNum, setLinkNum] = useState("");
  const [trackIn, setTrackIn] = useState("");
  const [histPhone, setHistPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 🔥 Firebase state
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [histOrders, setHistOrders] = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  const t = T[lang];

  // 🔥 실시간 제품 구독
  useEffect(() => {
    const unsub = subscribeProducts((prods) => {
      setProducts(prods.filter((p) => p.active !== false));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 저장된 고객 정보 로드
  useEffect(() => {
    try {
      const saved = localStorage.getItem("novo_customer_info");
      if (saved) setInfo(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    if (toast) {
      const tm = setTimeout(() => setToast(null), 2e3);
      return () => clearTimeout(tm);
    }
  }, [toast]);

  const addToCart = (p) => {
    setCart((prev) => {
      const ex = prev.find((c) => c.id === p.id);
      if (ex) return prev.map((c) => (c.id === p.id ? { ...c, qty: c.qty + 1 } : c));
      return [...prev, { ...p, qty: 1 }];
    });
    setToast(t.added);
  };
  const updQty = (id, d) =>
    setCart((prev) => prev.map((c) => (c.id === id ? { ...c, qty: Math.max(1, c.qty + d) } : c)));
  const rmItem = (id) => setCart((prev) => prev.filter((c) => c.id !== id));

  const subtotal = cart.reduce((s, c) => s + tieredPrice(c, c.qty) * c.qty, 0);
  const disc = coupon ? (coupon.type === "percent" ? (subtotal * coupon.value) / 100 : coupon.value) : 0;
  const afterDisc = subtotal - disc;
  const shipCost = afterDisc >= FREE_SHIP ? 0 : SHIP_COST;
  const total = afterDisc + shipCost;
  const cartN = cart.reduce((s, c) => s + c.qty, 0);

  // 카테고리 목록 생성
  const categoryKeys = useMemo(() => {
    const cats = new Set(products.map((p) => p.category));
    return ["all", ...Array.from(cats)];
  }, [products]);

  const getCatLabel = (key) => {
    if (key === "all") return lang === "en" ? "All" : "전체";
    const m = CATEGORY_MAP[key];
    return m ? m[lang] : key;
  };

  const filtered = useMemo(
    () =>
      products.filter((p) => {
        if (cat !== "all" && p.category !== cat) return false;
        const nm = lang === "en" ? (p.nameEn || p.name_en || "") : (p.nameKo || p.name_ko || "");
        if (search && !nm.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [cat, search, lang, products]
  );

  // 🔥 쿠폰 검증 (Firestore)
  const handleApplyCoupon = async () => {
    const code = couponIn.trim().toUpperCase();
    if (!code) return;
    const promo = await validateCoupon(code);
    if (promo) {
      setCoupon(promo);
      setToast(t.ok);
    } else {
      setToast(t.bad);
    }
  };

  // 🔥 주문 제출 (Firestore)
  const handleSubmitOrder = async () => {
    setSubmitting(true);
    try {
      const orderNum = genId();
      const orderData = {
        orderNum,
        phone: info.phone,
        customer: {
          name: info.name,
          address: info.addr,
          city: info.city,
          state: info.state,
          zip: info.zip,
          venmoName: info.vname,
        },
        items: cart.map((c) => ({
          id: c.id,
          name: c.nameKo || c.name_ko || c.nameEn || c.name_en,
          nameEn: c.nameEn || c.name_en || "",
          price: tieredPrice(c, c.qty),
          qty: c.qty,
        })),
        subtotal,
        discount: disc,
        shipping: shipCost,
        total,
        status: "pending_payment",
        trackingNum: "",
        linkedTo: linkMode ? linkNum : null,
        couponCode: coupon ? couponIn.toUpperCase() : null,
      };

      await createOrder(orderData);

      // 재고 차감
      await decrementStock(cart.map((c) => ({ id: c.id, qty: c.qty })));

      // 고객 정보 저장
      if (saveInfo) {
        localStorage.setItem("novo_customer_info", JSON.stringify(info));
        await saveCustomer(info.phone, {
          name: info.name,
          address: info.addr,
          city: info.city,
          state: info.state,
          zip: info.zip,
          venmoName: info.vname,
        });
      }

      setOrder({ id: orderNum, total, items: cart, linkedTo: linkMode ? linkNum : null });
      setStep(2);
      setCart([]);
    } catch (err) {
      console.error("Order submit error:", err);
      setToast(lang === "en" ? "Order failed. Please try again." : "주문 실패. 다시 시도해주세요.");
    }
    setSubmitting(false);
  };

  // 🔥 주문 내역 조회 (Firestore)
  const handleLookupOrders = async () => {
    if (!histPhone.trim()) return;
    setHistLoading(true);
    try {
      const results = await fetchOrdersByPhone(histPhone.trim());
      setHistOrders(results);
    } catch (err) {
      console.error("Order lookup error:", err);
      setHistOrders([]);
    }
    setHistLoading(false);
  };

  // 🔥 결제 완료 버튼 (상태 업데이트)
  const handlePaid = async () => {
    try {
      // Update order status to payment_submitted
      const { updateOrderField } = await import("./firebase");
      const ords = await fetchOrdersByPhone(info.phone);
      const match = ords.find((o) => o.orderNum === order.id);
      if (match) {
        await updateOrderField(match._docId, { status: "payment_submitted" });
      }
    } catch (err) {
      console.warn("Payment status update failed:", err);
    }
    setPaidDone(true);
  };

  // ─── Helpers for product field access (Firestore field names) ───
  const pName = (p) => (lang === "en" ? (p.nameEn || p.name_en || "") : (p.nameKo || p.name_ko || ""));
  const pDesc = (p) => (lang === "en" ? (p.descEn || p.desc_en || "") : (p.descKo || p.desc_ko || ""));

  const C = {
    bg: "#F7FAFB", card: "#FFF", pri: "#6AADCC", priL: "#EAF5FA", acc: "#E8879A", accBg: "#FFF0F3",
    txt: "#2A2A2A", mid: "#5A5A5A", light: "#9AA5AE", bdr: "#E0EBF0", danger: "#D94F4F", wh: "#FFF",
  };
  const B = {
    border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600,
    fontFamily: "'Nunito',sans-serif", transition: "all .15s",
  };

  return (
    <div
      style={{
        fontFamily: "'Nunito',sans-serif", background: C.bg, minHeight: "100vh",
        maxWidth: 480, margin: "0 auto", color: C.txt, position: "relative", paddingBottom: 70,
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Playfair+Display:wght@700&display=swap"
        rel="stylesheet"
      />
      {toast && (
        <div
          style={{
            position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 999,
            background: C.pri, color: "#FFF", padding: "8px 22px", borderRadius: 10,
            fontSize: 13, fontWeight: 700, boxShadow: "0 4px 16px rgba(0,0,0,.2)",
          }}
        >
          {toast}
        </div>
      )}

      {/* HEADER */}
      <div
        style={{
          background: "#FFF", padding: "10px 16px 8px", position: "sticky", top: 0, zIndex: 100,
          boxShadow: "0 1px 6px rgba(106,173,204,.1)", borderBottom: `1px solid ${C.bdr}`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <button
            onClick={() => setLang(lang === "en" ? "ko" : "en")}
            style={{ ...B, background: C.priL, color: C.pri, padding: "4px 10px", fontSize: 10, borderRadius: 6 }}
          >
            {lang === "en" ? "한국어" : "EN"}
          </button>
          <div
            onClick={() => { setPage("cart"); setSelProd(null); setStep(0); }}
            style={{
              position: "relative", cursor: "pointer", background: C.priL, borderRadius: "50%",
              width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 16 }}>🛒</span>
            {cartN > 0 && (
              <span
                style={{
                  position: "absolute", top: -3, right: -3, background: C.acc, color: "#FFF",
                  borderRadius: "50%", width: 17, height: 17, fontSize: 9, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {cartN}
              </span>
            )}
          </div>
        </div>
        <div onClick={() => { setPage("shop"); setSelProd(null); }} style={{ cursor: "pointer", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 1 }}>👩‍🍳👶👶</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 700, color: C.txt, letterSpacing: 1 }}>
            NOVO MARKET
          </div>
          <div style={{ fontSize: 9, color: C.light, letterSpacing: 1.5, fontWeight: 600, marginTop: 1, textTransform: "uppercase" }}>
            {t.tag}
          </div>
        </div>
      </div>

      {/* LOADING */}
      {loading && page === "shop" && (
        <div style={{ textAlign: "center", padding: "60px 0", color: C.light }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
          <div>{t.loading}</div>
        </div>
      )}

      {/* PRODUCT DETAIL */}
      {selProd && page === "shop" &&
        (() => {
          const p = products.find((x) => x.id === selProd);
          if (!p) return null;
          const nm = pName(p);
          const dc = pDesc(p);
          const bp = basePrice(p);
          const ic = cart.find((c) => c.id === p.id);
          const tp = ic ? tieredPrice(p, ic.qty) : bp;
          return (
            <div style={{ padding: 16, paddingBottom: 100 }}>
              <button onClick={() => setSelProd(null)} style={{ ...B, background: "none", color: C.pri, padding: "0 0 12px", fontSize: 14 }}>
                {t.back}
              </button>
              <Gallery media={p.media} emoji={p.emoji || p.image || "📦"} name={nm} />
              <div style={{ marginTop: 16 }}>
                {p.promo && (
                  <span style={{ background: C.danger, color: "#FFF", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 5, marginBottom: 8, display: "inline-block" }}>
                    {p.promo.value}% {t.off}
                  </span>
                )}
                <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, margin: "8px 0 6px", lineHeight: 1.3 }}>{nm}</h2>
                {p.tags && p.tags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                    {p.tags.map((tag, i) => (
                      <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: tag.color || "#EEE", color: tag.textColor || "#555" }}>
                        {tag.label}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 24, fontWeight: 800, color: p.promo ? C.danger : C.pri }}>{fmt(bp)}</span>
                  {p.promo && <span style={{ fontSize: 15, textDecoration: "line-through", color: C.light }}>{fmt(p.price)}</span>}
                </div>
                {p.tiered && p.tiered.length > 0 && (
                  <div style={{ background: C.priL, borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.pri, marginBottom: 6 }}>📦 {t.bulk}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <div style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 8, background: !ic || ic.qty < p.tiered[0].qty ? C.pri : "#FFF", color: !ic || ic.qty < p.tiered[0].qty ? "#FFF" : C.txt, border: `1px solid ${C.pri}` }}>
                        <div style={{ fontSize: 10, opacity: 0.8 }}>1{t.ea}</div>
                        <div style={{ fontSize: 15, fontWeight: 800 }}>{fmt(bp)}</div>
                      </div>
                      {p.tiered.map((tier, i) => {
                        const active = ic && ic.qty >= tier.qty && (i === p.tiered.length - 1 || ic.qty < p.tiered[i + 1].qty);
                        const pct = Math.round((1 - tier.price / bp) * 100);
                        return (
                          <div key={i} style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 8, background: active ? C.pri : "#FFF", color: active ? "#FFF" : C.txt, border: `1px solid ${C.pri}`, position: "relative" }}>
                            {pct > 0 && <div style={{ position: "absolute", top: -8, right: -4, background: C.acc, color: "#FFF", fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 6 }}>-{pct}%</div>}
                            <div style={{ fontSize: 10, opacity: 0.8 }}>{tier.qty}+</div>
                            <div style={{ fontSize: 15, fontWeight: 800 }}>{fmt(tier.price)}</div>
                          </div>
                        );
                      })}
                    </div>
                    {ic && <div style={{ fontSize: 11, color: C.pri, fontWeight: 600, marginTop: 6, textAlign: "center" }}>✓ {t.cur}: {fmt(tp)}/{t.ea}</div>}
                  </div>
                )}
                <p style={{ fontSize: 14, lineHeight: 1.7, color: C.mid, margin: "0 0 20px" }}>{dc}</p>
                {p.stock === 0 ? (
                  <div style={{ ...B, width: "100%", padding: 14, fontSize: 15, textAlign: "center", background: "#CCC", color: "#FFF", borderRadius: 12 }}>{t.sold}</div>
                ) : (
                  <div style={{ display: "flex", gap: 10 }}>
                    {ic && (
                      <div style={{ display: "flex", alignItems: "center", gap: 12, background: C.priL, borderRadius: 12, padding: "0 14px" }}>
                        <button onClick={() => updQty(p.id, -1)} style={{ ...B, background: "none", color: C.pri, fontSize: 20, padding: 8 }}>−</button>
                        <span style={{ fontWeight: 800, fontSize: 16, minWidth: 20, textAlign: "center" }}>{ic.qty}</span>
                        <button onClick={() => updQty(p.id, 1)} style={{ ...B, background: "none", color: C.pri, fontSize: 20, padding: 8 }}>+</button>
                      </div>
                    )}
                    <button onClick={() => addToCart(p)} style={{ ...B, flex: 1, padding: 14, fontSize: 15, background: C.pri, color: "#FFF", borderRadius: 12 }}>
                      {ic ? `✓ ${t.add}` : t.add}
                    </button>
                  </div>
                )}
                {p.stock > 0 && p.stock <= 10 && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#E67E22", fontWeight: 600 }}>
                    ⚡ {lang === "en" ? `Only ${p.stock} left!` : `${p.stock}개 남음!`}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {/* SHOP */}
      {page === "shop" && !selProd && !loading && (
        <div style={{ padding: "12px 16px 20px" }}>
          <div style={{ background: C.wh, borderRadius: 10, border: `1px solid ${C.bdr}`, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span>🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.search}
              style={{ border: "none", outline: "none", flex: 1, fontSize: 13, fontFamily: "'Nunito',sans-serif", background: "transparent" }}
            />
          </div>
          <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 10 }}>
            {categoryKeys.map((key) => (
              <button
                key={key}
                onClick={() => setCat(key)}
                style={{
                  ...B, padding: "5px 12px", fontSize: 11, whiteSpace: "nowrap",
                  background: cat === key ? C.pri : C.wh,
                  color: cat === key ? "#FFF" : C.light,
                  border: `1px solid ${cat === key ? C.pri : C.bdr}`,
                }}
              >
                {getCatLabel(key)}
              </button>
            ))}
          </div>
          <div style={{ background: C.accBg, borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: C.acc, fontWeight: 600 }}>
            🚚 {t.freeNote}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {filtered.map((p) => {
              const nm = pName(p);
              const pr = basePrice(p);
              const so = p.stock === 0;
              const hasImg = p.media && p.media.length > 0 && p.media[0].type === "image" && p.media[0].url;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelProd(p.id)}
                  style={{
                    background: C.card, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.bdr}`,
                    position: "relative", cursor: "pointer", opacity: so ? 0.6 : 1, boxShadow: "0 1px 4px rgba(0,0,0,.04)",
                  }}
                >
                  {p.promo && !so && (
                    <div style={{ position: "absolute", top: 6, left: 6, background: C.danger, color: "#FFF", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, zIndex: 2 }}>
                      {p.promo.value}% {t.off}
                    </div>
                  )}
                  {so && (
                    <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%) rotate(-12deg)", background: "rgba(0,0,0,.7)", color: "#FFF", fontSize: 12, fontWeight: 800, padding: "4px 16px", borderRadius: 4, zIndex: 2 }}>
                      {t.sold}
                    </div>
                  )}
                  {p.media && p.media.length > 1 && (
                    <div style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,.5)", color: "#FFF", borderRadius: 10, padding: "1px 6px", fontSize: 9, fontWeight: 600, zIndex: 2 }}>
                      📷 {p.media.length}
                    </div>
                  )}
                  <div style={{ height: 150, background: "#F5F2ED", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {hasImg ? (
                      <LazyImg src={p.media[0].url} alt={nm} style={{ width: "100%", height: 150 }} />
                    ) : (
                      <div style={{ height: 150, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48 }}>
                        {p.emoji || p.image || "📦"}
                      </div>
                    )}
                  </div>
                  <div style={{ padding: "8px 10px 10px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.3, marginBottom: 5, minHeight: 28 }}>{nm}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                      {p.promo ? (
                        <>
                          <span style={{ fontSize: 14, fontWeight: 800, color: C.danger }}>{fmt(pr)}</span>
                          <span style={{ fontSize: 10, color: C.light, textDecoration: "line-through" }}>{fmt(p.price)}</span>
                        </>
                      ) : (
                        <span style={{ fontSize: 14, fontWeight: 800, color: C.pri }}>{fmt(pr)}</span>
                      )}
                    </div>
                    {p.tiered && p.tiered.length > 0 && (
                      <div style={{ fontSize: 9, color: C.pri, fontWeight: 600, marginBottom: 5, background: C.priL, padding: "2px 6px", borderRadius: 4, display: "inline-block" }}>
                        📦 {p.tiered[0].qty}+ {fmt(p.tiered[0].price)}
                      </div>
                    )}
                    {p.tags && p.tags.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 5 }}>
                        {p.tags.slice(0, 2).map((tag, i) => (
                          <span key={i} style={{ fontSize: 8, fontWeight: 600, padding: "1px 5px", borderRadius: 8, background: tag.color || "#EEE", color: tag.textColor || "#555" }}>
                            {tag.label}
                          </span>
                        ))}
                        {p.tags.length > 2 && <span style={{ fontSize: 8, color: C.light }}>+{p.tags.length - 2}</span>}
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); if (!so) addToCart(p); }}
                      disabled={so}
                      style={{ ...B, width: "100%", padding: 7, fontSize: 11, background: so ? "#CCC" : C.pri, color: "#FFF" }}
                    >
                      {so ? t.sold : t.add}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {filtered.length === 0 && !loading && (
            <div style={{ textAlign: "center", padding: "40px 0", color: C.light }}>
              {lang === "en" ? "No products found" : "제품을 찾을 수 없습니다"}
            </div>
          )}
        </div>
      )}

      {/* CART */}
      {page === "cart" && step === 0 && (
        <div style={{ padding: 16 }}>
          <button onClick={() => setPage("shop")} style={{ ...B, background: "none", color: C.pri, padding: "0 0 14px", fontSize: 14 }}>
            {t.back}
          </button>
          <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, marginBottom: 14 }}>🛒 {t.cart}</h2>
          {cart.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: C.light }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🛒</div>
              <div>{t.empty}</div>
              <button onClick={() => setPage("shop")} style={{ ...B, marginTop: 16, background: C.pri, color: "#FFF", padding: "10px 24px", fontSize: 13 }}>
                {t.shopNow}
              </button>
            </div>
          ) : (
            <>
              {cart.map((item) => {
                const bp2 = basePrice(item);
                const tp2 = tieredPrice(item, item.qty);
                const isTiered = tp2 < bp2;
                const nm = pName(item);
                const hasImg = item.media && item.media[0]?.type === "image" && item.media[0]?.url;
                return (
                  <div key={item.id} style={{ background: C.card, borderRadius: 12, padding: 10, marginBottom: 8, display: "flex", gap: 10, alignItems: "center", border: `1px solid ${C.bdr}` }}>
                    {hasImg ? (
                      <div style={{ width: 50, height: 50, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
                        <img src={item.media[0].url} alt={nm} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      </div>
                    ) : (
                      <div style={{ fontSize: 30, width: 50, textAlign: "center", flexShrink: 0 }}>{item.emoji || item.image || "📦"}</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nm}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: isTiered ? C.acc : C.pri }}>{fmt(tp2)}</span>
                        {isTiered && <span style={{ fontSize: 10, color: C.light, textDecoration: "line-through" }}>{fmt(bp2)}</span>}
                      </div>
                      {isTiered && <div style={{ fontSize: 9, color: C.pri, fontWeight: 600 }}>📦 {t.bulkTag}</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button onClick={() => updQty(item.id, -1)} style={{ ...B, width: 26, height: 26, background: C.priL, color: C.pri, fontSize: 14, padding: 0 }}>−</button>
                      <span style={{ fontWeight: 700, fontSize: 13, minWidth: 16, textAlign: "center" }}>{item.qty}</span>
                      <button onClick={() => updQty(item.id, 1)} style={{ ...B, width: 26, height: 26, background: C.priL, color: C.pri, fontSize: 14, padding: 0 }}>+</button>
                    </div>
                    <button onClick={() => rmItem(item.id)} style={{ ...B, background: "none", color: C.danger, fontSize: 16, padding: 4 }}>✕</button>
                  </div>
                );
              })}
              <div style={{ background: C.card, borderRadius: 10, padding: 10, margin: "10px 0", border: `1px solid ${C.bdr}` }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <input value={couponIn} onChange={(e) => setCouponIn(e.target.value)} placeholder={t.promo} style={{ flex: 1, border: `1px solid ${C.bdr}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontFamily: "'Nunito',sans-serif" }} />
                  <button onClick={handleApplyCoupon} style={{ ...B, background: C.pri, color: "#FFF", padding: "8px 14px", fontSize: 12 }}>{t.apply}</button>
                </div>
                {coupon && (
                  <div style={{ marginTop: 6, fontSize: 11, color: C.pri, fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
                    <span>✓ {couponIn.toUpperCase()}</span>
                    <button onClick={() => { setCoupon(null); setCouponIn(""); }} style={{ ...B, background: "none", color: C.danger, padding: 0, fontSize: 11 }}>{t.remove}</button>
                  </div>
                )}
              </div>
              <div style={{ background: C.card, borderRadius: 12, padding: 14, border: `1px solid ${C.bdr}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: C.light }}>{t.sub}</span>
                  <span style={{ fontWeight: 700 }}>{fmt(subtotal)}</span>
                </div>
                {disc > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, color: C.danger }}>
                    <span>Discount</span>
                    <span style={{ fontWeight: 700 }}>−{fmt(disc)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 10 }}>
                  <span style={{ color: C.light }}>{t.ship}</span>
                  <span style={{ fontWeight: 700, color: shipCost === 0 ? C.pri : C.txt }}>{shipCost === 0 ? `🎉 ${t.free}` : fmt(shipCost)}</span>
                </div>
                {shipCost > 0 && (
                  <div style={{ fontSize: 11, color: C.acc, background: C.accBg, padding: "5px 8px", borderRadius: 6, marginBottom: 10 }}>
                    🚚 {fmt(FREE_SHIP - afterDisc)} {t.moreFree}
                  </div>
                )}
                <div style={{ borderTop: `1px solid ${C.bdr}`, paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 800 }}>
                  <span>{t.total}</span>
                  <span style={{ color: C.pri }}>{fmt(total)}</span>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", color: C.mid, marginTop: 12 }}>
                  <input type="checkbox" checked={linkMode} onChange={(e) => setLinkMode(e.target.checked)} />
                  {t.link}
                </label>
                {linkMode && (
                  <input
                    value={linkNum}
                    onChange={(e) => setLinkNum(e.target.value)}
                    placeholder={t.linkNum}
                    style={{ width: "100%", border: `1px solid ${C.bdr}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "'Nunito',sans-serif", boxSizing: "border-box", marginTop: 6 }}
                  />
                )}
                <button onClick={() => setStep(1)} style={{ ...B, width: "100%", padding: 13, marginTop: 14, fontSize: 14, background: C.pri, color: "#FFF", borderRadius: 12 }}>
                  {t.checkout} →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* CHECKOUT */}
      {page === "cart" && step === 1 && (
        <div style={{ padding: 16, paddingBottom: 100 }}>
          <button onClick={() => setStep(0)} style={{ ...B, background: "none", color: C.pri, padding: "0 0 14px", fontSize: 14 }}>
            {t.back}
          </button>
          <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, marginBottom: 16 }}>{t.info}</h2>
          <div style={{ background: C.card, borderRadius: 14, padding: 14, border: `1px solid ${C.bdr}`, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🛒</div>
            {cart.map((item) => {
              const nm = pName(item);
              const pr = tieredPrice(item, item.qty);
              return (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
                  <span>{nm} × {item.qty}</span>
                  <span style={{ fontWeight: 700 }}>{fmt(pr * item.qty)}</span>
                </div>
              );
            })}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", fontSize: 16, fontWeight: 800, borderTop: `1px solid ${C.bdr}`, marginTop: 8 }}>
              <span>{t.total}</span>
              <span>{fmt(total)}</span>
            </div>
            {linkMode && linkNum && (
              <div style={{ fontSize: 12, color: C.acc, fontWeight: 600, marginTop: 6 }}>🔗 Linked to {linkNum}</div>
            )}
          </div>
          {[
            { k: "name", l: t.name, ty: "text" },
            { k: "phone", l: t.phone, ty: "tel" },
            { k: "vname", l: t.vname, ty: "text" },
            { k: "addr", l: t.addr, ty: "text" },
          ].map((f) => (
            <div key={f.k} style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.light, marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: 0.5 }}>{f.l}</label>
              <input
                value={info[f.k]}
                onChange={(e) => setInfo({ ...info, [f.k]: e.target.value })}
                type={f.ty}
                style={{ width: "100%", border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "10px 14px", fontSize: 14, fontFamily: "'Nunito',sans-serif", boxSizing: "border-box", background: "#FFF" }}
              />
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
            {[
              { k: "city", l: t.city },
              { k: "state", l: t.state },
              { k: "zip", l: t.zip },
            ].map((f) => (
              <div key={f.k}>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.light, marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: 0.5 }}>{f.l}</label>
                <input
                  value={info[f.k]}
                  onChange={(e) => setInfo({ ...info, [f.k]: e.target.value })}
                  style={{ width: "100%", border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "10px 14px", fontSize: 14, fontFamily: "'Nunito',sans-serif", boxSizing: "border-box", background: "#FFF" }}
                />
              </div>
            ))}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", color: C.mid }}>
            <input type="checkbox" checked={saveInfo} onChange={(e) => setSaveInfo(e.target.checked)} />
            {t.save}
          </label>
          {(() => {
            const ok = info.name && info.phone && info.addr && info.city && info.state && info.zip;
            return (
              <button
                onClick={handleSubmitOrder}
                disabled={!ok || submitting}
                style={{
                  ...B, width: "100%", padding: 14, marginTop: 16, fontSize: 15,
                  background: ok && !submitting ? C.pri : "#CCC", color: "#FFF", borderRadius: 14,
                  opacity: ok && !submitting ? 1 : 0.5, pointerEvents: ok && !submitting ? "auto" : "none",
                }}
              >
                {submitting ? (t.submitting) : linkMode ? t.linkSubmit : t.submit}
              </button>
            );
          })()}
        </div>
      )}

      {/* ORDER CONFIRMED */}
      {page === "cart" && step === 2 && order && !paidDone && (
        <div style={{ padding: 20, paddingBottom: 100, textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.pri, marginBottom: 16 }}>{t.done}</div>
          <div style={{ background: C.priL, borderRadius: 14, padding: "16px 24px", display: "inline-block", marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: C.mid }}>{t.orderNum}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.pri, letterSpacing: 2 }}>{order.id}</div>
          </div>
          {order.linkedTo && <div style={{ fontSize: 13, color: C.acc, fontWeight: 600, marginBottom: 12 }}>🔗 Linked to {order.linkedTo}</div>}
          <div style={{ fontSize: 13, color: C.mid, marginBottom: 4 }}>{t.amt}</div>
          <div style={{ fontSize: 32, fontWeight: 800, marginBottom: 16 }}>{fmt(order.total)}</div>
          <div style={{ fontSize: 14, color: C.mid, lineHeight: 1.6, marginBottom: 12 }}>{t.payMsg}</div>
          <div style={{ background: C.accBg, borderRadius: 12, padding: "10px 14px", marginBottom: 20, fontSize: 13, color: C.acc, fontWeight: 700 }}>
            📝 {t.memo}: <strong>{order.id}</strong>
          </div>
          <div style={{ background: C.card, borderRadius: 14, padding: 16, border: `1px solid ${C.bdr}`, marginBottom: 10, textAlign: "left" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.mid }}>Venmo</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>@novo-market-us</div>
          </div>
          <div style={{ background: C.card, borderRadius: 14, padding: 16, border: `1px solid ${C.bdr}`, marginBottom: 16, textAlign: "left" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.mid }}>Zelle</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>pay@novomarket.us</div>
          </div>
          <button onClick={handlePaid} style={{ ...B, width: "100%", padding: 14, fontSize: 16, background: C.pri, color: "#FFF", borderRadius: 14 }}>
            ✓ {t.paid}
          </button>
        </div>
      )}

      {page === "cart" && step === 2 && paidDone && (
        <div style={{ padding: 20, paddingBottom: 100, textAlign: "center" }}>
          <div style={{ background: C.priL, borderRadius: 14, padding: 24, color: C.pri, fontSize: 15, fontWeight: 600, lineHeight: 1.7 }}>
            ✅ {t.paidOk}
          </div>
          <button
            onClick={() => { setPage("shop"); setStep(0); setOrder(null); setPaidDone(false); setLinkMode(false); setLinkNum(""); }}
            style={{ ...B, marginTop: 20, padding: "14px 40px", fontSize: 15, background: C.pri, color: "#FFF", borderRadius: 14 }}
          >
            🛍 {t.shopNow}
          </button>
        </div>
      )}

      {/* TRACK */}
      {page === "track" && (
        <div style={{ padding: 16 }}>
          <button onClick={() => setPage("shop")} style={{ ...B, background: "none", color: C.pri, padding: "0 0 14px", fontSize: 14 }}>
            {t.back}
          </button>
          <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, marginBottom: 16 }}>📦 {t.track}</h2>
          <div style={{ background: C.card, borderRadius: 14, padding: 20, border: `1px solid ${C.bdr}`, textAlign: "center" }}>
            <input
              value={trackIn}
              onChange={(e) => setTrackIn(e.target.value)}
              placeholder={t.trackNum}
              style={{ width: "100%", border: `1px solid ${C.bdr}`, borderRadius: 8, padding: 12, fontSize: 14, textAlign: "center", fontFamily: "'Nunito',sans-serif", boxSizing: "border-box", marginBottom: 10 }}
            />
            <button
              onClick={() => {
                if (!trackIn.trim()) return;
                const n = trackIn.trim().toUpperCase();
                const u = n.startsWith("1Z") ? CARRIERS.ups + n : n.length >= 20 ? CARRIERS.usps + n : CARRIERS.fedex + n;
                window.open(u, "_blank");
              }}
              disabled={!trackIn.trim()}
              style={{ ...B, width: "100%", padding: 12, fontSize: 14, background: trackIn.trim() ? C.pri : "#CCC", color: "#FFF", borderRadius: 10 }}
            >
              {t.trackBtn}
            </button>
          </div>
        </div>
      )}

      {/* HISTORY — 🔥 Firebase 주문 조회 */}
      {page === "history" && (
        <div style={{ padding: 16 }}>
          <button onClick={() => setPage("shop")} style={{ ...B, background: "none", color: C.pri, padding: "0 0 14px", fontSize: 14 }}>
            {t.back}
          </button>
          <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, marginBottom: 16 }}>📋 {t.history}</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input
              value={histPhone}
              onChange={(e) => setHistPhone(e.target.value)}
              placeholder={t.enterPhone}
              style={{ flex: 1, border: `1px solid ${C.bdr}`, borderRadius: 8, padding: 10, fontSize: 13, fontFamily: "'Nunito',sans-serif" }}
              onKeyDown={(e) => e.key === "Enter" && handleLookupOrders()}
            />
            <button onClick={handleLookupOrders} style={{ ...B, background: C.pri, color: "#FFF", padding: "10px 14px", fontSize: 12 }}>
              🔍 {t.lookUp}
            </button>
          </div>

          {histLoading && (
            <div style={{ textAlign: "center", padding: "20px 0", color: C.light }}>⏳</div>
          )}

          {!histLoading && histOrders.length === 0 && (
            <div style={{ textAlign: "center", padding: "30px 0", color: C.light, fontSize: 14 }}>{t.none}</div>
          )}

          {!histLoading &&
            histOrders.map((o) => {
              const STATUS_LABEL = {
                pending_payment: { label: lang === "en" ? "Awaiting Payment" : "결제 대기", color: "#E67E22", bg: "#FFF3E0" },
                payment_submitted: { label: lang === "en" ? "Payment Sent" : "결제 확인중", color: "#F39C12", bg: "#FFF8E1" },
                confirmed: { label: lang === "en" ? "Confirmed" : "결제 확인", color: "#27AE60", bg: "#E8F5E9" },
                preparing: { label: lang === "en" ? "Preparing" : "준비중", color: "#2980B9", bg: "#E3F2FD" },
                shipped: { label: lang === "en" ? "Shipped" : "배송중", color: "#8E44AD", bg: "#F3E5F5" },
                delivered: { label: lang === "en" ? "Delivered" : "배송 완료", color: "#2C3E50", bg: "#ECEFF1" },
              };
              const s = STATUS_LABEL[o.status] || STATUS_LABEL.pending_payment;
              const createdDate = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString("ko-KR") : o.createdAt ? new Date(o.createdAt).toLocaleDateString("ko-KR") : "";
              return (
                <div key={o._docId || o.orderNum} style={{ background: C.card, borderRadius: 12, padding: 14, marginBottom: 10, border: `1px solid ${C.bdr}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div>
                      <span style={{ fontWeight: 800, color: C.pri, fontSize: 15 }}>{o.orderNum}</span>
                      <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: s.bg, color: s.color }}>{s.label}</span>
                    </div>
                    <span style={{ fontWeight: 800, fontSize: 15 }}>${(o.total || 0).toFixed(2)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.mid, marginBottom: 6 }}>{createdDate}</div>
                  {o.items &&
                    o.items.map((it, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0", color: C.mid }}>
                        <span>{it.name || it.nameEn} × {it.qty}</span>
                        <span>${(it.price * it.qty).toFixed(2)}</span>
                      </div>
                    ))}
                  {o.trackingNum && (
                    <div style={{ marginTop: 8, fontSize: 12, color: C.pri, fontWeight: 600 }}>
                      📍 {o.trackingNum}
                      <button
                        onClick={() => {
                          const n = o.trackingNum.trim().toUpperCase();
                          const u = n.startsWith("1Z") ? CARRIERS.ups + n : n.length >= 20 ? CARRIERS.usps + n : CARRIERS.fedex + n;
                          window.open(u, "_blank");
                        }}
                        style={{ ...B, background: C.priL, color: C.pri, padding: "4px 10px", fontSize: 11, marginLeft: 8, borderRadius: 6 }}
                      >
                        {t.trackBtn}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* BOTTOM TAB BAR */}
      <div
        style={{
          position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%",
          maxWidth: 480, background: C.wh, borderTop: `1px solid ${C.bdr}`, display: "flex", zIndex: 100,
          boxShadow: "0 -2px 10px rgba(0,0,0,.06)",
        }}
      >
        {[
          { k: "shop", i: "🏠", l: t.shop },
          { k: "cart", i: "🛒", l: t.cart, badge: cartN },
          { k: "track", i: "📦", l: t.track },
          { k: "history", i: "📋", l: t.history },
        ].map((tab) => (
          <button
            key={tab.k}
            onClick={() => { setPage(tab.k); setSelProd(null); setStep(0); }}
            style={{
              flex: 1, border: "none", background: "none", cursor: "pointer", padding: "10px 0 8px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2, position: "relative",
              fontFamily: "'Nunito',sans-serif",
            }}
          >
            <div style={{ fontSize: 20, position: "relative" }}>
              {tab.i}
              {tab.badge > 0 && (
                <span style={{ position: "absolute", top: -5, right: -10, background: C.acc, color: "#FFF", borderRadius: "50%", width: 16, height: 16, fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {tab.badge}
                </span>
              )}
            </div>
            <span style={{ fontSize: 10, fontWeight: page === tab.k ? 800 : 500, color: page === tab.k ? C.pri : C.light }}>{tab.l}</span>
            {page === tab.k && <div style={{ position: "absolute", top: 0, left: "25%", right: "25%", height: 2, background: C.pri, borderRadius: "0 0 2px 2px" }} />}
          </button>
        ))}
      </div>
    </div>
  );
}
