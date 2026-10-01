/** Identifikátor běžícího nasazení – mění se s každým nasazením na Railway.
 *  Stránka otevřená přes nasazení volá serverové akce, které už na serveru
 *  neexistují; podle tohohle se to pozná (viz components/app/version-watch). */
export function appVersion(): string {
  return (
    process.env.RAILWAY_DEPLOYMENT_ID ??
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    "dev"
  );
}
