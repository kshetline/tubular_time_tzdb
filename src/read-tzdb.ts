import { requestBinary } from 'by-request';
import PromiseFtp from 'promise-ftp';
import { Readable } from 'stream';
import tar from 'tar-stream';
import { URL } from 'url';

export interface TzData {
  version: string;
  sources: Record<string, string>;
}

const DEFAULT_URL = 'https://www.iana.org/time-zones/repository/tzdata-latest.tar.gz';
const URL_TEMPLATE_FOR_VERSION = 'https://data.iana.org/time-zones/releases/tzdata{version}.tar.gz';
const ALL_RELEASES = 'ftp://ftp.iana.org/tz/releases/';
const TZ_SOURCE_FILES = new Set(['africa', 'antarctica', 'asia', 'australasia', 'europe', 'northamerica',
                                 'pacificnew', 'southamerica', 'backward', 'etcetera', 'systemv']);

function makeError(error: any): Error {
  return error instanceof Error ? error : new Error(error.toString());
}

export async function getByUrlOrVersion(urlOrVersion?: string, displayProgress = false): Promise<TzData> {
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

  const extract = tar.extract();
  const data = await requestBinary(url, { headers: { 'User-Agent': 'curl/7.64.1' }, autoDecompress: true });
  const stream = Readable.from(data);
  const result: TzData = { version: requestedVersion || 'unknown', sources: {} };
  let error: any;

  extract.on('entry', (header, stream, next) => {
    const sourceName = header.name;

    if (!error && TZ_SOURCE_FILES.has(sourceName) || sourceName === 'version') {
      let data = '';

      if (displayProgress && sourceName !== 'version')
        console.info(`Extracting ${sourceName}`);

      stream.on('data', chunk => data += chunk.toString());
      stream.on('error', err => error = err);
      stream.on('end', () => {
        if (sourceName === 'version') {
          result.version = data.trim();

          if (displayProgress && result.version)
            console.info(`tz database version ${result.version}`);
        }
        else
          result.sources[sourceName] = data;

        next();
      });
    }
    else
      stream.on('end', next);

    if (displayProgress && !result.version)
      console.info('unknown tz database version');

    stream.resume();
  });

  return new Promise<TzData>((resolve, reject) => {
    stream.pipe(extract);
    extract.on('finish', () => error ? reject(makeError(error)) : resolve(result));
    extract.on('error', err => reject(makeError(err)));
  });
}

export async function getLatest(displayProgress = false): Promise<TzData> {
  return getByUrlOrVersion(null, displayProgress);
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
