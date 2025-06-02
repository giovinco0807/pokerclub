// src/pages/OrderPage.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import {
  getAvailableDrinkMenuItems,
  getAvailableChipPurchaseOptions,
} from '../services/menuService';
import {
  DrinkMenuItem,
  ChipPurchaseOption,
  CartItem,
  CartDrinkItem,
  CartChipItem,
  OrderItemData,
  Category, // DrinkMenuItemが使用
} from '../types'; // types.ts からインポート

import { db } from '../services/firebase'; // Firestoreインスタンス
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore'; // updateDoc を追加
import { getFunctions, httpsCallable } from 'firebase/functions'; // HttpsCallableResult は通常不要

const OrderPage: React.FC = () => {
  const { currentUser, loading: appContextLoading } = useAppContext(); // appContextLoading を取得
  const navigate = useNavigate();

  const [drinkMenu, setDrinkMenu] = useState<DrinkMenuItem[]>([]);
  const [chipOptions, setChipOptions] = useState<ChipPurchaseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  const fetchMenuData = useCallback(async () => {
    if (!currentUser) {
      setLoading(false);
      setError("メニューを表示するにはログインしてください。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [drinks, chips] = await Promise.all([
        getAvailableDrinkMenuItems(),
        getAvailableChipPurchaseOptions(),
      ]);
      setDrinkMenu(drinks);
      setChipOptions(chips);
    } catch (err: any) {
      console.error("メニューデータの取得に失敗 (OrderPage):", err);
      setError("メニューデータの読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchMenuData();
  }, [fetchMenuData]);

  const handleAddToCart = (item: DrinkMenuItem | ChipPurchaseOption, type: 'drink' | 'chip') => {
    setCart(prevCart => {
      const itemId = item.id; 
      if (!itemId) {
        console.error("カート追加エラー: アイテムIDが存在しません。", item);
        setError("カートにアイテムを追加できませんでした。アイテム情報が不完全です。");
        return prevCart;
      }

      const existingItemIndex = prevCart.findIndex(cartItem => cartItem.id === itemId && cartItem.itemType === type);

      if (existingItemIndex > -1) {
        const updatedCart = [...prevCart];
        updatedCart[existingItemIndex].quantity += 1;
        return updatedCart;
      } else {
        let newItem: CartItem;
        if (type === 'drink') {
          const drinkItem = item as DrinkMenuItem;
          newItem = {
            id: itemId,
            name: drinkItem.name,
            price: drinkItem.price,
            quantity: 1,
            itemType: 'drink',
            category: drinkItem.category,
            imageUrl: drinkItem.imageUrl,
          };
        } else { 
          const chipItem = item as ChipPurchaseOption;
          newItem = {
            id: itemId,
            name: chipItem.name,
            price: chipItem.priceYen,
            quantity: 1,
            itemType: 'chip',
            chipsAmount: chipItem.chipsAmount,
          };
        }
        return [...prevCart, newItem];
      }
    });
    setSuccessMessage(`「${item.name}」をカートに追加しました。`);
    setTimeout(() => setSuccessMessage(''), 2000);
  };

  const handleIncreaseQuantity = (cartItemId: string) => {
    setCart(prevCart =>
      prevCart.map(cartItem =>
        (cartItem.id === cartItemId)
          ? { ...cartItem, quantity: cartItem.quantity + 1 }
          : cartItem
      )
    );
  };

  const handleDecreaseQuantity = (cartItemId: string) => {
    setCart(prevCart => {
      const itemIndex = prevCart.findIndex(cartItem => cartItem.id === cartItemId);
      if (itemIndex === -1) return prevCart;
      
      const updatedCart = [...prevCart];
      if (updatedCart[itemIndex].quantity > 1) {
        updatedCart[itemIndex].quantity -= 1;
        return updatedCart;
      } else {
        return updatedCart.filter((_, index) => index !== itemIndex);
      }
    });
  };

  const handleRemoveFromCart = (cartItemId: string) => {
    setCart(prevCart => prevCart.filter(cartItem => cartItem.id !== cartItemId));
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  }, [cart]);

  const handlePlaceOrder = async () => {
    if (!currentUser || cart.length === 0) {
      setError("カートが空か、ログインしていません。");
      return;
    }
    setIsSubmittingOrder(true);
    setError('');
    setSuccessMessage('');

    const itemsForFirestoreOrder: OrderItemData[] = [];
    const itemsForChipPurchaseFunction: { chipOptionId: string; quantity: number }[] = [];

    cart.forEach(cartItem => {
      itemsForFirestoreOrder.push({
        itemId: cartItem.id,
        itemName: cartItem.name,
        quantity: cartItem.quantity,
        unitPrice: cartItem.price,
        totalItemPrice: cartItem.price * cartItem.quantity,
        itemType: cartItem.itemType,
        ...(cartItem.itemType === 'drink' && { itemCategory: (cartItem as CartDrinkItem).category }),
        ...(cartItem.itemType === 'chip' && { chipsAmount: (cartItem as CartChipItem).chipsAmount }),
      });

      if (cartItem.itemType === 'chip') {
        itemsForChipPurchaseFunction.push({
          chipOptionId: cartItem.id,
          quantity: cartItem.quantity,
        });
      }
    });

    let orderDocId: string | null = null;

    try {
      if (itemsForFirestoreOrder.length > 0) {
        const orderDataForFirestore = {
          userId: currentUser.uid,
          userPokerName: currentUser.firestoreData?.pokerName || currentUser.email?.split('@')[0] || '不明',
          userEmail: currentUser.email || '',
          items: itemsForFirestoreOrder,
          totalOrderPrice: cartTotal,
          orderStatus: "pending" as const,
          orderedAt: serverTimestamp(),
          paymentDetails: {}, 
        };
        const docRef = await addDoc(collection(db, "orders"), orderDataForFirestore);
        orderDocId = docRef.id;
        console.log("Order document created with ID:", orderDocId);
      }

      if (itemsForChipPurchaseFunction.length > 0) {
        // ★★★ Firebase Functions のリージョンを指定 ★★★
        const functions = getFunctions(undefined, 'asia-northeast1'); 
        const purchaseChipsCallable = httpsCallable< // 型名の重複を避けるためエイリアスは削除
          { itemsToPurchase: { chipOptionId: string; quantity: number }[] },
          { status: string; message: string; totalChipsAwarded?: number; totalPriceYen?: number }
        >(functions, 'purchaseChips');
        
        console.log("Calling purchaseChips function with:", itemsForChipPurchaseFunction);
        const result = await purchaseChipsCallable({ itemsToPurchase: itemsForChipPurchaseFunction });
        const resultData = result.data;

        if (resultData.status === 'success') {
          setSuccessMessage(`注文完了！ ${resultData.message}`);
          if (orderDocId) {
            const orderRef = doc(db, "orders", orderDocId);
            await updateDoc(orderRef, {
              orderStatus: itemsForFirestoreOrder.some(item => item.itemType === 'drink') ? "pending" : "completed",
              "paymentDetails.chipPurchaseStatus": "success",
              "paymentDetails.chipsAwarded": resultData.totalChipsAwarded,
              "paymentDetails.chipsPriceYen": resultData.totalPriceYen,
              "paymentDetails.chipResponseMessage": resultData.message,
              updatedAt: serverTimestamp(),
            });
          }
        } else {
          throw new Error(resultData.message || "チップ購入処理でFunctionがエラーを返しました。");
        }
      } else if (itemsForFirestoreOrder.some(item => item.itemType === 'drink')) {
        setSuccessMessage("ドリンクの注文を受け付けました！");
         if (orderDocId) {
            const orderRef = doc(db, "orders", orderDocId);
            await updateDoc(orderRef, { orderStatus: "pending", updatedAt: serverTimestamp() });
         }
      } else {
        setError("注文する商品がありません。");
        setIsSubmittingOrder(false);
        return;
      }

      setCart([]); 
      setTimeout(() => { 
        setSuccessMessage(''); 
      }, 4000);

    } catch (e: any) {
      console.error("注文処理エラー (OrderPage):", e); // ★ エラーログにファイル名を追加
      let displayError = "注文処理中にエラーが発生しました。";
      if (e.code && e.message) { 
         displayError = `エラー (${e.code}): ${e.message}`;
      } else if (e.message) {
        displayError = e.message; // Firebase Functionからのカスタムエラーメッセージなど
      }
      setError(displayError);
      if (orderDocId) {
        try {
            const orderRef = doc(db, "orders", orderDocId);
            await updateDoc(orderRef, { 
                orderStatus: "failed", 
                "paymentDetails.chipPurchaseStatus": "failed",
                "paymentDetails.error": e.message || "Unknown error during order processing",
                updatedAt: serverTimestamp(),
            });
        } catch (updateError) {
            console.error("Failed to update order status to 'failed' (OrderPage):", updateError); // ★ エラーログにファイル名を追加
        }
      }
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // appContextLoading とローカルの loading state の両方を考慮
  if (appContextLoading || loading) { 
    return <div className="text-center p-10 text-xl text-slate-300">情報を読み込み中...</div>;
  }
  
  if (!currentUser && !appContextLoading) { // appContextLoading完了後、currentUserがいなければエラー
      return <div className="text-center p-10 text-xl text-yellow-400">{error || "このページを表示するにはログインが必要です。"}</div>;
  }
  
  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 text-neutral-lightest">
      <div className="flex justify-between items-center mb-8 pb-3 border-b border-slate-700">
        <h1 className="text-3xl font-bold text-red-500">ご注文メニュー</h1>
        <Link to="/" className="text-sky-400 hover:text-sky-300 hover:underline text-sm">← メインページに戻る</Link>
      </div>

      {successMessage && <div className="mb-4 p-3 bg-green-700/80 text-white rounded-md text-sm fixed top-20 right-5 z-50 shadow-lg animate-fadeIn">{successMessage}</div>}
      {error && <div className="mb-4 p-3 bg-red-700/80 text-white rounded-md text-sm fixed top-20 right-5 z-50 shadow-lg animate-fadeIn">{error}</div>}

      {/* カート表示セクション */}
      {cart.length > 0 && (
        <section className="mb-10 p-6 bg-slate-700 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-green-400 mb-4">現在のカート ({cart.reduce((sum, item) => sum + item.quantity, 0)}点)</h2>
          <ul className="space-y-3 mb-4 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
            {cart.map(item => (
              <li key={`${item.itemType}-${item.id}`} className="flex justify-between items-center border-b border-slate-600 pb-2 last:border-b-0">
                <div className="flex-grow min-w-0">
                  <p className="text-white font-medium truncate pr-2" title={item.name}>{item.name}</p>
                  <p className="text-xs text-slate-400">単価: {item.price.toLocaleString()}円 x {item.quantity}点</p>
                </div>
                <div className="flex items-center flex-shrink-0">
                    <p className="text-sm text-amber-400 mr-3 w-20 text-right">{(item.price * item.quantity).toLocaleString()}円</p>
                    <button onClick={() => handleDecreaseQuantity(item.id)} className="px-2 py-0.5 bg-slate-600 hover:bg-slate-500 rounded text-lg font-bold">-</button>
                    <span className="px-2 text-white">{item.quantity}</span>
                    <button onClick={() => handleIncreaseQuantity(item.id)} className="px-2 py-0.5 bg-slate-600 hover:bg-slate-500 rounded text-lg font-bold">+</button>
                    <button onClick={() => handleRemoveFromCart(item.id)} className="ml-2 text-red-500 hover:text-red-400 text-xs">削除</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="text-right mb-4 mt-4 pt-4 border-t border-slate-600">
            <p className="text-xl font-bold text-white">合計: <span className="text-green-400">{cartTotal.toLocaleString()}円</span></p>
          </div>
          <button
            onClick={handlePlaceOrder}
            disabled={isSubmittingOrder || cart.length === 0}
            className={`w-full px-6 py-3 font-semibold rounded-lg transition-colors text-lg ${isSubmittingOrder || cart.length === 0 ? 'bg-slate-500 text-slate-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg'}`}
          >
            {isSubmittingOrder ? '注文処理中...' : `この内容で注文する (${cartTotal.toLocaleString()}円)`}
          </button>
        </section>
      )}

      {/* ドリンクメニューセクション */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-amber-400 mb-6">ドリンク</h2>
        {appContextLoading || loading && !drinkMenu.length ? (<p className="text-slate-400">ドリンクメニューを読み込み中...</p>) : 
         !loading && drinkMenu.length === 0 ? (<p className="text-slate-400">現在ご注文いただけるドリンクはありません。</p>) :
        (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {drinkMenu.map(item => (
              <div key={item.id} className="bg-slate-800 p-5 rounded-lg shadow-lg hover:shadow-red-500/20 transition-shadow duration-300 flex flex-col justify-between">
                <div>
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt={item.name} className="w-full h-40 object-cover rounded mb-3 shadow-md" 
                         onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  )}
                  {!item.imageUrl && <div className="w-full h-40 bg-slate-700 rounded mb-3 flex items-center justify-center text-slate-500 text-sm">画像なし</div>}
                  <h3 className="text-xl font-semibold text-white mb-1 truncate" title={item.name}>{item.name}</h3>
                  <p className="text-sm text-slate-400 mb-1">{item.category}</p>
                  {item.description && <p className="text-xs text-slate-500 my-2 leading-relaxed h-12 overflow-y-auto custom-scrollbar">{item.description}</p>}
                </div>
                <div className="mt-auto pt-3">
                  <p className="text-2xl font-bold text-amber-300 mb-3">{item.price.toLocaleString()} 円</p>
                  <button 
                    onClick={() => handleAddToCart(item, 'drink')} 
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
                  >
                    カートに追加
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* チップ購入セクション */}
      <section>
        <h2 className="text-2xl font-semibold text-green-400 mb-6">チップ購入</h2>
        {appContextLoading || loading && !chipOptions.length ? (<p className="text-slate-400">チップオプションを読み込み中...</p>) :
         !loading && chipOptions.length === 0 ? (<p className="text-slate-400">現在購入可能なチップオプションはありません。</p>) :
        (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {chipOptions.map(option => (
              <div key={option.id} className="bg-slate-800 p-5 rounded-lg shadow-lg hover:shadow-green-500/20 transition-shadow duration-300 flex flex-col justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-white mb-1 truncate" title={option.name}>{option.name}</h3>
                  <p className="text-2xl font-bold text-green-300 my-2">{option.chipsAmount.toLocaleString()} チップ</p>
                  {option.description && <p className="text-xs text-slate-500 my-2 h-10 overflow-y-auto custom-scrollbar">{option.description}</p>}
                </div>
                <div className="mt-auto pt-3">
                  <p className="text-xl font-bold text-green-300 mb-3">{option.priceYen.toLocaleString()}円</p>
                  <button 
                    onClick={() => handleAddToCart(option, 'chip')} 
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
                  >
                    カートに追加
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default OrderPage;