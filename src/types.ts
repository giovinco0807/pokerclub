// src/types.ts
import { Timestamp } from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';

export const TABLE_STATUS_OPTIONS = ["active", "inactive", "full", "maintenance"] as const;
export type TableStatusTuple = typeof TABLE_STATUS_OPTIONS;
export type TableStatus = TableStatusTuple[number];

export const CATEGORY_OPTIONS = ["ソフトドリンク", "アルコール", "軽食", "チップ"] as const;
export type CategoryTuple = typeof CATEGORY_OPTIONS;
export type Category = CategoryTuple[number];

// チップ金種の定義
export interface ChipDenomination {
  value: number;
  label: string;
  color?: string;
}

export const DEFAULT_CHIP_DENOMINATIONS: ChipDenomination[] = [
  { value: 10000, label: '10kP' },
  { value: 5000, label: '5kP' },
  { value: 1000, label: '1kP' },
  { value: 500, label: '500P' },
  { value: 100, label: '100P' },
  { value: 25, label: '25P' },
];

// ゲーム名の型と選択肢
export type GameName = "NLH" | "PLO" | "MIX" | "Blackjack" | "Baccarat" | "Other";
export const GAME_NAME_OPTIONS: GameName[] = ["NLH", "PLO", "MIX", "Blackjack", "Baccarat", "Other"];

// --- User & Auth 関連 ---
export interface UserData {
  pokerName?: string;
  fullName?: string;
  email: string;
  address?: string;
  phone?: string;
  birthDate?: string;
  idFrontUrl?: string | null;
  idBackUrl?: string | null;
  chips: number;
  chipsInPlay: number;
  bill: number;
  isCheckedIn: boolean;
  approved: boolean;
  isStaff?: boolean;
  checkedInAt?: Timestamp | Date;
  checkedOutAt?: Timestamp | Date;
  currentTableId?: string | null;
  currentSeatNumber?: number | null;
  createdAt?: Timestamp; // ★ 新規ユーザー登録時に設定
  updatedAt?: Timestamp;
  pendingChipSettlement?: {
    tableId: string;
    seatNumber: number;
    adminEnteredTotalChips: number;
    denominationsCount: { [denominationValue: string]: number };
    initiatedBy: string;
    initiatedAt: Timestamp;
  } | null;
  avatarUrl?: string | null;
  pendingAvatarUrl?: string | null;
  avatarApproved?: boolean;
  avatarApprovalStatus?: 'pending' | 'approved' | 'rejected' | null | ""; // "" も許容
  activeGameSessionId?: string | null;

  // ★ 会計ボタン関連で追加 ★
  lastPaymentType?: string; // 例: 'cash_admin_reset'
  lastPaymentAt?: Timestamp;
}

export interface UserWithId extends UserData {
  id: string;
  isAdminClientSide?: boolean; // クライアント側での判定用 (カスタムクレームとは別)
}

export interface AppUser extends FirebaseUser {
  firestoreData?: UserData;
  isAdmin?: boolean;
  isStaffClaim?: boolean;
}

