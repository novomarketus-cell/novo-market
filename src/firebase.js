import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  orderBy,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyDCQ6jdlGAdGskr5jibgGVqSZx6z0GKYMc",
  authDomain: "novo-market-us.firebaseapp.com",
  projectId: "novo-market-us",
  storageBucket: "novo-market-us.firebasestorage.app",
  messagingSenderId: "410563440677",
  appId: "1:410563440677:web:f7e1ef5742457660c4cfcc",
  measurementId: "G-YRMQRGMNYX",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

// ═══════════════════════════════════════════
// AUTH (Firebase Authentication — email/password)
// ═══════════════════════════════════════════

export async function loginAdmin(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function logoutAdmin() {
  await fbSignOut(auth);
}

// Subscribe to auth state changes. Callback receives the current user or null.
// Returns an unsubscribe function.
export function subscribeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

// ═══════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════

export function subscribeProducts(callback) {
  const q = query(collection(db, "products"));
  return onSnapshot(q, (snapshot) => {
    const products = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(products);
  });
}

export async function addProduct(data) {
  const { id, ...rest } = data;
  await setDoc(doc(db, "products", id), rest);
}

export async function updateProduct(id, data) {
  await updateDoc(doc(db, "products", id), data);
}

export async function deleteProduct(id) {
  await deleteDoc(doc(db, "products", id));
}

// Update the `order` field on many products at once (drag-and-drop reorder).
// `orderedIds` is an array of product IDs in the desired display order.
// Uses Firestore batched writes — atomic, single round-trip.
// Firestore caps batches at 500 operations; that's plenty for a catalog.
export async function reorderProducts(orderedIds) {
  const batch = writeBatch(db);
  orderedIds.forEach((id, index) => {
    batch.update(doc(db, "products", id), { order: index });
  });
  await batch.commit();
}

// ═══════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════

export function subscribeOrders(callback) {
  const q = query(collection(db, "orders"));
  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map((doc) => ({
      _docId: doc.id,
      ...doc.data(),
    }));
    callback(orders);
  });
}

export async function addOrder(data) {
  const docRef = await addDoc(collection(db, "orders"), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateOrderStatus(docId, status) {
  await updateDoc(doc(db, "orders", docId), { status });
}

export async function updateOrderField(docId, fields) {
  await updateDoc(doc(db, "orders", docId), fields);
}

export async function deleteOrder(docId) {
  await deleteDoc(doc(db, "orders", docId));
}

// ═══════════════════════════════════════════
// ATOMIC STOCK DEDUCTION (prevents race condition)
// ═══════════════════════════════════════════
// items: [{ id, qty, name }]
// Throws error if any product is missing or stock is insufficient.
export async function deductStockTransaction(items) {
  await runTransaction(db, async (transaction) => {
    const refs = items.map((it) => ({
      item: it,
      ref: doc(db, "products", it.id),
    }));
    // Read all first
    const snaps = [];
    for (const r of refs) {
      const snap = await transaction.get(r.ref);
      if (!snap.exists()) {
        throw new Error(`PRODUCT_NOT_FOUND:${r.item.name || r.item.id}`);
      }
      const current = snap.data().stock || 0;
      if (current < r.item.qty) {
        throw new Error(
          `INSUFFICIENT_STOCK:${r.item.name || r.item.id}:${current}`
        );
      }
      snaps.push({ ref: r.ref, current, qty: r.item.qty });
    }
    // Then write
    for (const s of snaps) {
      transaction.update(s.ref, { stock: s.current - s.qty });
    }
  });
}

// ═══════════════════════════════════════════
// ATOMIC STOCK RESTORATION (reverse of deduction)
// ═══════════════════════════════════════════
// items: [{ id, qty }]
export async function restoreStockTransaction(items) {
  if (!items || items.length === 0) return;
  await runTransaction(db, async (transaction) => {
    const refs = items.map((it) => ({
      item: it,
      ref: doc(db, "products", it.id),
    }));
    const snaps = [];
    for (const r of refs) {
      const snap = await transaction.get(r.ref);
      if (!snap.exists()) continue; // product may have been deleted
      const current = snap.data().stock || 0;
      snaps.push({ ref: r.ref, current, qty: r.item.qty });
    }
    for (const s of snaps) {
      transaction.update(s.ref, { stock: s.current + s.qty });
    }
  });
}

// ═══════════════════════════════════════════
// CANCEL ORDER (set status + restore stock atomically)
// ═══════════════════════════════════════════
export async function cancelOrderWithRestock(docId, items) {
  await restoreStockTransaction(items);
  await updateDoc(doc(db, "orders", docId), { status: "cancelled" });
}

// ═══════════════════════════════════════════
// DELETE ORDER (restore stock + remove document)
// ═══════════════════════════════════════════
export async function deleteOrderWithRestock(docId, items) {
  await restoreStockTransaction(items);
  await deleteDoc(doc(db, "orders", docId));
}

// ═══════════════════════════════════════════
// ADJUST STOCK FOR ORDER EDITS
// ═══════════════════════════════════════════
// oldItems & newItems: [{ id, qty }]
// Calculates diff and deducts/restores accordingly
export async function adjustStockForOrderEdit(oldItems, newItems) {
  const diff = {};
  for (const it of oldItems) diff[it.id] = -(it.qty || 0);
  for (const it of newItems) diff[it.id] = (diff[it.id] || 0) + (it.qty || 0);
  const toDeduct = [];
  const toRestore = [];
  for (const [id, delta] of Object.entries(diff)) {
    if (delta > 0) toDeduct.push({ id, qty: delta });
    if (delta < 0) toRestore.push({ id, qty: -delta });
  }
  if (toRestore.length > 0) await restoreStockTransaction(toRestore);
  if (toDeduct.length > 0) await deductStockTransaction(toDeduct);
}

// Subscribe to orders filtered by phone number (for customer order history)
export function subscribeOrdersByPhone(phone, callback) {
  const q = query(collection(db, "orders"), where("phone", "==", phone));
  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map((doc) => ({
      _docId: doc.id,
      ...doc.data(),
    }));
    callback(orders);
  });
}

// ═══════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════

export function subscribeCategories(callback) {
  const q = query(collection(db, "categories"));
  return onSnapshot(q, (snapshot) => {
    const cats = {};
    snapshot.docs.forEach((doc) => {
      cats[doc.id] = doc.data();
    });
    callback(cats);
  });
}

export async function saveCategory(id, data) {
  await setDoc(doc(db, "categories", id), data);
}

export async function deleteCategory(id) {
  await deleteDoc(doc(db, "categories", id));
}

// ═══════════════════════════════════════════
// PROMOS
// ═══════════════════════════════════════════

export function subscribePromos(callback) {
  const q = query(collection(db, "promos"));
  return onSnapshot(q, (snapshot) => {
    const promos = snapshot.docs.map((doc) => ({
      _docId: doc.id,
      ...doc.data(),
    }));
    callback(promos);
  });
}

export async function addPromo(data) {
  await setDoc(doc(db, "promos", data.code), data);
}

export async function updatePromo(code, data) {
  await updateDoc(doc(db, "promos", code), data);
}

export async function deletePromo(code) {
  await deleteDoc(doc(db, "promos", code));
}

// ═══════════════════════════════════════════
// MEDIA UPLOAD (Firebase Storage)
// ═══════════════════════════════════════════

export async function uploadProductMedia(productId, file, index) {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `products/${productId}/${index}_${Date.now()}.${ext}`;
  const fileRef = storageRef(storage, path);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);
  return url;
}
