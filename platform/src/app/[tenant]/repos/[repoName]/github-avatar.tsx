'use client';

import { useState } from 'react';

export function GitHubAvatar({ username, name }: { username: string; name: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={`https://github.com/${username}.png?size=48`}
      alt={name}
      className="h-6 w-6 rounded-full"
      onError={() => setFailed(true)}
    />
  );
}
