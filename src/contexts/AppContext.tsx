// src/contexts/AppContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser, IdTokenResult } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { UserData } from '../types';

export interface AppUser extends FirebaseUser {
  firestoreData?: UserData;
  isAdmin?: boolean;
  isStaffClaim?: boolean;
}

export interface AppContextType {
  currentUser: AppUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  refreshCurrentUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFirestoreData = useCallback(async (user: FirebaseUser): Promise<UserData | null> => {
    const userDocRef = doc(db, 'users', user.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      return userDocSnap.data() as UserData;
    }
    console.warn(`fetchFirestoreData: User document not found for UID: ${user.uid}`); // ユーザーが見つからない場合の警告
    return null;
  }, []);

  const refreshCurrentUser = useCallback(async () => {
    const firebaseAuthUser = auth.currentUser;
    if (firebaseAuthUser) {
      setLoading(true);
      try {
        await firebaseAuthUser.reload();
        const idTokenResult: IdTokenResult | undefined = await firebaseAuthUser.getIdTokenResult(true);
        const firestoreData = await fetchFirestoreData(firebaseAuthUser);

        console.log("AppContext (refresh) - firebaseAuthUser:", firebaseAuthUser);
        console.log("AppContext (refresh) - firestoreData:", firestoreData);

        setCurrentUser({
          ...firebaseAuthUser,
          firestoreData: firestoreData || undefined,
          isAdmin: idTokenResult?.claims.admin === true,
          isStaffClaim: idTokenResult?.claims.staff === true,
        });
        setError(null);
      } catch (e: any) {
        console.error("Error refreshing current user:", e);
        setError("ユーザー情報の更新に失敗しました。");
      } finally {
        setLoading(false);
      }
    } else {
      console.log("refreshCurrentUser: No firebase auth user found.");
      setCurrentUser(null); // ユーザーがいない場合はクリア
      setLoading(false); // ローディングも解除
    }
  }, [fetchFirestoreData]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseAuthUser) => {
      setLoading(true);
      setError(null);
      if (firebaseAuthUser) {
        try {
          const idTokenResult = await firebaseAuthUser.getIdTokenResult();
          const fetchedFirestoreData = await fetchFirestoreData(firebaseAuthUser);

          console.log("AppContext (onAuthStateChanged) - firebaseAuthUser UID:", firebaseAuthUser.uid);
          console.log("AppContext (onAuthStateChanged) - fetchedFirestoreData:", fetchedFirestoreData);
          console.log("AppContext (onAuthStateChanged) - isAdmin claim:", idTokenResult.claims.admin);
          console.log("AppContext (onAuthStateChanged) - isStaffClaim claim:", idTokenResult.claims.staff);

          setCurrentUser({
            ...firebaseAuthUser,
            firestoreData: fetchedFirestoreData || undefined,
            isAdmin: idTokenResult.claims.admin === true,
            isStaffClaim: idTokenResult.claims.staff === true,
          });
        } catch (e:any) {
          console.error("Auth state change - error fetching user data:", e);
          setError("ユーザーデータの読み込み中にエラーが発生しました。");
          // エラー時でも基本的なAuthユーザー情報だけでもセットする
          const idTokenResultOnError = await firebaseAuthUser.getIdTokenResult().catch(() => undefined);
          setCurrentUser({
            ...firebaseAuthUser,
            firestoreData: undefined, // Firestoreデータは取得失敗
            isAdmin: idTokenResultOnError?.claims.admin === true,
            isStaffClaim: idTokenResultOnError?.claims.staff === true,
          });
        }
      } else {
        console.log("AppContext (onAuthStateChanged) - No user, setting currentUser to null");
        setCurrentUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [fetchFirestoreData]);

  const logout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await auth.signOut();
      setCurrentUser(null);
    } catch (e: any) {
      console.error("Error signing out:", e);
      setError("ログアウト中にエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  const value = {
    currentUser,
    isAuthenticated: !!currentUser,
    loading,
    error,
    refreshCurrentUser,
    logout,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};