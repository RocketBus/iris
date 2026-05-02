"use client";

import Terms from "./terms.mdx";

const Page = () => {
  return (
    <section className="mx-auto max-w-2xl px-4 py-28 lg:pt-44 lg:pb-32">
      <article className="prose prose-lg dark:prose-invert">
        <Terms />
      </article>
    </section>
  );
};

export default Page;
