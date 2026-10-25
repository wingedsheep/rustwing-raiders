# Scrapling

*Scrap, popcorn.* Scores and the other enemies: [the overview](README.md).

**Who it is.** A seat strapped to a stolen engine pod. Scrap clan kids fly them in strings behind whoever's oldest, follow-the-leader, to earn a real ship one day. They don't shoot, and they don't need to: they're the cloud the real ships hide in.
**Ship's log.** *"Kids. Lots of them. Sweep the string and they scatter for home."*

**Now.** A string of 6 to 8 on one of the classic formations (`formation`, `src/sim/foes.ts:231`):
- snake: down in an S
- sweep: across in a shallow bow
- hook: down a side lane, a U-turn towards you, and away
- loop: down, one full loop, and on down
- vee: a V that splits apart
- peel: a column that peels left and right
- retreat: down to near your row, then back up
- pincer: two sweeps from both sides

Gentle forms first; hook, loop, retreat and pincer from a quarter into a level (`Director.formation`, `src/sim/director.ts:413`). Each one dies to a burst. Ram one and it breaks up on you for a graze. Killing a whole string pays the wave bonus.
**Tell → window.** Later on (difficulty above 0.15), the leader flares and fires one aimed slug (0.5 s tell). The rest never shoot.
- [ ] A sound for the string coming in (a two-stroke buzz in a chord), and a bonus jingle for the whole string.
- [ ] Each planet's wear: Sankvi titan-plate pods on Ashgrave, shell-bolted ones on Vesh.
