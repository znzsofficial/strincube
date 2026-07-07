import { Cuboid } from 'lucide-react';

interface DesktopPauseMenuProps {
  saveStatus: string;
  onContinue: () => void;
  onImportMmdFolder: () => void;
  onImportModel: () => void;
  onOpenInventory: () => void;
  onOpenSettings: () => void;
  onReturnToTitle: () => void;
  onSave: () => void;
}

export function DesktopPauseMenu({
  saveStatus,
  onContinue,
  onImportMmdFolder,
  onImportModel,
  onOpenInventory,
  onOpenSettings,
  onReturnToTitle,
  onSave,
}: DesktopPauseMenuProps) {
  return (
    <section className="pause-menu" aria-label="暂停菜单">
      <Cuboid size={34} aria-hidden="true" />
      <h1>StrinCube</h1>
      <button type="button" className="menu-primary" onClick={onContinue}><iconify-icon icon="lucide:play" width="16"></iconify-icon> 回到游戏</button>
      <div className="pause-menu-grid">
        <button type="button" onClick={onOpenInventory}><iconify-icon icon="lucide:package" width="16"></iconify-icon> 背包</button>
        <button type="button" onClick={onOpenSettings}><iconify-icon icon="lucide:settings" width="16"></iconify-icon> 设置</button>
      </div>
      <button type="button" className="menu-secondary" onClick={onSave}><iconify-icon icon="lucide:save" width="16"></iconify-icon> 保存游戏</button>
      {saveStatus && <p className="save-status">{saveStatus}</p>}
      <div className="pause-menu-grid compact">
        <button type="button" onClick={onImportModel}><iconify-icon icon="lucide:upload" width="16"></iconify-icon> 模型</button>
        <button type="button" onClick={onImportMmdFolder}><iconify-icon icon="lucide:folder-open" width="16"></iconify-icon> MMD</button>
      </div>
      <button type="button" className="back-button" onClick={onReturnToTitle}><iconify-icon icon="lucide:log-out" width="16"></iconify-icon> 返回主菜单</button>
      <p>Esc 菜单，E 背包，O 设置，M 导入模型，选中模型后靠近按 F</p>
    </section>
  );
}
