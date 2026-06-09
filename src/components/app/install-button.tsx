"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

export function InstallButton() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <p className="text-sm text-stone-500">Aplikace je nainstalovaná. ✅</p>
    );
  }

  if (!deferred) {
    return (
      <p className="max-w-sm text-sm text-stone-500">
        Na Androidu (Chrome/Edge) otevři menu prohlížeče → <strong>Přidat na
        plochu / Nainstalovat aplikaci</strong>. Na iOS (Safari) → Sdílet →{" "}
        <strong>Přidat na plochu</strong>. Případně se tu objeví tlačítko.
      </p>
    );
  }

  return (
    <Button
      onClick={async () => {
        await deferred.prompt();
        await deferred.userChoice;
        setDeferred(null);
      }}
    >
      <Download className="size-4" />
      Nainstalovat aplikaci
    </Button>
  );
}
