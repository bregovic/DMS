// Bezpečný evaluátor vzorců pro Procesní tabulky (bez eval).
// Vzorec je aritmetický výraz nad pojmenovanými parametry úkonu, např.:
//   "16 * delka * vyska"            – spotřeba na plochu
//   "ceil(vyska / vyska_rady)"      – počet řad
//   "1.2 * (delka * vyska)"         – normohodiny
//
// Podporováno: + - * / % ^ (mocnina, pravá asociativita), unární -, závorky,
// a funkce ceil, floor, round(x[,n]), abs, sqrt, min(...), max(...).
// Desetinný oddělovač je tečka. Neznámý parametr → chyba (chytí překlepy).

type Vars = Record<string, number>;

type Node =
  | { num: number }
  | { var: string }
  | { fn: string; args: Node[] }
  | { op: "u-" | "u+"; x: Node }
  | { op: "+" | "-" | "*" | "/" | "%" | "^"; l: Node; r: Node };

type Token = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

const FUNCS: Record<string, (...a: number[]) => number> = {
  ceil: Math.ceil,
  floor: Math.floor,
  abs: Math.abs,
  sqrt: Math.sqrt,
  round: (x: number, n = 0) => {
    const f = 10 ** n;
    return Math.round(x * f) / f;
  },
  min: Math.min,
  max: Math.max,
};

function tokenize(src: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      toks.push({ t: "num", v: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      toks.push({ t: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/%^(),".includes(c)) {
      toks.push({ t: "op", v: c });
      i++;
      continue;
    }
    throw new Error(`Neplatný znak ve vzorci: "${c}"`);
  }
  return toks;
}

function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = (): Token | undefined => toks[p];
  const eat = (v?: string): Token => {
    const tk = toks[p];
    if (!tk || (v && tk.v !== v)) throw new Error(`Chyba ve vzorci u "${tk?.v ?? "konec"}"`);
    p++;
    return tk;
  };

  function parseAdd(): Node {
    let l = parseMul();
    while (peek()?.t === "op" && (peek()!.v === "+" || peek()!.v === "-")) {
      const op = String(eat().v) as "+" | "-";
      l = { op, l, r: parseMul() };
    }
    return l;
  }
  function parseMul(): Node {
    let l = parseUnary();
    while (peek()?.t === "op" && "*/%".includes(String(peek()!.v))) {
      const op = String(eat().v) as "*" | "/" | "%";
      l = { op, l, r: parseUnary() };
    }
    return l;
  }
  function parseUnary(): Node {
    if (peek()?.t === "op" && (peek()!.v === "-" || peek()!.v === "+")) {
      const op = eat().v === "-" ? "u-" : "u+";
      return { op, x: parseUnary() };
    }
    return parsePow();
  }
  function parsePow(): Node {
    const base = parsePrimary();
    if (peek()?.t === "op" && peek()!.v === "^") {
      eat("^");
      return { op: "^", l: base, r: parseUnary() };
    }
    return base;
  }
  function parsePrimary(): Node {
    const tk = peek();
    if (!tk) throw new Error("Neúplný vzorec");
    if (tk.t === "num") {
      eat();
      return { num: tk.v };
    }
    if (tk.t === "id") {
      eat();
      if (peek()?.t === "op" && peek()!.v === "(") {
        eat("(");
        const args: Node[] = [];
        if (!(peek()?.v === ")")) {
          args.push(parseAdd());
          while (peek()?.v === ",") {
            eat(",");
            args.push(parseAdd());
          }
        }
        eat(")");
        return { fn: tk.v, args };
      }
      return { var: tk.v };
    }
    if (tk.v === "(") {
      eat("(");
      const e = parseAdd();
      eat(")");
      return e;
    }
    throw new Error(`Neočekávané "${tk.v}" ve vzorci`);
  }

  const ast = parseAdd();
  if (p < toks.length) throw new Error(`Přebytek ve vzorci u "${peek()!.v}"`);
  return ast;
}

function evalNode(n: Node, vars: Vars): number {
  if ("num" in n) return n.num;
  if ("var" in n) {
    if (!(n.var in vars)) throw new Error(`Chybí parametr "${n.var}"`);
    return vars[n.var];
  }
  if ("fn" in n) {
    const f = FUNCS[n.fn];
    if (!f) throw new Error(`Neznámá funkce "${n.fn}"`);
    return f(...n.args.map((a) => evalNode(a, vars)));
  }
  if ("x" in n) return n.op === "u-" ? -evalNode(n.x, vars) : evalNode(n.x, vars);
  const a = evalNode(n.l, vars);
  const b = evalNode(n.r, vars);
  switch (n.op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": return a / b;
    case "%": return a % b;
    case "^": return a ** b;
  }
}

function collectVars(n: Node, acc: Set<string>): void {
  if ("var" in n) acc.add(n.var);
  else if ("fn" in n) n.args.forEach((a) => collectVars(a, acc));
  else if ("x" in n) collectVars(n.x, acc);
  else if ("l" in n) {
    collectVars(n.l, acc);
    collectVars(n.r, acc);
  }
}

/** Vyhodnotí vzorec s danými hodnotami parametrů. Vyhodí chybu při neznámém
 *  parametru/funkci nebo syntaxi. Výsledek není konečné číslo → chyba. */
export function evalFormula(src: string, vars: Vars): number {
  const r = evalNode(parse(src), vars);
  if (!Number.isFinite(r)) throw new Error("Výsledek vzorce není platné číslo (dělení nulou?).");
  return r;
}

/** Vrátí názvy parametrů, na které se vzorec odkazuje (pro validaci a UI). */
export function formulaVariables(src: string): string[] {
  const acc = new Set<string>();
  collectVars(parse(src), acc);
  return Array.from(acc);
}

/** Ověří, že vzorec lze rozparsovat. Vrací chybovou hlášku, nebo null když OK. */
export function validateFormula(src: string): string | null {
  try {
    parse(src);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Neplatný vzorec.";
  }
}
