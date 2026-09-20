"use client";

import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

/**
 * Decentní nabídka instalace na přihlašovací stránce: ukáže se jen tehdy,
 * když prohlížeč instalaci nabízí (Android, Chrome/Edge na počítači), nebo
 * na iPhonu jako jednořádková nápověda. V nainstalované aplikaci nic.
 */
export function InstallHint() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua);
    setIos(isIos);
    setHidden(!isIos);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
      setHidden(false);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden) return null;

  if (deferred)
    return (
      <button
        type="button"
        onClick={async () => {
          await deferred.prompt();
          await deferred.userChoice;
          setDeferred(null);
          setHidden(true);
        }}
        className="mt-6 flex w-full cursor-pointer items-center justify-center gap-2 border border-stone-300 py-2.5 text-xs text-stone-600 transition-colors hover:border-stone-950 hover:text-stone-950"
      >
        <Download className="size-3.5" />
        Nainstalovat aplikaci do telefonu
      </button>
    );

  if (ios)
    return (
      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11px] text-stone-400">
        <Share className="size-3.5 shrink-0" />
        Tip: <span className="text-stone-500">Sdílet → Přidat na plochu</span> a máš appku na ploše
      </p>
    );

  return null;
}
