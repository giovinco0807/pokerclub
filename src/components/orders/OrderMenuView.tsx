
import React, { useState } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { MenuItem as MenuItemType, OrderItem } from '../../types';
import Button from '../common/Button';
import MenuItem from './MenuItemCard';

const OrderMenuView: React.FC = () => {
  const { menuItems, addOrder, currentUser, error, clearError } = useAppContext();
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [orderMessage, setOrderMessage] = useState<string | null>(null);

  const addToCart = (menuItem: MenuItemType) => {
    setOrderMessage(null);
    if (error) clearError();
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.menuItemId === menuItem.id);
      if (existingItem) {
        return prevCart.map(item =>
          item.menuItemId === menuItem.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prevCart, { menuItemId: menuItem.id, quantity: 1, name: menuItem.name, price: menuItem.price }];
    });
  };

  const removeFromCart = (menuItemId: string) => {
    setOrderMessage(null);
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.menuItemId === menuItemId);
      if (existingItem && existingItem.quantity > 1) {
        return prevCart.map(item =>
          item.menuItemId === menuItemId ? { ...item, quantity: item.quantity - 1 } : item
        );
      }
      return prevCart.filter(item => item.menuItemId !== menuItemId);
    });
  };

  const getTotal = () => {
    return cart.reduce((total, item) => total + item.price * item.quantity, 0);
  };

  const handlePlaceOrder = () => {
    if (cart.length === 0) {
      setOrderMessage("カートは空です。");
      return;
    }
    if (!currentUser) {
      setOrderMessage("注文するにはログインしている必要があります。"); // This error is also in AppContext, consistent translation.
      return;
    }
    addOrder(cart);
    setCart([]); // Clear cart after order
    setOrderMessage("注文が正常に送信されました！スタッフがまもなく確認します。");
    setTimeout(() => setOrderMessage(null), 5000);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-secondary mb-6 font-condensed">ドリンクとチップを注文</h2>
      
      {error && (
        <div className="bg-red-700 border border-red-600 text-red-100 px-4 py-3 rounded relative mb-4" role="alert">
          <strong className="font-bold">エラー： </strong>
          <span className="block sm:inline">{error}</span>
          <button onClick={clearError} className="absolute top-0 bottom-0 right-0 px-4 py-3 text-red-100 hover:text-white">
            <span className="text-2xl leading-none">&times;</span>
          </button>
        </div>
      )}
      {orderMessage && (
        <div className={`px-4 py-3 rounded relative mb-4 ${orderMessage.includes("正常に送信されました") ? 'bg-green-600 border-green-500 text-green-100' : 'bg-yellow-600 border-yellow-500 text-yellow-100'}`} role="alert">
          {orderMessage}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {menuItems.map(item => (
          <MenuItem key={item.id} item={item} onAddToCart={() => addToCart(item)} />
        ))}
      </div>

      {cart.length > 0 && (
        <div className="mt-8 p-6 bg-neutral rounded-lg shadow-xl">
          <h3 className="text-2xl font-semibold text-secondary mb-4">ご注文内容</h3>
          <ul className="space-y-2 mb-4">
            {cart.map(item => (
              <li key={item.menuItemId} className="flex justify-between items-center p-2 bg-neutral-light rounded">
                <div>
                  <span className="text-neutral-lightest">{item.name}</span>
                  <span className="text-xs text-neutral-light ml-2">x {item.quantity}</span>
                </div>
                <div className="flex items-center">
                  <span className="text-neutral-lightest mr-4">¥{(item.price * item.quantity).toLocaleString()}</span>
                  <Button variant="danger" size="sm" onClick={() => removeFromCart(item.menuItemId)} className="p-1 leading-none text-xs">
                    削除
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-between items-center border-t border-neutral-light pt-4">
            <p className="text-xl font-bold text-neutral-lightest">合計： ¥{getTotal().toLocaleString()}</p>
            <Button variant="primary" size="lg" onClick={handlePlaceOrder}>
              注文する
            </Button>
          </div>
          <p className="text-xs text-neutral-light mt-2">
            チップ購入はチップ残高に追加されます。ドリンクの支払いはスタッフが対応します。
          </p>
        </div>
      )}
    </div>
  );
};

export default OrderMenuView;