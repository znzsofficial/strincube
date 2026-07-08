import { Loader } from 'lucide-react';

interface LoadingScreenProps {
  loadingProgress: { label: string; progress: number };
  worldMode: 'infinite' | 'finite' | 'flat';
  worldRadius: number;
}

export function LoadingScreen({ loadingProgress, worldMode, worldRadius }: LoadingScreenProps) {
  const isLoadingSave = loadingProgress.label === '加载存档' || loadingProgress.label.startsWith('加载');
  const percent = Math.round(loadingProgress.progress * 100);

  return (
    <div className="loading-content">
      <div className="loading-icon">
        <Loader size={36} className="loading-spinner" />
      </div>
      <h2>{isLoadingSave ? '正在加载存档' : '正在创建世界'}</h2>
      <p className="loading-label">{loadingProgress.label}</p>
      <div className="loading-bar">
        <div className="loading-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="loading-percent">{percent}%</span>
      {!isLoadingSave && <p className="loading-hint">{worldMode === 'finite' ? `世界半径 ${worldRadius} 格 · 约 ${((worldRadius * 2 + 1) * (worldRadius * 2 + 1) / 1000).toFixed(0)}k 个区块` : '动态区块生成 · 会优先准备出生点附近'}</p>}
    </div>
  );
}
