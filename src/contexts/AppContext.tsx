// src/contexts/AppContext.tsx (修正例)
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser, IdTokenResult } from 'firebase/auth';
import { auth, db } from '../services/firebase'; // firebase.ts からインポート
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { UserData } from '../types'; // UserData型をインポート

export interface AppUser extends FirebaseUser {
  firestoreData?: UserData;
  isAdmin?: boolean;
  isStaffClaim?: boolean; // staffクレームも保持する場合
}

export interface AppContextType {
  currentUser: AppUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  refreshCurrentUser: () => Promise<void>; // ★★★ refreshCurrentUser の型定義を追加 ★★★
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
    return null;
  }, []);

  // ★★★ refreshCurrentUser 関数の実装 ★★★
  const refreshCurrentUser = useCallback(async () => {
    const firebaseAuthUser = auth.currentUser;
    if (firebaseAuthUser) {
      setLoading(true); // 再取得中のローディング表示
      try {
        await firebaseAuthUser.reload(); // Firebase Authユーザー情報をリロード
        const idTokenResult: IdTokenResult | undefined = await firebaseAuthUser.getIdTokenResult(true); // IDトークンを強制更新して最新のカスタムクレームを取得
        const firestoreData = await fetchFirestoreData(firebaseAuthUser);
        
        setCurrentUser({
          ...firebaseAuthUser,
          firestoreData: firestoreData || undefined,
          isAdmin: idTokenResult?.claims.admin === true,
          isStaffClaim: idTokenResult?.claims.staff === true, // staffクレームも考慮
        });
        setError(null);
      } catch (e: any) {
        console.error("Error refreshing current user:", e);
        setError("ユーザー情報の更新に失敗しました。");
        // ここで setCurrentUser(null) にするかどうかは要件による
      } finally {
        setLoading(false);
      }
    }
  }, [fetchFirestoreData]); // fetchFirestoreDataを依存配列に追加

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseAuthUser) => {
      setLoading(true);
      setError(null);
      if (firebaseAuthUser) {
        try {
          const idTokenResult = await firebaseAuthUser.getIdTokenResult();
          const firestoreData = await fetchFirestoreData(firebaseAuthUser);

          setCurrentUser({
            ...firebaseAuthUser,
            firestoreData: firestoreData || undefined,
            isAdmin: idTokenResult.claims.admin === true,
            isStaffClaim: idTokenResult.claims.staff === true,
          });
        } catch (e:any) {
          console.error("Auth state change - error fetching user data:", e);
          setError("ユーザーデータの読み込み中にエラーが発生しました。");
          setCurrentUser(firebaseAuthUser); // 基本的なAuthユーザー情報だけでもセットする
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [fetchFirestoreData]); // fetchFirestoreDataを依存配列に追加

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
    refreshCurrentUser, // ★★★ value に refreshCurrentUser を追加 ★★★
    logout, // ★★★ logout を追加 ★★★
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