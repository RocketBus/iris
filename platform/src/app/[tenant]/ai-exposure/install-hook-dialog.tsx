'use client';

import { useState } from 'react';

import { Check, Copy } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useTranslation } from '@/hooks/useTranslation';

interface InstallHookDialogProps {
  children: React.ReactNode;
  repositoryName: string;
}

function CommandLine({ command }: { command: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silent fail — clipboard may be unavailable in some contexts
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 p-2 font-mono text-xs">
      <span className="text-muted-foreground">$</span>
      <code className="flex-1 truncate">{command}</code>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={copy}
        className="h-7 gap-1 px-2 text-xs"
        aria-label={copied ? t('aiExposure.install.copied') : t('aiExposure.install.copy')}
      >
        {copied ? (
          <>
            <Check className="size-3" />
            {t('aiExposure.install.copied')}
          </>
        ) : (
          <>
            <Copy className="size-3" />
            {t('aiExposure.install.copy')}
          </>
        )}
      </Button>
    </div>
  );
}

export function InstallHookDialog({ children, repositoryName }: InstallHookDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>{t('aiExposure.install.title')}</DialogTitle>
          <DialogDescription>
            {t('aiExposure.install.description', { name: repositoryName })}
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-4 text-sm">
          <li>
            <p className="mb-2 font-medium">
              <span className="mr-2 text-muted-foreground">1.</span>
              {t('aiExposure.install.step1')}
            </p>
            <CommandLine command="iris login" />
          </li>
          <li>
            <p className="mb-2 font-medium">
              <span className="mr-2 text-muted-foreground">2.</span>
              {t('aiExposure.install.step2')}
            </p>
            <CommandLine command="iris hook install" />
          </li>
          <li className="text-muted-foreground">
            <span className="mr-2">3.</span>
            {t('aiExposure.install.step3')}
          </li>
        </ol>

        <DialogFooter>
          <Button type="button" onClick={() => setOpen(false)}>
            {t('aiExposure.install.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
