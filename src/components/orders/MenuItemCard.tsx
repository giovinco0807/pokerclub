
import React from 'react';
import { MenuItem as MenuItemType } from '../../types';
import Button from '../common/Button';

interface MenuItemProps {
  item: MenuItemType;
  onAddToCart: (item: MenuItemType) => void;
}

const MenuItemCard: React.FC<MenuItemProps> = ({ item, onAddToCart }) => {
  return (
    <div className="bg-neutral p-4 rounded-lg shadow-lg flex flex-col justify-between transition-all hover:shadow-xl hover:scale-105">
      <div>
        {item.image && (
          <img 
            src={item.image} 
            alt={item.name} 
            className="w-full h-32 object-cover rounded-md mb-3" 
            onError={(e) => { (e.target as HTMLImageElement).src = 'https://picsum.photos/200/200?grayscale'; }} // Fallback
          />
        )}
        <h4 className="text-lg font-semibold text-neutral-lightest mb-1">{item.name}</h4>
        <p className="text-2xl font-bold text-primary mb-2">¥{item.price.toLocaleString()}</p>
        {item.description && <p className="text-xs text-neutral-light mb-2">{item.description}</p>}
      </div>
      <Button onClick={() => onAddToCart(item)} fullWidth variant="secondary" size="sm" className="mt-auto">
        カートに追加
      </Button>
    </div>
  );
};

export default MenuItemCard;