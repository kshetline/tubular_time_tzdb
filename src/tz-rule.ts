import { padLeft, toInt } from '@tubular/util';
import { calendar, ClockType, DAYS, formatPosixOffset, indexOfFailNotFound, MONTHS, parseAtTime, parseTimeOffset } from './tz-util';
import { div_rd, max, min } from '@tubular/math';
import { TzTransitionList } from './tz-transition-list';
import ttime, { DateTime, getDayNumber_SGC, Timezone } from '@tubular/time';
import { TzTransition } from './tz-transition';
import { TzCompiler, ZoneProcessingContext } from './tz-compiler';
import LAST = ttime.LAST;

export class TzRule {
  name: string;
  startYear: number;
  endYear: number;
  month: number;
  /*
   * If negative, find dayOfWeek on or before the absolute value of this value in the given month.
   * If 0, find the last dayOfWeek in the given month.
   * If positive, and dayOfWeek is negative, match this exact date.
   * If positive, and dayOfWeek is positive, find dayOfWeek on or after this value in the given month.
   */
  dayOfMonth: number;
  /*
   * 1 for Sunday through 7 for Saturday, negative when day of week doesn't matter (exact date is given).
   */
  dayOfWeek: number;
  atHour: number;
  atMinute: number;
  atType: ClockType;
  save: number;
  letters: string;
  ruleIndex = Number.MAX_SAFE_INTEGER;

  static parseRule(line: string, index = Number.MAX_SAFE_INTEGER): TzRule {
    const rule = new TzRule();
    const parts = line.split(/\s+/);
    let pos: number;

    rule.name = parts[1];
    rule.ruleIndex = index;

    if (/^min(imum)?$/i.test(parts[2]))
      rule.startYear = Number.MIN_SAFE_INTEGER;
    else
      rule.startYear = toInt(parts[2]);

    if (/^only$/i.test(parts[3]))
      rule.endYear = rule.startYear;
    else if (/^max(imum)?$/i.test(parts[3]))
      rule.endYear = Number.MAX_SAFE_INTEGER;
    else
      rule.endYear = toInt(parts[3]);

    rule.month = indexOfFailNotFound(MONTHS, parts[5].substring(0, 3)) + 1;

    if (/^last/i.test(parts[6])) {
      rule.dayOfMonth = 0;
      rule.dayOfWeek = indexOfFailNotFound(DAYS, parts[6].substring(4, 7)) + 1;
    }
    else if ((pos = parts[6].indexOf('>=')) > 0) {
      rule.dayOfMonth = toInt(parts[6].substring(pos + 2));
      rule.dayOfWeek = indexOfFailNotFound(DAYS, parts[6].substring(0, 3)) + 1;
    }
    else if ((pos = parts[6].indexOf('<=')) > 0) {
      rule.dayOfMonth = -toInt(parts[6].substring(pos + 2));
      rule.dayOfWeek = indexOfFailNotFound(DAYS, parts[6].substring(0, 3)) + 1;
    }
    else {
      rule.dayOfMonth = toInt(parts[6]);
      rule.dayOfWeek = -1;
    }

    const hmc = parseAtTime(parts[7]);

    rule.atHour = hmc[0];
    rule.atMinute = hmc[1];
    rule.atType = hmc[2];
    rule.save = parseTimeOffset(parts[8], true);

    if (parts.length < 10 || parts[9] === '-')
      rule.letters = '';
    else
      rule.letters = parts[9];

    return rule;
  }

  toCompactTailRule(): string {
    return [this.startYear, this.month, this.dayOfMonth, this.dayOfWeek, this.atHour + ':' + this.atMinute,
            this.atType, div_rd(this.save, 60)].join(' ');
  }

  toPosixRule(offset?: number, stdName?: string, dstRule?: TzRule, dstName?: string): string {
    if (this.save !== 0 && dstRule && dstRule.save === 0)
      return dstRule.toPosixRule(offset, dstName, this, stdName);

    let tz = (/^[a-z]+$/i.test(stdName) ? stdName : '<' + stdName + '>') + formatPosixOffset(-offset);

    if (!dstRule)
      return tz;

    tz += /^[a-z]+$/i.test(dstName) ? dstName : '<' + dstName + '>';

    if (dstRule.save !== 3600) {
      offset += dstRule.save;
      tz += formatPosixOffset(-offset);
    }

    // No POSIX representation for "on or before" a date, only "on or after".
    if (this.dayOfMonth < 0 || dstRule.dayOfMonth < 0)
      return tz;

    let hour = dstRule.atHour * 3600 + dstRule.atMinute * 60;
    let date: string;
    let nth: number;

    if (dstRule.atType === ClockType.CLOCK_TYPE_UTC)
      hour += offset;

    if (dstRule.dayOfWeek < 0)
      date = 'J' + getDayNumber_SGC(1970, dstRule.month, dstRule.dayOfMonth);
    else {
      nth = dstRule.dayOfMonth === 0 ? 5 : div_rd(dstRule.dayOfMonth - 1, 7) + 1;
      date = `M${dstRule.month}.${nth}.${dstRule.dayOfWeek - 1}`;
    }

    tz += ',' + date;

    if (hour !== 7200)
      tz += '/' + formatPosixOffset(hour);

    let hourStd = this.atHour * 3600 + this.atMinute * 60;

    if (this.atType === ClockType.CLOCK_TYPE_UTC)
      hourStd += offset;
    else if (this.atType === ClockType.CLOCK_TYPE_STD)
      hourStd += dstRule.save * 60;

    if (this.dayOfWeek < 0)
      date = 'J' + (getDayNumber_SGC(1970, this.month, this.dayOfMonth) + 1);
    else {
      nth = this.dayOfMonth === 0 ? 5 : div_rd(this.dayOfMonth - 1, 7) + 1;
      date = `M${this.month}.${nth}.${this.dayOfWeek - 1}`;
    }

    tz += ',' + date;

    if (hourStd !== hour)
      tz += '/' + formatPosixOffset(hourStd);

    return tz;
  }

