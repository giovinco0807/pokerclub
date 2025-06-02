import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: "AIzaSyBjEJJEoOsRfZPmdL2ADE5zHMj-5asQClI",
    authDomain: "hiroshima-pokerclub.firebaseapp.com",
    projectId: "hiroshima-pokerclub",
    storageBucket: "hiroshima-pokerclub.firebasestorage.app",
    messagingSenderId: "787041783171",
    appId: "1:787041783171:web:aa4fe8266e87e8ba5ebab6",
    measurementId: "G-M5Z8R2XRTP"
};

// Firebase 初期化
const app = initializeApp(firebaseConfig);

// Firestore を初期化してエクスポート
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app); 
export const firestore = getFirestore(app);
// （必要であれば）Analytics を初期化
getAnalytics(app);
