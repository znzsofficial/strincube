import { Cuboid } from 'lucide-react';

interface MobilePauseMenuProps {
  saveStatus: string;
  onContinue: () => void;
  onOpenInventory: () => void;
  onOpenSettings: () => void;
  onSave: () => void;
  onImportModel: () => void;
  onReturnToTitle: () => void;
}

export function MobilePauseMenu({
  saveStatus,
  onContinue,
  onOpenInventory,
  onOpenSettings,
  onSave,
  onImportModel,
  onReturnToTitle,
}: MobilePauseMenuProps) {
  return (
    <section className="mobile-pause-menu" aria-label="移动端主菜单">
      <header>
        <div>
          <Cuboid size={20} aria-hidden="true" />
          <strong>StrinCube</strong>
        </div>
        <button type="button" className="mobile-inventory-close" onClick={onContinue}>继续</button>
      </header>
      <div className="mobile-menu-hero">
        <span>暂停菜单</span>
        <small>进入全屏横屏触控模式后继续游戏</small>
      </div>
      <div className="mobile-menu-actions primary">
        <button type="button" onClick={onContinue}><iconify-icon icon="lucide:play" width="18"></iconify-icon> 回到游戏</button>
        <button type="button" onClick={onOpenInventory}><iconify-icon icon="lucide:package" width="18"></iconify-icon> 物品栏</button>
        <button type="button" onClick={onOpenSettings}><iconify-icon icon="lucide:settings" width="18"></iconify-icon> 设置</button>
      </div>
      <div className="mobile-menu-actions secondary">
        <button type="button" onClick={onSave}><iconify-icon icon="lucide:save" width="16"></iconify-icon> 保存游戏</button>
        <button type="button" onClick={onImportModel}><iconify-icon icon="lucide:upload" width="16"></iconify-icon> 导入模型</button>
      </div>
      {saveStatus && <p className="save-status">{saveStatus}</p>}
      <button type="button" className="mobile-menu-exit" onClick={onReturnToTitle}><iconify-icon icon="lucide:log-out" width="16"></iconify-icon> 返回主菜单</button>
    </section>
  );
}
