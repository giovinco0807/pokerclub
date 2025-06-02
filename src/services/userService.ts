import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
// userService.ts
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/services/firebase"; // firebase.tsでexportしていること
import { UserData } from '../types'; 

export const uploadIdImage = async (file: File, userId: string, type: "front" | "back") => {
  const storageRef = ref(storage, `idImages/${userId}/${type}`);
  const snapshot = await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(snapshot.ref);
  return downloadURL;
};
export const getUser = async (uid: string): Promise<UserData | null> => {
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        return docSnap.data() as UserData;
    } else {
        return null;
    }
};

export const createUser = async (uid: string, data: UserData): Promise<void> => {
    const docRef = doc(db, "users", uid);
    await setDoc(docRef, data);
};
