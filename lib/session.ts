export function setFamilyCookie(slug: string, familyId: string) {
  const maxAge = 60 * 60 * 24 * 30; // 30 дней
  document.cookie = `trip_${slug}_family=${familyId}; max-age=${maxAge}; path=/; samesite=lax`;
}

export function getFamilyCookie(slug: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )trip_${slug}_family=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function clearFamilyCookie(slug: string) {
  document.cookie = `trip_${slug}_family=; max-age=0; path=/`;
}
