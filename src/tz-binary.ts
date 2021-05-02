import fs from 'fs/promises';
import path from 'path';
import { TzTransitionList } from './tz-transition-list';
import { last } from '@tubular/util';
import { formatPosixOffset, toBase60 } from './tz-util';
import { TzTransition } from './tz-transition';
import { DateTime } from '@tubular/time';

const Y1800 = new DateTime('1800-01-01Z').utcSeconds;
const Y1900 = new DateTime('1900-01-01Z').utcSeconds;

export async function writeZoneInfoFile(directory: string, transitions: TzTransitionList): Promise<void> {
  const zonePath = transitions.zoneId.split('/');
  directory = path.join(directory, ...zonePath.slice(0, zonePath.length - 1));
  await fs.mkdir(directory, { recursive: true });
  const fh = await fs.open(path.join(directory, last(zonePath)), 'w', 0o644);
  const buf1 = createZoneInfoBuffer(transitions, 4, Y1900);
  const buf2 = createZoneInfoBuffer(transitions, 8, Y1800);

  await fh.write(buf1);
  await fh.write(buf2);
  await fh.close();

  console.log(transitions.findFinalRulesAndOffsets());
}

function createZoneInfoBuffer(transitions: TzTransitionList, dataSize: number, earliest: number): Buffer {
  const uniqueOffsetList: { key: string, name: string }[] = [];
  const names = new Set<string>();
  const makeKey = (t: TzTransition): string => toBase60(t.utcOffset / 60) + '/' + toBase60(t.dstOffset / 60) +
    '/' + t.name;
  let discarded = 0;
  let topDiscarded = 0;

  for (const t of transitions) {
    if (t.time < earliest || (dataSize === 4 && t.time < -0x8000000)) {
      ++discarded;
      continue;
    }
    else if (dataSize === 4 && t.time > 0x7FFFFFFF) {
      ++topDiscarded;
      continue;
    }

    const offset = { key: makeKey(t), name: t.name };

    if (!t.name)
      offset.name = formatPosixOffset(t.utcOffset);

    if (!uniqueOffsetList.find(os => os.key === offset.key))
      uniqueOffsetList.push(offset);

    names.add(offset.name);
  }

  const allNames = uniqueOffsetList.map(os => os.name).join('\x00') + '\x00';
  // Variable names tzh_timecnt, tzh_typecnt, etc. from https://man7.org/linux/man-pages/man5/tzfile.5.html
  const tzh_timecnt = transitions.length - discarded - topDiscarded;
  const tzh_typecnt = uniqueOffsetList.length;
  const size = 20 + 6 * 4 + tzh_timecnt * (dataSize + 1) + tzh_typecnt * 6 + allNames.length
    /* + tzh_leapcnt * 4 */ + allNames.length;
  const buf = Buffer.alloc(size, 0);

  buf.write('TZif2' + '\x00'.repeat(15), 0, 'ascii');

  buf.writeInt32BE(tzh_typecnt, 20);
  buf.writeInt32BE(tzh_typecnt, 24);
  buf.writeInt32BE(0, 28); // No leap second entries... yet.
  buf.writeInt32BE(transitions.length - discarded, 32);
  buf.writeInt32BE(tzh_typecnt, 36);
  buf.writeInt32BE(allNames.length, 40);

  let offset = 44;

  for (let i = discarded; i < transitions.length - topDiscarded; ++i) {
    if (dataSize === 4)
      buf.writeInt32BE(transitions[i].time, offset);
    else
      buf.writeBigInt64BE(BigInt(transitions[i].time), offset);

    offset += dataSize;
  }

  return buf;
}
