import { useEffect, useRef } from 'react';

/**
 * Hook universal de pantalla completa para juegos en dispositivos móviles y de escritorio.
 * Detecta la primera interacción del usuario (touch o click) para solicitar
 * pantalla completa real de forma nativa sin violar las políticas de seguridad de los navegadores.
 */
export const useGameFullscreen = (isEnabled: boolean = true) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isEnabled || typeof window === 'undefined') return;

    const enterFullscreen = async () => {
      const el = containerRef.current || document.documentElement;
      // Solo intentar si no estamos ya en pantalla completa
      if (el && !document.fullscreenElement) {
        try {
          // Soporte estándar (Chrome / Android / Firefox / Edge)
          if (el.requestFullscreen) {
            await el.requestFullscreen();
          } 
          // Soporte para Safari iOS / WebKit
          else if ((el as any).webkitRequestFullscreen) {
            await (el as any).webkitRequestFullscreen();
          }
        } catch {
          // Silenciar error si el usuario deniega, no es compatible o corre en iframe restringido
        }
      }
    };

    // Escuchar el PRIMER toque o clic en todo el documento para activar pantalla completa
    const handleFirstInteraction = () => {
      enterFullscreen();
      // Remover los listeners después de la primera interacción
      document.removeEventListener('click', handleFirstInteraction, true);
      document.removeEventListener('touchstart', handleFirstInteraction, true);
    };

    // Usar captura (true) para interceptar el evento antes que el juego
    document.addEventListener('click', handleFirstInteraction, true);
    document.addEventListener('touchstart', handleFirstInteraction, true);

    // Limpieza al salir del juego
    return () => {
      document.removeEventListener('click', handleFirstInteraction, true);
      document.removeEventListener('touchstart', handleFirstInteraction, true);
      
      // Salir de pantalla completa al desmontar el juego si estaba activo
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [isEnabled]);

  return containerRef;
};

export default useGameFullscreen;
