// src/components/common/ConfirmationModal.tsx
import React from 'react';
import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Button, useTheme } from '@mui/material'; // useTheme をインポート

export interface ConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmButtonColor?: 'inherit' | 'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning';
  scaleFactor?: number; // ★ scaleFactor プロパティを追加 (オプショナル)
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "OK",
  cancelText = "キャンセル",
  confirmButtonColor = "primary",
  scaleFactor = 1, // ★ デフォルト値を設定
}) => {
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
        return baseValue.toString();
      }
    }
    return `${numericValue * scaleFactor}${originalUnit}`;
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="confirmation-dialog-title"
      aria-describedby="confirmation-dialog-description"
      PaperProps={{
        sx: {
          bgcolor: 'slate.800',
          color: 'neutral.lightest',
          border: '1px solid',
          borderColor: 'slate.700',
          // モーダルの幅などもスケールに応じて調整可能
          // minWidth: getScaledValue(300, 'px'), // 例
        }
      }}
    >
      <DialogTitle
        id="confirmation-dialog-title"
        sx={{
          color: 'sky.400',
          borderBottom:1,
          borderColor:'slate.700',
          fontSize: getScaledValue(theme.typography.h6.fontSize ?? '1.25rem'),
          px: getScaledValue(theme.spacing(3)), // titleのpaddingも調整
          py: getScaledValue(theme.spacing(1.5)),
        }}
      >
        {title}
      </DialogTitle>
      <DialogContent sx={{
        pt: getScaledValue(theme.spacing(2.5)),
        px: getScaledValue(theme.spacing(3)), // contentのpaddingも調整
      }}>
        <DialogContentText
          id="confirmation-dialog-description"
          sx={{
            color: 'slate.300',
            whiteSpace: 'pre-line',
            fontSize: getScaledValue(theme.typography.body1.fontSize ?? '1rem')
          }}
        >
          {typeof message === 'string' ? message.split('\n').map((line, index) => (
            <React.Fragment key={index}>{line}<br/></React.Fragment>
          )) : message}
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{
        borderTop:1,
        borderColor:'slate.700',
        px: getScaledValue(theme.spacing(3)),
        py: getScaledValue(theme.spacing(1.5)),
      }}>
        <Button onClick={onClose} sx={{color: 'slate.400', '&:hover': {bgcolor: 'slate.700'}, fontSize: getScaledValue(theme.typography.button.fontSize ?? '0.875rem')}}>
          {cancelText}
        </Button>
        <Button onClick={onConfirm} color={confirmButtonColor} variant="contained" autoFocus sx={{bgcolor: `${confirmButtonColor}.main`, fontSize: getScaledValue(theme.typography.button.fontSize ?? '0.875rem')}}>
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmationModal;