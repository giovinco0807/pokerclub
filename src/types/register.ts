import { z } from 'zod';
import { registerSchema } from '@/schemas/registerSchema';

export interface RegisterFormData {
  pokerName: string;
  fullName: string;
  email: string;
  address: string;
  phone: string;
  birthDate: string;
  idFront: FileList;
  idBack?: FileList;
}

