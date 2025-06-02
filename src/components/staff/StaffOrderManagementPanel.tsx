
import React from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { Order } from '../../types';
import Button from '../common/Button';

const StaffOrderManagementPanel: React.FC = () => {
  const { orders, updateOrderStatus, menuItems, currentUser } = useAppContext();

  // In a real app, staff would see ALL orders.
  // This demo shows all orders; could be filtered if needed for a specific staff's scope.
  const allOrders = orders; 

  const getStatusText = (status: Order['status']) => {
    switch (status) {
      case 'pending': return '保留中';
      case 'preparing': return '準備中';
      case 'ready': return '準備完了';
      case 'delivered': return '配達済み';
      case 'cancelled': return 'キャンセル済';
      default: return status;
    }
  };

  // A real app would fetch user details based on order.userId
  const getUserPokerName = (userId: string) => {
    // This is a simplified lookup for the demo.
    // In a real app, you'd query your user list/database.
    // For now, if the order's userId matches the logged-in staff's context (which is a user),
    // show that pokerName. This is a very rough approximation.
    // If we had access to 'allUsers' in context, that would be better.
    if (currentUser && currentUser.id === userId) {
        return currentUser.pokerName || userId.substring(0,8)+"...";
    }
    // If no match or no pokerName, show partial ID
    return userId.substring(0,8)+"...";
  };


  const handleUpdateStatus = (orderId: string, status: Order['status']) => {
    updateOrderStatus(orderId, status);
  };

  return (
    <div className="bg-neutral p-6 rounded-lg shadow-xl">
      <h3 className="text-xl font-semibold text-secondary mb-4">注文管理</h3>
      {allOrders.length === 0 ? (
        <p className="text-neutral-light">有効な注文はありません。</p>
      ) : (
        <div className="space-y-4">
          {allOrders.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(order => (
            <div key={order.id} className="p-4 border border-neutral-light rounded-md bg-neutral-dark bg-opacity-30">
              <div className="flex justify-between items-start mb-2">
                <div>
                    <p className="text-lg font-semibold text-neutral-lightest">注文ID: {order.id.substring(0,8)}...</p>
                    <p className="text-sm text-neutral-light">プレイヤー: {getUserPokerName(order.userId)}</p>
                    <p className="text-xs text-neutral-light">注文日時: {new Date(order.createdAt).toLocaleString()}</p>
                </div>
                <p className="text-xl font-bold text-primary-light">¥{order.totalAmount.toLocaleString()}</p>
              </div>
              
              <ul className="mb-3 text-sm space-y-1">
                {order.items.map(item => {
                  const menuItemDetail = menuItems.find(mi => mi.id === item.menuItemId);
                  return (
                    <li key={item.menuItemId} className="text-neutral-lightest">
                      {item.quantity} x {menuItemDetail?.name || item.menuItemId} 
                      <span className="text-neutral-light"> (@ ¥{menuItemDetail?.price.toLocaleString() || 'N/A'} 各)</span>
                    </li>
                  );
                })}
              </ul>

              <div className="flex items-center justify-between">
                <p className="text-sm text-neutral-light">現在のステータス: 
                  <span className={`ml-1 font-semibold ${
                    order.status === 'pending' ? 'text-yellow-400' :
                    order.status === 'delivered' ? 'text-green-400' :
                    order.status === 'cancelled' ? 'text-red-400' :
                    'text-blue-400' 
                  }`}>
                    {getStatusText(order.status).toUpperCase()}
                  </span>
                </p>
                <div className="flex space-x-2">
                  {order.status === 'pending' && (
                    <Button size="sm" variant="secondary" onClick={() => handleUpdateStatus(order.id, 'preparing')}>準備中にする</Button>
                  )}
                  {order.status === 'preparing' && (
                    <Button size="sm" variant="secondary" onClick={() => handleUpdateStatus(order.id, 'ready')}>準備完了にする</Button>
                  )}
                  {order.status === 'ready' && (
                    <Button size="sm" variant="primary" onClick={() => handleUpdateStatus(order.id, 'delivered')}>配達済みにする</Button>
                  )}
                  {order.status !== 'delivered' && order.status !== 'cancelled' && (
                     <Button size="sm" variant="danger" onClick={() => handleUpdateStatus(order.id, 'cancelled')}>注文をキャンセル</Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StaffOrderManagementPanel;