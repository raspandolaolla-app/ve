import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { BcvProvider } from './context/BcvContext';
import { WalletProvider } from './context/WalletContext';
import { GameModeProvider, useGameMode } from './hooks/useGameMode';
import { PresenceService } from './services/PresenceService';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { BottomNavigation } from './components/layout/BottomNavigation';
import { ExploreDrawer } from './components/layout/ExploreDrawer';
import { ProfileMenuModal } from './components/layout/ProfileMenuModal';
import { SupportModal } from './components/layout/SupportModal';
import { NotificationsModal } from './components/layout/NotificationsModal';
import { GiraLaOllaModal } from './components/layout/GiraLaOllaModal';
import { SafeDevelopmentBanner } from './components/layout/SafeDevelopmentBanner';
import { AnnouncementBanner } from './components/common/AnnouncementBanner';
import { InactivityWarningModal } from './components/common/InactivityWarningModal';
import { QuickMatchModal } from './components/common/QuickMatchModal';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { useInactivityTimeout } from './hooks/useInactivityTimeout';
import { useHeartbeat } from './hooks/useHeartbeat';
import { GameRulesModal } from './features/games/GameRulesModal';
import { LobbyView } from './features/lobby/LobbyView';
import { TablesView } from './features/tables/TablesView';
import { WalletView } from './features/wallet/WalletView';
import { ProfileView } from './features/profile/ProfileView';
import { AdminView } from './features/admin/AdminView';
import { SupportView } from './features/support/SupportView';
import { LegalModal } from './components/legal/LegalModal';
import { TermsAcceptanceModal } from './components/legal/TermsAcceptanceModal';
import { ProfileOnboarding } from './components/auth/ProfileOnboarding';
import { AlertCircle, X } from 'lucide-react';
import { PollaBoard } from './features/games/components/PollaBoard';
import { AtrapaitoGame } from './features/games/components/AtrapaitoGame';
import type { GameMetadata } from './types/games';
import type { LegalDocId } from './types/legal';

// Lista de pestañas o identificadores que son juegos y deben ocultar la barra inferior y headers
const GAME_TABS = ['atrapaito', 'chess', 'checkers', 'domino', 'truco', 'tictactoe', 'rps', 'unaolla', 'bingo_game', 'polla'];

