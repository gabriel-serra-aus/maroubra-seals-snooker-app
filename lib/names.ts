// The name the public site shows (spec 3.8, O-21): first name and the first letter of the surname, so a
// member's full name never leaves the server on a public route. The organiser's screens keep full names.

/** Most surname letters a public name grows to before a clash is left for the organiser to fix (O-21). */
export const MAX_SURNAME_LETTERS = 3;

interface Parts {
  first: string;
  /** The surname's letters only: "O' Sullivan" → "OSullivan". Empty for a one-word name. */
  surname: string;
}

/** "Leonard Thomlinson (Lenny)" → Lenny + Thomlinson: a bracketed nickname stands in for the first name. */
function parts(full: string): Parts {
  const nick = /\(([^)]*)\)/.exec(full)?.[1]?.trim();
  const words = full.replace(/\([^)]*\)/g, " ").trim().split(/\s+/).filter(Boolean);
  const first = nick || words[0] || "?";
  return { first, surname: words.slice(1).join("").replace(/[^\p{L}]/gu, "") };
}

function label(p: Parts, letters: number): string {
  return p.surname ? `${p.first} ${p.surname.slice(0, letters)}.` : p.first;
}

/** One name on its own: "Gabriel Serra" → "Gabriel S." */
export function shortName(full: string): string {
  return label(parts(full), 1);
}

/**
 * Public names for a whole list (O-21). Everyone starts at one surname letter; players whose names would
 * read the same get more letters, up to MAX_SURNAME_LETTERS ("Chris Han." / "Chris Hal."), and only they do.
 * Players still alike after that are returned in `clashes` for the organiser to fix, e.g. with a nickname.
 */
export function publicNames(players: ReadonlyArray<{ id: string; name: string }>): { names: Map<string, string>; clashes: string[][] } {
  const info = players.map((p) => ({ id: p.id, full: p.name, parts: parts(p.name), letters: 1 }));
  const groups = () => {
    const by = new Map<string, typeof info>();
    for (const x of info) {
      const key = label(x.parts, x.letters).toLowerCase();
      by.set(key, [...(by.get(key) ?? []), x]);
    }
    return [...by.values()].filter((g) => g.length > 1);
  };
  for (let grew = true; grew; ) {
    grew = false;
    for (const g of groups()) {
      for (const x of g) {
        if (x.letters < MAX_SURNAME_LETTERS && x.letters < x.parts.surname.length) {
          x.letters++;
          grew = true;
        }
      }
    }
  }
  return {
    names: new Map(info.map((x) => [x.id, label(x.parts, x.letters)])),
    clashes: groups().map((g) => g.map((x) => x.full)),
  };
}
