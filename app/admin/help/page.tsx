import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { currentSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Organiser help · Maroubra Seals Snooker" };

type Step = { img?: string; alt?: string; lines: ReactNode[] };
type Tab = { id: string; title: string; steps: Step[] };

/** Screenshots live in public/help/: a sample night, the button to tap ringed in orange. */
const TABS: Tab[] = [
  {
    id: "start",
    title: "Start the night",
    steps: [
      { img: "login.png", alt: "Login screen", lines: [<>Type your code. Tap <b>Log in</b>.</>, "Your code puts your name on every change.", "The phone stays logged in week to week."] },
      { img: "setup.png", alt: "Setup screen", lines: [<>Check the name. Leave the size on <b>32</b>.</>, <>Tap <b>Set up tonight&apos;s competition</b>.</>] },
      { img: "tick-players.png", alt: "Club players list", lines: [<>Tick everyone who is here. Tap <b>Add</b>.</>, <>Not on the list? Tap <b>+ New player</b>.</>] },
      { img: "start-competition.png", alt: "Start Competition button", lines: [<>Tap <b>Start Competition</b>.</>] },
      { img: "start-confirm.png", alt: "Start confirmation", lines: [<>Tap <b>Start with 32</b>. The draw is made.</>, "The size cannot change after this."] },
    ],
  },
  {
    id: "play",
    title: "Play a match",
    steps: [
      { lines: [<>Tip: tap <b>List</b> (under Find player). It is the easiest view, and the phone remembers it.</>] },
      { img: "match-start.png", alt: "Ready match", lines: [<>Tap <b>Start match</b>.</>] },
      { img: "pick-table.png", alt: "Table picker", lines: ["Tap a free table. The clock starts."] },
      {
        img: "match-live.png",
        alt: "Match being played",
        lines: [
          <>Green <b>starts on 5</b> = the weaker player starts with 5 points.</>,
          "The clock keeps going if the phone locks.",
          <>At zero the phone beeps (button must say <b>Sound on</b>). Play on until someone wins.</>,
        ],
      },
    ],
  },
  {
    id: "result",
    title: "Record a result",
    steps: [
      { img: "match-live.png", alt: "Record result button", lines: [<>Tap <b>Record result</b>.</>] },
      { img: "result-winner.png", alt: "Who won?", lines: ["Tap the winner."] },
      {
        img: "result-buyback.png",
        alt: "Buy-back choice",
        lines: [<>Round one only: tap <b>buys back · $2</b> or <b>declines</b>.</>, <>Tap <b>Save result</b>.</>, "Winners move up automatically."],
      },
    ],
  },
  {
    id: "close",
    title: "Close entries",
    steps: [
      { img: "toolbar-late.png", alt: "Late entry button", lines: [<>Someone arrives late? Tap <b>+ Late entry</b>.</>] },
      { img: "late-entry.png", alt: "Add late arrival", lines: [<>Tap their name. Tap <b>Add</b>.</>] },
      {
        img: "close-entries.png",
        alt: "Close entries button",
        lines: [<>Nobody else coming? Tap <b>Close entries</b>.</>, "It never closes by itself. The yellow note says when round one is done."],
      },
      {
        img: "close-confirm.png",
        alt: "Close confirmation",
        lines: [<>Tap <b>Close the window</b>.</>, "Anyone without an opponent goes through to round two.", "After this: no buy-backs, no late entries."],
      },
    ],
  },
  {
    id: "end",
    title: "End of night",
    steps: [
      { img: "ratings-review.png", alt: "Ratings review", lines: ["After the final, the ratings review opens.", "Check the new numbers. Change a box if needed."] },
      { img: "ratings-save.png", alt: "Save rating changes", lines: [<>Tap <b>Save rating changes</b>. It saves once.</>] },
      { img: "history.png", alt: "History", lines: [<>Past nights: tap <b>History</b>.</>] },
      {
        img: "end-night.png",
        alt: "End night button",
        lines: [<>Out of time? Tap <b>End night</b>. No winner. Cannot be undone.</>, <><b>Abandon night</b> (red) scraps the night. Nothing counts.</>],
      },
    ],
  },
  {
    id: "fix",
    title: "Fix a mistake",
    steps: [
      { img: "cancel-start.png", alt: "Cancel start", lines: [<>Started the wrong match? Tap <b>Cancel start</b>.</>] },
      { img: "review-result.png", alt: "Review result", lines: [<>Wrong winner? Tap <b>Review result</b>.</>, "Works until the winner's next match starts."] },
      {
        img: "override.png",
        alt: "Master override",
        lines: [<>Still stuck? <b>More › Override</b>.</>, "Every action asks first and records your name.", <>Closed entries too soon? <b>Reopen buy-backs</b> is there.</>],
      },
    ],
  },
  {
    id: "players",
    title: "Players",
    steps: [
      { img: "players.png", alt: "Players list", lines: [<>Tap <b>Players</b>, then <b>+ Add player</b> or <b>Edit</b>.</>] },
      { img: "add-player.png", alt: "Add player", lines: [<>Type the name and rating. Tap <b>Add</b>.</>, "Lower rating = better player. Below zero is normal."] },
      { img: "edit-player.png", alt: "Change a rating", lines: ["To change a rating: type the new number and a reason."] },
      { img: "edit-player-save.png", alt: "Save", lines: [<>Tap <b>Save</b>.</>, <>Left the club? Tick <b>Inactive</b>. Nobody is ever deleted.</>] },
    ],
  },
];

/**
 * Organiser help (spec 3.12): a cheat sheet that opens in its own window from More › Help, so it has no top bar.
 * The tabs are radio buttons styled in CSS: no client code, and switching is instant on a slow connection.
 */
export default async function HelpPage() {
  if (!(await currentSession())) redirect("/admin/login");
  return (
    <main className="help">
      <header className="help-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/club-logo-small.png" alt="" width={48} height={48} />
        <h1>Organiser help</h1>
      </header>
      {TABS.map((t, i) => (
        <input key={t.id} type="radio" name="help-tab" id={`help-${t.id}`} defaultChecked={i === 0} />
      ))}
      <nav className="help-tabs">
        {TABS.map((t) => (
          <label key={t.id} htmlFor={`help-${t.id}`}>
            {t.title}
          </label>
        ))}
      </nav>
      {TABS.map((t) => (
        <section key={t.id} className={`help-panel help-panel-${t.id}`}>
          <h2>{t.title}</h2>
          <ol>
            {t.steps.map((s, i) => (
              <li key={i} className={s.img ? "" : "help-tip"}>
                {s.img && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/help/${s.img}`} alt={s.alt} loading="lazy" />
                )}
                {s.lines.map((l, j) => (
                  <p key={j}>{l}</p>
                ))}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </main>
  );
}
