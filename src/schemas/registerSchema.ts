import { z } from 'zod';

export const registerSchema = z.object({
  pokerName: z.string().min(1, 'ポーカーネームは必須です'),
  fullName: z.string().min(1, '氏名は必須です'),
  email: z.string().email('有効なメールアドレスを入力してください'),
  address: z.string().min(1, '住所は必須です'),
  phone: z.string().min(1, '電話番号は必須です'),
  birthDate: z.string().min(8, '生年月日は8桁で入力してください').max(8, '生年月日は8桁で入力してください'), // maxも追加すると良い
  idFront: z
    .custom<FileList>((val) => val instanceof FileList, {
      message: "身分証（表）のファイル形式が不正です。",
    })
    .refine((files) => files.length > 0, '身分証（表）の画像を選択してください')
    .refine((files) => files[0] instanceof File, '身分証（表）はファイルである必要があります'),
    // .refine((files) => files[0]?.size <= MAX_FILE_SIZE, `ファイルサイズは${MAX_FILE_SIZE/1024/1024}MB以下にしてください。`) // ファイルサイズ制限の例
    // .refine((files) => ACCEPTED_IMAGE_TYPES.includes(files[0]?.type), "対応していないファイル形式です。") // ファイル形式制限の例
  idBack: z
    .custom<FileList>((val) => val instanceof FileList, {
      message: "身分証（裏）のファイル形式が不正です。",
    })
    .refine((files) => files.length === 0 || (files.length > 0 && files[0] instanceof File), {
      message: '身分証（裏）が選択された場合は、有効なファイルである必要があります',
    })
    .optional(),
    // 同様にファイルサイズや形式の制限も追加可能
    avatarFile: z.custom<FileList>() // FileList型を期待
    .refine(files => !files || files.length === 0 || files[0]?.size <= 2 * 1024 * 1024, `アイコン画像は2MB以下にしてください。`) // 例: 2MB制限
    .refine(files => !files || files.length === 0 || ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(files[0]?.type), "対応形式: jpg, png, gif, webp")
    .optional(), 
});