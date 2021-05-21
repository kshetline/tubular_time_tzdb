import { padLeft, toInt, toNumber } from '@tubular/util';
import ttime, { Calendar, DateTime, parseTimeOffset as pto, Timezone } from '@tubular/time';
import { div_rd, div_tt0 } from '@tubular/math';
import { ChildProcess, spawn as nodeSpawn } from 'child_process';
import LAST = ttime.LAST;

export enum ClockType { CLOCK_TYPE_WALL, CLOCK_TYPE_STD, CLOCK_TYPE_UTC }
export const ClockTypeLetters = ['w', 's', 'u'];

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DEFAULT_MIN_YEAR = 1850;
export const DEFAULT_MAX_YEAR = 2050;

export const DT_FORMAT = 'Y-MM-DD HH:mm';
export const calendar = new Calendar();
export class ParseError extends Error {}

const isWindows = (process.platform === 'win32');
const clockTypeMatcher = /.+\d([gsuwz])/i;

export function parseTimeOffset(offset: string, roundToMinutes = false): number {
  if (offset.length < 3 && !offset.includes(':'))
    offset += ':00';

  return pto(offset, roundToMinutes);
}

export function makeTime(utcSeconds: number, utcOffset: number): DateTime {
  return new DateTime(utcSeconds * 1000, new Timezone(
    { zoneName: undefined, currentUtcOffset: utcOffset, usesDst: false, dstOffset: 0, transitions: null }));
}

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
      whole = div_rd(whole, 60);
    }
  }

  if (fraction !== 0) {
    result += '.';

    while (--precision >= 0) {
      fraction *= 60;

      const digit = Math.floor(fraction + 0.0083);

      fraction -= digit;
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
    result[1] = indexOfFailNotFound(MONTHS, parts[1].substr(0, 3)) + 1; // month

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

export function formatPosixOffset(offsetSeconds: number, noColons = false): string {
  if (offsetSeconds == null)
    return '?';

  const colon = noColons ? '' : ':';
  let result = offsetSeconds < 0 ? '-' : noColons ? '+' : '';

  offsetSeconds = Math.abs(offsetSeconds);

  const hours = div_tt0(offsetSeconds, 3600);
  offsetSeconds -= hours * 3600;
  const minutes = div_tt0(offsetSeconds, 60);
  offsetSeconds -= minutes * 60;

  if (minutes === 0 && offsetSeconds === 0)
    return result + hours;

  result += padLeft(hours, noColons ? 2 : 1, '0') + colon + padLeft(minutes, 2, '0');

  if (offsetSeconds !== 0)
    result += colon + padLeft(offsetSeconds, 2, '0');

  return result;
}

export function spawn(command: string, args: string[], options?: any): ChildProcess {
  let inputText: string;
  let childProcess: ChildProcess;

  if (options?.inputText) {
    inputText = options.inputText;
    options = Object.assign({}, options);
    delete options.inputText;
  }

  if (isWindows) {
    if (command === 'which')
      command = 'where';

    const cmd = process.env.comspec || 'cmd';

    childProcess = nodeSpawn(cmd, ['/c', command, ...args], options);
  }
  else
    childProcess = nodeSpawn(command, args, options);

  if (inputText) {
    (childProcess.stdin as any).setEncoding('utf8');
    childProcess.stdin.write(inputText);
    childProcess.stdin.end();
  }

  return childProcess;
}

export function monitorProcess(proc: ChildProcess): Promise<string> {
  let errors = '';
  let output = '';

  return new Promise<string>((resolve, reject) => {
    proc.stderr.on('data', data => {
      data = data.toString();
      errors += data;
    });
    proc.stdout.on('data', data => {
      data = data.toString();
      output += data;
    });
    proc.on('error', err => {
      reject(err);
    });
    proc.on('close', () => {
      if (errors)
        reject(new Error(errors.trim()));
      else
        resolve(output);
    });
  });
}

export async function hasCommand(command: string): Promise<boolean> {
  try {
    return !!(await monitorProcess(spawn('which', [command]))).trim();
  }
  catch {}

  return false;
}
