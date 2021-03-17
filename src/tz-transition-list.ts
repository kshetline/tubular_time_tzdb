import { abs, max, div_rd } from '@tubular/math';
import fs from 'fs';
import path from 'path';
import { TzTransition } from './tz-transition';
import { clone } from '@tubular/util';
import { IanaZoneRecord } from './iana-zone-record';
import { DateTime, Timezone } from '@tubular/time';
import { ClockType, DT_FORMAT, makeTime, toBase60 } from './tz-util';
import { TzRule } from './tz-rule';
import { getCountries, getPopulation } from './population-and-country-data';
import { TzCallback, TzMessageLevel, TzPhase } from './tz-writer';

export enum Rollbacks { NO_ROLLBACKS, ROLLBACKS_FOUND, ROLLBACKS_REMOVED, ROLLBACKS_REMAIN }

const ZONE_MATCHING_TOLERANCE = 3600 * 24 * 30 * 3; // Three months, in seconds.
const formatUtcOffset = Timezone.formatUtcOffset;

export class TzTransitionList extends Array<TzTransition> {
  private lastZoneRec: IanaZoneRecord;

  constructor(public zoneId?: string, public aliasFor?: string) {
    super();
  }

  clone(withId?: string, aliasFor?: string): TzTransitionList {
    const theClone = clone(this);

    if (withId)
      theClone.zoneId = withId; // Not a perfect clone anymore

    if (aliasFor)
      theClone.aliasFor = aliasFor; // Not a perfect clone anymore

    return theClone;
  }

  getLastZoneRec(): IanaZoneRecord {
    return this.lastZoneRec;
  }

  setLastZoneRec(lastZoneRec: IanaZoneRecord): void {
    this.lastZoneRec = lastZoneRec;
  }

  findCalendarRollbacks(fixRollbacks: boolean, progress: TzCallback): Rollbacks {
    let rollbackCount = 0;
    let warningShown = false;

    for (let i = 1; i < this.length; ++i) {
      const prev = this[i - 1];
      const curr = this[i];
      const before = makeTime(curr.time - 1, prev.utcOffset).tz(Timezone.ZONELESS, true);
      const after = makeTime(curr.time, curr.utcOffset).tz(Timezone.ZONELESS, true);

      if (after.compare(before, 'days') < 0) {
        ++rollbackCount;

        const turnbackTime = makeTime(curr.time, prev.utcOffset);
        const wallTime = turnbackTime.wallTime;
        const midnight = new DateTime({ y: wallTime.y, m: wallTime.m, d: wallTime.d, utcOffset: prev.utcOffset });
        const forayIntoNextDay = turnbackTime.utcTimeSeconds - midnight.utcTimeSeconds;

        if (progress && !warningShown) {
          const forayMinutes = div_rd(forayIntoNextDay, 60);
          const foraySeconds = forayIntoNextDay % 60;
          progress(TzPhase.COMPILE, TzMessageLevel.LOG,
            `* ${this.zoneId}: ${before.format(DT_FORMAT)} rolls back to ${after.format(DT_FORMAT)}` +
            ` (${forayMinutes} minute${foraySeconds > 0 ? ', ' + foraySeconds + ' second' : ''} foray into next day)`);
          warningShown = true;
        }

        if (fixRollbacks)
          curr.time -= forayIntoNextDay;
      }
    }

    let stillHasRollbacks = false;

    if (rollbackCount > 0 && fixRollbacks)
      stillHasRollbacks = (this.findCalendarRollbacks(false, progress) === Rollbacks.ROLLBACKS_FOUND);

    if (warningShown) {
      if (fixRollbacks) {
        if (stillHasRollbacks)
          progress(TzPhase.COMPILE, TzMessageLevel.WARN,
            `  *** ${this.zoneId} rollback${rollbackCount > 1 ? 's' : ''} NOT FIXED ***`);
        else
          progress(TzPhase.COMPILE, TzMessageLevel.LOG, '  * fixed *');
      }
    }

    if (rollbackCount === 0)
      return Rollbacks.NO_ROLLBACKS;
    else if (!fixRollbacks)
      return Rollbacks.ROLLBACKS_FOUND;
    else if (stillHasRollbacks)
      return Rollbacks.ROLLBACKS_REMAIN;
    else
      return Rollbacks.ROLLBACKS_REMOVED;
  }

  removeDuplicateTransitions(): void {
    for (let i = 1; i < this.length; ++i) {
      const prev = this[i - 1];
      const curr = this[i];

      if (curr.time === prev.time ||
          curr.utcOffset === prev.utcOffset && curr.dstOffset === prev.dstOffset && curr.name === prev.name)
        this.splice(i--, 1);
    }
  }

