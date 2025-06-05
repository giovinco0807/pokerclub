// src/components/orders/OrderMenuView.tsx
import React from 'react';
import { DrinkMenuItem, ChipPurchaseOption, Category } from '../../types';
import MenuItemCard from './MenuItemCard';
import { Grid, Typography, Box, useTheme } from '@mui/material'; // useTheme をインポート

interface OrderMenuViewProps {
  items: (DrinkMenuItem | ChipPurchaseOption)[];
  onItemSelect: (item: DrinkMenuItem | ChipPurchaseOption) => void;
  itemType: 'drink' | 'chip';
  scaleFactor?: number; // ★ scaleFactor プロパティを追加 (オプショナル)
}

const OrderMenuView: React.FC<OrderMenuViewProps> = ({ items, onItemSelect, itemType, scaleFactor = 1 }) => {
  const theme = useTheme(); // テーマを取得

  // OrderPage.tsx にあった getScaledFontSize と同様のヘルパー関数
  // もしくは共通化して import する
  const getScaledValue = (baseValue: string | number, unit: 'px' | 'rem' | '' = ''): string => {
    let numericValue: number;
    let originalUnit: string = unit;

    if (typeof baseValue === 'number') {
      numericValue = baseValue;
    } else {
      const match = baseValue.match(/^(\d+\.?\d*)(.*)$/);
      if (match) {
        numericValue = parseFloat(match[1]);
        originalUnit = match[2] || unit;
      } else {
        // 数値として解釈できない場合は元の値をそのまま返すか、エラー処理
        return baseValue.toString();
      }
    }
    return `${numericValue * scaleFactor}${originalUnit}`;
  };


  if (!items || items.length === 0) {
    return <Typography sx={{ textAlign: 'center', color: 'slate.400', py: 3, fontSize: getScaledValue(theme.typography.body1.fontSize ?? '1rem') }}>現在利用可能な商品はありません。</Typography>;
  }

  const groupedItems: { [key in Category]?: (DrinkMenuItem | ChipPurchaseOption)[] } = {};
  if (itemType === 'drink' && items.every(item => 'category' in item)) {
    items.forEach(item => {
      const drinkItem = item as DrinkMenuItem;
      if (!groupedItems[drinkItem.category]) {
        groupedItems[drinkItem.category] = [];
      }
      groupedItems[drinkItem.category]!.push(drinkItem);
    });
  }

  const categoriesToDisplay = itemType === 'drink' ? Object.keys(groupedItems) as Category[] : [];

  return (
    <Box>
      {itemType === 'drink' && categoriesToDisplay.length > 0 ? (
        categoriesToDisplay.map(category => (
          <Box key={category} sx={{ mb: getScaledValue(theme.spacing(4)) }}>
            <Typography variant="h6" sx={{
              color: 'sky.300',
              borderBottom: 1,
              borderColor: 'slate.700',
              pb: getScaledValue(theme.spacing(1)),
              mb: getScaledValue(theme.spacing(2)),
              fontSize: getScaledValue(theme.typography.h6.fontSize ?? '1.25rem')
            }}>
              {category}
            </Typography>
            <Grid container spacing={getScaledValue(theme.spacing(2))}>
              {(groupedItems[category] || []).map(item => (
                <Grid item xs={12} sm={6} md={4} key={item.id}>
                  {/* MenuItemCard にも scaleFactor を渡す必要があれば、同様に修正 */}
                  <MenuItemCard item={item} onSelect={() => onItemSelect(item)} itemType={itemType} scaleFactor={scaleFactor} />
                </Grid>
              ))}
            </Grid>
          </Box>
        ))
      ) : (
        <Grid container spacing={getScaledValue(theme.spacing(2))}>
          {items.map(item => (
            <Grid item xs={12} sm={6} md={4} key={item.id}>
              {/* MenuItemCard にも scaleFactor を渡す必要があれば、同様に修正 */}
              <MenuItemCard item={item} onSelect={() => onItemSelect(item)} itemType={itemType} scaleFactor={scaleFactor} />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
};

export default OrderMenuView;