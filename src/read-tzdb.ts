import { requestBinary, requestText } from 'by-request';
import { spawn } from 'child_process';
import { Readable } from 'stream';
import tar from 'tar-stream';
import { TzCallback, TzMessageLevel, TzPhase } from './tz-writer';
import { asLines, toNumber } from '@tubular/util';

export interface TzData {
  version: string;
  leapSeconds?: string;
  deltaTs?: string;
  sources: Record<string, string>;
}

// Get additional data from https://www.iers.org/IERS/EN/DataProducts/EarthOrientationData/eop.html
// As ΔT = 32.184 (for TDT - TAI) + (TAI - UTC)† - (UT1-UTC)
// † 37 seconds on 2021-04-28, as it will likely remain for some time.
// TODO: Perhaps extract from a remote data source later
const deltaTs = '69.36 69.36 69.45';

export const DEFAULT_URL = 'https://www.iana.org/time-zones/repository/tzdata-latest.tar.gz';
const URL_TEMPLATE_FOR_VERSION = 'https://data.iana.org/time-zones/releases/tzdata{version}.tar.gz';
const ALL_RELEASES = 'https://data.iana.org/time-zones/releases/';
const TZ_SOURCE_FILES = new Set(['main.zi', 'rearguard.zi', 'vanguard.zi']);
export const MAIN_REGIONS = new Set(['africa', 'antarctica', 'asia', 'australasia', 'europe', 'northamerica',
                                        'pacificnew', 'southamerica', 'etcetera']);
export const TZ_REGION_FILES = new Set([...Array.from(MAIN_REGIONS), 'systemv', 'backward', 'backzone']);
const TZ_EXTENDED_SOURCE_FILES = new Set([...TZ_SOURCE_FILES, ...TZ_REGION_FILES])
  .add('leap-seconds.list').add('version').add('ziguard.awk');
const NTP_BASE = -2_208_988_800;

function makeError(error: any): Error {
  return error instanceof Error ? error : new Error(error.toString());
}

export async function getByUrlOrVersion(urlOrVersion?: string, progress?: TzCallback): Promise<TzData> {
  let url: string;
  let requestedVersion: string;
  let xCompress = false;

  if (!urlOrVersion)
    url = DEFAULT_URL;
  else if (urlOrVersion.includes(':'))
    url = urlOrVersion;
  else {
    requestedVersion = urlOrVersion;

    if (requestedVersion.length >= 5 && requestedVersion < '1996l')
      requestedVersion = requestedVersion.substr(2); // Switch to two-digit year

    url = URL_TEMPLATE_FOR_VERSION.replace('{version}', requestedVersion);

    if (urlOrVersion < '1993g') {
      xCompress = true;
      url = url.replace(/\.gz$/, '.Z');
    }

    requestedVersion = urlOrVersion;
  }

  if (progress)
    progress(TzPhase.DOWNLOAD, TzMessageLevel.INFO);

  let data = await requestBinary(url, { headers: { 'User-Agent': 'curl/7.64.1' }, autoDecompress: !xCompress });

  if (xCompress) {
    // zlib.gunzip chokes on this file format, but command-line gzip handles it well.
    data = await new Promise<Buffer>((resolve, reject) => {
      const gzipProc = spawn('gzip', ['-dc']);
      let tarContent = Buffer.alloc(0);
      const stream = Readable.from(data);

      stream.pipe(gzipProc.stdin);
      gzipProc.stdout.on('data', d => tarContent = Buffer.concat([tarContent, d], tarContent.length + d.length));
      gzipProc.stdout.on('error', err => reject(makeError(err)));
      gzipProc.stdout.on('end', () => resolve(tarContent));
   });
  }

  const extract = tar.extract({ allowUnknownFormat: true });
  const stream = Readable.from(data);
  const result: TzData = { version: requestedVersion || 'unknown', deltaTs, sources: {} };
  let error: any;

  extract.on('entry', (header, stream, next) => {
    const sourceName = header.name;

    if (!error && TZ_EXTENDED_SOURCE_FILES.has(sourceName)) {
      let data = '';

      if (progress && sourceName !== 'version')
        progress(TzPhase.EXTRACT, TzMessageLevel.INFO, `Extracting ${sourceName}`);

      stream.on('data', chunk => data += chunk.toString());
      stream.on('error', err => error = err);
      stream.on('end', () => {
        if (sourceName === 'version') {
          result.version = data.trim();

          if (progress && result.version)
            progress(TzPhase.EXTRACT, TzMessageLevel.INFO, `tz database version ${result.version}`);
        }
        else if (sourceName === 'leap-seconds.list') {
          const lines = asLines(data).filter(line => line && !line.startsWith('#'));
          const leaps = lines.map(line => line.trim().split(/\s+/).map(n => toNumber(n))).map(a => [(a[0] + NTP_BASE) / 86400, a[1]]);

          result.leapSeconds = leaps.map((a, i) => i === 0 ? '' : `${a[0] * (a[1] >= leaps[i - 1][1] ? 1 : -1)}`).join(' ').trim();
        }
        else
          result.sources[sourceName] = data;

        next();
      });
    }
    else
      stream.on('end', next);

    if (progress && !result.version)
      progress(TzPhase.EXTRACT, TzMessageLevel.INFO, 'unknown tz database version');

    stream.resume();
  });

  return new Promise<TzData>((resolve, reject) => {
    stream.pipe(extract);
    extract.on('finish', () => error ? reject(makeError(error)) : resolve(result));
    extract.on('error', err => {
      // tar-stream has a problem with the format of a few of the tar files
      // dealt with here, which nevertheless are valid archives.
      if (/unexpected end of data|invalid tar header/i.test(err.message))
        resolve(result);
      else
        reject(makeError(err));
    });
  });
}

export async function getLatest(progress?: TzCallback): Promise<TzData> {
  return getByUrlOrVersion(null, progress);
}

export async function getAvailableVersions(countCodeVersions = false): Promise<string[]> {
  const releaseSet = new Set<string>((await requestText(ALL_RELEASES))
    .split(/(href="tz[^"]+(?="))/g).filter(s => s.startsWith('href="tz')).map(s => s.substr(6))
    .map(s => (/^tzdata(\d\d(?:\d\d)?[a-z][a-z]?)\.tar.(?:gz|Z)$/.exec(s) ?? [])[1] ||
      (countCodeVersions && (/^tzcode(\d\d(?:\d\d)?[a-z][a-z]?)\.tar.(?:gz|Z)$/.exec(s) ?? [])[1]))
    .filter(s => !!s));

  // Treat the special code-only case of tzcode93.tar.Z as release 1993a
  if (countCodeVersions)
    releaseSet.add('1993a');

  return Array.from(releaseSet).map(v => /^\d{4}/.test(v) ? v : '19' + v).sort();
}
