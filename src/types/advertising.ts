// ==============================================================================
// RASPANDO LA OLLA — TIPOS Y CONTRATOS DEL SISTEMA DE PUBLICIDAD (GITHUB + SUPABASE)
// ==============================================================================

export type AdAssetType = 'image' | 'video' | 'animation' | 'icon';

export type AdDeviceType = 'ALL' | 'MOBILE' | 'TABLET' | 'DESKTOP';

export type AdOrientation = 'ANY' | 'PORTRAIT' | 'LANDSCAPE';

export type AdPlacement =
  | 'HOME_TOP'
  | 'HOME_MIDDLE'
  | 'HOME_BOTTOM'
  | 'LOGIN'
  | 'REGISTER'
  | 'LOBBY'
  | 'LOBBY_TOP'
  | 'LOBBY_BOTTOM'
  | 'GAME_HEADER'
  | 'GAME_BETWEEN_ROUNDS'
  | 'GAME_RESULT'
  | 'GAME_DOMINO'
  | 'GAME_TRUCO'
  | 'GAME_BINGO'
  | 'GAME_POLLA'
  | 'GAME_ATRAPAITO'
  | 'GAME_DAMAS'
  | 'GAME_PPOT'
  | 'GAME_LA_VIEJA'
  | 'ADMIN_HOME'
  | string;

export interface AdvertisingAsset {
  id: string;
  assetKey: string;
  filePath: string;
  assetType: AdAssetType;
  mimeType?: string | null;
  title?: string | null;
  description?: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  fileSizeBytes?: number | null;
  active: boolean;
  publicUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdvertisingCampaign {
  id: string;
  assetId?: string | null;
  asset?: AdvertisingAsset | null;
  name: string;
  active: boolean;
  priority: number;
  placement: AdPlacement;
  gameType?: string | null;
  deviceType: AdDeviceType;
  orientation: AdOrientation;
  startAt?: string | null;
  endAt?: string | null;
  displayDurationSeconds?: number | null;
  frequencyLimit?: number | null;
  targetUrl?: string | null;
  ctaText?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ManifestAssetItem {
  id: string;
  asset_key?: string;
  file: string;
  type: AdAssetType;
  mime?: string;
  title?: string;
  description?: string;
  width?: number;
  height?: number;
  duration?: number;
  size?: number;
  active?: boolean;
}

export interface AdvertisingManifest {
  version: number;
  updated_at: string;
  provider?: string;
  base_path?: string;
  assets: ManifestAssetItem[];
}

export interface AdvertisingLibraryScanResult {
  success: boolean;
  timestamp: string;
  version: number;
  totalFound: number;
  validAssetsCount: number;
  invalidAssetsCount: number;
  assets: AdvertisingAsset[];
  errors: string[];
}
