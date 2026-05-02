import { TenantNavList } from './TenantNavList';

export function TenantSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-background lg:flex">
      <div className="flex-1 p-4">
        <TenantNavList />
      </div>
    </aside>
  );
}
