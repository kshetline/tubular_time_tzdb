#!/usr/bin/env node
import fs from 'fs';
import { Command } from 'commander';
import { DEFAULT_URL, getAvailableVersions } from './read-tzdb';
import { padLeft, toInt } from '@tubular/util';
import { DEFAULT_MAX_YEAR, DEFAULT_MIN_YEAR, TzFormat, TzMessageLevel, TzOutputOptions, TzPhase, TzPresets, writeTimezones } from './tz-writer';
const { version } = require('../package.json');

const program = new Command();
const nl = '\n' + ' '.repeat(20);
const options = program
  .name('tzc')
  .description(`Downloads and compiles IANA timezone data, converting to text or @tubular/time-compatible data.`)
  .usage('[options] [output_file_name_or_directory]')
  .version(version, '-v, --version')
  .addHelpText('after', '  -,                  Use dash by itself to output to stdout.')
  .option('-5, --systemv', `Include the SystemV timezones from the systemv file by${nl}\
uncommenting the commented-out zone descriptions.`)
  .option('-b, --binary', 'Output binary files to directory, one file per timezone')
  .option('-f', `Filter out Etc/GMTxxxx and other timezones that are either${nl}\
redundant or covered by options for creating fixed-offset timezones.`)
  .option('-j, --javascript', 'Output JavaScript instead of JSON.')
  .option('--large', 'Apply presets for "large" timezone definitions.')
  .option('--large-alt', 'Apply presets for "large-alt" timezone definitions.')
  .option('--list', 'List available tz database versions.')
  .option('-m', 'Round all UTC offsets to whole minutes.')
  .option('-o', 'Overwrite existing file.')
  .option('-q', 'Display no progress messages, fewer warning messages.')
  .option('-r', `Remove 'calendar rollbacks' from time zone transitions -- that is${nl}\
modify time zone data to prevent situations where the calendar date${nl}\
goes backwards as well as the hour and/or minute of the day.`)
  .option('-s <zone-id>', 'Zone ID for a single time zone to be rendered.')
  .option('--small', 'Apply presets for "small" timezone definitions.')
  .option('-t, --typescript', 'Output TypeScript instead of JSON.')
  .option('--text', 'Output (somewhat) human-readable text')
  .option('-u, --url <url>', `URL or version number, such as '2018c', to parse and compile.${nl}Default: ${DEFAULT_URL}`)
  .option('-y <year-span>', `<min_year,max_year> Year range for explicit time zone transitions.${nl}\
Default: ${DEFAULT_MIN_YEAR},${DEFAULT_MAX_YEAR}`)
  .option('-z <zone-info-dir>', `Validate this tool's output against output from the standard${nl}\
zic tool stored in the given directory.${nl}\
(Validation is done before applying the -r option.)`)
  .arguments('[outfile]')
  .parse(process.argv).opts();

let lastWasInfo = false;

function progress(phase?: TzPhase, level?: TzMessageLevel, message?: string, step?: number, stepCount?: number): void {
  const args: (string | number)[] = [message ?? ''];

  if (phase != null)
    args[0] = TzPhase[phase] + (args[0] ? ': ' + args[0] : '');

  if (step) {
    args.push(padLeft(step, 3));

    if (stepCount)
      args.push(stepCount);
  }

  if (lastWasInfo)
    process.stdout.write('\x1B[A\x1B[K');

  if (level === TzMessageLevel.INFO && !options.q)
    console.info(...args);
  else if (level === TzMessageLevel.LOG && !options.q)
    console.log(...args);
  else if (level === TzMessageLevel.WARN)
    console.warn(...args);
  else if (level === TzMessageLevel.ERROR)
    console.error(...args);

  lastWasInfo = level === TzMessageLevel.INFO;
}

async function getUserInput(): Promise<string> {
  return new Promise<string>(resolve => {
    const callback = (data: any): void => {
      process.stdin.off('data', callback);
      resolve(data.toString().trim());
    };

    process.stdin.on('data', callback);
  });
}

(async function (): Promise<void> {
  if (options.list) {
    try {
      (await getAvailableVersions()).forEach(v => console.log(v));
      process.exit(0);
    }
    catch (err) {
      console.error(err);
      process.exit(1);
    }

    return;
  }

  const tzOptions: TzOutputOptions = {
    callback: progress,
    filtered: options.f,
    fixRollbacks: options.r,
    roundToMinutes: options.m,
    singleZone: options.s,
    systemV: options.systemv,
    urlOrVersion: options.url,
    zoneInfoDir: options.z
  };

  if (options.small)
    tzOptions.preset = TzPresets.SMALL;
  else if (options.large)
    tzOptions.preset = TzPresets.LARGE;
  else if (options.largeAlt)
    tzOptions.preset = TzPresets.LARGE_ALT;

  let file = '';
  let fileStream: fs.WriteStream;

  if (program.args[0] !== '-')
    file = program.args[0] || ('timezone' + (['s', '-small', '-large', '-large-alt'][tzOptions.preset ?? 0]));

  if (options.binary || (!options.javascript && !options.typescript && !options.text && !file.includes('.')))
    tzOptions.format = TzFormat.BINARY;
  else if (options.javascript || (!options.typescript && !options.text && file.endsWith('.js')))
    tzOptions.format = TzFormat.JAVASCRIPT;
  else if (options.typescript || (!options.text && file.endsWith('.ts')))
    tzOptions.format = TzFormat.TYPESCRIPT;
  else if (options.text || file.endsWith('.txt'))
    tzOptions.format = TzFormat.TEXT;

  if (tzOptions.format === TzFormat.BINARY) {
    if (program.args[0] === '-') {
      console.error('stdout option (-) is not valid for binary format');
      process.exit(1);
    }
    else if (program.args[0])
      tzOptions.directory = program.args[0];
    else
      tzOptions.directory = 'zoneinfo';
  }
  else if (file && !file.includes('.')) {
    file += ['', '.json', '.js', '.ts', '.txt'][tzOptions.format ?? 0];

    if (!options.o && fs.existsSync(file)) {
      process.stdout.write(`File "${file}" already exists. Overwrite it? (y/N)? `);

      const response = await getUserInput();

      if (!/^y/i.test(response))
        process.exit(0);
    }

    tzOptions.fileStream = (fileStream = fs.createWriteStream(file, 'utf8')) as unknown as NodeJS.WriteStream;
  }

  if (options.y) {
    const parts = options.y.split(',');

    if (parts.length === 1)
      tzOptions.minYear = tzOptions.maxYear = toInt(parts[0]);
    else if (parts.length === 2) {
      tzOptions.minYear = parts[0] ? toInt(parts[0], DEFAULT_MIN_YEAR) : undefined;
      tzOptions.maxYear = parts[1] ? toInt(parts[1], DEFAULT_MAX_YEAR) : undefined;
    }
  }

  try {
    await writeTimezones(tzOptions);

    if (fileStream) {
      fileStream.close();
      await new Promise<void>(resolve => fileStream.on('close', () => resolve()));
      process.exit(0);
    }
  }
  catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
