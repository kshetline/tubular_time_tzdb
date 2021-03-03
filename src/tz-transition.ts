import { TzRule } from './tz-rule';
import { DateTime, Timezone } from '@tubular/time';
import { DT_FORMAT } from './tz-util';

export class TzTransition {
  constructor(
    public time: number, // in seconds from epoch
    public utcOffset: number, // seconds, positive eastward from UTC
    public dstOffset: number, // seconds
    public name: string,
    public rule?: TzRule
  ) {}

  formatTime(): string {
    const ldt = new DateTime(this.utcOffset * 1000, Timezone.ZONELESS);

    return ldt.format(DT_FORMAT);
  }

  toString(): string {
    let s: string;

    if (this.time === Number.MIN_SAFE_INTEGER)
      s = '---';
    else
      s = this.formatTime();

    return [s, Timezone.formatUtcOffset(this.utcOffset), Timezone.formatUtcOffset(this.dstOffset), this.name].join(', ');
  }
}
