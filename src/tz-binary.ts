import fs from 'fs/promises';
import path from 'path';
import { TzTransitionList } from './tz-transition-list';
import { last } from '@tubular/util';

export async function writeZoneInfoFile(directory: string, transitions: TzTransitionList): Promise<void> {
  const zonePath = transitions.zoneId.split('/');
  directory = path.join(directory, ...zonePath.slice(0, zonePath.length - 1));
  await fs.mkdir(directory, { recursive: true });
  const fh = await fs.open(path.join(directory, last(zonePath)), 'w', 0o644);
  const version = '2';
  await fh.write(Buffer.from(('TZif' + version + '\u0000'.repeat(15)).split('').map(c => c.charCodeAt(0))));
  await fh.close();
}