  toString(): string {
    const month = MONTHS[this.month - 1];
    const dayOfWeek = DAYS[this.dayOfWeek - 1];
    let s = this.name + ': ' +
            (this.startYear === this.endYear ? this.startYear + ' only' :
              ((this.startYear < -9999 ? '-inf' : this.startYear) + ' to ' +
               (this.endYear > 9999 ? '+inf' : this.endYear))) + ', ';

    if (this.dayOfMonth === 0)
      s += `last ${dayOfWeek} of ${month}`;
    else if (this.dayOfWeek < 0)
      s += `${month} ${this.dayOfMonth}`;
    else if (this.dayOfMonth > 0)
      s += `first ${dayOfWeek} on/after ${month} ${this.dayOfMonth}`;
    else
      s += `last ${dayOfWeek} on/before ${month} ${-this.dayOfMonth}`;

    s += `, at ${this.atHour}:${padLeft(this.atMinute, 2, '0')} `;
    s += ['wall time', 'std time', 'UTC'][this.atType];

    if (this.save === 0)
      s += ' begin std time';
    else {
      s += ` save ${div_rd(this.save, 60)} mins`;

      if (this.save % 60 !== 0)
        s += ` ${this.save % 60} secs`;
    }

    if (this.letters)
      s += `, ${this.letters}`;

    return s;
  }

  getTransitions(maxYear: number, zpc: ZoneProcessingContext, lastDst: number): TzTransitionList {
    const newTransitions = new TzTransitionList();
    const minTime = zpc.lastUntil;
    const zoneOffset = zpc.utcOffset;
    const lastZoneOffset = zpc.lastUtcOffset;

    for (let year = max(this.startYear, 1800); year <= min(maxYear, this.endYear); ++year) {
      let ldtDate: number;
      let ldtMonth = this.month;
      let ldtYear = year;

      if (this.dayOfWeek > 0 && this.dayOfMonth > 0) {
        ldtDate = calendar.getDayOnOrAfter(year, ldtMonth, this.dayOfWeek - 1, this.dayOfMonth);

        if (ldtDate <= 0) {
          // Use first occurrence of dayOfWeek in next month instead
          ldtMonth += (ldtMonth < 12 ? 1 : -11);
          ldtYear += (ldtMonth === 1 ? 1 : 0);
          ldtDate = calendar.getDayOnOrAfter(ldtYear, ldtMonth, this.dayOfWeek - 1, 1);
        }
      }
      else if (this.dayOfWeek > 0 && this.dayOfMonth < 0) {
        ldtDate = calendar.getDayOnOrBefore(year, ldtMonth, this.dayOfWeek - 1, -this.dayOfMonth);

        if (ldtDate <= 0) {
          // Use last occurrence of dayOfWeek in previous month instead
          ldtMonth -= (ldtMonth > 1 ? 1 : -11);
          ldtYear -= (ldtMonth === 12 ? 1 : 0);
          ldtDate = calendar.getDateOfNthWeekdayOfMonth(ldtYear, ldtMonth, this.dayOfWeek - 1, LAST);
        }
      }
      else if (this.dayOfWeek > 0)
        ldtDate = calendar.getDateOfNthWeekdayOfMonth(year, ldtMonth, this.dayOfWeek - 1, LAST);
      else
        ldtDate = this.dayOfMonth;

      const ldt = new DateTime([ldtYear, ldtMonth, ldtDate, this.atHour, this.atMinute], Timezone.UT_ZONE);
      let epochSecond = ldt.utcSeconds - (this.atType === ClockType.CLOCK_TYPE_UTC ? 0 : zoneOffset);
      const altEpochSecond = ldt.utcSeconds - (this.atType === ClockType.CLOCK_TYPE_UTC ? 0 : lastZoneOffset) -
              (this.atType === ClockType.CLOCK_TYPE_WALL ? lastDst : 0);

      if (altEpochSecond === minTime)
        epochSecond = minTime;

      const name = TzCompiler.createDisplayName(zpc.format, this.letters, this.save !== 0);
      const tzt = new TzTransition(epochSecond, zpc.utcOffset + this.save, this.save, name, zpc.zoneIndex, this);

      newTransitions.push(tzt);
    }

    return newTransitions;
  }
}

export class TzRuleSet extends Array<TzRule> {
  constructor(public name: string) {
    super();
  }
}
