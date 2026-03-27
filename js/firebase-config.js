import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const firebaseConfig = {
  projectId: "planisweb-ipave",
  appId: "1:210839028220:web:6a99f2a2af358d2c59b279",
  storageBucket: "planisweb-ipave.firebasestorage.app",
  apiKey: "AIzaSyALyf_MKKaPxLLEYPnCEx24OK4phEWzAVc",
  authDomain: "planisweb-ipave.firebaseapp.com",
  messagingSenderId: "210839028220",
  projectNumber: "210839028220",
  version: "2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
