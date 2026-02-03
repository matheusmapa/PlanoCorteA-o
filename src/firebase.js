import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore"; // <--- NOVO

const firebaseConfig = {
  apiKey: "AIzaSyACYH1e2FyvW0_xwbyePye_tPA2GB7BpQs",
  authDomain: "planodecorte-8c2d9.firebaseapp.com",
  projectId: "planodecorte-8c2d9",
  storageBucket: "planodecorte-8c2d9.firebasestorage.app",
  messagingSenderId: "816729895481",
  appId: "1:816729895481:web:b97c7089897216c28ed3e8"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app); // <--- Exportar o banco de dados
