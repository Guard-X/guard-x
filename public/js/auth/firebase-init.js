// firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCX-gR9hxdcTsobQxO19dbWg1SIVqJHvUo",
  authDomain: "project-guard-x.firebaseapp.com",
  projectId: "project-guard-x",
  storageBucket: "project-guard-x.firebasestorage.app",
  messagingSenderId: "1087505680893",
  appId: "1:1087505680893:web:df1573d6f6afa9b3d9b194",
  measurementId: "G-8L2L6CRRQN"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); // ✅ Add this

export { auth, db }; // ✅ Export db
//public/js/auth/firebase-init.js