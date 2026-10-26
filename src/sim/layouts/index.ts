/**
 * Each biome's layout on the level generator (see sim/layout.ts), by biome id. The rest are still
 * scattered.
 */

import type { Layout } from '../layout';
import { glowcap } from './glowcap';
import { mesarun } from './mesarun';
import { monoliths } from './monoliths';
import { oasis } from './oasis';
import { saltpans } from './saltpans';
import { sporevents } from './sporevents';
import { temple } from './temple';

export const LAYOUTS: Record<string, Layout> = { glowcap, mesarun, monoliths, oasis, saltpans, sporevents, temple };
