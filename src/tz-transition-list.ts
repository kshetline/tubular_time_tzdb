import { div_rd } from '@tubular/math';
import { TzTransition } from './tz-transition';
import { IanaZoneRecord } from './iana-zone-record';
import { DateTime, Timezone } from '@tubular/time';
import { ClockType, DT_FORMAT, makeTime, toBase60 } from './tz-util';
import { TzRule } from './tz-rule';

export enum Rollbacks { NO_ROLLBACKS, ROLLBACKS_FOUND, ROLLBACKS_REMOVED, ROLLBACKS_REMAIN };

const formatUtcOffset = Timezone.formatUtcOffset;

export class TzTransitionList extends Array<TzTransition> {
  private lastZoneRec: IanaZoneRecord;

  private static systemV = /SystemV\/(\w\w\w)\d(\w\w\w)/;

  constructor(public zoneId?: string, public aliasFor?: string) {
    super();
  }

  getLastZoneRec(): IanaZoneRecord {
    return this.lastZoneRec;
  }

  setLastZoneRec(lastZoneRec: IanaZoneRecord): void {
    this.lastZoneRec = lastZoneRec;
  }

  findCalendarRollbacks(fixRollbacks: boolean, showWarnings: boolean): Rollbacks {
    let hasRollbacks = false;
    let warningShown = false;

    for (let i = 1; i < this.length; ++i) {
      const prev = this[i - 1];
      const curr = this[i];
      const before = makeTime(curr.time - 1, prev.utcOffset).tz(Timezone.ZONELESS, true);
      const after = makeTime(curr.time, curr.utcOffset).tz(Timezone.ZONELESS, true);

      if (after.compare(before, 'days') < 0) {
        hasRollbacks = true;

        const turnbackTime = makeTime(curr.time, prev.utcOffset);
        const wallTime = turnbackTime.wallTime;
        const midnight = new DateTime({ y: wallTime.y, m: wallTime.m, d: wallTime.d, utcOffset: prev.utcOffset });
        const forayIntoNextDay = turnbackTime.utcTimeSeconds - midnight.utcTimeSeconds;

        if (showWarnings && !warningShown) {
          const forayMinutes = div_rd(forayIntoNextDay, 60);
          const foraySeconds = forayIntoNextDay % 60;
          console.warn(`* Warning -- ${this.zoneId}: ${before.format(DT_FORMAT)} rolls back to ${after.format(DT_FORMAT)}` +
            ` (${forayMinutes} minute${foraySeconds > 0 ? ', ' + foraySeconds + ' second' : ''} foray into next day)`);
          warningShown = true;
        }

        if (fixRollbacks)
          curr.time -= forayIntoNextDay;
      }
    }

    let stillHasRollbacks = false;

    if (hasRollbacks && fixRollbacks)
      stillHasRollbacks = (this.findCalendarRollbacks(false, false) === Rollbacks.ROLLBACKS_FOUND);

    if (warningShown) {
      if (fixRollbacks) {
        if (stillHasRollbacks)
          console.warn(' *** NOT FIXED ***');
        else
          console.warn(' * fixed *');
      }

      console.warn();
    }

    if (!hasRollbacks)
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

  transitionsMatch(otherList: TzTransitionList): boolean {
    if (this.length !== otherList.length) {
      console.error(this.length + ' != ' + otherList.length);

      return false;
    }

    for (let i = 0; i < this.length; ++i) {
      const ti1 = this[i];
      const ti2 = otherList[i];

      if (ti1.time      !== ti2.time ||
          ti1.utcOffset !== ti2.utcOffset ||
          ti1.dstOffset !== ti2.dstOffset ||
          ti1.name      !== ti2.name) {
        console.error('index: ' + i);
        console.error('  1: ' + ti1.time + ', ' + ti1.utcOffset + ', ' + ti1.dstOffset + ', ' + ti1.name + ': ' + ti1.formatTime());
        console.error('  2: ' + ti2.time + ', ' + ti2.utcOffset + ', ' + ti2.dstOffset + ', ' + ti2.name + ': ' + ti2.formatTime());
        console.error('  -: ' + (ti2.time - ti1.time));

        return false;
      }
    }

    return true;
  }
}
