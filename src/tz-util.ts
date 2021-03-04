import { toInt, toNumber } from '@tubular/util';
import ttime, { Calendar } from '@tubular/time';
import LAST = ttime.LAST;

export enum ClockType { CLOCK_TYPE_WALL, CLOCK_TYPE_STD, CLOCK_TYPE_UTC }
export const ClockTypeLetters = ['w', 's', 'u'];

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DT_FORMAT = 'Y-MM-DD HH:mm';

const clockTypeMatcher = /.+\d([gsuwz])/i;

export const calendar = new Calendar();
export class ParseError extends Error {}

export function indexOfFailNotFound(s: string[], query: string): number {
  const result = s.indexOf(query);

  if (result < 0)
    throw new ParseError(`"${query}" not found in ${JSON.stringify(s)}`);

  return result;
}

function digitValueToChar(digit: number): string {
  if (digit < 10)
    digit += 48;
  else if (digit < 36)
    digit += 87;
  else
    digit += 29;

  return String.fromCharCode(digit);
}

export function toBase60(x: number, precision = 1): string {
  let result = '';
  let sign = 1;

  if (x < 0) {
    x *= -1;
    sign = -1;
  }

  x += Math.pow(60, -precision) / 2;

  let whole = Math.floor(x);
  let fraction = x - whole;

  if (whole === 0)
    result += '0';
  else {
    while (whole > 0) {
      const digit = whole % 60;

      result = digitValueToChar(digit) + result;
      whole /= 60;
    }
  }

  if (fraction !== 0) {
    result += '.';

    while (--precision >= 0) {
      fraction *= 60;

      const digit = Math.floor(fraction);

      fraction -= digit; // TODO: Was =- in Java. Mistake?
      result += digitValueToChar(digit);
    }

    let lastChar: string;

    while ((lastChar = result.charAt(result.length - 1)) === '0' || lastChar === '.') {
      result = result.slice(0, -1);

      if (lastChar === '.')
        break;
    }
  }

  if (sign < 0)
    result = '-' + result;

  return result;
}

export function fromBase60(x: string): number {
  let sign = 1;
  let result = 0;
  let inFractionalPart = false;
  let power = 1;

  if (x.startsWith('-')) {
    sign = -1;
    x = x.substr(1);
  }
  else if (x.startsWith('+'))
    x = x.substr(1);

  for (let i = 0; i < x.length; ++i) {
    let digit = x.charCodeAt(i);

    if (digit === 46) {
      inFractionalPart = true;
      continue;
    }
    else if (digit > 96)
      digit -= 87;
    else if (digit > 64)
      digit -= 29;
    else
      digit -= 48;

    if (inFractionalPart) {
      power /= 60;
      result += power * digit;
    }
    else {
      result *= 60;
      result += digit;
    }
  }

  return result * sign;
}

export function parseAtTime(s: string): number[] {
  const result = [0, 0, ClockType.CLOCK_TYPE_WALL];
  const $ = clockTypeMatcher.exec(s);

  if ($) {
    const marker = $[1].toLowerCase();

    if (marker === 's')
      result[2] = ClockType.CLOCK_TYPE_STD;
    else if (marker === 'g' || marker === 'u' || marker === 'z')
      result[2] = ClockType.CLOCK_TYPE_UTC;

    s = s.slice(0, -1);
  }

  const parts = s.split(':');

  result[0] = toInt(parts[0]); // hour
  result[1] = toInt(parts[1]); // minute

  return result;
}

export function parseUntilTime(s: string, roundToMinutes = false): number[] {
  const result = [0, 1, 1, 0, 0, 0, ClockType.CLOCK_TYPE_WALL];
  const $ = clockTypeMatcher.exec(s);

  if ($) {
    const marker = $[1].toLowerCase();

    if (marker === 's')
      result[6] = ClockType.CLOCK_TYPE_STD;
    else if (marker === 'g' || marker === 'u' || marker === 'z')
      result[6] = ClockType.CLOCK_TYPE_UTC;

    s = s.slice(0, -1);
  }

  const parts = s.split(/[ :]/);

  result[0] = toInt(parts[0]); // year

  if (parts.length > 1) {
    result[1] = indexOfFailNotFound(MONTHS, parts[1].substring(0, 3)) + 1; // month

    if (parts.length > 2) {
      let pos: number;

      // date
      if (parts[2].startsWith('last')) {
        const dayOfWeek = indexOfFailNotFound(DAYS, parts[2].substring(4, 7));

        result[2] = calendar.getDateOfNthWeekdayOfMonth(result[0], result[1], dayOfWeek, LAST);
      }
      else if ((pos = parts[2].indexOf('>=')) > 0) {
        const dayOfMonth = toInt(parts[2].substring(pos + 2));
        const dayOfWeek = indexOfFailNotFound(DAYS, parts[2].substring(0, 3));

        result[2] = calendar.getDayOnOrAfter(result[0], result[1], dayOfWeek, dayOfMonth);
      }
      else if (parts[2].includes('<=')) {
        const dayOfMonth = toInt(parts[2].substring(pos + 2));
        const dayOfWeek = indexOfFailNotFound(DAYS, parts[2].substring(0, 3));

        result[2] = calendar.getDayOnOrBefore(result[0], result[1], dayOfWeek, dayOfMonth);
      }
      else
        result[2] = toInt(parts[2]);

      if (parts.length > 3) {
        result[3] = toInt(parts[3]); // hour

        if (parts.length > 4) {
          result[4] = toInt(parts[4]); // minute

          if (parts.length > 5) {
            const sec = Math.round(toNumber(parts[5])); // seconds

            if (roundToMinutes) {
              if (sec >= 30) {
                ++result[4];

                if (result[4] === 60) {
                  result[4] = 0;
                  ++result[3];

                  if (result[3] === 24) {
                    // In the rare event we get this far, just round off the seconds instead of rounding up.
                    result[3] = 23;
                    result[4] = 59;
                  }
                }
              }
            }
            else
              result[5] = Math.min(sec, 59);
          }
        }
      }
    }
  }

  return result;
}
