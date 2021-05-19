import { TzRule } from './tz-rule';
import { DateTime, Timezone } from '@tubular/time';
import { ClockType, DT_FORMAT } from './tz-util';
import { isObject } from '@tubular/util';

export class TzTransition {
  public rule?: TzRule;
  public clockType?: ClockType

  constructor(
    public time: number, // in seconds from epoch
    public utcOffset: number, // seconds, positive eastward from UTC
    public dstOffset: number, // seconds
    public name: string,
    public zoneIndex = 0,
    ruleOrClockType?: TzRule | ClockType
  ) {
    if (isObject(ruleOrClockType)) {
      this.rule = ruleOrClockType;
      this.clockType = ruleOrClockType.atType;
    }
    else
      this.clockType = ruleOrClockType;
  }

  get ruleIndex(): number {
    return this.rule?.ruleIndex ?? Number.MAX_SAFE_INTEGER;
  }

  formatTime(): string {
    if (this.time === Number.MIN_SAFE_INTEGER)
      return '(arbitrary past)';

    const ldt = new DateTime((this.time + this.utcOffset) * 1000, Timezone.ZONELESS);

    return ldt.format(DT_FORMAT + (ldt.wallTime.sec > 0 ? ':ss' : ''));
  }

  toString(): string {
    let s: string;

    if (this.time === Number.MIN_SAFE_INTEGER)
      s = '---';
    else
      s = this.formatTime();

    return [s, Timezone.formatUtcOffset(this.utcOffset, true),
            Timezone.formatUtcOffset(this.dstOffset, true), this.name].join(', ');
  }
}
