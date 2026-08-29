// ==============================================================================
// RASPANDO LA OLLA — DEFINICIONES DE TIPOS GLOBALES: PERFIL Y KYC
// ==============================================================================

export type VenezuelanState =
  | 'Amazonas'
  | 'Anzoátegui'
  | 'Apure'
  | 'Aragua'
  | 'Barinas'
  | 'Bolívar'
  | 'Carabobo'
  | 'Cojedes'
  | 'Delta Amacuro'
  | 'Falcón'
  | 'Guárico'
  | 'Lara'
  | 'La Guaira'
  | 'Mérida'
  | 'Miranda'
  | 'Monagas'
  | 'Nueva Esparta'
  | 'Portuguesa'
  | 'Sucre'
  | 'Táchira'
  | 'Trujillo'
  | 'Yaracuy'
  | 'Zulia'
  | 'Distrito Capital';

export type AccountStatus =
  | 'active'
  | 'pending_verification'
  | 'restricted'
  | 'suspended'
  | 'banned'
  | 'closed';

export type VerificationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'needs_review';

export interface UserProfile {
  id: string; // auth.users.id
  firstName: string;
  lastName: string;
  email: string;
  phoneMasked: string; // E.g. +58 414-***1234
  cedulaMasked: string; // E.g. V-***456 (nunca la cédula completa en consultas públicas)
  state: VenezuelanState;
  birthDate: string; // YYYY-MM-DD
  isAdult: boolean; // Validado por servidor (edad >= 18)
  avatarUrl: string | null;
  accountStatus: AccountStatus;
  identityVerificationStatus: VerificationStatus;
  humanVerificationStatus: VerificationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileSetupPayload {
  firstName: string;
  lastName: string;
  cedula: string;
  phone: string;
  state: VenezuelanState;
  birthDate: string;
  avatarUrl?: string;
}
