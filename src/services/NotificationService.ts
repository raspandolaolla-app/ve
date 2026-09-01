// ==============================================================================
// RASPANDO LA OLLA — SISTEMA DE NOTIFICACIONES PUSH Y TIEMPO REAL
// ==============================================================================

import { audioService } from './AudioService';

interface PushNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: any;
  requireInteraction?: boolean;
  silent?: boolean;
  vibrate?: number[];
}

type NotificationType = 
  | 'game_invitation'
  | 'match_ready'
  | 'your_turn'
  | 'winner'
  | 'deposit_success'
  | 'withdraw_processed'
  | 'tournament_start'
  | 'daily_bonus'
  | 'friend_online'
  | 'system_message';

class NotificationService {
  private static instance: NotificationService;
  private permissionGranted: boolean = false;
  private notificationQueue: PushNotificationOptions[] = [];
  private unreadCount: number = 0;

  private constructor() {
    this.requestPermission();
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private async requestPermission(): Promise<void> {
    if (!('Notification' in window)) {
      console.warn('[NotificationService] Notificaciones no soportadas en este navegador');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      this.permissionGranted = permission === 'granted';
      
      if (this.permissionGranted) {
        console.log('[NotificationService] Permiso de notificaciones otorgado');
        this.processQueue();
      } else {
        console.warn('[NotificationService] Permiso de notificaciones denegado');
      }
    } catch (error) {
      console.error('[NotificationService] Error solicitando permisos:', error);
    }
  }

  public async send(
    type: NotificationType,
    options: PushNotificationOptions
  ): Promise<void> {
    const defaultIcon = '/ve/favicon.svg';
    const defaultBadge = '/ve/favicon.svg';

    const notificationOptions: NotificationOptions = {
      body: options.body,
      icon: options.icon || defaultIcon,
      badge: options.badge || defaultBadge,
      tag: options.tag || type,
      data: options.data,
      requireInteraction: options.requireInteraction || false,
      silent: options.silent || false,
      vibrate: options.vibrate || [200, 100, 200]
    };

    if (!this.permissionGranted) {
      this.notificationQueue.push({ ...options, icon: options.icon || defaultIcon });
      return;
    }

    try {
      const notification = new Notification(options.title, notificationOptions);

      // Vibración adicional para móviles
      const notificationOptions: NotificationOptions = {
      body: options.body,
      icon: options.icon || defaultIcon,
      badge: options.badge || defaultBadge,
      tag: options.tag || type,
      data: options.data,
      requireInteraction: options.requireInteraction || false,
      silent: options.silent || false,
      vibrate: options.vibrate || [200, 100, 200]  // ❌ ESTA LÍNEA FALLA
    };

      // Reproducir sonido según tipo
      this.playNotificationSound(type);

      // Incrementar contador de no leídas
      this.unreadCount++;

      // Auto-cerrar después de 5 segundos si no requiere interacción
      if (!options.requireInteraction) {
        setTimeout(() => notification.close(), 5000);
      }

      // Manejar click en notificación
      notification.onclick = (event) => {
        event.preventDefault();
        this.handleNotificationClick(type, options.data);
        notification.close();
      };
    } catch (error) {
      console.error('[NotificationService] Error enviando notificación:', error);
    }
  }

  private playNotificationSound(type: NotificationType): void {
    switch (type) {
      case 'winner':
        audioService.playWinSound(true);
        break;
      case 'match_ready':
      case 'game_invitation':
        audioService.play('gameStart');
        break;
      case 'your_turn':
        audioService.play('notification', 1);
        break;
      case 'deposit_success':
      case 'withdraw_processed':
        audioService.play('deposit');
        break;
      case 'tournament_start':
        audioService.play('achievement');
        break;
      default:
        audioService.play('notification');
    }
  }

  private handleNotificationClick(type: NotificationType, data?: any): void {
    // Navegar a la vista correspondiente según el tipo de notificación
    const navigationMap: Record<NotificationType, string> = {
      game_invitation: 'tables',
      match_ready: 'tables',
      your_turn: 'tables',
      winner: 'wallet',
      deposit_success: 'wallet',
      withdraw_processed: 'wallet',
      tournament_start: 'tables',
      daily_bonus: 'profile',
      friend_online: 'home',
      system_message: 'profile'
    };

    const targetTab = navigationMap[type] || 'home';
    
    // Dispatch custom event para que la app navegue
    window.dispatchEvent(new CustomEvent('notification-click', {
      detail: { type, targetTab, data }
    }));
  }

  private processQueue(): void {
    while (this.notificationQueue.length > 0) {
      const notification = this.notificationQueue.shift();
      if (notification) {
        this.send('system_message', notification);
      }
    }
  }

  public getUnreadCount(): number {
    return this.unreadCount;
  }

  public clearUnread(): void {
    this.unreadCount = 0;
  }

  public async sendGameInvitation(gameName: string, playerName: string): Promise<void> {
    await this.send('game_invitation', {
      title: '🎮 ¡Invitación de Juego!',
      body: `${playerName} te invitó a jugar ${gameName}`,
      tag: 'game-invitation',
      requireInteraction: true,
      vibrate: [300, 100, 300]
    });
  }

  public async sendMatchReady(gameName: string): Promise<void> {
    await this.send('match_ready', {
      title: '✅ ¡Partida Lista!',
      body: `Tu partida de ${gameName} está lista para comenzar`,
      vibrate: [200, 50, 200, 50, 200]
    });
  }

  public async sendYourTurn(gameName: string): Promise<void> {
    await this.send('your_turn', {
      title: '🎯 ¡Es tu Turno!',
      body: `Es tu turno en ${gameName}`,
      silent: true // No vibrar para no molestar
    });
  }

  public async sendWinner(prize: string, gameName: string): Promise<void> {
    await this.send('winner', {
      title: '🏆 ¡Felicidades, Ganaste!',
      body: `Ganaste ${prize} en ${gameName}`,
      requireInteraction: true,
      vibrate: [500, 100, 500, 100, 500, 100, 500]
    });
  }

  public async sendDepositSuccess(amount: string): Promise<void> {
    await this.send('deposit_success', {
      title: '💰 Abono Exitoso',
      body: `Tu abono de ${amount} ha sido procesado correctamente`,
      vibrate: [200, 100, 200]
    });
  }

  public async sendWithdrawProcessed(amount: string): Promise<void> {
    await this.send('withdraw_processed', {
      title: '💸 Retiro Procesado',
      body: `Tu retiro de ${amount} ha sido enviado`,
      requireInteraction: true,
      vibrate: [300, 100, 300]
    });
  }

  public async sendTournamentStart(tournamentName: string): Promise<void> {
    await this.send('tournament_start', {
      title: '🏁 ¡Torneo Iniciado!',
      body: `El torneo ${tournamentName} ha comenzado`,
      requireInteraction: true,
      vibrate: [400, 100, 400, 100, 400]
    });
  }

  public async sendDailyBonus(amount: string): Promise<void> {
    await this.send('daily_bonus', {
      title: '🎁 Bonus Diario Disponible',
      body: `Reclama tu bonus diario de ${amount}`,
      requireInteraction: true,
      vibrate: [250, 100, 250, 100, 250]
    });
  }
}

export const notificationService = NotificationService.getInstance();
