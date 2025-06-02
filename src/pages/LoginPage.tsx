// src/pages/LoginPage.tsx
import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../services/firebase"; // パスが正しいか確認
import { useNavigate, Link  } from "react-router-dom";

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState(""); // パスワードの代わりに生年月日
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); // エラーメッセージを初期化
    try {
      // ログイン試行時には生年月日をパスワードとして使用
      await signInWithEmailAndPassword(auth, email, birthDate);
      navigate("/admin"); // ログイン成功後に遷移するパス（例: /admin や /dashboard）
                          // "/" がトップページならそのままでOK
    } catch (err: any) { // エラーの型をanyまたはFirebaseErrorに
      console.error("Login error:", err); // コンソールに詳細なエラーを出力
      if (err.code) {
        switch (err.code) {
          case 'auth/user-not-found':
          case 'auth/wrong-password': // Firebase v9では 'auth/invalid-credential' に統合された可能性あり
          case 'auth/invalid-credential': // メールアドレスかパスワードが間違っている場合
            setError("メールアドレスまたは生年月日が間違っています。");
            break;
          case 'auth/invalid-email':
            setError("メールアドレスの形式が正しくありません。");
            break;
          case 'auth/too-many-requests':
            setError("試行回数が多すぎます。後でもう一度お試しください。");
            break;
          default:
            setError("ログインに失敗しました。もう一度お試しください。");
        }
      } else {
        setError("ログイン中に予期せぬエラーが発生しました。");
      }
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 bg-slate-900 p-6 rounded shadow">
      <h2 className="text-red-500 text-2xl font-bold mb-6 text-center">ログイン</h2> {/* text-center を追加 */}
      <form onSubmit={handleLogin}>
        {/* メールアドレス入力 */}
        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
            メールアドレス
          </label>
          <input
            id="email"
            type="email"
            placeholder="メールアドレスを入力"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required // 入力必須
            className="w-full p-2 bg-slate-800 text-white border border-slate-700 rounded focus:ring-red-500 focus:border-red-500 focus:bg-slate-700 placeholder-gray-500"
          />
        </div>

        {/* 生年月日入力 (パスワードの代わり) */}
        <div className="mb-6"> {/* 少しマージンを調整 */}
          <label htmlFor="birthDate" className="block text-sm font-medium text-gray-300 mb-1">
            生年月日（パスワードとして8桁）
          </label>
          <input
            id="birthDate"
            type="password" // 入力文字を隠すために type="password" を使用
            placeholder="例: 19960807"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            required // 入力必須
            minLength={8} // バリデーションのため
            maxLength={8} // バリデーションのため
            pattern="\d{8}" // 数字8桁のパターン (HTML5バリデーション)
            title="生年月日を8桁の数字で入力してください（例: 19960807）" // パターンエラー時のメッセージ
            className="w-full p-2 bg-slate-800 text-white border border-slate-700 rounded focus:ring-red-500 focus:border-red-500 focus:bg-slate-700 placeholder-gray-500"
          />
        </div>

        {error && (
          <p className="text-yellow-400 bg-red-900/30 p-3 rounded mb-4 text-sm"> {/* エラーメッセージのスタイル改善 */}
            {error}
          </p>
        )}

        <button
          type="submit"
          className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        >
          ログイン
        </button>
      </form>
      {
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-400">
            アカウントをお持ちでないですか？{' '}
            <Link to="/register" className="font-medium text-red-500 hover:text-red-400">
              新規登録はこちら
            </Link>
          </p>
        </div>
      }
    </div>
  );
};

export default LoginPage;