function AppContent() {
  const { isGameActive } = useGameMode();
  const [currentTab, setCurrentTab] = useState<string>('home');
  const isPlayingGame = isGameActive || GAME_TABS.includes(currentTab);
  const [legalModalOpen, setLegalModalOpen] = useState<boolean>(false);
  const [legalModalDoc, setLegalModalDoc] = useState<LegalDocId>('terms');
  const [rulesModalOpen, setRulesModalOpen] = useState<boolean>(false);
  const [rulesGameId, setRulesGameId] = useState<string>('domino_venezolano');

  // Modales de Layout
  const [exploreDrawerOpen, setExploreDrawerOpen] = useState<boolean>(false);
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(false);
  const [supportModalOpen, setSupportModalOpen] = useState<boolean>(false);
  const [notificationsModalOpen, setNotificationsModalOpen] = useState<boolean>(false);
  const [giraLaOllaModalOpen, setGiraLaOllaModalOpen] = useState<boolean>(false);
  const [quickMatchModalOpen, setQuickMatchModalOpen] = useState<boolean>(false);

  const { state, user, profile, error, clearError, hasAcceptedTerms, confirmTermsAccepted, signOut, refreshProfile } = useAuth();
  const { showWarning, secondsRemaining, keepSessionAlive } = useInactivityTimeout();
  useHeartbeat();

  useEffect(() => {
    if (state === 'authenticated' && user?.id) {
      PresenceService.initGlobalPresence(user.id, {
        displayName: user.user_metadata?.full_name || user.email || 'Jugador',
      });
    } else {
      PresenceService.cleanup();
    }
  }, [state, user?.id, user?.user_metadata, user?.email]);

  const handleSelectGame = (game: GameMetadata) => {
    if (game.id === 'atrapaito') {
      setCurrentTab('atrapaito');
      return;
    }
    setRulesGameId(game.id);
    setCurrentTab('tables');
  };

  const handleJoinTrancaito = () => {
    setCurrentTab('tables');
  };

  const handleOpenQuickMatch = () => {
    setCurrentTab('tables');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('open-quick-match'));
    }, 50);
  };

  const handleOpenLegalDoc = (docId: LegalDocId = 'terms') => {
    setLegalModalDoc(docId);
    setLegalModalOpen(true);
  };

  const handleOpenGameRules = (gameId: string = 'domino_venezolano') => {
    setRulesGameId(gameId);
    setRulesModalOpen(true);
  };

  const isTermsModalVisible =
    state === 'authenticated' && user !== null && !hasAcceptedTerms;

  // Onboarding de identidad estricto: después de aceptar términos, si el perfil no tiene cédula o teléfono registrados
  const needsOnboarding =
    state === 'authenticated' &&
    user !== null &&
    hasAcceptedTerms &&
    (!profile?.cedula || !profile?.telefono || !profile?.isProfileLocked);

  return (
    <div className="min-h-screen flex flex-col bg-[#080B12] text-[#F8FAFC] antialiased selection:bg-[#FF8A00] selection:text-[#080B12]">
      <SafeDevelopmentBanner />
      <AnnouncementBanner />

      {/* Cabecera Fija */}
      {!isPlayingGame && (
        <Header
          currentTab={currentTab}
          onNavigate={setCurrentTab}
          onOpenNotifications={() => setNotificationsModalOpen(true)}
          onOpenProfile={() => setProfileModalOpen(true)}
        />
      )}

      {/* Banner Global de Notificaciones / Errores de Autenticación */}
      {error && !isPlayingGame && (
        <div id="auth-error-banner" className="bg-[#FF8A00]/10 border-b border-[#FF8A00]/30 px-4 py-3 text-[#F5B942]">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs sm:text-sm">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-[#FF8A00] shrink-0" />
              <span>{error.userFriendlyMessage}</span>
            </div>
            <button
              onClick={clearError}
              className="p-1 rounded hover:bg-[#FF8A00]/20 text-[#F5B942] hover:text-[#F8FAFC] transition-colors"
              title="Cerrar notificación"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Contenido Principal con Espaciado Inferior Seguro o Modo Inmersivo */}
      <main className={isPlayingGame ? 'game-fullscreen-wrapper game-immersive-container' : 'flex-1 max-w-7xl w-full mx-auto px-2.5 sm:px-6 lg:px-8 py-3 sm:py-8 pb-28 sm:pb-12'}>
        {currentTab === 'home' && (
          <LobbyView
            onSelectGame={handleSelectGame}
            onJoinTrancaito={handleJoinTrancaito}
            onNavigateTab={setCurrentTab}
            onOpenRules={handleOpenGameRules}
            onSelectBingoVariant={(_variant, tableId) => {
              setCurrentTab('tables');
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('open-table', { detail: { tableId } }));
              }, 60);
            }}
          />
        )}

        {currentTab === 'polla' && <PollaBoard />}

        {currentTab === 'atrapaito' && (
          <AtrapaitoGame onLeave={() => setCurrentTab('home')} onExit={() => setCurrentTab('home')} />
        )}

        {currentTab === 'tables' && <TablesView />}

        {currentTab === 'wallet' && <WalletView />}

        {currentTab === 'profile' && (
          <ProfileView onOpenLegalDoc={handleOpenLegalDoc} />
        )}

        {currentTab === 'support' && (
          <SupportView onBack={() => setCurrentTab('home')} />
        )}

        {currentTab === 'admin' && <AdminView />}
      </main>

      {/* Pie de Página */}
      {!isPlayingGame && <Footer onOpenLegalDoc={handleOpenLegalDoc} />}

      {/* Barra de Navegación Inferior Fija (Mobile-First) */}
      {!isPlayingGame && (
        <BottomNavigation
          currentTab={currentTab}
          onNavigate={setCurrentTab}
          onOpenExplore={() => setExploreDrawerOpen(true)}
          onOpenSupport={() => setSupportModalOpen(true)}
          onOpenQuickMatch={handleOpenQuickMatch}
        />
      )}

      {/* Drawer / Menú Lateral de Explorar */}
      <ExploreDrawer
        isOpen={exploreDrawerOpen}
        onClose={() => setExploreDrawerOpen(false)}
        onSelectGame={handleSelectGame}
        onNavigateTab={setCurrentTab}
        onOpenSupport={() => setSupportModalOpen(true)}
        onOpenRules={handleOpenGameRules}
      />

      {/* Menú Desplegable / Modal de Perfil */}
      <ProfileMenuModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        onNavigateTab={setCurrentTab}
        onOpenSupport={() => setSupportModalOpen(true)}
      />

      {/* Modal de Soporte y Ayuda */}
      <SupportModal
        isOpen={supportModalOpen}
        onClose={() => setSupportModalOpen(false)}
        onNavigateSupportCenter={() => {
          setSupportModalOpen(false);
          setCurrentTab('support');
        }}
        onNavigateFAQ={() => {
          setSupportModalOpen(false);
          setCurrentTab('support');
        }}
      />

      {/* Modal de Notificaciones */}
      <NotificationsModal
        isOpen={notificationsModalOpen}
        onClose={() => setNotificationsModalOpen(false)}
        onNavigateTab={setCurrentTab}
      />

      {/* Modal de Minijuego Temático Gira La Olla */}
      <GiraLaOllaModal
        isOpen={giraLaOllaModalOpen}
        onClose={() => setGiraLaOllaModalOpen(false)}
      />

      {/* Modal de Partida Rápida */}
      <QuickMatchModal
        isOpen={quickMatchModalOpen}
        onClose={() => setQuickMatchModalOpen(false)}
        onNavigateToTable={(tableId) => {
          setQuickMatchModalOpen(false);
          setCurrentTab('tables');
        }}
      />

      {/* Modal Visor de Documentos Legales */}
      <LegalModal
        isOpen={legalModalOpen}
        initialDoc={legalModalDoc}
        onClose={() => setLegalModalOpen(false)}
      />

      {/* Modal Visor de Reglas Oficiales y ¿Cómo Jugar? */}
      <GameRulesModal
        isOpen={rulesModalOpen}
        defaultGameId={rulesGameId}
        onClose={() => setRulesModalOpen(false)}
      />

      {/* Modal Advertencia de Inactividad de Sesión */}
      <InactivityWarningModal
        isOpen={showWarning}
        secondsRemaining={secondsRemaining}
        onStayLoggedIn={keepSessionAlive}
      />

      {/* Modal Obligatorio de Aceptación de Términos y Mayoría de Edad */}
      {user && (
        <TermsAcceptanceModal
          userId={user.id}
          userEmail={user.email}
          isOpen={isTermsModalVisible}
          onAccepted={confirmTermsAccepted}
          onSignOut={signOut}
          onOpenLegalDoc={handleOpenLegalDoc}
        />
      )}

      {/* Modal Obligatorio de Perfilado Estricto y Blindaje de Identidad */}
      {needsOnboarding && (
        <ProfileOnboarding
          onComplete={async () => {
            await refreshProfile();
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BcvProvider>
          <WalletProvider>
            <GameModeProvider>
              <AppContent />
            </GameModeProvider>
          </WalletProvider>
        </BcvProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
