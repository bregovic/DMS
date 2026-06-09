"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Initial = {
  ico?: string | null;
  name?: string | null;
  dic?: string | null;
  address?: string | null;
};

// Pole IČO/Název/DIČ/Adresa s tlačítkem „Z ARES". Inputy jsou řízené, aby je
// šlo po dotažení z registru naplnit; názvy odpovídají server action vendors.
export function AresLookup({ initial, autoFocus }: { initial?: Initial; autoFocus?: boolean }) {
  const [ico, setIco] = useState(initial?.ico ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [dic, setDic] = useState(initial?.dic ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function lookup() {
    const clean = ico.replace(/\D/g, "");
    if (!clean) {
      setErr("Zadej IČO.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/ares/${clean}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Subjekt se nepodařilo načíst.");
        return;
      }
      if (data.name) setName(data.name);
      if (data.dic) setDic(data.dic);
      if (data.address) setAddress(data.address);
      if (data.ico) setIco(data.ico);
    } catch {
      setErr("Chyba spojení s ARES.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="ico">IČO</Label>
        <div className="flex gap-2">
          <Input
            id="ico"
            name="ico"
            value={ico}
            onChange={(e) => setIco(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                lookup();
              }
            }}
            inputMode="numeric"
            placeholder="napr. 27074358"
            autoFocus={autoFocus}
          />
          <Button type="button" variant="outline" onClick={lookup} disabled={loading} className="shrink-0">
            <Search className="size-4" />
            {loading ? "Hledám…" : "Z ARES"}
          </Button>
        </div>
        {err && <p className="text-xs text-red-700">{err}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name">Název dodavatele</Label>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Např. Novák stavby s.r.o."
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="dic">DIČ</Label>
          <Input id="dic" name="dic" value={dic} onChange={(e) => setDic(e.target.value)} placeholder="CZ…" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="address">Adresa</Label>
          <Input
            id="address"
            name="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ulice, město"
          />
        </div>
      </div>
    </>
  );
}
