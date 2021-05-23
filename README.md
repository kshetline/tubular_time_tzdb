# @tubular/time-tzdb

**@tubular/time-tzdb** is an IANA timezone compiler, specifically for generating timezone data compatible with **[@tubular/time](https://www.npmjs.com/package/@tubular/time)**.

It can compile timezone source files directly from <https://www.iana.org/time-zones/>, using the latest release or any particular requested version, or from a local `.tar.gz` file specified via file URL.

Options are available for limiting the span of years covered, adjusting and filtering timezones, and choosing different output formats.

- [@tubular/time-tzdb](#tubulartime-tzdb)
  - [Requirements](#requirements)
  - [Installation](#installation)
    - [As a command line tool](#as-a-command-line-tool)
    - [As a library](#as-a-library)
  - [CLI interface](#cli-interface)
  - [JavaScript/TypeScript API](#javascripttypescript-api)
    - [getTzData](#gettzdata)
  - [`@tubular/time` data format](#tubulartime-data-format)

## Requirements

Your system should have a command line `awk` tool installed for full functionality. Without it, the "vanguard" and "rearguard" options are not fully supported.

## Installation

### As a command line tool

`npm install -g @tubular/time-tzdb`

### As a library

`npm install @tubular/time-tzdb`

`import { getByUrlOrVersion, TzData, writeTimezones`...`} from '@tubular/time_tzdb';`

## CLI interface

`npm install -g @tubular/time-tzdb`

```text
Usage: tzc [options] [output_file_name_or_directory]

Downloads and compiles IANA timezone data, converting to text, zoneinfo binary
files, or @tubular/time-compatible data.

Options:
  -v, --version       output the version number
  -5, --systemv       Include the SystemV timezones from the systemv file by
                      uncommenting the commented-out zone descriptions.
  -b, --binary        Output binary files to directory, one file per timezone
  -f                  Filter out Etc/GMTxxx and other timezones that are either
                      redundant or covered by options for creating fixed-offset
                      timezones.
  -i                  Include leap seconds in binary files.
  -j, --javascript    Output JavaScript instead of JSON.
  --large             Apply presets for "large" timezone definitions.
  --large-alt         Apply presets for "large-alt" timezone definitions.
  --list              List available tz database versions.
  -m                  Round all UTC offsets to whole minutes.
  -n, --no-backward   Skip the additional aliases in the backward file.
  -o                  Overwrite existing file/directory.
  -q                  Display no progress messages, fewer warning messages.
  -R, --rearguard     Rearguard mode (skip vanguard features like negative DST).
  -r                  Remove 'calendar rollbacks' from time zone transitions --
                      that is modify time zone data to prevent situations
                      where the calendar date goes backwards as well as the
                      hour and/or minute of the day.
  -p, --packrat       Add additional timezones from the backzone file.
  -s <zone-id>        Zone ID for a single time zone to be rendered.
  --small             Apply presets for "small" timezone definitions.
  -t, --typescript    Output TypeScript instead of JSON.
  --text              Output (somewhat) human-readable text
  -u, --url <url>     URL or version number, such as '2018c', to parse and
                      compile.
                      Default: https://www.iana.org/time-zones/repository/tzdata-latest.tar.gz
  -V, --vanguard      Vanguard mode (use vanguard features like negative DST).
  -y <year-span>      <min_year,max_year> Year range for explicit time zone
                      transitions.
                      Default: 1850,2050
  -z <zone-info-dir>  Validate this tool's output against output from the
                      standard zic tool stored in the given directory.
                      (Validation is done before applying the -r option.)
  -h, --help          display help for command
  -,                  Use dash by itself to output to stdout.
```

## JavaScript/TypeScript API

### getTzData

`async function getTzData(options: TzOptions = {}): Promise<any>`

This function returns an object containing encoded timezone information for a set of timezones, and other timezone set metadata. This data is in a format meant to be consumed by the `@tubular/time` package.

Here is a truncated sample of this data:

```json5
{
  "version": "2021a",
  "years": "1800-2088",
  "deltaTs": "69.36 69.36 69.45",
  "leapSeconds": "912 1096 1461 1826 2191 2557 2922 3287 3652 4199 4564 4929 5660 6574 7305 7670 8217 8582 8947 9496 10043 10592 13149 14245 15522 16617 17167",
  "Africa/Abidjan": "-001608 +0000 0;-g.8/0/LMT 0/0/GMT;1;-2ldXH.Q;;48e5;BFCIGMGNMLMRSHSLSNTG",
  "Africa/Accra": "-000052 +0000 0;-0.Q/0/LMT 0/0/GMT k/k u/0 u/u;1212121212121212121212121212121212121212121212131414141414141;-2bRzX.8 9RbX.8 fdE 1BAk MLE 1Bck MLE 1Bck MLE 1Bck MLE 1BAk MLE 1Bck MLE 1Bck MLE 1Bck MLE 1BAk MLE 1Bck MLE 1Bck MLE 1Bck MLE 1BAk MLE 1Bck MLE 1Bck MLE 1Bck MLE 1BAk MLE 1Bck MLE 1Bck MLE 1Bck MLE Mok 1BXE M0k 1BXE fak 9vbu bjCu MLu 1Bcu MLu 1BAu MLu 1Bcu MLu 1Bcu MLu 1Bcu MLu;;41e5;GH",
  "Africa/Algiers": "+001212 +0100 0;c.c/0/LMT 9.l/0/PMT 0/0/WET 10/10/WEST 10/0/CET 20/10/CEST;1232323232323232454542423234542324;-3bQ0c.c MDA2.P cNb9.l HA0 19A0 1iM0 11c0 1oo0 Wo0 1rc0 QM0 1EM0 UM0 DA0 Imo0 rd0 De0 9Xz0 1fb0 1ap0 16K0 2yo0 mEp0 hwL0 jxA0 11A0 dDd0 17b0 11B0 1cN0 2Dy0 1cN0 1fB0 1cL0;;26e5;DZ",
  "Africa/Bissau": "-010220 +0000 0;-12.k/0/LMT -10/0 0/0/GMT;12;-2ldX0 2xoo0;;39e4;GW",
  "Africa/Cairo": "+020509 +0200 0;25.9/0/LMT 20/0/EET 30/10/EEST;1212121212121212121212121212121212121212121212121212121212121212121212121212121212121212121212121212121212121212121212121212121;-2MBC5.9 1AQM5.9 vb0 1ip0 11z0 1iN0 1nz0 12p0 1pz0 10N0 1pz0 16p0 1jz0 s3d0 Vz0 1oN0 11b0 1oO0 10N0 1pz0 10N0 1pb0 10N0 1pb0 10N0 1pb0 10N0 1pz0 10N0 1pb0 10N0 1pb0 11d0 1oL0 11d0 1pb0 11d0 1oL0 11d0 1oL0 11d0 1oL0 11d0 1pb0 11d0 1oL0 11d0 1oL0 11d0 1oL0 11d0 1pb0 11d0 1oL0 11d0 1oL0 11d0 1oL0 11d0 1pb0 11d0 1oL0 11d0 1WL0 rd0 1Rz0 wp0 1pb0 11d0 1oL0 11d0 1oL0 11d0 1oL0 11d0 1pb0 11d0 1qL0 Xd0 1oL0 11d0 1oL0 11d0 1pb0 11d0 1oL0 11d0 1oL0 11d0 1ny0 11z0 1o10 11z0 1o10 11z0 1o10 11z0 1qN0 11z0 1o10 11z0 1o10 11z0 1o10 11z0 1o10 11z0 1qN0 11z0 1o10 11z0 1o10 WL0 1qN0 Rb0 1wp0 On0 1zd0 Lz0 1EN0 Fb0 c10 8n0 8Nd0 gL0 e10 mn0;;15e6;EG",

  // ...

  "US/Samoa": "Pacific/Pago_Pago",
  "UTC": "Etc/UTC",
  "Universal": "Etc/UTC",
  "W-SU": "Europe/Moscow",
  "Zulu": "Etc/UTC"
}
```

A detailed explanation of this format can be found [at the end of this document](#tubulartime-data-format).

The following options can be specified to tailor the output for your specific needs:

```typescript
enum TzFormat { BINARY, JSON, JAVASCRIPT, TYPESCRIPT, TEXT }
enum TzPresets { NONE, SMALL, LARGE, LARGE_ALT }
enum TzPhase { DOWNLOAD, EXTRACT, PARSE, COMPILE, VALIDATE, REENCODE, OUTPUT_OF_RESULTS, DONE }
enum TzMessageLevel { INFO, LOG, WARN, ERROR }

type TzCallback = (
  phase?: TzPhase,
  level?: TzMessageLevel,
  message?: string,
  step?: number,
  stepCount?: number
) => void;

interface TzOptions {
  callback?: TzCallback,
  filtered?: boolean;
  fixRollbacks?: boolean;
  includeLeaps?: boolean,
  maxYear?: number;
  minYear?: number;
  mode?: TzMode;
  noBackward?: boolean;
  packrat?: boolean;
  preset?: TzPresets;
  roundToMinutes?: boolean;
  singleZone?: string;
  systemV?: boolean;
  urlOrVersion?: string;
  zoneInfoDir?: string;
}
```

• `callback`: This is an optional callback, used to provide information on the progress of parsing, compiling, and processing timezone data.

• `filtered`: When `true` various obsolete timezones are omitted, such as `America/Knox_IN`, or the various `Etc` timezones.

`fixRollbacks`: It can be challenging enough when handling Daylight Saving Time (DST) that wall clock time can go backward during the course of a day. There are a few shifts in UTC offset for some timezones, however, where even the calendar date goes backward, such as a case where its the 19th of the month, then the 18th, and then the 19th again, as happens with the unmodified America/Juneau timezone during October 1867.

The `fixRollbacks` option adjusts such transitions so that they delayed just enough to avoid backtracking of local calendar dates.

• `includeLeaps`: This option adds leap second information to binary output files. Leap seconds are always included in JSON, JavaScript, and TypeScript formats.

• `minYear` and `maxYear`: This is the range of years covered by the generated data, and it defaults to 1850-2050. Reducing the range can reduce generated data size, particularly when the lower limit is raised closer to current times, as many differently-named timezones share common descriptions.

When the generated data is used by `@tubular/time`, a reduced range does not necessarily eliminate utility outside of that range, in simply makes early times dependent on JavaScript `Intl` support (when available), and future times reliant on rules-based descriptions of Daylight Saving Time transitions.

For a few timezones rules-based descriptions are not possible for covering future times, as these timezones are reliant on rules which that cannot be expressed in the `tz database` short of explicitly providing specific DST transition dates and times for each future year. This is the case, for example, when transitions are based on Islamic calendar dates. In such cases DST transitions are reliable only up to `maxYear`.

• `mode`: One of three values, `TzMode.REARGUARD`, `TzMode.MAIN`, `TzMode.VANGUARD`, with `TzMode.MAIN` being the default. As of release 2021a, `VANGUARD` and `REARGUARD` are the same, providing negative DST support and rules with hours greater than 24. Selecting `TzMode.REARGUARD` will build timezone data without these features.

The future of these separate modes is uncertain, and they are likely to be phased out, but it is at least possible that sometime in the future that `VANGUARD` might enable access to features not support in `MAIN`.

• `noBackward`: If `true`, timezones aliases defined in the `backward` file are omitted.

• `packrat`: If `true`, extra timezones defined in the `backzone` file are included.

• `preset`: One of four values, `TzPresets.NONE`, `TzPresets.SMALL`, `TzPresets.LARGE`, `TzPresets.LARGE_ALT`, with `TzPresets.NONE` being the defaults.

- `TzPresets.NONE`: No default options are changed.
- `TzPresets.SMALL`: Default options are changed to generate data for `@tubular/time`'s `small` option.

## `@tubular/time` data format
