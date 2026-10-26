/**
 * Each biome's layout on the level generator (see sim/layout.ts), by biome id. The rest are still
 * scattered.
 */

import type { Layout } from '../layout';
import { glass } from './glass';
import { glowcap } from './glowcap';
import { mesarun } from './mesarun';
import { monoliths } from './monoliths';
import { oasis } from './oasis';
import { peat } from './peat';
import { saltpans } from './saltpans';
import { sporevents } from './sporevents';
import { temple } from './temple';
import { titans } from './titans';

export const LAYOUTS: Record<string, Layout> = { glass, glowcap, mesarun, monoliths, oasis, peat, saltpans, sporevents, temple, titans };
