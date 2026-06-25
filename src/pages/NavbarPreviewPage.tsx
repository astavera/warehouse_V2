import { useMemo, useState } from 'react';
import {
  BarChart3,
  ClipboardList,
  Landmark,
  LogOut,
  Package,
  PackageSearch,
  ReceiptText,
  SearchCheck,
  Settings,
  Tag,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react';
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '@/components/ui/menubar';
import { cn } from '@/lib/utils';

const menuGroups = [
  {
    label: 'Dashboard',
    icon: BarChart3,
    items: [
      {
        label: 'Overview',
        path: '/',
        icon: BarChart3,
        description: 'Main warehouse snapshot',
      },
    ],
    submenus: [
      {
        label: 'Fast views',
        items: [
          { label: 'Warehouse floor', path: '/', icon: Warehouse, description: 'Operational control view' },
          { label: 'Audit queue', path: '/inventory-audit', icon: SearchCheck, description: 'Inventory review tools' },
        ],
      },
    ],
  },
  {
    label: 'Warehouse',
    icon: Warehouse,
    items: [
      {
        label: 'Receiving',
        path: '/receive',
        icon: Package,
        description: 'Scan and receive boxes',
      },
      {
        label: 'Expected boxes',
        path: '/expected-boxes',
        icon: PackageSearch,
        description: 'Inbound packages and WH status',
      },
      {
        label: 'History',
        path: '/history',
        icon: ClipboardList,
        description: 'Received activity log',
      },
      {
        label: 'Suppliers',
        path: '/suppliers',
        icon: Users,
        description: 'Supplier directory',
      },
      {
        label: 'Carriers',
        path: '/carriers',
        icon: Truck,
        description: 'Carrier contacts and delivery notes',
      },
    ],
    submenus: [],
  },
  {
    label: 'Control',
    icon: SearchCheck,
    items: [
      {
        label: 'Prices',
        path: '/prices',
        icon: Tag,
        description: 'Price change queue',
      },
      {
        label: 'Audit',
        path: '/inventory-audit',
        icon: SearchCheck,
        description: 'Cycle counts and mismatch review',
      },
    ],
    submenus: [],
  },
  {
    label: 'Accounting',
    icon: Landmark,
    items: [
      {
        label: 'Overview',
        path: '/accounting',
        icon: Landmark,
        description: 'Payables and warehouse invoice coverage',
      },
      {
        label: 'Invoices',
        path: '/accounting/invoices',
        icon: ReceiptText,
        description: 'Create, split checks, and review invoices',
      },
    ],
    submenus: [
      {
        label: 'Payables',
        items: [
          { label: 'Vendors', path: '/accounting/vendors', icon: Users, description: 'Terms and mailing setup' },
          { label: 'Overdue review', path: '/accounting', icon: ReceiptText, description: 'Highest-risk invoices' },
        ],
      },
    ],
  },
] as const;

const menuItems = menuGroups.flatMap(group => [
  ...group.items,
  ...group.submenus.flatMap(submenu => submenu.items),
]);

function PreviewMenuItem({
  item,
  activePath,
  onSelect,
}: {
  item: (typeof menuItems)[number];
  activePath: string;
  onSelect: (path: string) => void;
}) {
  const active = activePath === item.path;

  return (
    <MenubarItem
      onSelect={() => onSelect(item.path)}
      className={cn(
        'cursor-pointer rounded-md px-3 py-2 text-sm font-semibold',
        active && 'bg-zinc-100 text-zinc-950'
      )}
    >
      {item.label}
    </MenubarItem>
  );
}

function NestedNavbarPreview({
  activePath,
  onSelect,
}: {
  activePath: string;
  onSelect: (path: string) => void;
}) {
  const dashboardItem = menuGroups.find(group => group.label === 'Dashboard')?.items[0];
  const dropdownGroups = menuGroups.filter(group => group.label !== 'Dashboard');

  return (
    <Menubar className="h-auto flex-wrap justify-center gap-1 rounded-md border-zinc-200 bg-white/90 p-1.5 shadow-sm">
      {dashboardItem && (
        <button
          type="button"
          onClick={() => onSelect(dashboardItem.path)}
          className={cn(
            'inline-flex h-10 items-center rounded-md px-3 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950',
            activePath === dashboardItem.path && 'bg-zinc-950 text-white hover:bg-zinc-950 hover:text-white'
          )}
        >
          Dashboard
        </button>
      )}
      {dropdownGroups.map(group => {
        const groupActive = group.items.some(item => item.path === activePath)
          || group.submenus.some(submenu => submenu.items.some(item => item.path === activePath));

        return (
          <MenubarMenu key={group.label}>
            <MenubarTrigger
              className={cn(
                'h-10 cursor-pointer rounded-md px-3 font-semibold text-zinc-600 transition-colors data-[state=open]:bg-zinc-950 data-[state=open]:text-white',
                groupActive && 'bg-zinc-950 text-white'
              )}
            >
              {group.label}
            </MenubarTrigger>
            <MenubarContent className="min-w-[190px] rounded-md border-zinc-200 bg-white p-1.5 shadow-xl">
              {group.items.map(item => (
                <PreviewMenuItem key={`${group.label}-${item.label}`} item={item} activePath={activePath} onSelect={onSelect} />
              ))}
              {group.submenus.length > 0 ? <MenubarSeparator /> : null}
              {group.submenus.map(submenu => (
                <MenubarSub key={`${group.label}-${submenu.label}`}>
                  <MenubarSubTrigger className="cursor-pointer rounded-md px-3 py-2 text-sm font-semibold">
                    {submenu.label}
                  </MenubarSubTrigger>
                  <MenubarSubContent className="min-w-[190px] rounded-md border-zinc-200 bg-white p-1.5 shadow-xl">
                    {submenu.items.map(item => (
                      <PreviewMenuItem
                        key={`${group.label}-${submenu.label}-${item.label}`}
                        item={item}
                        activePath={activePath}
                        onSelect={onSelect}
                      />
                    ))}
                  </MenubarSubContent>
                </MenubarSub>
              ))}
            </MenubarContent>
          </MenubarMenu>
        );
      })}
    </Menubar>
  );
}

export default function NavbarPreviewPage() {
  const [activePath, setActivePath] = useState('/');
  const activeItem = useMemo(
    () => menuItems.find(item => item.path === activePath) || menuItems[0],
    [activePath]
  );
  const ActiveIcon = activeItem.icon;

  return (
    <div className="min-h-screen bg-[#f7f8f5] text-zinc-950">
      <header className="border-b border-zinc-200 bg-[#fbfcf8]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-3">
          <div className="flex min-h-14 items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm">
                <img src="/all-zentro-logo-square.png" alt="" className="h-10 w-10 object-contain" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-base font-bold tracking-tight">All Zentro Solutions</div>
                <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
                  <Warehouse className="h-3.5 w-3.5" />
                  Warehouse command center
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 sm:block">
                Sync ready
              </div>
              <div className="hidden rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm md:block">
                <span className="text-zinc-500">Welcome, </span>
                <span className="font-semibold">Manager</span>
              </div>
              <button className="flex h-10 w-10 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 shadow-sm hover:bg-zinc-50">
                <Settings className="h-4 w-4" />
              </button>
              <button className="flex h-10 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>

          <NestedNavbarPreview activePath={activePath} onSelect={setActivePath} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-4 py-6">
        <section className="border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-md border border-zinc-200 bg-[#f7f8f5]">
                <ActiveIcon className="h-6 w-6 text-zinc-700" />
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{activeItem.label}</h1>
                <p className="text-sm text-zinc-500">{activeItem.description}</p>
              </div>
            </div>
            <div className="flex min-w-0 max-w-full flex-wrap gap-2 sm:justify-end">
              <span className="rounded-md border border-zinc-200 bg-[#f7f8f5] px-3 py-2 text-sm font-semibold text-zinc-600">
                Route {activeItem.path}
              </span>
              <span className="rounded-md border border-zinc-200 bg-[#f7f8f5] px-3 py-2 text-sm font-semibold text-zinc-600">
                Nested menu preview
              </span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
