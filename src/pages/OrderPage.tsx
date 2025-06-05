// src/pages/OrderPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { DrinkMenuItem, ChipPurchaseOption, CartItem, Order, OrderItemData, OrderStatus } from '../types';
import { getAllDrinkMenuItems, getAvailableChipPurchaseOptions } from '../services/menuService';
import { Link, useNavigate } from 'react-router-dom';
import { db, auth } from '../services/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable, HttpsCallableResult } from 'firebase/functions';
import OrderMenuView from '../components/orders/OrderMenuView';
import { CircularProgress, Typography, Box, Paper, Button as MuiButton, Alert, Tabs, Tab, Badge, Container, Grid, IconButton, useTheme } from '@mui/material';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt'; // 標準サイズに戻すアイコン例
import ConfirmationModal, { ConfirmationModalProps } from '../components/common/ConfirmationModal';

const OrderPage: React.FC = () => {
  const { currentUser, loading: appContextLoading, refreshCurrentUser } = useAppContext();
  const navigate = useNavigate();
  const theme = useTheme(); // Material UIのテーマを取得

  const [drinkMenuItems, setDrinkMenuItems] = useState<DrinkMenuItem[]>([]);
  const [chipPurchaseOptions, setChipPurchaseOptions] = useState<ChipPurchaseOption[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderSuccessMessage, setOrderSuccessMessage] = useState<string | null>(null);

  const [currentTab, setCurrentTab] = useState<'drinks' | 'chips'>('drinks');
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  // 表示サイズ調整のための状態
  const [scaleFactor, setScaleFactor] = useState(1);
  const minScale = 0.8;
  const maxScale = 1.5;
  const scaleStep = 0.1;

  const fetchMenuData = useCallback(async () => {
    setLoadingMenu(true);
    setError(null);
    try {
      const [drinks, chips] = await Promise.all([
        getAllDrinkMenuItems(),
        getAvailableChipPurchaseOptions()
      ]);
      setDrinkMenuItems(drinks);
      setChipPurchaseOptions(chips);
    } catch (err: any) {
      console.error("メニュー取得エラー (OrderPage):", err);
      setError("メニューの読み込みに失敗しました。");
    } finally {
      setLoadingMenu(false);
    }
  }, []);

  useEffect(() => {
    if (!appContextLoading) {
      if (currentUser) {
        fetchMenuData();
      } else {
        setError("注文機能を利用するにはログインが必要です。");
        setLoadingMenu(false);
      }
    }
  }, [appContextLoading, currentUser, fetchMenuData]);

  const addToCart = (item: DrinkMenuItem | ChipPurchaseOption, itemType: 'drink' | 'chip') => {
    setCart(prevCart => {
      const existingItem = prevCart.find(cartItem => cartItem.id === item.id && cartItem.itemType === itemType);
      if (existingItem) {
        return prevCart.map(cartItem =>
          cartItem.id === item.id && cartItem.itemType === itemType
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        );
      } else {
        if (itemType === 'drink') {
          const drink = item as DrinkMenuItem;
          return [...prevCart, { id: drink.id!, name: drink.name, price: drink.price, quantity: 1, itemType: 'drink', category: drink.category, imageUrl: drink.imageUrl }];
        } else {
          const chipOption = item as ChipPurchaseOption;
          return [...prevCart, { id: chipOption.id!, name: chipOption.name, price: chipOption.priceYen, chipsAmount: chipOption.chipsAmount, quantity: 1, itemType: 'chip' }];
        }
      }
    });
    setOrderSuccessMessage(null);
  };

  const removeFromCart = (itemId: string, itemType: 'drink' | 'chip') => {
    setCart(prevCart => {
      const existingItem = prevCart.find(cartItem => cartItem.id === itemId && cartItem.itemType === itemType);
      if (existingItem && existingItem.quantity > 1) {
        return prevCart.map(cartItem =>
          cartItem.id === itemId && cartItem.itemType === itemType
            ? { ...cartItem, quantity: cartItem.quantity - 1 }
            : cartItem
        );
      } else {
        return prevCart.filter(cartItem => !(cartItem.id === itemId && cartItem.itemType === itemType));
      }
    });
  };

  const clearCart = () => {
    setCart([]);
  };

  const getTotalPrice = () => {
    return cart.reduce((total, item) => total + item.price * item.quantity, 0);
  };
  const getTotalItems = () => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  };

  const handlePlaceOrder = async () => {
    if (!currentUser || !currentUser.uid) {
      setError("注文するにはログインが必要です。");
      return;
    }
    if (cart.length === 0) {
      setError("カートが空です。");
      return;
    }

    setIsConfirmModalOpen(false);
    setPlacingOrder(true);
    setError(null);
    setOrderSuccessMessage(null);

    const orderItems: OrderItemData[] = cart.map(item => ({
      itemId: item.id,
      itemName: item.name,
      itemCategory: item.itemType === 'drink' ? (item as any).category : null,
      chipsAmount: item.itemType === 'chip' ? (item as any).chipsAmount : null,
      quantity: item.quantity,
      unitPrice: item.price,
      totalItemPrice: item.price * item.quantity,
      itemType: item.itemType,
    }));

    const orderDataToSave: any = {
      userId: currentUser.uid,
      userPokerName: currentUser.firestoreData?.pokerName || currentUser.email?.split('@')[0] || '不明',
      userEmail: currentUser.email || '',
      items: orderItems,
      totalOrderPrice: getTotalPrice(),
      orderStatus: "pending",
      orderedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (currentUser.firestoreData?.currentTableId) {
      orderDataToSave.tableNumber = currentUser.firestoreData.currentTableId;
    }
    if (currentUser.firestoreData?.currentSeatNumber !== undefined && currentUser.firestoreData?.currentSeatNumber !== null) {
      orderDataToSave.seatNumber = currentUser.firestoreData.currentSeatNumber.toString();
    }

    let tempOrderId: string | null = null;

    try {
      console.log("OrderPage: Attempting to place order with data to save:", orderDataToSave);
      const orderDocRef = await addDoc(collection(db, 'orders'), orderDataToSave);
      tempOrderId = orderDocRef.id;
      console.log("OrderPage: Temporary order document created with ID:", tempOrderId);

      const chipItemsInCart = cart.filter(item => item.itemType === 'chip');
      if (chipItemsInCart.length > 0) {
        console.log("OrderPage: Chip items found in cart, calling purchaseChipsAndFinalizeOrder function...");
        const functions = getFunctions(undefined, 'asia-northeast1');
        const purchaseChipsFunction = httpsCallable<
            { orderId: string; cartItems: CartItem[]; userId: string; },
            { success: boolean; message: string; orderId?: string; newBill?: number }
        >(functions, 'purchaseChipsAndFinalizeOrder');

        const result = await purchaseChipsFunction({
            orderId: tempOrderId,
            cartItems: cart,
            userId: currentUser.uid
        });

        if (result.data.success) {
          setOrderSuccessMessage(result.data.message || "注文とチップ購入が完了しました！");
          setCart([]);
          if (refreshCurrentUser && typeof result.data.newBill === 'number') {
             await refreshCurrentUser();
          }
        } else {
          throw new Error(result.data.message || "チップ購入または注文処理に失敗しました。");
        }
      } else {
        setOrderSuccessMessage("注文を受け付けました！準備ができるまでお待ちください。");
        setCart([]);
        if (refreshCurrentUser) await refreshCurrentUser();
      }

    } catch (err: any) {
      console.error("注文処理エラー (OrderPage):", err);
      setError(`注文処理に失敗しました: ${err.message || '不明なエラーが発生しました。'}`);
      if (tempOrderId) {
        try {
          console.log(`OrderPage: Attempting to update order ${tempOrderId} status to 'failed'`);
          await updateDoc(doc(db, 'orders', tempOrderId), {
            orderStatus: "failed" as OrderStatus,
            updatedAt: serverTimestamp(),
            paymentDetails: { error: err.message || 'Unknown failure reason' }
          });
          console.log(`OrderPage: Successfully updated order ${tempOrderId} to 'failed'`);
        } catch (updateError: any) {
          console.error(`Failed to update order status to 'failed' (OrderPage):`, updateError);
        }
      }
    } finally {
      setPlacingOrder(false);
    }
  };

  // フォントサイズをスケールファクターに基づいて調整するヘルパー関数
  const getScaledFontSize = (baseFontSize: string | number): string => {
    if (typeof baseFontSize === 'number') {
      return `${baseFontSize * scaleFactor}px`;
    }
    // '1rem', '16px'のような文字列形式の場合、数値部分を抽出してスケールする
    const match = baseFontSize.match(/^(\d+\.?\d*)(.*)$/);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2];
      return `${value * scaleFactor}${unit}`;
    }
    return baseFontSize.toString(); // フォールバック
  };


  if (appContextLoading || loadingMenu) {
    return <Container sx={{py:4, display: 'flex', justifyContent:'center', alignItems:'center', flexDirection:'column'}}><CircularProgress sx={{mb:2}} /> <Typography>メニューを読み込み中...</Typography></Container>;
  }
  if (error && !currentUser) {
     return <Container sx={{py:4}}><Alert severity="warning">{error} <Link to="/login" className="underline hover:text-sky-300">ログインページへ</Link></Alert></Container>;
  }
  if (error) {
     return <Container sx={{py:4}}><Alert severity="error">{error}</Alert></Container>;
  }
  if (!currentUser) {
    return <Container sx={{py:4}}><Alert severity="info">注文機能を利用するにはログインが必要です。 <Link to="/login" className="underline hover:text-sky-300">ログイン</Link></Alert></Container>;
  }


  return (
    // sx の color: 'neutral.lightest' を削除し、テーマから継承
    <Container maxWidth="lg" sx={{ py: getScaledFontSize(theme.spacing(4)) /* パディングもスケール */ }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{
        fontWeight: 'bold',
        color: 'primary.main', // テーマのプライマリカラーを使用
        mb: getScaledFontSize(theme.spacing(3)),
        fontSize: getScaledFontSize(theme.typography.h4.fontSize!)
      }}>
        オーダー
      </Typography>

      {/* 表示サイズ調整ボタン */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
        <Typography sx={{fontSize: getScaledFontSize(theme.typography.body2.fontSize!)}}>表示サイズ:</Typography>
        <IconButton onClick={() => setScaleFactor(prev => Math.max(minScale, prev - scaleStep))} size="small" title="小さくする">
          <ZoomOutIcon sx={{fontSize: getScaledFontSize(theme.typography.h6.fontSize!)}} />
        </IconButton>
        <MuiButton onClick={() => setScaleFactor(1)} size="small" variant="outlined" sx={{fontSize: getScaledFontSize(theme.typography.button.fontSize!), p:getScaledFontSize(theme.spacing(0.5))}}>
          標準
        </MuiButton>
        <IconButton onClick={() => setScaleFactor(prev => Math.min(maxScale, prev + scaleStep))} size="small" title="大きくする">
          <ZoomInIcon sx={{fontSize: getScaledFontSize(theme.typography.h6.fontSize!)}} />
        </IconButton>
      </Box>

      {orderSuccessMessage && <Alert severity="success" sx={{mb:2, fontSize: getScaledFontSize(theme.typography.body2.fontSize!)}} onClose={() => setOrderSuccessMessage(null)}>{orderSuccessMessage}</Alert>}
      {error && !orderSuccessMessage && <Alert severity="error" sx={{mb:2, fontSize: getScaledFontSize(theme.typography.body2.fontSize!)}} onClose={() => setError(null)}>{error}</Alert>}


      <Grid container spacing={getScaledFontSize(theme.spacing(3))}>
        <Grid item xs={12} md={8}>
          <Paper sx={{
            p:0, // OrderMenuView内部でパディングを制御するため0に
            bgcolor:'slate.800',
            boxShadow:2,
            borderRadius: 2,
            overflow:'hidden'
          }}>
            <Tabs
                value={currentTab}
                onChange={(e, newValue) => setCurrentTab(newValue as 'drinks' | 'chips')}
                indicatorColor="secondary"
                textColor="inherit"
                variant="fullWidth"
                sx={{ bgcolor: 'slate.700', borderBottom: 1, borderColor: 'slate.600',
                      '& .MuiTab-root': {
                        color: 'slate.300',
                        fontWeight:'medium',
                        fontSize: getScaledFontSize(theme.typography.button.fontSize!),
                        '&.Mui-selected': {color: 'secondary.main'}
                      }
                }}
            >
                <Tab label="ドリンク・フード" value="drinks" />
                <Tab label="チップ購入" value="chips" />
            </Tabs>
            <Box sx={{p: getScaledFontSize(theme.spacing(2))}}>
            {currentTab === 'drinks' && (
                <OrderMenuView items={drinkMenuItems} onItemSelect={(item) => addToCart(item, 'drink')} itemType="drink" scaleFactor={scaleFactor} />
            )}
            {currentTab === 'chips' && (
                <OrderMenuView items={chipPurchaseOptions} onItemSelect={(item) => addToCart(item, 'chip')} itemType="chip" scaleFactor={scaleFactor} />
            )}
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{
            p: getScaledFontSize(theme.spacing(2.5)),
            bgcolor:'slate.800',
            boxShadow:2,
            borderRadius: 2,
            position: 'sticky',
            top: getScaledFontSize(theme.spacing(8.75)) // 70px をテーマのスペーシングとスケールで調整 (70/8 = 8.75)
            }}>
            <Typography variant="h6" sx={{
                color: 'sky.400',
                mb:getScaledFontSize(theme.spacing(2)),
                borderBottom:1,
                borderColor:'slate.700',
                pb:getScaledFontSize(theme.spacing(1)),
                fontSize: getScaledFontSize(theme.typography.h6.fontSize!)
            }}>
                現在のカート <Badge badgeContent={getTotalItems()} color="secondary" sx={{ml:1}}><ShoppingCartIcon sx={{fontSize: getScaledFontSize(theme.typography.h6.fontSize!)}}/></Badge>
            </Typography>
            {cart.length === 0 ? (
              <Typography sx={{color:'slate.400', textAlign:'center', py:getScaledFontSize(theme.spacing(3)), fontSize: getScaledFontSize(theme.typography.body1.fontSize!)}}>カートは空です。</Typography>
            ) : (
              <>
                <Box sx={{
                    maxHeight: `calc(100vh - ${getScaledFontSize(400)})`, // 400px部分もスケール
                    overflowY:'auto',
                    pr:getScaledFontSize(theme.spacing(1)),
                    mb:getScaledFontSize(theme.spacing(2)),
                    '&::-webkit-scrollbar': {width:getScaledFontSize(6)},
                    '&::-webkit-scrollbar-thumb': {backgroundColor:'slate.600', borderRadius:getScaledFontSize(3)}
                  }}>
                {cart.map(item => (
                  <Paper key={`${item.itemType}-${item.id}`} sx={{
                    display:'flex',
                    justifyContent:'space-between',
                    alignItems:'center',
                    mb:getScaledFontSize(theme.spacing(1.5)),
                    p:getScaledFontSize(theme.spacing(1.5)),
                    bgcolor:'slate.700/70',
                    borderRadius:1
                    }}>
                    <Box>
                      <Typography sx={{color:'slate.100', fontWeight:'medium', fontSize:getScaledFontSize(theme.typography.body2.fontSize!)}}>{item.name}</Typography>
                      <Typography sx={{color:'slate.400', fontSize:getScaledFontSize(theme.typography.caption.fontSize!)}}>
                        {item.price.toLocaleString()}円 x {item.quantity}
                        {item.itemType === 'chip' && ` (${(item as any).chipsAmount.toLocaleString()}チップ)`}
                      </Typography>
                    </Box>
                    <Box sx={{display:'flex', alignItems:'center'}}>
                      <MuiButton size="small" variant="outlined" onClick={() => removeFromCart(item.id, item.itemType)} sx={{minWidth:getScaledFontSize(30), p:getScaledFontSize(theme.spacing(0.25)), borderColor:'slate.500', color:'slate.300', mr:getScaledFontSize(theme.spacing(1)), fontSize: getScaledFontSize(theme.typography.button.fontSize!)}}>-</MuiButton>
                      <Typography sx={{minWidth:getScaledFontSize(20), textAlign:'center', color:'slate.200', fontSize: getScaledFontSize(theme.typography.body2.fontSize!)}}>{item.quantity}</Typography>
                      <MuiButton size="small" variant="outlined" onClick={() => addToCart(item.itemType === 'drink' ? drinkMenuItems.find(d=>d.id===item.id)! : chipPurchaseOptions.find(c=>c.id===item.id)!, item.itemType)} sx={{minWidth:getScaledFontSize(30), p:getScaledFontSize(theme.spacing(0.25)), borderColor:'slate.500', color:'slate.300', ml:getScaledFontSize(theme.spacing(1)), fontSize: getScaledFontSize(theme.typography.button.fontSize!)}}>+</MuiButton>
                    </Box>
                  </Paper>
                ))}
                </Box>
                <Box sx={{borderTop:1, borderColor:'slate.700', pt:getScaledFontSize(theme.spacing(2)), mt:getScaledFontSize(theme.spacing(2))}}>
                <Typography variant="h6" sx={{color:'slate.200', mb:getScaledFontSize(theme.spacing(1)), fontSize: getScaledFontSize(theme.typography.h6.fontSize!)}}>合計: <span className="font-bold text-amber-400">{getTotalPrice().toLocaleString()}円</span></Typography>
                <MuiButton variant="contained" color="secondary" fullWidth onClick={() => setIsConfirmModalOpen(true)} disabled={placingOrder} sx={{py:getScaledFontSize(theme.spacing(1.2)), fontWeight:'bold', bgcolor:'success.main', '&:hover':{bgcolor:'success.dark'}, fontSize: getScaledFontSize(theme.typography.button.fontSize!)}}>
                  {placingOrder ? <CircularProgress size={getScaledFontSize(24)} color="inherit"/> : '注文を確定する'}
                </MuiButton>
                {cart.length > 0 && (
                  <MuiButton variant="text" fullWidth onClick={clearCart} sx={{mt:getScaledFontSize(theme.spacing(1)), color:'slate.400', fontSize:getScaledFontSize(theme.typography.caption.fontSize!), '&:hover':{bgcolor:'slate.700'}}}>カートを空にする</MuiButton>
                )}
                </Box>
              </>
            )}
          </Paper>
        </Grid>
      </Grid>
      <ConfirmationModal
        open={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={handlePlaceOrder}
        title="注文内容の確認"
        message={`合計 ${getTotalPrice().toLocaleString()}円の注文を確定しますか？\nチップ購入が含まれる場合、現在の保有チップから${cart.filter(i => i.itemType==='chip').reduce((sum, i) => sum + i.price * i.quantity, 0).toLocaleString()}円が自動的に引かれます。`}
        confirmText="確定する"
        cancelText="キャンセル"
        scaleFactor={scaleFactor} // ConfirmationModalにもscaleFactorを渡す (内部でフォントサイズ調整が必要な場合)
      />
    </Container>
  );
};

export default OrderPage;