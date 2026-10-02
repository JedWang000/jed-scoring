export const DEFAULT_DEVELOPER_URL = 'https://b23.tv/iNOah8D' as const;

export const BRAND = {
  productName: 'JED Scoring',
  developerName: '达子 Jed_Wang',
  versionLabel: 'V0.2.1',
  contactUrl: import.meta.env.VITE_JED_CONTACT_URL || DEFAULT_DEVELOPER_URL,
  homepageUrl: import.meta.env.VITE_JED_HOMEPAGE_URL || DEFAULT_DEVELOPER_URL
} as const;

export function isSafeDeveloperUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
