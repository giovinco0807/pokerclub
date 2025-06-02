// tailwind.config.js
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mincho: ['"游明朝"', 'YuMincho', '"Hiragino Mincho ProN"', 'serif'], // 明朝体
      },
      colors: {
        background: '#000000',
        text: '#ff0000',
      }
    },
  },
  plugins: [],
};
