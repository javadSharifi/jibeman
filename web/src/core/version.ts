import { Money } from './money';

export interface AppChangelog {
  title?: string;
  added?: string[];
  fixed?: string[];
  improved?: string[];
}

export interface AppVersionInfo {
  version: string;
  build: number | null;
  commit: string;
  buildTime: string;
  buildId: string;
  changelog?: AppChangelog | null;
}

export const APP_VERSION_INFO: AppVersionInfo = __APP_VERSION_INFO__;
export const APP_VERSION: string = APP_VERSION_INFO.version;

/** Formats a semver or numeric version string using Persian digits. */
export function formatVersionFa(version: string): string {
  return Money.fa(version);
}
