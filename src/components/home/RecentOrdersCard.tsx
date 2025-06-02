import React from 'react';
import { Order } from '../../types';

interface RecentOrdersCardProps {
  orders: Order[];
}

const RecentOrdersCard: React.FC<RecentOrdersCardProps> = ({ orders }) => {
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

  return (
    <div className="bg-neutral p-6 rounded-lg shadow-xl">
      <h3 className="text-xl font-semibold text-secondary mb-4">最近の注文</h3>
      {orders.length === 0 ? (
        <p className="text-neutral-light">最近の注文はありません。</p>
      ) : (
        <ul className="space-y-3">
          {orders.map(order => (
            <li key={order.id} className="p-3 bg-neutral-light rounded-md shadow hover:shadow-lg transition-shadow">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-neutral-lightest font-semibold">
                    注文ID： <span className="font-normal">{order.id.substring(0, 8)}...</span>
                  </p>
                  <p className="text-xs text-neutral-light">
                    {new Date(order.createdAt).toLocaleString()} - {order.items.reduce((acc, item) => acc + item.quantity, 0)} 品
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-primary-light">¥{order.totalAmount.toLocaleString()}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    order.status === 'pending' ? 'bg-yellow-500 text-yellow-900' :
                    order.status === 'delivered' ? 'bg-green-500 text-green-900' :
                    order.status === 'cancelled' ? 'bg-red-500 text-red-900' :
                    'bg-blue-500 text-blue-900' // preparing, ready
                  }`}>
                    {getStatusText(order.status)}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default RecentOrdersCard;