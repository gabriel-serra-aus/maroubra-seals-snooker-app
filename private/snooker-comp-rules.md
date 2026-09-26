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
- A round-one loser can buy back **once**. Buy-back players play each other in round one, and the winners join the first-draw winners in round two.
- A player who arrives after the draw can enter as a buy-back player.
- Once the organiser closes the buy-back window, no more entries for the night.

## 4. Free passes

- When a round has an odd number of players, one player drawn at random advances without playing.
- Round one can one or more free passes.

## 5. Time limit

- The 25-minute clock starts when the organiser starts the match in the app. The app alerts when time is up.
- If the frame is unfinished at time, the player **ahead on points** wins. If level, a **re-spotted black** decides it.

## 6. Handicaps

- Every player has a rating. The lower-rated player starts the frame with **two thirds of the rating difference**, rounded to the nearest point.
- Example: ratings 45 and 20 give a difference of 25, so the lower-rated player starts on **17**.
- Ratings are reviewed **weekly** on the previous week's results. Winners go up, losers come down. The organiser has final say.

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

## 9. Buy-back modes

Chosen before the night; can be switched at any time during round one.

- **Random Draw (default).** Buy-back players are shuffled and paired in one go when the window closes. Fairest, but tables can sit idle while the window is open.
- **Sequential Pairing.** Buy-back players are paired in the order they re-enter. A match forms as soon as two are waiting. Keeps tables busy.

## 10. Force Pair (round one only)

For when a table is free but no match is ready. **Force Pair** picks two waiting players at random and pairs them, whether they came from the first draw or from buy-backs. It does nothing if fewer than two are waiting, and never breaks an existing match. Hidden from round two onwards.

## 11. Closing buy-backs and finishing round one

- **Close Buy-Backs** locks the player list. It also closes automatically once every round-one loser has bought back or been marked **Declined**.
- The system fills every possible round-one match before giving a free pass. Only a player with no possible opponent gets one.
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
- A result cannot be entered on a match that has not started. A wrong result can be corrected as long as the winner's next match has not started, which pulls them back out of the next round.

## 13. Handicap ratings in the app

- Each player has a stored rating. When a match is created the app shows the lower-rated player's start, calculated as in 6.
- After each night the organiser adjusts ratings. Proposed scale, amounts **TBC**: winner of the night up, a player who lost their first match and did not win a buy-back match down, everyone else unchanged.
- The organiser can override any rating. The app records who changed it and when.

---

**Still to confirm:** handicap adjustment amounts (13).
