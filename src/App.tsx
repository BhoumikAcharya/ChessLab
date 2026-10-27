import React, { useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { DashboardView } from './components/dashboard/DashboardView';
import { GameLibraryView } from './components/library/GameLibraryView';
import { GameReviewView } from './components/review/GameReviewView';
import { SettingsView } from './components/settings/SettingsView';
import { ImportModal } from './components/modals/ImportModal';

export const App: React.FC = () => {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const navigate = useNavigate();

  const handleImportComplete = () => {
    // Navigate to library to see the newly imported games
    navigate('/library');
  };

  return (
    <div className="app-layout">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="app-main">
        <Routes>
          <Route
            path="/"
            element={<DashboardView onOpenImport={() => setIsImportModalOpen(true)} />}
          />
          <Route
            path="/library"
            element={<GameLibraryView onOpenImport={() => setIsImportModalOpen(true)} />}
          />
          <Route path="/review" element={<GameReviewView />} />
          <Route path="/review/:gameId" element={<GameReviewView />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Global Import Modal */}
      {isImportModalOpen && <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={handleImportComplete}
      />}
    </div>
  );
};

export default App;
