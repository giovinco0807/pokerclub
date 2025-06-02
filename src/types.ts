// src/types.ts
import { Timestamp } from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';

export const TABLE_STATUS_OPTIONS = ["active", "inactive", "full", "maintenance"] as const;
export type TableStatusTuple = typeof TABLE_STATUS_OPTIONS;
export type TableStatus = TableStatusTuple[number];

export const CATEGORY_OPTIONS = ["ソフトドリンク", "アルコール", "軽食", "チップ"] as const;
export type CategoryTuple = typeof CATEGORY_OPTIONS;
export type Category = CategoryTuple[number];

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

// --- User & Auth 関連 ---
export interface UserData {
  pokerName?: string;
  fullName?: string;
  email: string;
  address?: string;
  phone?: string;
  birthDate?: string;
  idFrontUrl?: string;
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
  createdAt?: Timestamp;
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
  avatarApprovalStatus?: 'pending' | 'approved' | 'rejected' | null;
  
  // ★★★ 現在アクティブなゲームセッションのIDを追加 ★★★
  activeGameSessionId?: string | null; 
}

export interface UserWithId extends UserData {
  id: string;
  isAdminClientSide?: boolean;
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
  | "cancelled";                       

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
  tableNumber?: string;
  seatNumber?: string;
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
  processedBy?: string;
  notes?: string;
  updatedAt?: Timestamp;
}

// --- Table & Seat 関連 ---
export interface SeatData {
  seatNumber: number;
  userId: string | null;
  userPokerName: string | null;
  occupiedAt?: Timestamp | null;
  status?: "occupied" | "empty" | "reserved";
  currentStack?: number; 
}
export interface Seat extends SeatData {
  id: string;
}

// ★★★ GameName 型と GAME_NAME_OPTIONS 定数を TableData より前に定義 ★★★
export type GameName = "NLH" | "PLO" | "MIX" | "Blackjack" | "Baccarat" | "Other";
export const GAME_NAME_OPTIONS: GameName[] = ["NLH", "PLO", "MIX", "Blackjack", "Baccarat", "Other"];

export interface TableData {
  name: string;
  maxSeats: number;
  status?: TableStatus;
  gameType?: GameName | string; // GameName 型または自由入力   
  blindsOrRate?: string | null;   // テンプレートからコピー、または直接入力
  currentGameTemplateId?: string | null; 
  minBuyIn?: number;
  maxBuyIn?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
export interface Table extends TableData {
  id: string;
  seats?: Seat[]; 
}

// --- Game Template & Game Session 関連 (ランキング機能用) ---
export interface GameTemplate {
  id?: string;
  templateName: string;
  gameType: GameName;
  rateOrMinBet?: string | null;
  description?: string;
  isActive: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// ★★★ GameSession 型の定義 ★★★
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
  additionalChipsIn?: number;    // セッション中の追加引き出し総額 (デフォルト0)
  totalChipsIn: number;           // chipsIn + (additionalChipsIn || 0)
  
  chipsOut?: number | null;        
  profit?: number | null;          // chipsOut - totalChipsIn
  
  durationMinutes?: number | null; 

  playFeeCalculated?: number | null; 
  playFeeAppliedToBill?: boolean;  // プレイ代が会計に加算済みか (デフォルトfalse)

  seasonId?: string | null;        // シーズンID (ランキング用)
}
// ★★★ ここまで ★★★

// --- Announcement 関連 ---
export interface StoreAnnouncement {
  id?: string;
  title: string;
  text?: string;
  imageUrl?: string;
  link?: string;
  isPublished: boolean;
  sortOrder?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// --- Functions Response Types ---
export interface SetAdminClaimResponse {
  status: string;
  message: string;
}