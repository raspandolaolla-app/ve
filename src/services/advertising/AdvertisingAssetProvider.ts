// ==============================================================================
// RASPANDO LA OLLA — PROVEEDOR DE URLS PARA ASSETS DE PUBLICIDAD
// ==============================================================================
// Soporta resolución dinámica con soporte de Base URL (/ve/ o /) y
// permite migrar a CDN o almacenamiento alternativo sin modificar el Engine.
// ==============================================================================

export interface IAdvertisingAssetProvider {
  getAssetUrl(filePath?: string | null): string;
  getProviderName(): string;
}

export class GitHubPagesAssetProvider implements IAdvertisingAssetProvider {
  private cdnPrefix: string | null = null;

  constructor(cdnPrefix?: string) {
    this.cdnPrefix = cdnPrefix || null;
  }

  public getProviderName(): string {
    return this.cdnPrefix ? 'CDN' : 'GitHubPages';
  }

  /**
   * Resuelve la URL del archivo de publicidad respetando BASE_URL (/ve/ o /)
   */
  public getAssetUrl(filePath?: string | null): string {
    if (!filePath) {
      return this.getFallbackUrl();
    }

    // Si ya es una URL absoluta o protocolo especial
    if (
      filePath.startsWith('http://') ||
      filePath.startsWith('https://') ||
      filePath.startsWith('blob:') ||
      filePath.startsWith('data:')
    ) {
      return filePath;
    }

    // Limpieza de ruta relativa
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

    // Si tenemos configurado un CDN externo
    if (this.cdnPrefix) {
      const base = this.cdnPrefix.endsWith('/') ? this.cdnPrefix : `${this.cdnPrefix}/`;
      return `${base}${cleanPath}`;
    }

    // Resolución local estándar en el repositorio/sitio
    const baseUrl = import.meta.env.BASE_URL || '/';
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    // Si ya viene con el prefijo ads/ o advertising/
    if (cleanPath.startsWith('ads/')) {
      return `${normalizedBase}${cleanPath}`;
    }
    if (cleanPath.startsWith('advertising/')) {
      return `${normalizedBase}ads/${cleanPath.replace(/^advertising\//, '')}`;
    }

    return `${normalizedBase}ads/${cleanPath}`;
  }

  public getFallbackUrl(): string {
    const baseUrl = import.meta.env.BASE_URL || '/';
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return `${normalizedBase}ads/banners/default_banner.svg`;
  }
}

// Instancia singleton por defecto
export const defaultAssetProvider = new GitHubPagesAssetProvider();

export class AdvertisingAssetProvider {
  private static activeProvider: IAdvertisingAssetProvider = defaultAssetProvider;

  public static setProvider(provider: IAdvertisingAssetProvider): void {
    this.activeProvider = provider;
  }

  public static getAssetUrl(filePath?: string | null): string {
    return this.activeProvider.getAssetUrl(filePath);
  }

  public static getFallbackUrl(): string {
    if (this.activeProvider instanceof GitHubPagesAssetProvider) {
      return this.activeProvider.getFallbackUrl();
    }
    const baseUrl = import.meta.env.BASE_URL || '/';
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return `${normalizedBase}logo.svg`;
  }
}
