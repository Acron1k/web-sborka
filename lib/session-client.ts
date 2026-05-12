'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getFamilyCookie } from '@/lib/session';

export function useCurrentFamily(slug: string): string | null | 'loading' {
  const router = useRouter();
  const [familyId, setFamilyId] = useState<string | null | 'loading'>('loading');

  useEffect(() => {
    const id = getFamilyCookie(slug);
    if (!id) router.replace(`/t/${slug}/join`);
    else setFamilyId(id);
  }, [slug, router]);

  return familyId;
}