  trim(minYear: number, maxYear: number): void {
    if (minYear !== Number.MIN_SAFE_INTEGER) {
      // Find the latest Standard Time transition before minYear. Change the start time of that
      // transition to the programmatic beginning of time, and delete all other transitions before it.
      let match = -1;
      let tzt: TzTransition;

      for (let i = 0; i < this.length; ++i) {
        tzt = this[i];

        if (tzt.time === Number.MIN_SAFE_INTEGER)
          continue;

        const ldt = makeTime(tzt.time + 1, tzt.utcOffset);

        if (ldt.wallTime.y >= minYear)
          break;
        else if (tzt.dstOffset === 0)
          match = i;
      }

      if (match >= 0) {
        this.splice(0, match);
        this[0].time = Number.MIN_SAFE_INTEGER;
      }
    }

    // End on a transition to Standard Time within the proper year range
    for (let i = this.length - 1; i >= 0; --i) {
      const tzt = this[i];

      if (tzt.time === Number.MIN_SAFE_INTEGER)
        continue;

      const ldt = makeTime(tzt.time + tzt.utcOffset, 0);

      if (tzt.dstOffset !== 0 || ldt.wallTime.y > maxYear)
        this.splice(i, 1);
      else
        break;
    }
  }

  // The format produced here borrows some key ideas, like the use of base-60 numbers, from the moment.js timezone package.
  // https://momentjs.com/timezone/
  //
  // Though somewhat similar in appearance, the format is not compatible.
  createCompactTransitionTable(fixCalendarRollbacks = false): string {
    let sb = '';
    const baseOffset = this[0].utcOffset;
    const [nominalStdOffset, nominalDstOffset, finalStdRule, finalDstRule] =
      this.findFinalRulesAndOffsets();

    sb += formatUtcOffset(baseOffset, true) + ' ' + formatUtcOffset(nominalStdOffset, true) +
      ' ' + div_rd(nominalDstOffset, 60) + ';';

    const uniqueOffsetList: string[] = [];
    const offsetList: string[] = [];

    for (const t of this) {
      let offset = toBase60(t.utcOffset / 60) + '/' + toBase60(t.dstOffset / 60);

      if (t.name != null && t.name.length !== 0)
        offset += '/' + t.name;

      if (!uniqueOffsetList.includes(offset))
        uniqueOffsetList.push(offset);

      offsetList.push(offset);
    }

    for (const offset of uniqueOffsetList)
      sb += offset + ' ';

    sb = sb.trimEnd() + ';';

    for (let i = 1; i < this.length; ++i)
      sb += toBase60(uniqueOffsetList.indexOf(offsetList[i]));

    sb += ';';

    let lastTime = 0;

    for (let i = 1; i < this.length; ++i) {
      const t = this[i];

      sb += toBase60((t.time - lastTime) / 60) + ' ';
      lastTime = t.time;
    }

    sb = sb.trimEnd();

    if (finalStdRule != null && finalDstRule != null) {
      if (fixCalendarRollbacks) {
        let fallBackRule = finalStdRule;
        let aheadRule = finalDstRule;
        let fallBackAmount = finalDstRule.save;

        if (fallBackAmount < 0) {
          fallBackRule = finalDstRule;
          aheadRule = finalStdRule;
          fallBackAmount *= -1;
        }

        let turnbackTime = (fallBackRule.atHour * 60 + fallBackRule.atMinute) * 60;

        if (fallBackRule.atType === ClockType.CLOCK_TYPE_UTC)
          turnbackTime += nominalStdOffset + aheadRule.save;
        else if (fallBackRule.atType === ClockType.CLOCK_TYPE_STD)
          turnbackTime += aheadRule.save;

        if (turnbackTime > 0 && turnbackTime - fallBackAmount < 0) {
          fallBackRule.atMinute -= turnbackTime;

          while (fallBackRule.atMinute < 0) {
            fallBackRule.atMinute += 60;
            --fallBackRule.atHour;
          }
        }
      }

      sb += `;${finalStdRule.toCompactTailRule()},${finalDstRule.toCompactTailRule()}`;
    }

    sb = sb.replace(/;$/, '');

    return sb;
  }

