import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export const useFirestoreData = (user) => {
  const [projects, setProjects] = useState([]);
  const [savedPlans, setSavedPlans] = useState([]);
  const [inventory, setInventory] = useState([]);

  useEffect(() => {
    if (!user) return;

    // 1. Projetos (Demanda)
    const qProjects = query(collection(db, 'users', user.uid, 'projects'), orderBy('createdAt', 'desc'));
    const unsubProjects = onSnapshot(qProjects, (snapshot) => {
      setProjects(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. Planos Salvos (Output)
    const qPlans = query(collection(db, 'users', user.uid, 'cutPlans'), orderBy('createdAt', 'desc'));
    const unsubPlans = onSnapshot(qPlans, (snapshot) => {
      setSavedPlans(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 3. Estoque de Pontas
    const inventoryRef = doc(db, 'users', user.uid, 'appData', 'inventory');
    const unsubInventory = onSnapshot(inventoryRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().items) {
        setInventory(docSnap.data().items);
        localStorage.setItem('estoquePontas', JSON.stringify(docSnap.data().items));
      } else {
        // Tenta pegar do localstorage se não tiver no banco ainda
        const local = localStorage.getItem('estoquePontas');
        if (local) setInventory(JSON.parse(local));
      }
    });

    return () => {
      unsubProjects();
      unsubPlans();
      unsubInventory();
    };
  }, [user]);

  // Função para salvar estoque (Centralizada)
  const updateInventory = async (newInv) => {
    setInventory(newInv);
    localStorage.setItem('estoquePontas', JSON.stringify(newInv));
    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid, 'appData', 'inventory'), {
          items: newInv,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (e) { console.error("Erro ao salvar estoque:", e); }
    }
  };

  return { projects, savedPlans, inventory, updateInventory };
};
