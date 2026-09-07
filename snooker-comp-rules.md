# Maroubra Seals Snooker Competition — Rules

Part A is for players. Part B is how the app runs the night and is the spec for the app.

---

# Part A — Player rules

## 1. Format

- Single-elimination knockout, played on one night, with a **16 or 32 player** round-one bracket.
- Every match is **one frame** with a **25-minute time limit** (see 5).
- Lose in round one and you can **buy back** for one more match in round one. Lose in round two or later and you are out.
- If the club's time runs out before the final, the organiser **ends the night where it stands**. Every result played counts and the handicaps are adjusted as usual (6, 13); the title is simply not awarded that week.

## 2. Fees

|                   | AUD         |
| ----------------- | ----------- |
| Competition entry | **5** |
| Buy-back          | **2** |

## 3. Round one and buy-backs

- All entered players are drawn at random into round one.
- A round-one loser can buy back **once**, if they want to — it is never automatic. A buy-back goes straight into the bracket: a **random empty match** while one is left, otherwise the empty seat beside a **random player still waiting for an opponent**, first-draw or buy-back alike (see 9). Winners join the first-draw winners in round two.
- **Buy-backs are limited to the empty slots, first come first served.** A bracket with no empty slots has no room for any; when the last slot goes, the next loser is out however willing they are to pay. The organiser picks the bracket size with this in mind.
- A player who arrives after the draw can enter as a **late arrival**, taking an empty slot and placed the same way as a buy-back (see 9). A late arrival is not a buy-back: if they lose in round one they can buy back once, like everyone else.
- Once the organiser closes the buy-back window, no more entries for the night. (If it was closed by mistake, the organiser can reopen it from the app's override screen.)

## 4. Free passes and the bracket

- The bracket is **fixed**: the winners of matches 1 and 2 meet in round two, the winners of matches 3 and 4 meet next to them, and so on up to the final. Your place in the tree is set by the slot you drew in round one.
- A **free pass** is what you get when the other side of your next match is empty — nobody drawn there, or everyone there already knocked out. You move on without playing.
- When the buy-back window closes, **every** round-one player still without an opponent gets a free pass to round two: two half-filled matches means two free passes. If the organiser would rather those two played each other, they use **Force Pair** (10) before closing.
- A free pass can happen in any round, more than once in the same round, and the same player can get several in a row: with few players the bottom of the bracket is empty and whoever sits just above it climbs until they meet someone. Buy-backs filling the empty matches is what keeps that rare.

## 5. Time limit

- The 25-minute clock starts when the organiser starts the match in the app. The app alerts when time is up.
- If the frame is unfinished at time, the player **ahead on points** wins. If level, a **re-spotted black** decides it.

## 6. Handicaps

- Every player has a handicap rating. **The lower the number, the better the player, and ratings can go below zero** — it runs like a golf handicap.
- The weaker player — the one with the **higher** number — starts the frame with **two thirds of the difference**, rounded to the nearest point.
- Example: ratings 45 and 20 give a difference of 25, so the player on **45** starts on **17**. Negative numbers work the same way: 20 against −5 is also a difference of 25, so the player on 20 starts on 17.
- Ratings are reviewed **weekly** on the previous week's results: a good night brings your number **down**, a bad night puts it **up** (see 13). The organiser has final say.

## 7. Conduct

- Be at the table when your match is called, or the organiser may award it to your opponent.
- Standard snooker rules apply at the table. The organiser's decision on any dispute is final.

---

# Part B — App behaviour

**Waiting player**: a player in the current round with no opponent yet.

## 8. Setup and start

1. Organiser sets the bracket size (**16 or 32**) and selects the entered players. The bracket size cannot be changed after start. The match time limit and the rating scale (13) live on a separate settings page.
2. **Start Competition** shuffles the players and fills the round-one bracket top to bottom with no gaps. Slots left empty stay open for buy-backs and late arrivals; an odd player out becomes a waiting player.
3. After start, players can only be added as late arrivals (3) while the buy-back window is open, or through the override (5).
4. **End night here** closes a night that has run out of time. The night counts: every result is kept, it goes into the history, and the handicap review opens as usual — but no winner is recorded, and it reads "completed (unfinished)". A match still on the clock is put back to not started. It cannot be undone.
5. If the draw is wrong, the organiser can **abandon** the night and set it up again. Everything played so far is kept for the record, but an abandoned night counts for nothing and gets no handicap review.
6. The organiser's **override** screen can change anything at any point — add or remove a player, repair a match, reopen the buy-back window — for the things a night throws up that no rule covers. Every use is logged against the organiser who did it.

## 9. Buy-back placement

A buy-back or late arrival is placed the moment they enter; there is no waiting list.

- While an **empty match** is left in round one, they take one at random.
- When none is left, they take the empty seat beside a **random waiting player**, whether that player came from the first draw or from a buy-back.
- A match forms as soon as the second seat of a pair fills. A player alone in a match shows as *awaiting opponent* until then.

## 10. Force Pair (round one only)

For when a table is free but no match is ready. **Force Pair** picks two waiting players at random and pairs them, whether they came from the first draw or from buy-backs. It does nothing if fewer than two are waiting, and never breaks an existing match. Hidden from round two onwards.

## 11. Closing buy-backs and moving up the bracket

- **Close Buy-Backs** — the **No More Buy-Backs / Late Entries** button — locks the player list. Nothing closes it automatically: buy-backs and late arrivals are taken until the organiser taps it, even after every round-one match has been played.
- When the window closes, **every** round-one player still without an opponent gets a free pass to round two. There may be more than one (4); **Force Pair** before closing is how the organiser avoids that.
- Winners move up the bracket as each match finishes: a round-two match is ready the moment both matches feeding it are done, without waiting for the rest of round one. Later rounds follow the same way, with no buy-backs and no Force Pair.

## 12. Match timer and status

| State       | Colour          |
| ----------- | --------------- |
| Not started | none            |
| In play     | **green** |
| Finished    | **red**   |

- **Start** on a match turns it green and begins the countdown. The default is 25 minutes, configurable for the whole competition and overridable per match. The countdown keeps running wherever the organiser is in the app.
- At zero the app plays the voice alert **"Match timed out"** and shows a warning on the match. The match stays green until a result is entered.
- **Complete** on a match: the organiser selects the winner and, for a round-one loser, whether they buy back or decline. The match turns red, the clock stops, and the winner is **advanced automatically** into their next match up the bracket.
- **Cancel start** puts a match that was started by mistake back to not started and throws the clock away. Nothing else about the match changes and it can be started again.
- A result cannot be entered on a match that has not started. A wrong result can be corrected as long as the winner's next match has not started, which pulls them back out of the next round. Past that point the organiser's override screen can still unwind it.

## 13. Handicap ratings in the app

- Each player has a stored rating. When a match is created the app shows the start and which player receives it, calculated as in 6.
- After each night the organiser adjusts ratings on a scale set in the app: the night's **top X finishers change by Y**, the **bottom Z change by W**, everyone else is unchanged. The defaults are the top **3** by **−1** and the bottom **3** by **+2** — so a good night brings your number down and a bad night puts it up, as in 6. All four numbers are settings and can be changed before any night.
- The app proposes every new rating and the organiser can change any of them before saving. The organiser can override any rating at any other time too.
- The app records who changed a rating and when. Each organiser has their own code, so it knows who without anyone typing a name.
- Players are never deleted from the club list. Someone who has left is marked **inactive**; their ratings history and past results are kept.

---

**Nothing outstanding.** The organiser's rulings on everything these rules left open are recorded in [functional-spec.md](functional-spec.md) section 10, numbered O-1 to O-14; the wording above has been brought into line with them. O-13 (placement) and O-14 (the fixed bracket) are the two most recent.
