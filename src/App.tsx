import { useState } from 'react';
import { AuthProvider } from './features/auth/AuthContext';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { SafeDevelopmentBanner } from './components/layout/SafeDevelopmentBanner';
import { LobbyView } from './features/lobby/LobbyView';
import { TablesView } from './features/tables/TablesView';
import { WalletView } from './features/wallet/WalletView';
import { ProfileView } from './features/profile/ProfileView';
import { AdminView } from './features/admin/AdminView';
import type { GameMetadata } from './types/games';

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('home');

  const handleSelectGame = (_game: GameMetadata) => {
    // Redirigir a la vista de mesas
    setCurrentTab('tables');
  };

  const handleJoinTrancaito = () => {
    setCurrentTab('tables');
  };

  return (
    <AuthProvider>
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

          {currentTab === 'profile' && <ProfileView />}

          {currentTab === 'admin' && <AdminView />}
        </main>

        <Footer />
      </div>
    </AuthProvider>
  );
}

