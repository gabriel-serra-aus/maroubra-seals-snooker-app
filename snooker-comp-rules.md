# Maroubra Seals Snooker Competition — Rules

Part A is for players. Part B is how the app runs the night and is the spec for the app.

---

# Part A — Player rules

## 1. Format

- Single-elimination knockout, played on one night, with a **16 or 32 player** round-one bracket.
- Every match is **one frame** with a **25-minute time limit** (see 5).
- Lose in round one and you can **buy back** for one more match in round one. Lose in round two or later and you are out.

## 2. Fees

|                   | AUD         |
| ----------------- | ----------- |
| Competition entry | **5** |
| Buy-back          | **2** |

## 3. Round one and buy-backs

- All entered players are drawn at random into round one.
- A round-one loser can buy back **once**, if they want to — it is never automatic. Buy-backs fill the slots left empty in the bracket, **empty matches first**, so buy-back players usually play each other; once those are full a buy-back is paired with a first-draw player who is still waiting. Winners join the first-draw winners in round two.
- **Buy-backs are limited to the empty slots, first come first served.** A bracket with no empty slots has no room for any; when the last slot goes, the next loser is out however willing they are to pay. The organiser picks the bracket size with this in mind.
- A player who arrives after the draw can enter as a buy-back player, taking a slot the same way.
- Once the organiser closes the buy-back window, no more entries for the night. (If it was closed by mistake, the organiser can reopen it from the app's override screen.)

## 4. Free passes

- When a round has an odd number of players, one player drawn at random advances without playing.
- **Round one can give more than one free pass.** When the buy-back window closes, everyone still without an opponent goes straight to round two — two half-filled matches means two free passes. If the organiser would rather those two played each other, they use **Force Pair** (10) before closing.
- From round two onwards there is at most one free pass per round.

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

1. Organiser sets the bracket size (**16 or 32**), selects the entered players, and picks the buy-back mode (see 9). The bracket size cannot be changed after start.
2. **Start Competition** shuffles the players and fills the round-one bracket top to bottom with no gaps. Slots left empty stay open for buy-backs and late arrivals; an odd player out becomes a waiting player.
3. After start, players can only be added as buy-backs.
4. If the draw is wrong, the organiser can **abandon** the night and set it up again. Everything played so far is kept for the record.
5. The organiser's **override** screen can change anything at any point — add or remove a player, repair a match, reopen the buy-back window — for the things a night throws up that no rule covers. Every use is logged against the organiser who did it.

## 9. Buy-back modes

Chosen before the night; can be switched at any time during round one.

- **Random Draw (default).** Buy-back players are shuffled and paired in one go when the window closes. Fairest, but tables can sit idle while the window is open.
- **Sequential Pairing.** Buy-back players are paired in the order they re-enter. A match forms as soon as two are waiting. Keeps tables busy.

Either mode fills the empty round-one matches before it fills the empty seat beside a first-draw player who is still waiting (3).

## 10. Force Pair (round one only)

For when a table is free but no match is ready. **Force Pair** picks two waiting players at random and pairs them, whether they came from the first draw or from buy-backs. It does nothing if fewer than two are waiting, and never breaks an existing match. Hidden from round two onwards.

## 11. Closing buy-backs and finishing round one

- **Close Buy-Backs** locks the player list. It also closes automatically once every round-one loser has bought back or been marked **Declined**.
- When the window closes, any waiting buy-backs are placed into the empty slots, and **every** player left without an opponent gets a free pass to round two. There may be more than one (4); **Force Pair** before closing is how the organiser avoids that.
- When all round-one matches are finished, winners and free-pass holders move to round two. Later rounds are drawn from the players who advanced, with no buy-backs and no Force Pair.

## 12. Match timer and status

| State       | Colour          |
| ----------- | --------------- |
| Not started | none            |
| In play     | **green** |
| Finished    | **red**   |

- **Start** on a match turns it green and begins the countdown. The default is 25 minutes, configurable for the whole competition and overridable per match. The countdown keeps running wherever the organiser is in the app.
- At zero the app plays the voice alert **"Match timed out"** and shows a warning on the match. The match stays green until a result is entered.
- **Complete** on a match: the organiser selects the winner and, for a round-one loser, whether they buy back or decline. The match turns red, the clock stops, and the winner is **advanced automatically**.
- **Cancel start** puts a match that was started by mistake back to not started and throws the clock away. Nothing else about the match changes and it can be started again.
- A result cannot be entered on a match that has not started. A wrong result can be corrected as long as the winner's next match has not started, which pulls them back out of the next round. Past that point the organiser's override screen can still unwind it.

## 13. Handicap ratings in the app

- Each player has a stored rating. When a match is created the app shows the start and which player receives it, calculated as in 6.
- After each night the organiser adjusts ratings on a scale set in the app: the night's **top X finishers change by Y**, the **bottom Z change by W**, everyone else is unchanged. The defaults are the top **3** by **−1** and the bottom **3** by **+2** — so a good night brings your number down and a bad night puts it up, as in 6. All four numbers are settings and can be changed before any night.
- The app proposes every new rating and the organiser can change any of them before saving. The organiser can override any rating at any other time too.
- The app records who changed a rating and when. Each organiser has their own code, so it knows who without anyone typing a name.
- Players are never deleted from the club list. Someone who has left is marked **inactive**; their ratings history and past results are kept.

---

**Nothing outstanding.** The twelve open questions raised against these rules were answered by the organiser and are recorded in [functional-spec.md](functional-spec.md) section 10, numbered O-1 to O-12; the wording above has been brought into line with them.
