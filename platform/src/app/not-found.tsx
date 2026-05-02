import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import { Background } from "@/components/background";
import { Button } from "@/components/ui/button";
import { getServerTranslation } from "@/lib/server-translation";

export default async function NotFound() {
  const { t } = await getServerTranslation();
  return (
    <Background>
      <div className="container flex min-h-[70vh] flex-col items-center justify-center py-28 text-center lg:min-h-[80vh] lg:py-32">
        <div className="relative z-10 max-w-2xl">
          <h1 className="from-foreground to-foreground/70 relative mb-6 bg-linear-to-br bg-clip-text py-2 text-5xl font-bold text-transparent sm:text-6xl lg:text-7xl">
            {t('notFound.title')}
          </h1>

          <p className="text-muted-foreground mb-10 text-xl">
            {t('notFound.description')}
          </p>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="group min-w-[200px] gap-2">
              <Link href="/">
                <ArrowLeft className="size-5 transition-transform group-hover:-translate-x-1" />
                {t('notFound.back')}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Background>
  );
}
