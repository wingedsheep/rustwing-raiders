import type { Game } from './game';
import type { RunLog } from './recorder';
import { Flight } from '../screens/flight';
import { Tape } from '../sim/recording';
import { planetById } from '../world/planets';

/**
 * ?replay=<file>&stage=n: stage n of a recorded run (playtests/<file>), flown again from its
 * inputs. It holds on the moment the tape runs out, and says in the console whether it ended
 * where the stage did (the sim is deterministic: it should, to the frame).
 */
export async function replay(game: Game, file: string, stage: number) {
  const name = file.replace(/^.*\//, '').replace(/\.json$/, '');
  const log = (await (await fetch(`/playtests/${name}.json`)).json()) as RunLog;
  const s = log.stages[stage - 1];
  if (!s) throw new Error(`${name} has ${log.stages.length} stages, not ${stage}`);
  const setup = s.setup;
  const planet = planetById(setup.planet);
  const spec = { planet, biomes: setup.biomes.map((id) => planet.biomes.find((b) => b.id === id)!), mode: setup.mode, seed: setup.seed, difficulty: setup.difficulty, length: setup.length };
  game.devices = ['keys'];
  const flight = new Flight(game, spec, structuredClone(setup.builds), setup.hull && [...setup.hull], () => {}, structuredClone(setup.grafts), structuredClone(setup.kits), setup.call);
  flight.play(s.inputs.map((t) => Tape.read(t)), setup, s.end);
  console.log(`[replay] ${name} stage ${stage}: ${setup.planet} ${setup.mode} seed ${setup.seed}, ${s.end?.state ?? '?'} at ${s.end?.time ?? '?'}s`);
  game.go(flight);
}
