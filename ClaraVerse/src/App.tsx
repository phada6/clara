import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import Debug from './components/Debug';
import Onboarding from './components/Onboarding';
import ImageGen from './components/ImageGen';
import Gallery from './components/Gallery';
import Help from './components/Help';
import N8N from './components/N8N';
import Servers from './components/Servers';
import AgentStudio from './components/AgentStudio';
import AgentManager from './components/AgentManager';
import AgentRunnerSDK from './components/AgentRunnerSDK';
import Lumaui from './components/Lumaui';
import LumaUILite from './components/LumaUILite';
import Notebooks from './components/Notebooks';
import { db } from './db';
import { ProvidersProvider } from './contexts/ProvidersContext';
import ClaraAssistant from './components/ClaraAssistant';
import { StartupService } from './services/startupService';

function App() {
  const [activePage, setActivePage] = useState(() => localStorage.getItem('activePage') || 'dashboard');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [userInfo, setUserInfo] = useState<{ name: string } | null>(null);
  const [alphaFeaturesEnabled, setAlphaFeaturesEnabled] = useState(false);
  const [agentMode, setAgentMode] = useState<'manager' | 'studio' | 'runner'>('manager');
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);

  useEffect(() => {
    const checkUserInfo = async () => {
      const info = await db.getPersonalInfo();
      if (!info || !info.name) {
        setShowOnboarding(true);
      } else {
        setShowOnboarding(false);
        setUserInfo({ name: info.name });
      }
    };
    checkUserInfo();
    
    // Add db to window for debugging in development
    if (import.meta.env.DEV) {
      (window as typeof window & { db: typeof db }).db = db;
    }
  }, []);

  useEffect(() => {
    db.getAlphaFeaturesEnabled?.().then(val => setAlphaFeaturesEnabled(!!val));
  }, []);

  useEffect(() => {
    // Apply startup settings
    StartupService.getInstance().applyStartupSettings();
  }, []);

  // Listen for global shortcut trigger to navigate to Clara chat
  useEffect(() => {
    let lastTriggerTime = 0;
    const debounceDelay = 300; // 300ms debounce
    
    const handleGlobalClaraShortcut = () => {
      const now = Date.now();
      
      // Check if we're within the debounce period
      if (now - lastTriggerTime < debounceDelay) {
        console.log('Global shortcut navigation debounced - too soon after last trigger');
        return;
      }
      
      lastTriggerTime = now;
      console.log('Global shortcut triggered - navigating to Clara chat');
      setActivePage('clara');
    };

    // Add listener for the trigger-new-chat event
    if (window.electron && window.electron.receive) {
      window.electron.receive('trigger-new-chat', handleGlobalClaraShortcut);
    }

    // Cleanup listener on unmount
    return () => {
      if (window.electron && window.electron.removeListener) {
        window.electron.removeListener('trigger-new-chat', handleGlobalClaraShortcut);
      }
    };
  }, []);

  const handleOnboardingComplete = async () => {
    setShowOnboarding(false);
    const info = await db.getPersonalInfo();
    if (info) {
      setUserInfo({ name: info.name });
    }
  };

  useEffect(() => {
    console.log('Storing activePage:', activePage);
    localStorage.setItem('activePage', activePage);
    
    // Reset agent mode when navigating away from agents page
    if (activePage !== 'agents') {
      setAgentMode('manager');
      setEditingAgentId(null);
    }
  }, [activePage]);

  const renderContent = () => {
    if (activePage === 'assistant') {
      return <ClaraAssistant onPageChange={setActivePage} />;
    }
    
    // Clara is now always mounted but conditionally visible
    // This allows it to run in the background
    
    if (activePage === 'agents') {
      const handleEditAgent = (agentId: string) => {
        setEditingAgentId(agentId);
        setAgentMode('studio');
      };

      const handleOpenAgent = (agentId: string) => {
        setRunningAgentId(agentId);
        setAgentMode('runner');
      };

      const handleCreateAgent = () => {
        setEditingAgentId(null);
        setAgentMode('studio');
      };

      const handleBackToManager = () => {
        setAgentMode('manager');
        setEditingAgentId(null);
        setRunningAgentId(null);
      };

      if (agentMode === 'manager') {
        return (
          <AgentManager
            onPageChange={setActivePage}
            onEditAgent={handleEditAgent}
            onOpenAgent={handleOpenAgent}
            onCreateAgent={handleCreateAgent}
            userName={userInfo?.name}
          />
        );
      } else if (agentMode === 'studio') {
        return (
          <AgentStudio
            onPageChange={handleBackToManager}
            userName={userInfo?.name}
            editingAgentId={editingAgentId}
          />
        );
      } else if (agentMode === 'runner' && runningAgentId) {
        return (
          <AgentRunnerSDK
            agentId={runningAgentId}
            onClose={handleBackToManager}
          />
        );
      }
    }
    

    
    if (activePage === 'image-gen') {
      return <ImageGen onPageChange={setActivePage} />;
    }

    if (activePage === 'gallery') {
      return <Gallery onPageChange={setActivePage} />;
    }

    if (activePage === 'n8n') {
      return <N8N onPageChange={setActivePage} />;
    }
    
    if (activePage === 'servers') {
      return <Servers onPageChange={setActivePage} />;
    }

    return (
      <div className="flex h-screen">
        <Sidebar activePage={activePage} onPageChange={setActivePage} alphaFeaturesEnabled={alphaFeaturesEnabled} />
        
        <div className="flex-1 flex flex-col">
          <Topbar userName={userInfo?.name} onPageChange={setActivePage} />
          
          <main className="">
            {(() => {
              switch (activePage) {
                case 'settings':
                  return <Settings alphaFeaturesEnabled={alphaFeaturesEnabled} setAlphaFeaturesEnabled={setAlphaFeaturesEnabled} />;
                case 'debug':
                  return <Debug />;
                case 'help':
                  return <Help />;
                case 'notebooks':
                  return <Notebooks />;
                case 'lumaui':
                  return <Lumaui onPageChange={setActivePage} />;
                case 'lumaui-lite':
                  return <LumaUILite />;
                case 'dashboard':
                default:
                  return <Dashboard onPageChange={setActivePage} />;
              }
            })()}
          </main>
        </div>
      </div>
    );
  };

  return (
    <ProvidersProvider>
      <div className="min-h-screen bg-gradient-to-br from-white to-sakura-100 dark:from-gray-900 dark:to-sakura-100">
        {showOnboarding ? (
          <Onboarding onComplete={handleOnboardingComplete} />
        ) : (
          <>
            {/* Always render Clara in background - visible when activePage is 'clara' */}
            <div className={activePage === 'clara' ? 'block' : 'hidden'} data-clara-container>
              <ClaraAssistant onPageChange={setActivePage} />
            </div>
            
            {/* Render other content when not on Clara page */}
            {activePage !== 'clara' && renderContent()}
          </>
        )}
      </div>
    </ProvidersProvider>
  );
}

export default App;


