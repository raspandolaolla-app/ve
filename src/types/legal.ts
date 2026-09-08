// ==============================================================================
// RASPANDO LA OLLA — DEFINICIONES DE TIPOS: TÉRMINOS, CONDICIONES Y LEGAL
// ==============================================================================

export type TermsVersion = '1.0';

export type LegalDocId = 'terms' | 'privacy' | 'rules' | 'responsible_gaming';

export interface LegalDocumentSection {
  title: string;
  paragraphs: string[];
  bulletPoints?: string[];
}

export interface LegalDocument {
  id: LegalDocId;
  title: string;
  shortTitle: string;
  version: string;
  lastUpdated: string;
  summary: string;
  sections: LegalDocumentSection[];
}

export interface TermsAcceptanceRecord {
  userId: string;
  termsVersion: TermsVersion;
  isAdultConfirmed: boolean;
  acceptedAt: string; // ISO 8601 string
  platformOrigin: string;
  userEmailMasked?: string;
}

export interface TermsAcceptanceState {
  hasAcceptedCurrentVersion: boolean;
  acceptedVersion: string | null;
  acceptedAt: string | null;
  isAdultConfirmed: boolean;
  isLoading: boolean;
}