  dump(out: NodeJS.WriteStream = process.stdout, roundToMinutes = false): void {
    const write = (s: string): void => {
      out.write(s + '\n');
    };

    const formatOffset = (offset: number): string => {
      return formatUtcOffset(offset, true).padEnd(roundToMinutes ? 5 : 7, '0');
    };

    write(`-------- ${this.zoneId} --------`);

    if (this.aliasFor)
      write(`  Alias for ${this.aliasFor}`);
    else if (this.length === 0)
      write('  (empty)');
    else if (this.length === 1) {
      const tzt = this[0];

      write(`  Fixed UTC offset at ${formatUtcOffset(tzt.utcOffset)}${tzt.name != null ? ' ' + tzt.name : ''}`);
    }
    else {
      const tzt = this[0];
      const format = DT_FORMAT + (roundToMinutes ? '' : ':ss');
      const offsetSpace = '_'.repeat(roundToMinutes ? 4 : 6);
      const secs = roundToMinutes ? '' : ':__';

      write(`  ____-__-__ __:__${secs} ±${offsetSpace} ±${offsetSpace} --> ____-__-__ __:__${secs} ` +
                  formatOffset(tzt.utcOffset) + ' ' + formatOffset(tzt.dstOffset) +
                  (tzt.name != null ? ' ' + tzt.name : ''));

      for (let i = 1; i < this.length; ++i) {
        const prev = this[i - 1];
        const prevOffset = prev.utcOffset;
        const curr = this[i];
        const currOffset = curr.utcOffset;
        const prevDateTime = makeTime(curr.time - 1, prevOffset);
        const currDateTime = makeTime(curr.time, currOffset);

        write('  ' + prevDateTime.format(format) + ' ' + formatOffset(prev.utcOffset) +
              ' ' + formatOffset(prev.dstOffset) + ' --> ' +
              currDateTime.format(format) + ' ' + formatOffset(curr.utcOffset) +
              ' ' + formatOffset(curr.dstOffset) +
                    (curr.name != null ? ' ' + curr.name : '') + (curr.dstOffset !== 0 ? '*' : ''));
      }

      const [, , finalStdRule, finalDstRule] = this.findFinalRulesAndOffsets();

      if (finalStdRule)
        write(`  Final Standard Time rule: ${finalStdRule.toString()}`);

      if (finalDstRule)
        write(`  Final Daylight Saving Time rule: ${finalDstRule.toString()}`);
    }

    if (getPopulation(this.zoneId) > 0)
      write(`  Population: ${getPopulation(this.zoneId)}`);

    if (getCountries(this.zoneId))
      write(`  Countries: ${getCountries(this.zoneId)}`);
  }

  static getZoneTransitionsFromZoneinfo(zoneInfoPath: string, zoneId: string,
                                        roundToMinutes = false): TzTransitionList {
    function conditionallyRoundToMinutes(seconds: number, roundToMinutes: boolean): number {
      if (roundToMinutes)
        seconds = div_rd(seconds + 30, 60) * 60;

      return seconds;
    }

    // Derived from bsmi.util.ZoneInfo.java, http://bmsi.com/java/ZoneInfo.java, Copyright (C) 1999 Business Management Systems, Inc.
    // Modified to handle version 2 data.
    const transitions = new TzTransitionList(zoneId);
    const ziPath = path.join(zoneInfoPath, zoneId);

    if (!fs.existsSync(ziPath))
      return null;

    const buf = fs.readFileSync(ziPath);
    const format = max(buf.readUInt8(4) - 32, 1);
    let offset = 32 + (format > 1 ? 51 : 0);
    const transitionCount = buf.readInt32BE(offset);
    const typeCount = buf.readInt32BE(offset += 4);
    const times = new Array<number>(transitionCount);
    const typeIndices = new Uint8Array(transitionCount);

    offset += 8;

    for (let i = 0; i < transitionCount; ++i) {
      if (format > 1) {
        times[i] = Number(buf.readBigInt64BE(offset));
        offset += 8;
      }
      else {
        times[i] = buf.readInt32BE(offset);
        offset += 4;
      }
    }

    buf.copy(typeIndices, 0, offset, offset += transitionCount);

    const offsets = new Array<number>(typeCount);
    const dstFlags = new Array<boolean>(typeCount);
    const nameIndices = new Uint8Array(typeCount);
    const names = new Array<string>(typeCount);

    for (let i = 0; i < typeCount; ++i) {
      offsets[i] = buf.readInt32BE(offset);
      dstFlags[i] = (buf.readInt8(offset += 4) !== 0);
      nameIndices[i] = buf.readInt8(offset += 1);
      ++offset;
    }

    const namesOffset = offset;
    let lastStdOffset = offsets[0];

    for (let i = 0; i < typeCount; ++i) {
      const index = nameIndices[i];
      let end = index;

      while (buf.readInt8(namesOffset + end) !== 0)
        ++end;

      names[i] = buf.toString('utf8', namesOffset + index, namesOffset + end);
    }

    for (let i = 0; i <= transitionCount; ++i) {
      const type = (i < 1 ? 0 : typeIndices[i - 1]);
      let tTime: number;
      const offset = conditionallyRoundToMinutes(offsets[type], roundToMinutes);
      const isDst = dstFlags[type];
      const dst = isDst ? offset - lastStdOffset : 0;
      const name = names[type];

      if (i === 0 || times[i - 1] === -0x8000000)
        tTime = Number.MIN_SAFE_INTEGER;
      else
        tTime = conditionallyRoundToMinutes(times[i - 1], roundToMinutes);

      transitions.push(new TzTransition(tTime, offset, dst, /^[-+]/.test(name) ? null : name));

      if (!isDst)
        lastStdOffset = offset;
    }

    transitions.removeDuplicateTransitions();

    return transitions;
  }

