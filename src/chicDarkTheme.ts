// src/chicDarkTheme.ts
import { createTheme, responsiveFontSizes } from '@mui/material/styles';

// Google Fonts を使用する場合、別途HTMLファイルで読み込むか、
// @font-face で定義する必要があります。
// 例: public/index.html に <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Lato:wght@300;400;700&display=swap" rel="stylesheet"> を追加

let chicDarkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#B08D57', // 落ち着いたゴールド
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#4A5D6A', // ダークスレートブルー
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#1A1A1A', // 非常に暗いチャコールグレー
      paper: '#2C2C2C',   // カードなどの背景 (少し明るめのダークグレー)
    },
    text: {
      primary: '#EAEAEA',   // ライトグレー
      secondary: '#B0B0B0', // 中間的なグレー (説明文など)
    },
    divider: 'rgba(176, 141, 87, 0.2)', // プライマリカラーベースの区切り線
    action: {
        active: '#B08D57',
        hover: 'rgba(176, 141, 87, 0.08)',
        selected: 'rgba(176, 141, 87, 0.16)',
        disabled: 'rgba(255, 255, 255, 0.3)',
        disabledBackground: 'rgba(255, 255, 255, 0.12)',
    }
  },
  typography: {
    fontFamily: '"Lato", "Helvetica", "Arial", sans-serif',
    h4: {
      fontFamily: '"Playfair Display", serif',
      fontWeight: 700,
      color: '#B08D57', // プライマリカラー
    },
    h6: {
      fontFamily: '"Playfair Display", serif',
      fontWeight: 600,
      fontSize: '1.35rem',
      letterSpacing: '0.02em',
    },
    subtitle1: {
        fontFamily: '"Lato", sans-serif',
        fontSize: '1.1rem',
        fontWeight: 700,
    },
    body1: {
        fontFamily: '"Lato", sans-serif',
        fontSize: '1rem',
        lineHeight: 1.6,
    },
    body2: {
      fontFamily: '"Lato", sans-serif',
      fontSize: '0.9rem',
      lineHeight: 1.5,
      color: '#B0B0B0',
    },
    button: {
      fontFamily: '"Lato", sans-serif',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${'rgba(176, 141, 87, 0.2)'}`, // プライマリカラーの薄い枠線
          boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.2)', // ソフトな影
        }
      }
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 4,
          padding: '8px 20px',
        },
        containedPrimary: {
          // ゴールドボタンの文字色は、テーマの contrastText に '#FFFFFF' を指定しているので白になります。
          // もし黒など他の色にしたい場合は、ここで color を指定します。
          // color: '#1A1A1A',
          backgroundColor: '#B08D57',
          '&:hover': {
            backgroundColor: '#94713D',
            boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.15)',
          },
        },
        outlinedPrimary: {
            borderColor: '#B08D57',
            color: '#B08D57',
            '&:hover': {
                borderColor: '#94713D',
                backgroundColor: 'rgba(176, 141, 87, 0.04)',
            }
        }
      },
    },
    MuiChip: {
        styleOverrides: {
            root: {
                fontFamily: '"Lato", sans-serif',
                fontWeight: 'bold',
                borderRadius: 8,
                backgroundColor: 'rgba(176, 141, 87, 0.15)',
                color: '#B08D57',
                border: '1px solid rgba(176, 141, 87, 0.3)',
            }
        }
    },
    MuiDivider: {
        styleOverrides: {
            root: {
                borderColor: 'rgba(176, 141, 87, 0.2)',
            }
        }
    }
  },
});

chicDarkTheme = responsiveFontSizes(chicDarkTheme);

export default chicDarkTheme;