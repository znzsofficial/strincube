import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { defaultSettings } from '../src/engine/core/session';
import type { GameSettings } from '../src/engine/types';
import { SettingsPanel } from '../src/ui/SettingsPanel';
import '../src/styles.css';

function Preview() {
  const [settings, setSettings] = useState(defaultSettings(1));
  const update = (patch: Partial<GameSettings>) => setSettings(current => ({ ...current, ...patch }));
  return <main className="game-shell"><div className="menu-overlay">
    <SettingsPanel isMobile={new URLSearchParams(location.search).has('mobile')} settings={settings}
      onReturnToMenu={() => setSettings(defaultSettings(1))} onUpdateSettings={update}
      onUpdateSetting={(key, value) => update({ [key]: value })} />
  </div></main>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
