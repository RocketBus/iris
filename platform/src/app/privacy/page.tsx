"use client";

import Privacy from "./privacy.mdx";

import { env } from "@/lib/env";

const Page = () => {
  return (
    <section className="mx-auto max-w-2xl px-4 py-28 lg:pt-44 lg:pb-32">
      <article className="prose prose-lg dark:prose-invert">
        <Privacy
          operatorName={env.NEXT_PUBLIC_OPERATOR_NAME}
          operatorJurisdiction={env.NEXT_PUBLIC_OPERATOR_JURISDICTION}
          operatorPrivacyEmail={env.NEXT_PUBLIC_OPERATOR_PRIVACY_EMAIL}
          operatorDpoEmail={
            env.NEXT_PUBLIC_OPERATOR_DPO_EMAIL ||
            env.NEXT_PUBLIC_OPERATOR_PRIVACY_EMAIL
          }
        />
      </article>
    </section>
  );
};

export default Page;
