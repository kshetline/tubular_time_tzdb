import { requestBinary } from 'by-request';
import PromiseFtp from 'promise-ftp';
import { Readable } from 'stream';
import tar from 'tar-stream';
import { URL } from 'url';
import { TzCallback, TzMessageLevel, TzPhase } from './tz-writer';
import { asLines, toNumber } from '@tubular/util';

export interface TzData {
  version: string;
  leapSeconds?: string;
  deltaTs?: string;
  sources: Record<string, string>;
}

// TODO: Perhaps extract from a remote data source later
const deltaTs = '69.36 69.36';

export const DEFAULT_URL = 'https://www.iana.org/time-zones/repository/tzdata-latest.tar.gz';
const URL_TEMPLATE_FOR_VERSION = 'https://data.iana.org/time-zones/releases/tzdata{version}.tar.gz';
const ALL_RELEASES = 'ftp://ftp.iana.org/tz/releases/';
const TZ_SOURCE_FILES = new Set(['africa', 'antarctica', 'asia', 'australasia', 'europe', 'northamerica',
                                 'pacificnew', 'southamerica', 'backward', 'etcetera', 'systemv']);
const TZ_EXTENDED_SOURCE_FILES = new Set(TZ_SOURCE_FILES).add('leap-seconds.list').add('version');
const NTP_BASE = -2_208_988_800;

function makeError(error: any): Error {
  return error instanceof Error ? error : new Error(error.toString());
}

export async function getByUrlOrVersion(urlOrVersion?: string, progress?: TzCallback): Promise<TzData> {
  let url: string;
  let requestedVersion: string;

  if (!urlOrVersion)
    url = DEFAULT_URL;
  else if (urlOrVersion.includes(':'))
    url = urlOrVersion;
  else {
    requestedVersion = urlOrVersion;
    url = URL_TEMPLATE_FOR_VERSION.replace('{version}', urlOrVersion);
  }

  if (progress)
    progress(TzPhase.DOWNLOAD, TzMessageLevel.INFO);

  const data = await requestBinary(url, { headers: { 'User-Agent': 'curl/7.64.1' }, autoDecompress: true });
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
      if (/unexpected end of data|invalid tar header/i.test(err.message) && Object.keys(result.sources).length >= 11)
        resolve(result);
      else
        reject(makeError(err));
    });
  });
}

export async function getLatest(progress?: TzCallback): Promise<TzData> {
  return getByUrlOrVersion(null, progress);
}

export async function getAvailableVersions(): Promise<string[]> {
  const parsed = new URL(ALL_RELEASES);
  const port = Number(parsed.port || 21);
  const options: PromiseFtp.Options = { host: parsed.hostname, port, connTimeout: 30000, pasvTimeout: 30000 };
  const ftp = new PromiseFtp();

  return ftp.connect(options)
    .then(() => ftp.list(parsed.pathname))
    .then(list => {
      ftp.end();

      return list.map(item => /^tzdata(\d{4}\w+)\.tar.gz$/.exec(item.name))
        .filter(match => !!match).map(match => match[1]);
    })
    .catch(err => makeError(err));
}
