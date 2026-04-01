// ============================================================
// NOVO MARKET — Firebase Configuration & Helper Functions
// ============================================================
// 📌 아래 firebaseConfig를 Firebase Console에서 복사한 값으로 교체하세요.
// Firebase Console → 프로젝트 설정 → 웹 앱 → SDK 설정 및 구성
// ============================================================

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

// ─────────────────────────────────────────────
// 🔧 Firebase Config — 여기를 교체하세요!
// ─────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDCQ6jdlGAdGskr5jibgGVqSZx6z0GKYMc",
  authDomain: "novo-market-us.firebaseapp.com",
  projectId: "novo-market-us",
  storageBucket: "novo-market-us.firebasestorage.app",
  messagingSenderId: "410563440677",
  appId: "1:410563440677:web:f7e1ef5742457660c4cfcc",
  measurementId: "G-YRMQRGMNYX",
};

// ─────────────────────────────────────────────
// Initialize Firebase
// ─────────────────────────────────────────────
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// ─────────────────────────────────────────────
// Collection References
// ─────────────────────────────────────────────
const productsRef = collection(db, "products");
const ordersRef = collection(db, "orders");
const customersRef = collection(db, "customers");
const categoriesRef = collection(db, "categories");
const promosRef = collection(db, "promos");

// ─────────────────────────────────────────────
// 📦 PRODUCTS
// ─────────────────────────────────────────────

/** 실시간 제품 목록 구독 */
export function subscribeProducts(callback) {
  return onSnapshot(productsRef, (snapshot) => {
    const products = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(products);
  });
}

/** 모든 제품 가져오기 (일회성) */
export async function fetchProducts() {
  const snap = await getDocs(productsRef);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** 제품 추가 */
export async function addProduct(product) {
  const { id, ...data } = product;
  if (id) {
    await setDoc(doc(db, "products", id), { ...data, updatedAt: serverTimestamp() });
    return id;
  }
  const docRef = await addDoc(productsRef, { ...data, createdAt: serverTimestamp() });
  return docRef.id;
}

/** 제품 수정 */
export async function updateProduct(productId, data) {
  await updateDoc(doc(db, "products", productId), { ...data, updatedAt: serverTimestamp() });
}

/** 제품 삭제 */
export async function deleteProduct(productId) {
  await deleteDoc(doc(db, "products", productId));
}

// ─────────────────────────────────────────────
// 📋 ORDERS
// ─────────────────────────────────────────────

/** 실시간 주문 목록 구독 */
export function subscribeOrders(callback) {
  const q = query(ordersRef, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map((d) => ({ _docId: d.id, ...d.data() }));
    callback(orders);
  });
}

