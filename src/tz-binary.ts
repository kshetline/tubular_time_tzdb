import fs from 'fs/promises';
import path from 'path';
import { TzTransitionList } from './tz-transition-list';
import { last } from '@tubular/util';
import { formatPosixOffset, toBase60 } from './tz-util';
import { TzTransition } from './tz-transition';
import { DateTime } from '@tubular/time';
import { max } from '@tubular/math';

const Y1800 = new DateTime('1800-01-01Z').utcSeconds;

export async function writeZoneInfoFile(directory: string, transitions: TzTransitionList): Promise<void> {
  const zonePath = transitions.zoneId.split('/');
  directory = path.join(directory, ...zonePath.slice(0, zonePath.length - 1));
  await fs.mkdir(directory, { recursive: true });
  const fh = await fs.open(path.join(directory, last(zonePath)), 'w', 0o644);
  const buf1 = createZoneInfoBuffer(transitions, 4);
  const buf2 = createZoneInfoBuffer(transitions, 8);

  await fh.write(buf1);
  await fh.write(buf2);
  await fh.close();
}

function createZoneInfoBuffer(transitions: TzTransitionList, dataSize: number): Buffer {
  const uniqueOffsetList: { key: string, name: string, trans: TzTransition }[] = [];
  const names = new Set<string>();
  const makeKey = (t: TzTransition): string => toBase60(t.utcOffset / 60) + '/' + toBase60(t.dstOffset / 60) +
    '/' + t.name;
  let discarded = 0;
  let topDiscarded = 0;

  for (const t of transitions) {
    if (t.time < Y1800 || (dataSize === 4 && t.time < -0x80000000))
      ++discarded;
    else
      break;
  }

  let pendingOffset: any = null;

  for (let i = max(discarded - 1, 0); i < transitions.length; ++i) {
    const t = transitions[i];

    if (t.time > 0x7FFFFFFF) { // For now, discard data beyond 2038-01-19T03:14:07Z even when 8 bytes are available.
      ++topDiscarded;
      continue;
    }

    const offset = { key: makeKey(t), name: t.name, trans: t };

    if (!t.name)
      offset.name = formatPosixOffset(t.utcOffset, true);

    if (!uniqueOffsetList.find(os => os.key === offset.key)) {
      // Holding off saving the offset info from before the first saved transition shouldn't be strictly
      // necessary to create a valid file, nor the first standard time transition, but standard zic output
      // seems to do this, so matching that behavior makes output validation easier.
      if (i <= discarded - 1 + (pendingOffset?.name === 'LMT' ? 1 : 0)) {
        if (pendingOffset) {
          if (!uniqueOffsetList.find(os => os.key === pendingOffset.key))
            uniqueOffsetList.push(pendingOffset);

          names.add(pendingOffset.name);
        }

        pendingOffset = offset;
      }
      else {
        uniqueOffsetList.push(offset);
        names.add(offset.name);
      }
    }
  }

  if (pendingOffset) {
    if (!uniqueOffsetList.find(os => os.key === pendingOffset.key))
      uniqueOffsetList.push(pendingOffset);

    names.add(pendingOffset.name);
  }

  const allNames = Array.from(names).join('\x00') + '\x00';
  // Variable names tzh_timecnt, tzh_typecnt, etc. from https://man7.org/linux/man-pages/man5/tzfile.5.html
  const tzh_timecnt = transitions.length - discarded - topDiscarded;
  const tzh_typecnt = uniqueOffsetList.length;
  let size = 20 + 6 * 4 + tzh_timecnt * (dataSize + 1) + tzh_typecnt * 8 + allNames.length/* + tzh_leapcnt * 4 */;
  let posixRule = '';

  if (dataSize > 4) {
    const [stdOffset, , finalStdRule, finalDstRule, stdName, dstName] = transitions.findFinalRulesAndOffsets();
    const lastT = last(transitions);

    if (finalStdRule)
      posixRule = '\x0A' + finalStdRule.toPosixRule(stdOffset, stdName, finalDstRule, dstName) + '\x0A';
    else if (lastT?.name) {
      posixRule = '\x0A' + lastT.name + formatPosixOffset(-lastT.utcOffset) + '\x0A';
    }

    size += posixRule.length;
  }

  const buf = Buffer.alloc(size, 0);

  buf.write('TZif2', 0, 'ascii');
  buf.writeInt32BE(tzh_typecnt, 20);
  buf.writeInt32BE(tzh_typecnt, 24);
  buf.writeInt32BE(0, 28); // No leap second entries... yet.
  buf.writeInt32BE(tzh_timecnt, 32);
  buf.writeInt32BE(tzh_typecnt, 36);
  buf.writeInt32BE(allNames.length, 40);

  let offset = 44;

  for (let i = discarded; i < transitions.length - topDiscarded; ++i) {
    const t = transitions[i];

    if (dataSize === 4)
      buf.writeInt32BE(t.time, offset);
    else
      buf.writeBigInt64BE(BigInt(t.time), offset);

    offset += dataSize;
  }

  for (let i = discarded; i < transitions.length - topDiscarded; ++i) {
    const key = makeKey(transitions[i]);
    buf.writeInt8(max(uniqueOffsetList.findIndex(os => os.key === key), 0), offset++);
  }

  for (const os of uniqueOffsetList) {
    const name = '\x00' + (os.trans.name || formatPosixOffset(os.trans.utcOffset, true)) + '\x00';

    buf.writeInt32BE(os.trans.utcOffset, offset);
    offset += 4;
    buf.writeUInt8(os.trans.dstOffset ? 1 : 0, offset++);
    buf.writeUInt8(('\x00' + allNames).indexOf(name), offset++);
  }

  buf.write(allNames, offset, 'ascii');
  offset += allNames.length;

  /* Leap seconds would go here. */

  if (tzh_typecnt > 1) {
    buf.writeUInt8(1, offset + tzh_typecnt - 1);
    buf.writeUInt8(1, offset + tzh_typecnt * 2 - 1);
  }

  if (posixRule)
    buf.write(posixRule, size - posixRule.length);

  return buf;
}
