import { padLeft, toInt } from '@tubular/util';
import { ClockType, DAYS, indexOfFailNotFound, MONTHS, parseAtTime, parseTimeOffset } from './tz-util';
import { div_rd } from '@tubular/math';

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

  static parseRule(line: string): TzRule {
    const rule = new TzRule();
    const parts = line.split(/\s+/);
    let pos: number;

    rule.name = parts[1];

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
    else if (parts[6].includes('<=')) {
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
}

export class TzRuleSet extends Array<TzRule> {
  constructor(public name: string) {
    super();
  }
}
