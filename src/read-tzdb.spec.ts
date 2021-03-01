import * as chai from 'chai';
// @ts-ignore
import chaiAsPromised from 'chai-as-promised';
import { getAvailableVersions, getLatest, getVersion } from './read-tzdb';

const { expect } = chai;

chai.use(chaiAsPromised);
chai.should();

describe('Reading HTTP timezone data', () => {
  it('should fetch latest tzdb', async function () {
    this.timeout(60000);
    return getLatest().should.eventually.be.fulfilled;
  });

  it('should fetch by version', async function () {
    this.timeout(60000);
    return getVersion('1997d').should.eventually.be.fulfilled;
  });

  it('should fail with bad version', async function () {
    this.timeout(60000);
    return getVersion('foo').should.eventually.be.rejected;
  });

  it('should list all versions', async function () {
    this.timeout(60000);

    const versions = await getAvailableVersions();

    expect(versions.includes('1998i')).to.be.true;
    expect(versions.includes('2021a')).to.be.true;
    expect(versions.includes('1884q')).to.be.false;
  });
});