// --- Menu & Order 関連 ---
export interface DrinkMenuItem {
  id?: string;
  name: string;
  category: Category;
  price: number;
  description?: string;
  imageUrl?: string;
  isAvailable: boolean;
  sortOrder?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ChipPurchaseOption {
  id?: string;
  name: string;
  chipsAmount: number;
  priceYen: number;
  description?: string;
  isAvailable: boolean;
  sortOrder?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

interface BaseCartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  description?: string;
}
export interface CartDrinkItem extends BaseCartItem {
  itemType: 'drink';
  category: Category;
  imageUrl?: string;
}
export interface CartChipItem extends BaseCartItem {
  itemType: 'chip';
  chipsAmount: number;
}
export type CartItem = CartDrinkItem | CartChipItem;

export interface OrderItemData {
  itemId: string;
  itemName: string;
  itemCategory?: Category;
  chipsAmount?: number;
  quantity: number;
  unitPrice: number;
  totalItemPrice: number;
  itemType: 'drink' | 'chip';
}

export type OrderStatus =
  | "pending"
  | "preparing"
  | "delivered_awaiting_confirmation"
  | "completed"
  | "cancelled"
  | "failed"; // 失敗ステータスも追加

export interface Order {
  id?: string;
  userId: string;
  userPokerName?: string;
  userEmail?: string;
  items: OrderItemData[];
  totalOrderPrice: number;
  orderStatus: OrderStatus;
  orderedAt: Timestamp;
  adminProcessedAt?: Timestamp;
  adminDeliveredAt?: Timestamp;
  customerConfirmedAt?: Timestamp;
  completedAt?: Timestamp;
  notes?: string;
  tableNumber?: string; // 以前のテーブル番号 (文字列型)
  seatNumber?: string;  // 以前の座席番号 (文字列型)
  updatedAt?: Timestamp;
  paymentDetails?: {
    chipPurchaseStatus?: "success" | "failed" | "pending";
    chipsAwarded?: number;
    chipsPriceYen?: number;
    chipResponseMessage?: string;
    error?: string;
  }
}

export type WithdrawalRequestStatus =
  | "pending_approval"
  | "approved_preparing"
  | "delivered_awaiting_confirmation"
  | "completed"
  | "denied";

export interface WithdrawalRequest {
  id?: string;
  userId: string;
  userPokerName?: string;
  userEmail?: string;
  requestedChipsAmount: number;
  status: WithdrawalRequestStatus;
  requestedAt: Timestamp;
  adminProcessedAt?: Timestamp;
  adminDeliveredAt?: Timestamp;
  customerConfirmedAt?: Timestamp;
  processedBy?: string; // 管理者/スタッフのUID
  notes?: string;
  updatedAt?: Timestamp;
}

// --- Table & Seat 関連 ---
export interface SeatData {
  seatNumber: number;
  userId: string | null;
  userPokerName: string | null;
  occupiedAt?: Timestamp | null;
  status?: "occupied" | "empty" | "reserved"; // "reserved" も追加
  currentStack?: number;
}
export interface Seat extends SeatData {
  id: string; // 座席番号をIDとして使用する場合 string
}

export interface TableData {
  name: string;
  maxSeats: number;
  status?: TableStatus;
  gameType?: GameName | string; // GameTemplateが設定されていればそれが優先される
  blindsOrRate?: string | null; // GameTemplateが設定されていればそれが優先される
  currentGameTemplateId?: string | null; // 適用されているゲームテンプレートのID
  minBuyIn?: number; // GameTemplateからコピー、または手動設定
  maxBuyIn?: number; // GameTemplateからコピー、または手動設定
  createdAt?: Timestamp | Date; // Date型も許容 (Firestoreから取得時はTimestamp)
  updatedAt?: Timestamp | Date; // Date型も許容
}
export interface Table extends TableData {
  id: string;
  seats?: Seat[];
}

// --- Game Template & Game Session & Waiting List 関連 ---
export interface GameTemplate {
  id?: string;                 // Firestore document ID
  templateName: string;       // 管理者が識別するためのテンプレート名
  gameType: GameName;         // ゲームの種類
  blindsOrRate?: string | null; // ★★★ フィールド名を blindsOrRate に修正 ★★★
  description?: string;        // ゲームの説明 (任意)
  minPlayers?: number;         // ★★★ 追加 ★★★
  maxPlayers?: number;         // ★★★ 追加 ★★★
  estimatedDurationMinutes?: number; // ★★★ 追加 ★★★
  notesForUser?: string;       // ★★★ 追加 ★★★
  isActive: boolean;          // このテンプレートでウェイティングリストを現在アクティブにするか
  sortOrder?: number;          // ★★★ 追加 ★★★
  createdAt?: Timestamp | Date;
  updatedAt?: Timestamp | Date;
}

export type WaitingListEntryStatus = "waiting" | "called" | "seated" | "cancelled_by_user" | "cancelled_by_admin" | "no_show";

export interface WaitingListEntry {
  id?: string; // Firestore document ID
  userId: string;
  userPokerNameSnapshot?: string; // 登録時のポーカーネーム (表示用)
  gameTemplateId: string;
  requestedAt: Timestamp;
  status: WaitingListEntryStatus;
  notes?: string;          // ユーザーからの備考
  adminNotes?: string;     // 管理者からの備考
  calledAt?: Timestamp;    // 呼び出し日時
  seatedAt?: Timestamp;    // 着席日時 (実際にテーブルに着席した日時)
  cancelledAt?: Timestamp; // キャンセル日時
  callCount?: number;      // 呼び出し回数
}

// ウェイティングリスト表示用にユーザー情報を付加した型
export interface WaitingListEntryWithUser extends WaitingListEntry {
  user?: UserWithId; // ユーザーの詳細情報 (任意で含める)
  isCurrentUserCheckedIn?: boolean; // ★ ウェイティングリスト表示調整用 ★
}


export interface GameSession {
  id?: string;
  userId: string;
  userPokerName?: string;

  tableId: string;
  tableName?: string;
  seatNumber: number;

  gameTypePlayed: GameName | string;
  ratePlayed?: string | null;

  sessionStartTime: Timestamp;
  sessionEndTime?: Timestamp | null;

  chipsIn: number;
  additionalChipsIn?: number;
  totalChipsIn: number;

  chipsOut?: number | null;
  profit?: number | null;

  durationMinutes?: number | null;

  playFeeCalculated?: number | null;
  playFeeAppliedToBill?: boolean;

  minBuyIn?: number; // セッション開始時のテーブルの最小バイイン
  maxBuyIn?: number; // セッション開始時のテーブルの最大バイイン

  seasonId?: string | null;
}

// --- Announcement 関連 ---
export interface StoreAnnouncement {
  id?: string;
  title: string;
  text?: string;
  imageUrl?: string;
  link?: string;
  isPublished: boolean;
  sortOrder?: number;
  createdAt: Timestamp; // FirestoreのTimestamp型を期待
  updatedAt: Timestamp; // FirestoreのTimestamp型を期待
}

// --- Functions Response Types ---
export interface SetAdminClaimResponse {
  status: string;
  message: string;
}