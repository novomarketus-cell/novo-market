import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
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
