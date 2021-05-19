import { DateTime, Timezone } from '@tubular/time';
import { ClockTypeLetters, ClockType, DT_FORMAT, parseTimeOffset, parseUntilTime } from './tz-util';

export class IanaZoneRecord {
  utcOffset: number;
  rules: string;
  format: string;
  until: number;
  untilType: ClockType;
  zoneIndex = 0;

  static parseZoneRecord(line: string, roundToMinutes = false): [IanaZoneRecord, string] {
    // Unfortunately the use of tabs vs. spaces to delimit these files is wildly inconsistent,
    // so it takes some extra effort to parse correctly.
    let zoneId: string;
    let parts: string[];

    if (line.startsWith('Zone')) {
      let sb = '';

      parts = line.split(/\s+/);
      zoneId = parts[1];

      for (let i = 2; i < parts.length; ++i) {
        if (i > 2)
          sb += ' ';

        sb += parts[i];
      }

      line = sb.toString();
    }
    else {
      parts = line.trim().split(/\s+/);
      line = parts.join(' ');
    }

    const zoneRec = new IanaZoneRecord();

    parts = line.split(' ');
    zoneRec.utcOffset = parseTimeOffset(parts[0], roundToMinutes);
    zoneRec.rules = (parts[1] === '-' ? null : parts[1]);
    zoneRec.format = parts[2];

    if (parts.length > 3) {
      let sb = '';

      for (let i = 3; i < parts.length; ++i) {
        if (i > 3)
          sb += ' ';

        sb += parts[i];
      }

      const timeArray = parseUntilTime(sb.toString(), roundToMinutes);
      const clockType = timeArray[6];
      const ldt = new DateTime(timeArray.slice(0, -1), Timezone.ZONELESS);

      zoneRec.until = ldt.utcSeconds - (clockType !== ClockType.CLOCK_TYPE_UTC ? zoneRec.utcOffset : 0);
      zoneRec.untilType = clockType;
    }
    else
      zoneRec.until = Number.MAX_SAFE_INTEGER;

    return [zoneRec, zoneId];
  }

  toString(): string {
    let s = `${this.utcOffset}, ${this.rules}, ${this.format}`;

    if (this.until !== Number.MAX_SAFE_INTEGER)  {
      const ldt = new DateTime((this.until + (this.untilType !== ClockType.CLOCK_TYPE_UTC ? this.utcOffset : 0)) * 1000, Timezone.ZONELESS);

      s += `, ${ldt.format(DT_FORMAT)}${ClockTypeLetters[this.untilType]}`;
    }

    return s;
  }
}

export class IanaZone extends Array<IanaZoneRecord> {
  constructor(public zoneId: string) {
    super();
  }
}
