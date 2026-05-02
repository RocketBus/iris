'use client';

import { useState } from 'react';

import { Menu } from 'lucide-react';

import { ApertureMark } from '@/components/brand/ApertureMark';

import { TenantNavList } from './TenantNavList';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useTranslation } from '@/hooks/useTranslation';

export function TenantMobileNav() {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 lg:hidden"
          aria-label={t('navigation.openMenu')}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <ApertureMark className="size-5 text-primary" />
            Iris
          </SheetTitle>
        </SheetHeader>
        <div className="p-3">
          <TenantNavList onItemClick={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