/** 주문 생성 (고객용) */
export async function createOrder(orderData) {
  const docRef = await addDoc(ordersRef, {
    ...orderData,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

/** 주문 상태 변경 (관리자) */
export async function updateOrderStatus(docId, status) {
  await updateDoc(doc(db, "orders", docId), { status, updatedAt: serverTimestamp() });
}

/** 주문 필드 업데이트 (트래킹 번호 등) */
export async function updateOrderField(docId, fieldData) {
  await updateDoc(doc(db, "orders", docId), { ...fieldData, updatedAt: serverTimestamp() });
}

/** 전화번호로 주문 조회 (고객용) */
export async function fetchOrdersByPhone(phone) {
  const q = query(ordersRef, where("phone", "==", phone), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ _docId: d.id, ...d.data() }));
}

// ─────────────────────────────────────────────
// 👤 CUSTOMERS
// ─────────────────────────────────────────────

/** 고객 저장/업데이트 (전화번호 기준) */
export async function saveCustomer(phone, customerData) {
  await setDoc(doc(db, "customers", phone), {
    ...customerData,
    phone,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// ─────────────────────────────────────────────
// 📂 CATEGORIES
// ─────────────────────────────────────────────

/** 실시간 카테고리 구독 */
export function subscribeCategories(callback) {
  return onSnapshot(categoriesRef, (snapshot) => {
    const cats = {};
    snapshot.docs.forEach((d) => {
      cats[d.id] = d.data();
    });
    callback(cats);
  });
}

/** 카테고리 추가/수정 */
export async function saveCategory(catId, data) {
  await setDoc(doc(db, "categories", catId), data);
}

/** 카테고리 삭제 */
export async function deleteCategory(catId) {
  await deleteDoc(doc(db, "categories", catId));
}

// ─────────────────────────────────────────────
// 🎟️ PROMOS
// ─────────────────────────────────────────────

/** 실시간 프로모션 구독 */
export function subscribePromos(callback) {
  return onSnapshot(promosRef, (snapshot) => {
    const promos = snapshot.docs.map((d) => ({ _docId: d.id, ...d.data() }));
    callback(promos);
  });
}

/** 모든 프로모션 가져오기 */
export async function fetchPromos() {
  const snap = await getDocs(promosRef);
  return snap.docs.map((d) => ({ _docId: d.id, ...d.data() }));
}

/** 프로모션 추가 */
export async function addPromo(promoData) {
  // 코드를 doc ID로 사용
  await setDoc(doc(db, "promos", promoData.code), promoData);
}

/** 프로모션 수정 */
export async function updatePromo(code, data) {
  await setDoc(doc(db, "promos", code), data);
}

/** 프로모션 삭제 */
export async function deletePromo(code) {
  await deleteDoc(doc(db, "promos", code));
}

/** 쿠폰 코드 검증 (고객용) */
export async function validateCoupon(code) {
  const docSnap = await getDoc(doc(db, "promos", code));
  if (docSnap.exists()) {
    const data = docSnap.data();
    if (data.active) return data;
  }
  return null;
}

// ─────────────────────────────────────────────
// 📷 FIREBASE STORAGE — 이미지/영상 업로드
// ─────────────────────────────────────────────

/**
 * 파일을 Firebase Storage에 업로드하고 다운로드 URL을 반환
 * @param {File} file - 업로드할 파일
 * @param {string} path - Storage 경로 (예: "products/p1/image1.jpg")
 * @returns {Promise<string>} 다운로드 URL
 */
export async function uploadFile(file, path) {
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(snapshot.ref);
  return downloadURL;
}

/**
 * 제품 이미지 업로드 (관리자용)
 * @param {string} productId - 제품 ID
 * @param {File} file - 이미지/영상 파일
 * @param {number} index - 미디어 인덱스
 * @returns {Promise<string>} 다운로드 URL
 */
export async function uploadProductMedia(productId, file, index) {
  const ext = file.name.split(".").pop();
  const path = `products/${productId}/${index}_${Date.now()}.${ext}`;
  return uploadFile(file, path);
}

/**
 * Storage에서 파일 삭제
 * @param {string} url - Firebase Storage URL
 */
export async function deleteStorageFile(url) {
  try {
    const storageRef = ref(storage, url);
    await deleteObject(storageRef);
  } catch (e) {
    console.warn("Storage delete failed:", e);
  }
}

// ─────────────────────────────────────────────
// 🔄 재고 차감 (주문 시)
// ─────────────────────────────────────────────

/**
 * 주문 아이템들의 재고를 차감
 * @param {Array} items - [{id, qty}, ...]
 */
export async function decrementStock(items) {
  const batch = writeBatch(db);
  for (const item of items) {
    const prodRef = doc(db, "products", item.id);
    const prodSnap = await getDoc(prodRef);
    if (prodSnap.exists()) {
      const current = prodSnap.data().stock || 0;
      batch.update(prodRef, { stock: Math.max(0, current - item.qty) });
    }
  }
  await batch.commit();
}

// ─────────────────────────────────────────────
// 🛠 초기 데이터 시딩 (최초 1회)
// ─────────────────────────────────────────────

/**
 * 초기 제품/카테고리 데이터를 Firestore에 저장
 * 관리자 대시보드에서 "초기 데이터 로드" 버튼으로 호출
 */
export async function seedInitialData(products, categories, promos) {
  const batch = writeBatch(db);

  // 카테고리
  for (const [id, name] of Object.entries(categories)) {
    batch.set(doc(db, "categories", id), { nameKo: name, nameEn: id });
  }

  // 프로모션
  for (const promo of promos) {
    batch.set(doc(db, "promos", promo.code), promo);
  }

  await batch.commit();

  // 제품 (개별 처리 - media 포함)
  for (const product of products) {
    const { id, ...data } = product;
    await setDoc(doc(db, "products", id), { ...data, createdAt: serverTimestamp() });
  }

  return true;
}

// Export Firebase instances for direct use if needed
export { db, storage, serverTimestamp };
