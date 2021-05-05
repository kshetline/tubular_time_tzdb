import fs from 'fs/promises';
import path from 'path';
import { TzTransitionList } from './tz-transition-list';
import { last, toNumber } from '@tubular/util';
import { formatPosixOffset, toBase60 } from './tz-util';
import { TzTransition } from './tz-transition';
import { DateTime } from '@tubular/time';
import { abs, max, sign } from '@tubular/math';

const Y1800 = new DateTime('1800-01-01Z').utcSeconds;

export async function writeZoneInfoFile(directory: string, transitions: TzTransitionList, leapSeconds?: string,
                                        nameOrder?: string[]): Promise<void> {
  const zonePath = transitions.zoneId.split('/');
  directory = path.join(directory, ...zonePath.slice(0, zonePath.length - 1));
  await fs.mkdir(directory, { recursive: true });
  const fh = await fs.open(path.join(directory, last(zonePath)), 'w', 0o644);
  const buf1 = createZoneInfoBuffer(transitions, 4, leapSeconds, nameOrder);
  const buf2 = createZoneInfoBuffer(transitions, 8, leapSeconds, nameOrder);

  await fh.write(buf1);
  await fh.write(buf2);
  await fh.close();
}

function createZoneInfoBuffer(transitions: TzTransitionList, dataSize: number, leapSeconds?: string,
                              nameOrder?: string[]): Buffer {
  let uniqueLocalTimeTypes: { key: string, name: string, trans: TzTransition }[] = [];
  const names = new Set<string>();
  const makeKey = (t: TzTransition): string => toBase60(t.utcOffset / 60) + '/' + toBase60(t.dstOffset / 60) +
    '/' + t.name;
  let discarded = 0;
  let topDiscarded = 0;
  const leaps = !leapSeconds ? [] : leapSeconds.split(/\s+/).map(l =>
    new DateTime({ n: abs(toNumber(l)), utcOffset: 0 }).utcSeconds * sign(toNumber(l)));
  const tzh_leapcnt = leaps.length;
  const deltaTais = [];
  let deltaTai10 = 0;
  const times = transitions.map(t => t.time);
  // I wouldn't have suspected this, but the seconds values for transition times have to have previous
  // leap seconds added (minus 10) in if leap seconds are included in the file.

  leaps.forEach(l => {
    deltaTai10 += (l < 0 ? -1 : 1);
    deltaTais.push(deltaTai10);
  });

  let deltaEpoch = 0;
  let leapIndex = 0;

  times.forEach((t, i) => {
    if (leapIndex < leaps.length && t >= abs(leaps[leapIndex]))
      deltaEpoch = deltaTais[leapIndex++];

    times[i] = t + deltaEpoch;
  });

  for (let i = 0; i < transitions.length; ++i) {
    const t = transitions[i];

    if (t.time < Y1800 || (dataSize === 4 && times[i] < -0x80000000))
      ++discarded;
    else
      break;
  }

  for (let i = max(discarded - 1, 0); i < transitions.length; ++i) {
    const t = transitions[i];

    if (times[i] > 0x7FFFFFFF) { // For now, discard data beyond 2038-01-19T03:14:07Z even when 8 bytes are available.
      ++topDiscarded;
      continue;
    }

    const localTimeType = { key: makeKey(t), name: t.name, trans: t };

    if (!t.name)
      localTimeType.name = formatPosixOffset(t.utcOffset, true);

    if (!uniqueLocalTimeTypes.find(ltt => ltt.key === localTimeType.key)) {
      uniqueLocalTimeTypes.push(localTimeType);
      names.add(localTimeType.name);
    }
  }

  if (nameOrder) {
    const origList = uniqueLocalTimeTypes;

    uniqueLocalTimeTypes = [];
    names.clear();

    for (const name of nameOrder) {
      const index = origList.findIndex(ltt => ltt.name === name);

      if (index >= 0) {
        uniqueLocalTimeTypes.push(...origList.splice(index, 1));
      }
    }

    uniqueLocalTimeTypes.push(...origList);
    uniqueLocalTimeTypes.forEach(ltt => names.add(ltt.name));
  }

  const allNames = Array.from(names).join('\x00') + '\x00';
  // Variable names tzh_timecnt, tzh_typecnt, etc. from https://man7.org/linux/man-pages/man5/tzfile.5.html
  const tzh_timecnt = transitions.length - discarded - topDiscarded;
  const tzh_typecnt = uniqueLocalTimeTypes.length;
  let size = 20 + 6 * 4 + tzh_timecnt * (dataSize + 1) + tzh_typecnt * 8 + allNames.length +
    tzh_leapcnt * (4 + dataSize);
  let posixRule = '';

  if (dataSize > 4) {
    const [stdOffset, , finalStdRule, finalDstRule, stdName, dstName] = transitions.findFinalRulesAndOffsets();
    const lastT = last(transitions);

    if (finalStdRule)
      posixRule = '\x0A' + finalStdRule.toPosixRule(stdOffset, stdName, finalDstRule, dstName) + '\x0A';
    else if (lastT?.name)
      posixRule = '\x0A' + lastT.name + formatPosixOffset(-lastT.utcOffset) + '\x0A';

    size += posixRule.length;
  }

  const buf = Buffer.alloc(size, 0);

  buf.write('TZif2', 0, 'ascii');
  buf.writeUInt32BE(tzh_typecnt, 20);
  buf.writeUInt32BE(tzh_typecnt, 24);
  buf.writeUInt32BE(tzh_leapcnt, 28);
  buf.writeUInt32BE(tzh_timecnt, 32);
  buf.writeUInt32BE(tzh_typecnt, 36);
  buf.writeUInt32BE(allNames.length, 40);

  let offset = 44;

  for (let i = discarded; i < times.length - topDiscarded; ++i) {
    const t = times[i];

    if (dataSize === 4)
      buf.writeInt32BE(t, offset);
    else
      buf.writeBigInt64BE(BigInt(t), offset);

    offset += dataSize;
  }

  for (let i = discarded; i < transitions.length - topDiscarded; ++i) {
    const key = makeKey(transitions[i]);
    buf.writeInt8(max(uniqueLocalTimeTypes.findIndex(ltt => ltt.key === key), 0), offset++);
  }

  for (const ltt of uniqueLocalTimeTypes) {
    const name = '\x00' + (ltt.trans.name || formatPosixOffset(ltt.trans.utcOffset, true)) + '\x00';

    buf.writeInt32BE(ltt.trans.utcOffset, offset);
    offset += 4;
    buf.writeUInt8(ltt.trans.dstOffset ? 1 : 0, offset++);
    buf.writeUInt8(('\x00' + allNames).indexOf(name), offset++);
  }

  buf.write(allNames, offset, 'ascii');
  offset += allNames.length;

  leaps.forEach((l, index) => {
    const t = abs(l) + (deltaTais[index - 1] ?? 0);

    if (dataSize === 4)
      buf.writeUInt32BE(t, offset);
    else
      buf.writeBigInt64BE(BigInt(t), offset);

    offset += dataSize;
    buf.writeInt32BE(deltaTais[index], offset);
    offset += 4;
  });

  if (tzh_typecnt > 1) {
    buf.writeUInt8(1, offset + tzh_typecnt - 1);
    buf.writeUInt8(1, offset + tzh_typecnt * 2 - 1);
  }

  if (posixRule)
    buf.write(posixRule, size - posixRule.length);

  return buf;
}
