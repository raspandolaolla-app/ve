import { useState } from 'react';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { SafeDevelopmentBanner } from './components/layout/SafeDevelopmentBanner';
import { LobbyView } from './features/lobby/LobbyView';
import { TablesView } from './features/tables/TablesView';
import { WalletView } from './features/wallet/WalletView';
import { ProfileView } from './features/profile/ProfileView';
import { AdminView } from './features/admin/AdminView';
import { LegalModal } from './components/legal/LegalModal';
import { TermsAcceptanceModal } from './components/legal/TermsAcceptanceModal';
import type { GameMetadata } from './types/games';
import type { LegalDocId } from './types/legal';

function AppContent() {
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [legalModalOpen, setLegalModalOpen] = useState<boolean>(false);
  const [legalModalDoc, setLegalModalDoc] = useState<LegalDocId>('terms');

  const { state, user, hasAcceptedTerms, confirmTermsAccepted, signOut } = useAuth();

  const handleSelectGame = (_game: GameMetadata) => {
    setCurrentTab('tables');
  };

  const handleJoinTrancaito = () => {
    setCurrentTab('tables');
  };

  const handleOpenLegalDoc = (docId: LegalDocId = 'terms') => {
    setLegalModalDoc(docId);
    setLegalModalOpen(true);
  };

  const isTermsModalVisible =
    state === 'authenticated' && user !== null && !hasAcceptedTerms;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 antialiased selection:bg-amber-500 selection:text-slate-950">
      <SafeDevelopmentBanner />
      <Header currentTab={currentTab} onNavigate={setCurrentTab} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentTab === 'home' && (
          <LobbyView
            onSelectGame={handleSelectGame}
            onJoinTrancaito={handleJoinTrancaito}
          />
        )}

        {currentTab === 'tables' && <TablesView />}

        {currentTab === 'wallet' && <WalletView />}

        {currentTab === 'profile' && (
          <ProfileView onOpenLegalDoc={handleOpenLegalDoc} />
        )}

        {currentTab === 'admin' && <AdminView />}
      </main>

      <Footer onOpenLegalDoc={handleOpenLegalDoc} />

      {/* Modal Visor de Documentos Legales */}
      <LegalModal
        isOpen={legalModalOpen}
        initialDoc={legalModalDoc}
        onClose={() => setLegalModalOpen(false)}
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
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