  transitionsMatch(otherList: TzTransitionList, exact = true, roundToMinutes = false, progress?: TzCallback): boolean {
    const report = (message: string): void => {
      if (progress)
        progress(TzPhase.VALIDATE, TzMessageLevel.ERROR, message);
    };

    if (exact && this.length !== otherList.length) {
      report(`*** ${this.zoneId}: ${this.length} != ${otherList.length}`);

      return false;
    }

    const roundingAllowance = (roundToMinutes ? 60 : 0);
    const start = (exact ? 0 : 1);

    for (let i = start, j = start; i < this.length && j < otherList.length; ++i, ++j) {
      const ti1 = this[i];
      const ti2 = otherList[j];

      if (!exact && ti1.time + ZONE_MATCHING_TOLERANCE < ti2.time) {
        --i;
        continue;
      }
      else if (ti2.time + ZONE_MATCHING_TOLERANCE < ti1.time) {
        --j;
        continue;
      }

      if (abs(ti1.time      - ti2.time) < roundingAllowance ||
          abs(ti1.utcOffset - ti2.utcOffset) < roundingAllowance ||
          abs(ti1.dstOffset - ti2.dstOffset) < roundingAllowance ||
          ti1.name      !== ti2.name) {
        report(`*** ${this.zoneId}, mismatch at index ${i}${i !== j ? '/' + j : ''}`);
        report(`  1: ${ti1.time}, ${ti1.utcOffset}, ${ti1.dstOffset}, ${ti1.name}: ${ti1.formatTime()}`);
        report(`  2: ${ti2.time}, ${ti2.utcOffset}, ${ti2.dstOffset}, ${ti2.name}: ${ti2.formatTime()}`);
        report(`  -: ${ti2.time - ti1.time}`);

        return false;
      }
    }

    return true;
  }

  private findFinalRulesAndOffsets(): [number, number, TzRule, TzRule] {
    let nominalStdOffset = 0;
    let nominalDstOffset = 0;
    let finalStdRule: TzRule;
    let finalDstRule: TzRule;
    let lookingForStd = true;
    let lookingForStdRule = true;
    let lookingForDst = true;
    let lastRuleSet: string = null;

    if (this.lastZoneRec != null && this.lastZoneRec.rules == null) {
      nominalStdOffset = this.lastZoneRec.utcOffset;
      lookingForStd = lookingForDst = false;
    }

    for (let i = this.length - 1; i >= 0 && (lookingForStd || lookingForStdRule || lookingForDst); --i) {
      const tzt = this[i];

      if (tzt.rule == null) {
        if (lookingForStd)
          nominalStdOffset = tzt.utcOffset - tzt.dstOffset;

        if (lookingForDst)
          nominalDstOffset = tzt.dstOffset;

        break;
      }

      if (lastRuleSet == null)
        lastRuleSet = tzt.rule.name;
      else if (tzt.rule.name !== lastRuleSet)
        break;

      if (lookingForStd) {
        nominalStdOffset = tzt.utcOffset - tzt.dstOffset;
        lookingForStd = false;
      }

      if (lookingForStdRule && tzt.dstOffset === 0 && tzt.rule.endYear === Number.MAX_SAFE_INTEGER) {
        finalStdRule = tzt.rule;
        lookingForStdRule = false;
      }

      if (lookingForDst && tzt.dstOffset !== 0 && tzt.rule.endYear === Number.MAX_SAFE_INTEGER) {
        nominalDstOffset = tzt.dstOffset;
        finalDstRule = tzt.rule;
        lookingForDst = false;
      }
    }

    return [nominalStdOffset, nominalDstOffset, finalStdRule, finalDstRule];
  }
}
