// Import MenuItem type from ./types
import { MenuItem, StoreAnnouncement } from './types';

export const APP_NAME = "広島ポーカー倶楽部";
export const GEMINI_MODEL_TEXT = "gemini-2.5-flash-preview-04-17";
export const HOURLY_PLAY_RATE = 1000; // Yen per hour (example)
export const ADMIN_EMAIL = 'admin@hpc.com'; // Administrator email
export const STAFF_EMAIL = 'staff@hpc.com'; // General staff email (can be same as admin or different)

export const MOCK_MENU_ITEMS: MenuItem[] = [
  { id: 'drink-1', name: 'ビール', type: 'drink', price: 600, image: 'https://picsum.photos/id/142/100/100' },
  { id: 'drink-2', name: 'ハイボール', type: 'drink', price: 500, image: 'https://picsum.photos/id/163/100/100' },
  { id: 'drink-3', name: 'ソフトドリンク', type: 'drink', price: 300, image: 'https://picsum.photos/id/211/100/100' },
  { id: 'chips-1', name: 'チップ追加 (1000点)', type: 'chips_purchase', price: 1000, description: 'チップを1000点追加' },
  { id: 'chips-2', name: 'チップ追加 (5000点)', type: 'chips_purchase', price: 5000, description: 'チップを5000点追加' },
];

export const POKER_HAND_RANKINGS = [
  "ロイヤルフラッシュ", "ストレートフラッシュ", "フォー・オブ・ア・カインド", "フルハウス", "フラッシュ",
  "ストレート", "スリー・オブ・ア・カインド", "ツーペア", "ワンペア", "ハイカード"
];

export const MOCK_ANNOUNCEMENT: StoreAnnouncement = {
  id: 'anno-1',
  title: '週末特別トーナメント開催！',
  text: '今週末、参加費無料の特別ポーカー大会を開催します！豪華景品をご用意してお待ちしております。詳細はスタッフまでお問い合わせください。初心者の方も大歓迎です！奮ってご参加ください。',
  imageUrl: 'https://picsum.photos/id/237/600/300', // Example image
  createdAt: new Date().toISOString(),
  link: '#' // Optional link for more details
};