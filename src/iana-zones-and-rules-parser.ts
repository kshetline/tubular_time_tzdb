import { IanaZone } from './iana-zone-record';
import { TzRuleSet } from './tz-rule';
import { isBoolean, isString } from '@tubular/util';
import { getByUrlOrVersion, getLatest, TzData } from './read-tzdb';

export class IanaZonesAndRulesParser {
  private readonly zoneMap = new Map<string, IanaZone>();
  private readonly zoneAliases = new Map<string, string>();
  private readonly ruleSetMap = new Map<string, TzRuleSet>();

  constructor(private roundToMinutes = false, private displayProgress = false) {};

  async parseFromOnline(includeSystemV: boolean): Promise<string>;
  async parseFromOnline(urlOrVersion: string): Promise<string>;
  async parseFromOnline(urlOrVersionOrIsv: string | boolean, includeSystemV = false): Promise<string> {
    const urlOrVersion = isString(urlOrVersionOrIsv) ? urlOrVersionOrIsv : null;

    includeSystemV = isBoolean(urlOrVersionOrIsv) ? urlOrVersionOrIsv : includeSystemV;

    let tzData: TzData;

    if (urlOrVersion)
      tzData = await getByUrlOrVersion(urlOrVersion, this.displayProgress);
    else
      tzData = await getLatest(this.displayProgress);

    return this.parseTzData(tzData, includeSystemV);
  }

  parseTzData(tzData: TzData, includeSystemV = false): string {
    if (this.displayProgress)
      console.info('Parsing tz database sources');

    if (!includeSystemV)
      delete tzData.sources.systemv;
    else if (tzData.sources.systemv)
      // Uncomment the commented-out time zones in the systemv file
      tzData.sources.systemv = tzData.sources.systemv.replace(/## Zone/g, 'Zone');

    // Add aliases if needed for legacy time zones. Not all substitutes exactly duplicate their originals.
    if (includeSystemV && !tzData.sources.systemv) {
      this.addAlias('SystemV/AST4', 'America/Anguilla');
      this.addAlias('SystemV/AST4ADT', 'America/Goose_Bay');
      this.addAlias('SystemV/CST6', 'America/Belize');
      this.addAlias('SystemV/CST6CDT', 'America/Chicago');
      this.addAlias('SystemV/EST5', 'America/Atikokan');
      this.addAlias('SystemV/EST5EDT', 'America/New_York');
      this.addAlias('SystemV/HST10', 'HST');
      this.addAlias('SystemV/MST7', 'America/Creston');
      this.addAlias('SystemV/MST7MDT', 'America/Boise');
      this.addAlias('SystemV/PST8', 'Etc/GMT+8');
      this.addAlias('SystemV/PST8PDT', 'America/Los_Angeles');
      this.addAlias('SystemV/YST9', 'Etc/GMT+8');
      this.addAlias('SystemV/YST9YDT', 'America/Anchorage');
    }

    if (!tzData.sources.pacificnew)
      this.addAlias('US/Pacific-New', 'America/Los_Angeles');

    return tzData.version;
  }

  private addAlias(alias: string, original: string): void {
    const rootZone = this.getRootZone(original);

    if (rootZone)
      this.zoneAliases.set(alias, rootZone);
  }

  private getRootZone(zoneId: string): string {
    while (this.zoneAliases.has(zoneId))
      zoneId = this.zoneAliases.get(zoneId);

    return zoneId;
  }
}
