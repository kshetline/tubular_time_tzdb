import { expect } from 'chai';
import { TzRule } from './tz-rule';

describe('Utility functions', () => {
  it('should format zone rules in POSIX format', () => {
    let dstRule = TzRule.parseRule('Rule\tUS\t2007\tmax\t-\tMar\tSun>=8\t2:00\t1:00\tD');
    let stdRule = TzRule.parseRule('Rule\tUS\t2007\tmax\t-\tNov\tSun>=1\t2:00\t0\tS');

    expect(stdRule.toPosixRule(-18000, 'EST', dstRule, 'EDT')).to.equal('EST5EDT,M3.2.0,M11.1.0');
    expect(stdRule.toPosixRule(-28800, 'PST', dstRule, 'PDT')).to.equal('PST8PDT,M3.2.0,M11.1.0');
    expect(stdRule.toPosixRule(-28800, 'PST')).to.equal('PST8');

    dstRule = TzRule.parseRule('Rule\tEU\t1981\tmax\t-\tMar\tlastSun\t 1:00u\t1:00\tS');
    stdRule = TzRule.parseRule('Rule\tEU\t1996\tmax\t-\tOct\tlastSun\t 1:00u\t0\t-');

    expect(stdRule.toPosixRule(0, 'GMT', dstRule, 'BST')).to.equal('GMT0BST,M3.5.0/1,M10.5.0');
  });
});
