"use client";

import Terms from "./terms.mdx";

import { env } from "@/lib/env";

const Page = () => {
  return (
    <section className="mx-auto max-w-2xl px-4 py-28 lg:pt-44 lg:pb-32">
      <article className="prose prose-lg dark:prose-invert">
        <Terms
          operatorName={env.NEXT_PUBLIC_OPERATOR_NAME}
          operatorJurisdiction={env.NEXT_PUBLIC_OPERATOR_JURISDICTION}
          operatorPrivacyEmail={env.NEXT_PUBLIC_OPERATOR_PRIVACY_EMAIL}
        />
      </article>
    </section>
  );
};

export default Page;
