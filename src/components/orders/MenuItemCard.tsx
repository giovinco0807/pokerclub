// src/components/orders/MenuItemCard.tsx
import React from 'react';
import { DrinkMenuItem, ChipPurchaseOption } from '../../types';
import { Paper, Typography, Button, Box, Chip, useTheme, Divider } from '@mui/material'; // Divider を追加

export interface MenuItemProps {
  item: DrinkMenuItem | ChipPurchaseOption;
  onSelect: (item: DrinkMenuItem | ChipPurchaseOption) => void;
  itemType: 'drink' | 'chip';
  scaleFactor?: number;
}

const MenuItemCard: React.FC<MenuItemProps> = ({ item, onSelect, itemType, scaleFactor = 1 }) => {
  const theme = useTheme(); // chicDarkTheme がここに入る想定

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
        return baseValue.toString();
      }
    }
    return `${numericValue * scaleFactor}${originalUnit}`;
  };

  const isDrink = itemType === 'drink';
  const drinkItem = isDrink ? item as DrinkMenuItem : null;
  const chipItem = !isDrink ? item as ChipPurchaseOption : null;

  const handleSelect = () => {
    onSelect(item);
  };

  const displayPrice = isDrink ? (item as DrinkMenuItem).price : (item as ChipPurchaseOption).priceYen;
  const isAvailable = isDrink ? (item as DrinkMenuItem).isAvailable : (item as ChipPurchaseOption).isAvailable;

  // theme.typography からのフォントサイズ取得時のフォールバック
  const h6FontSize = theme.typography.h6?.fontSize || '1.35rem';
  const subtitle1FontSize = theme.typography.subtitle1?.fontSize || '1.1rem';
  const body2FontSize = theme.typography.body2?.fontSize || '0.9rem';
  const captionFontSize = theme.typography.caption?.fontSize || '0.75rem';
  const buttonFontSize = theme.typography.button?.fontSize || '0.875rem';

  return (
    <Paper
      // elevation は theme.components.MuiPaper.styleOverrides で設定された影が適用される
      // elevation={1} // よりフラットにするなら
      sx={{
        p: getScaledValue(theme.spacing(2.5)), // パディングを少し広めに
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        bgcolor: theme.palette.background.paper, // テーマの背景色(紙)
        color: theme.palette.text.primary,     // テーマの主要文字色
        // borderは theme.components.MuiPaper で設定される
        borderRadius: getScaledValue(theme.shape.borderRadius), // テーマの角丸設定を利用 (標準的)
        transition: 'transform 0.3s ease-out, box-shadow 0.3s ease-out',
        '&:hover': {
          transform: `translateY(${getScaledValue(-3, 'px')})`, // 控えめなホバー
          boxShadow: `0px 6px 16px rgba(0, 0, 0, 0.25)`, // 少し強調される影
        },
      }}
    >
      <Box>
        {isDrink && drinkItem?.imageUrl && (
          <Box
            component="img"
            src={drinkItem.imageUrl}
            alt={drinkItem.name}
            sx={{
              width: '100%',
              height: getScaledValue(180, 'px'), // 画像の高さを確保
              objectFit: 'cover',
              borderRadius: `${getScaledValue(theme.shape.borderRadius)} ${getScaledValue(theme.shape.borderRadius)} 0 0`,
              mb: getScaledValue(theme.spacing(2)),
            }}
          />
        )}
         {!isDrink && chipItem && (
            <Box sx={{
              display:'flex',
              flexDirection:'column',
              alignItems:'center',
              justifyContent:'center',
              height: getScaledValue(180, 'px'),
              mb:getScaledValue(theme.spacing(2)),
              bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.05)',
              borderRadius: theme.shape.borderRadius,
            }}>
                <Typography variant="h3" sx={{ // theme.typography.h3 を使うならそちらでフォント定義
                    color: theme.palette.primary.main, // プライマリカラー（ゴールド系）
                    fontFamily: '"Playfair Display", serif', // チップ量もエレガントに
                    fontSize: getScaledValue(theme.typography.h3?.fontSize || '2.5rem'),
                    fontWeight: 700,
                }}>
                    {chipItem.chipsAmount.toLocaleString()}
                </Typography>
                <Typography variant="overline" sx={{ // overline を使い、テーマでカスタマイズも可
                    color: theme.palette.text.secondary,
                    fontSize: getScaledValue(theme.typography.overline?.fontSize || '0.7rem'),
                    letterSpacing: '0.1em',
                }}>
                    CHIPS
                </Typography>
            </Box>
         )}
        <Typography
          variant="h6" // theme.typography.h6 のスタイルが適用される
          component="div"
          sx={{
            color: theme.palette.text.primary,
            minHeight: getScaledValue('2.6em'), // フォントサイズに応じた高さを確保 (1.3 * 2行分など)
            fontSize: getScaledValue(h6FontSize),
            fontFamily: theme.typography.h6.fontFamily, //テーマで設定したPlayfair Display
            letterSpacing: theme.typography.h6.letterSpacing,
            textAlign: 'center',
            mb: getScaledValue(theme.spacing(1)),
            lineHeight: 1.3, // エレガントなフォントは行間も重要
          }}
        >
          {item.name}
        </Typography>
        {(drinkItem?.description || chipItem?.description) && (
          <Typography
            variant="body2" // theme.typography.body2 のスタイルが適用される
            sx={{
              color: theme.palette.text.secondary,
              fontSize: getScaledValue(body2FontSize),
              mb: getScaledValue(theme.spacing(2)),
              minHeight: getScaledValue('3em'), // 2行分程度を想定
              textAlign: 'center',
              px: getScaledValue(theme.spacing(1)),
              lineHeight: theme.typography.body2.lineHeight, // テーマの行間
            }}
          >
            {drinkItem?.description || chipItem?.description}
          </Typography>
        )}
      </Box>

      <Divider sx={{ my: getScaledValue(theme.spacing(1)) }} /> {/* 区切り線 */}

      <Box sx={{ mt: 'auto', pt: getScaledValue(theme.spacing(1.5)) }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', mb: getScaledValue(theme.spacing(2)) }}>
          <Typography variant="subtitle1" sx={{ // theme.typography.subtitle1 を使用
            color: theme.palette.primary.main, // 価格もプライマリカラー（ゴールド系）で強調
            fontSize: getScaledValue(subtitle1FontSize),
            fontFamily: theme.typography.subtitle1.fontFamily,
            fontWeight: theme.typography.subtitle1.fontWeight,
          }}>
            {displayPrice.toLocaleString()} 円
          </Typography>
          {!isDrink && chipItem && (
            <Chip // theme.components.MuiChip.styleOverrides が適用される
              label={`${chipItem.chipsAmount.toLocaleString()} P`}
              size="medium" // 少し大きめに
              // sx propでさらに微調整も可能
              // sx={{ fontSize: getScaledValue(captionFontSize) }}
            />
          )}
        </Box>
        <Button
          variant="contained" // theme.components.MuiButton.styleOverrides.containedPrimary が適用
          color="primary"
          fullWidth
          onClick={handleSelect}
          disabled={!isAvailable}
          sx={{
            fontSize: getScaledValue(buttonFontSize), // テーマのボタンフォントサイズ
            fontFamily: theme.typography.button.fontFamily,
            letterSpacing: theme.typography.button.letterSpacing,
            // paddingは theme.components.MuiButton で設定されたものが適用される
            // 必要ならここで上書き: py: getScaledValue(theme.spacing(1.25)),
             '&.Mui-disabled': { // 無効時のスタイルもテーマに合わせる
                backgroundColor: theme.palette.action.disabledBackground,
                color: theme.palette.action.disabled,
            }
          }}
        >
          {isAvailable ? (isDrink ? 'カートに入れる' : 'チップを購入') : '品切れ中'}
        </Button>
      </Box>
    </Paper>
  );
};

export default MenuItemCard;